from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional, List, Dict

import numpy as np

logger = logging.getLogger(__name__)


# ============================================================
# One Euro Filter (scalar)
# ============================================================

class OneEuroFilter:
    """
    One Euro Filter for real-time scalar smoothing.
    Adaptive cutoff:
      cutoff = min_cutoff + beta * |dx_hat|
    """

    def __init__(
        self,
        *,
        freq: float = 30.0,
        min_cutoff: float = 1.0,
        beta: float = 0.5,
        d_cutoff: float = 1.0,
    ):
        self.freq = float(freq) if freq and freq > 0 else 30.0
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)

        self.x_prev: Optional[float] = None
        self.dx_prev: Optional[float] = None

    def reset(self) -> None:
        self.x_prev = None
        self.dx_prev = None

    def _alpha(self, cutoff: float) -> float:
        cutoff = float(max(1e-6, cutoff))
        tau = 1.0 / (2.0 * np.pi * cutoff)
        te = 1.0 / self.freq
        return float(1.0 / (1.0 + tau / te))

    def __call__(self, x: float) -> float:
        x = float(x)

        if self.x_prev is None:
            self.x_prev = x
            self.dx_prev = 0.0
            return x

        # derivative
        dx = (x - float(self.x_prev)) * self.freq

        # filter derivative
        a_d = self._alpha(self.d_cutoff)
        dx_hat = a_d * dx + (1.0 - a_d) * float(self.dx_prev or 0.0)

        # adaptive cutoff
        cutoff = self.min_cutoff + self.beta * abs(dx_hat)

        # filter signal
        a = self._alpha(cutoff)
        x_hat = a * x + (1.0 - a) * float(self.x_prev)

        self.x_prev = float(x_hat)
        self.dx_prev = float(dx_hat)
        return float(x_hat)


# ============================================================
# State
# ============================================================

@dataclass
class _EMAState:
    x: float
    y: float

@dataclass
class _OneEuroState:
    fx: OneEuroFilter
    fy: OneEuroFilter
    x: float  # last output px
    y: float  # last output py


# ============================================================
# Consumer
# ============================================================

class PoseSmoothingConsumer:
    """
    Wraps another FrameConsumer and smooths pose landmarks before passing them onward.

    - Smooths in PIXEL space (canvas space): stable drawing/measurement
    - Visibility gating: if vis < threshold, hold last good
    - Spike rejection: if jump is too large, hold last good
    - Converts back to normalized coords so downstream stays identical
    - Missing pose handling:
        - hold_last_frames: keep state for a few missing frames (no reset)
        - reset_after_missing: clear state after N missing frames (prevents ghost)
    - Two methods:
        - method="ema": your current EMA logic (with your fixed semantics)
        - method="oneeuro": adaptive One Euro filter
    """

    def __init__(
        self,
        inner,
        *,
        # common knobs
        vis_threshold: float = 0.3,
        max_jump_px: float = 150.0,
        landmark_indices: Optional[List[int]] = None,
        hold_last_frames: int = 0,
        reset_after_missing: int = 5,
        debug: bool = False,

        # mode select
        method: str = "ema",   # "ema" or "oneeuro"

        # EMA knob (keeps your semantics)
        alpha: float = 0.5,

        # OneEuro knobs
        fps: float = 30.0,
        min_cutoff: float = 1.0,
        beta: float = 0.5,
        d_cutoff: float = 1.0,
    ):
        self.inner = inner

        self.vis_threshold = float(vis_threshold)
        self.max_jump_px = float(max_jump_px)
        self.landmark_indices = landmark_indices

        self.hold_last_frames = int(hold_last_frames)
        self.reset_after_missing = int(reset_after_missing)
        self.debug = bool(debug)

        self.method = (method or "ema").strip().lower()
        if self.method not in {"ema", "oneeuro"}:
            self.method = "ema"

        # EMA
        self.alpha = float(alpha)

        # OneEuro
        self.fps = float(fps) if fps and fps > 0 else 30.0
        self.min_cutoff = float(min_cutoff)
        self.beta = float(beta)
        self.d_cutoff = float(d_cutoff)

        self._ema_state: Dict[int, _EMAState] = {}
        self._oe_state: Dict[int, _OneEuroState] = {}
        self._missing_count: int = 0

    # -------------------------
    # internal helpers
    # -------------------------

    def _reset_state(self) -> None:
        self._ema_state.clear()
        for st in self._oe_state.values():
            try:
                st.fx.reset()
                st.fy.reset()
            except Exception:
                pass
        self._oe_state.clear()

    def _ensure_oneeuro(self, i: int, init_x: float, init_y: float) -> _OneEuroState:
        st = self._oe_state.get(i)
        if st is not None:
            return st

        fx = OneEuroFilter(freq=self.fps, min_cutoff=self.min_cutoff, beta=self.beta, d_cutoff=self.d_cutoff)
        fy = OneEuroFilter(freq=self.fps, min_cutoff=self.min_cutoff, beta=self.beta, d_cutoff=self.d_cutoff)

        # prime
        _ = fx(float(init_x))
        _ = fy(float(init_y))

        st = _OneEuroState(fx=fx, fy=fy, x=float(init_x), y=float(init_y))
        self._oe_state[i] = st
        return st

    @staticmethod
    def _clamp01(v: float) -> float:
        if v < 0.0:
            return 0.0
        if v > 1.0:
            return 1.0
        return float(v)

    # -------------------------
    # main hook
    # -------------------------

    def consume(self, frame_idx: int, image, pose_result, *, scale, offset, **kwargs):
        # Missing pose => increment missing count, maybe reset
        if not pose_result or not getattr(pose_result, "pose_landmarks", None):
            self._missing_count += 1

            # keep state during hold window (prevents blink)
            # after reset_after_missing, clear state (prevents “ghost forever”)
            if self.reset_after_missing > 0 and self._missing_count >= self.reset_after_missing:
                self._reset_state()

            return self.inner.consume(frame_idx, image, pose_result, scale=scale, offset=offset, **kwargs)

        lms = pose_result.pose_landmarks.landmark
        if not lms:
            self._missing_count += 1
            if self.reset_after_missing > 0 and self._missing_count >= self.reset_after_missing:
                self._reset_state()
            return self.inner.consume(
                frame_idx,
                image,
                pose_result,
                scale=scale,
                offset=offset,
                **kwargs,
            )

        # Pose present => reset missing counter
        self._missing_count = 0

        nw, nh = scale
        ox, oy = offset

        indices = self.landmark_indices if self.landmark_indices is not None else range(len(lms))
        max_jump2 = float(self.max_jump_px) * float(self.max_jump_px)

        for i in indices:
            if i < 0 or i >= len(lms):
                continue

            lm = lms[i]
            vis = float(getattr(lm, "visibility", 0.0) or 0.0)

            # normalized -> pixel (canvas space)
            px = float(lm.x) * float(nw) + float(ox)
            py = float(lm.y) * float(nh) + float(oy)

            # -------------------------
            # EMA mode (your current logic)
            # -------------------------
            if self.method == "ema":
                st = self._ema_state.get(i)
                if st is None:
                    self._ema_state[i] = _EMAState(px, py)
                    px_s, py_s = px, py
                else:
                    px_s, py_s = st.x, st.y  # default hold
                    if vis >= self.vis_threshold:
                        dx = px - st.x
                        dy = py - st.y
                        if (dx * dx + dy * dy) <= max_jump2:
                            a = self.alpha
                            # Your FIXED EMA semantics:
                            # alpha=1 -> hold prev (smooth/lag)
                            # alpha=0 -> follow new (snappy)
                            px_s = a * st.x + (1.0 - a) * px
                            py_s = a * st.y + (1.0 - a) * py

                    st.x, st.y = float(px_s), float(py_s)

            # -------------------------
            # OneEuro mode
            # -------------------------
            else:
                st = self._oe_state.get(i)
                if st is None:
                    st = self._ensure_oneeuro(i, px, py)
                    px_s, py_s = px, py
                else:
                    px_s, py_s = st.x, st.y  # default hold

                    if vis >= self.vis_threshold:
                        dx = px - st.x
                        dy = py - st.y
                        # spike rejection BEFORE updating filter
                        if (dx * dx + dy * dy) <= max_jump2:
                            px_s = float(st.fx(float(px)))
                            py_s = float(st.fy(float(py)))

                    st.x, st.y = float(px_s), float(py_s)

            # pixel -> normalized (relative to resized image, remove letterbox)
            nx = (float(px_s) - float(ox)) / float(nw) if nw else float(lm.x)
            ny = (float(py_s) - float(oy)) / float(nh) if nh else float(lm.y)

            nx = self._clamp01(nx)
            ny = self._clamp01(ny)

            if self.debug and frame_idx < 3 and i == 23:
                logger.debug(
                    "smooth[%s] frame=%d idx=%d scale=%s offset=%s "
                    "norm_in=(%.4f,%.4f) raw_px=(%.1f,%.1f) sm_px=(%.1f,%.1f) norm_out=(%.4f,%.4f) vis=%.2f",
                    self.method,
                    frame_idx,
                    i,
                    scale,
                    offset,
                    float(lm.x),
                    float(lm.y),
                    px,
                    py,
                    px_s,
                    py_s,
                    nx,
                    ny,
                    vis,
                )

            lm.x = nx
            lm.y = ny

        return self.inner.consume(frame_idx, image, pose_result, scale=scale, offset=offset)