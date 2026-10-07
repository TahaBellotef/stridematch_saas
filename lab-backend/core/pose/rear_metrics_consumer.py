#
#  File: rear_metrics_consumer.py
#  Project: StrideMatchLab
#

from __future__ import annotations

from typing import List, Dict, Any, Optional, Tuple, Union
import logging
import os

import numpy as np

from app.services.analysis.pipeline_types import RearFrameData, RearConsumerResult
from app.visualization_config import MAX_FRAMES
from core.pose.side_metrics import compute_step_events
from .rear_metrics import (
    RearMetricConfig,
    extract_rear_frame_metrics,
    aggregate_rear_metrics,
    rear_drift_hint,
)

logger = logging.getLogger(__name__)

PairLike = Union[
    Tuple[int, int],
    List[int],
    Tuple[float, float],
    List[float],
    Dict[str, Any],
]

# =========================================================
# Helpers
# =========================================================

def _normalize_pair(v: Any) -> Optional[Tuple[int, int]]:
    """
    Accept (w,h) or dict forms:
      - {"w":..,"h":..} or {"width":..,"height":..}
      - {"x":..,"y":..}
    Return ints.
    """
    if v is None:
        return None

    if isinstance(v, (tuple, list)):
        if len(v) != 2:
            return None
        try:
            return (int(v[0]), int(v[1]))
        except Exception:
            return None

    if isinstance(v, dict):
        if "w" in v and "h" in v:
            try:
                return (int(v["w"]), int(v["h"]))
            except Exception:
                return None
        if "width" in v and "height" in v:
            try:
                return (int(v["width"]), int(v["height"]))
            except Exception:
                return None
        if "x" in v and "y" in v:
            try:
                return (int(v["x"]), int(v["y"]))
            except Exception:
                return None

    return None


def _pick_kw(kwargs: Dict[str, Any], *names: str) -> Any:
    for n in names:
        if n in kwargs:
            return kwargs.get(n)
    return None


def _pick_transform_meta(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Best-effort: pipeline *may* pass a transform object/dict.
    Stored for debugging. Rotation/flip are already baked into the output
    video by the pipeline, so the frontend should NOT re-apply them.
    We zero out rotate_cw and flip flags so the UI doesn't double-transform.
    """
    t = _pick_kw(kwargs, "transform", "video_transform", "final_transform")
    if t is None:
        return {}

    # Extract raw values for logging, but return zeroed for frontend
    raw: Dict[str, Any] = {}
    if hasattr(t, "__dict__"):
        d = dict(getattr(t, "__dict__", {}) or {})
        raw = {k: d.get(k) for k in ("rotate_cw", "flip_x", "flip_y") if k in d}
    elif isinstance(t, dict):
        raw = {k: t.get(k) for k in ("rotate_cw", "flip_x", "flip_y") if k in t}

    if not raw:
        return {}

    # Pipeline already applies rotation/flip to the encoded video.
    # Return zeroed transform so the frontend doesn't re-apply.
    return {"rotate_cw": 0, "flip_x": False, "flip_y": False}


def _is_xy_list(v: Any) -> bool:
    return isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(x, (int, float)) for x in v)


def _agg_float(values: List[float], method: str = "median", trim_ratio: float = 0.1) -> float:
    arr = np.asarray([float(x) for x in values if x is not None], dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return 0.0
    if method == "mean":
        return float(np.mean(arr))
    if method == "trimmed_mean":
        arr.sort()
        k = int(round(trim_ratio * arr.size))
        if 2 * k >= arr.size:
            return float(np.mean(arr))
        return float(np.mean(arr[k: arr.size - k]))
    # median default
    return float(np.median(arr))


def _agg_point(points: List[List[float]], method: str = "median", trim_ratio: float = 0.1) -> Optional[List[float]]:
    xs = [p[0] for p in points if _is_xy_list(p)]
    ys = [p[1] for p in points if _is_xy_list(p)]
    if not xs or not ys:
        return None
    return [float(_agg_float(xs, method=method, trim_ratio=trim_ratio)), float(_agg_float(ys, method=method, trim_ratio=trim_ratio))]

def _buffers_set_rear_geom(buffers: Dict[str, Any], geom: Dict[str, Any]) -> None:
    """
    Publish latest per-frame rear geometry to shared buffers so annotation can draw it live.
    Stored under buffers["rear_geom"] to avoid mixing with aggregated session metrics.
    """
    if not isinstance(buffers, dict) or not isinstance(geom, dict):
        return

    out: Dict[str, Any] = {}

    midline_x = geom.get("midline_x_px")
    if isinstance(midline_x, (int, float)) and np.isfinite(float(midline_x)):
        out["midline_x_px"] = float(midline_x)

    pelvis = geom.get("pelvis_center_px")
    if _is_xy_list(pelvis):
        out["pelvis_center_px"] = [float(pelvis[0]), float(pelvis[1])]

    L = geom.get("foot_L_tripod_px")
    if isinstance(L, dict):
        L_out: Dict[str, Any] = {}
        for k in ("heel", "big_toe", "small_toe"):
            p = L.get(k)
            if _is_xy_list(p):
                L_out[k] = [float(p[0]), float(p[1])]
        if L_out:
            out["foot_L_tripod_px"] = L_out

    R = geom.get("foot_R_tripod_px")
    if isinstance(R, dict):
        R_out: Dict[str, Any] = {}
        for k in ("heel", "big_toe", "small_toe"):
            p = R.get(k)
            if _is_xy_list(p):
                R_out[k] = [float(p[0]), float(p[1])]
        if R_out:
            out["foot_R_tripod_px"] = R_out

    buffers["rear_geom"] = out

# =========================================================
# Consumer
# =========================================================

class RearMetricsConsumer:
    """
    Collects rear-view biomechanical metrics.

    Focus:
    - Pronation proxy (drift_norm + ankle_offset_norm)
    - Knee window (knee_window_norm)
    - Base of support (base_of_support_norm)
    - Pelvic drop (pelvic_drop_deg)
    - Foot progression + heel whip (left/right)
    - Rear symmetry proxy (rear_symmetry_score)

    NEW (for annotation + QA):
    - pelvis_center_px + midline_x_px
    - foot tripod points per side (heel, big_toe, small_toe)
    """

    requires_pose = True
    frame_order_dependent = False
    produces_metrics = True

    def __init__(
        self,
        config: Optional[RearMetricConfig] = None,
        *,
        buffers: Optional[Dict[str, Any]] = None,
        fps: Optional[float] = None,
    ):
        self.frames: List[RearFrameData] = []
        self.config = config or RearMetricConfig()
        self._buffers = buffers
        self._fps = fps
        self.fallback_used = False
        self.accepted_frames = 0
        self.rejected_low_conf = 0
        self.rejected_bad_map = 0

        self.pose_seen = False
        self._debug_logged = 0

        self._debug_enabled = os.environ.get("APP_DEBUG", "").lower() in {
            "1", "true", "yes", "y", "on",
        }

        # optional transform info (if pipeline passes it)
        self._transform_meta: Dict[str, Any] = {}

        # NEW: geometry samples (kept separate from float frames)
        self._geom_midline_x: List[float] = []
        self._geom_pelvis_center: List[List[float]] = []
        self._geom_tripod_L: Dict[str, List[List[float]]] = {"heel": [], "big_toe": [], "small_toe": []}
        self._geom_tripod_R: Dict[str, List[List[float]]] = {"heel": [], "big_toe": [], "small_toe": []}

    def set_fps(self, fps: Optional[float]) -> None:
        if fps is None:
            self._fps = None
            return
        try:
            value = float(fps)
        except Exception:
            return
        if np.isfinite(value) and value > 0:
            self._fps = value

    def consume(self, frame_idx: int, image, pose_result, **kwargs) -> None:
        if not pose_result or not getattr(pose_result, "pose_landmarks", None):
            return

        self.pose_seen = True
        lm = pose_result.pose_landmarks.landmark

        # guard: RTMPose variants may output fewer keypoints; rear metrics needs at least heel/toe indices
        required_max_idx = 25  # R_HEEL (HALPE-26: heel/toe keypoints at indices 20-25)
        if not hasattr(lm, "__len__") or len(lm) <= required_max_idx:
            self.rejected_low_conf += 1
            if self._debug_enabled and self._debug_logged < 10:
                logger.info(
                    "RearMetricsConsumer skip frame=%s (landmark list too short): len(lm)=%s need>%d",
                    frame_idx, (len(lm) if hasattr(lm, "__len__") else None), required_max_idx
                )
                self._debug_logged += 1
            return

        # pull mapping from pipeline (letterbox)
        raw_scale = _pick_kw(kwargs, "scale", "resized_wh", "resizedWH", "resized", "resize")
        raw_offset = _pick_kw(kwargs, "offset", "pad", "padding", "letterbox_offset")

        resized_wh = _normalize_pair(raw_scale)
        offset = _normalize_pair(raw_offset)

        # store transform meta if available (first time only)
        if not self._transform_meta:
            self._transform_meta = _pick_transform_meta(kwargs)

        if resized_wh is None or offset is None:
            self.rejected_bad_map += 1
            if self._debug_enabled and self._debug_logged < 10:
                logger.info(
                    "RearMetricsConsumer skip frame=%s (bad scale/offset): scale=%r offset=%r",
                    frame_idx, raw_scale, raw_offset
                )
                self._debug_logged += 1
            return

        geom: Dict[str, Any] = {}
        frame_metrics = extract_rear_frame_metrics(
            lm,
            resized_wh=resized_wh,
            offset=offset,
            config=self.config,
            geom_out=geom,
        )

        if frame_metrics is None:
            self.rejected_low_conf += 1
            return

        self.frames.append(frame_metrics)
        self.accepted_frames += 1

        # Publish per-frame geometry for live annotation (same frame)
        if isinstance(self._buffers, dict):
            _buffers_set_rear_geom(self._buffers, geom)

        # NEW: collect geometry samples if present
        midline_x = geom.get("midline_x_px")
        if isinstance(midline_x, (int, float)) and np.isfinite(float(midline_x)):
            self._geom_midline_x.append(float(midline_x))

        pelvis = geom.get("pelvis_center_px")
        if _is_xy_list(pelvis):
            self._geom_pelvis_center.append([float(pelvis[0]), float(pelvis[1])])

        L = geom.get("foot_L_tripod_px")
        if isinstance(L, dict):
            for k in ("heel", "big_toe", "small_toe"):
                p = L.get(k)
                if _is_xy_list(p):
                    self._geom_tripod_L[k].append([float(p[0]), float(p[1])])

        R = geom.get("foot_R_tripod_px")
        if isinstance(R, dict):
            for k in ("heel", "big_toe", "small_toe"):
                p = R.get(k)
                if _is_xy_list(p):
                    self._geom_tripod_R[k].append([float(p[0]), float(p[1])])

        # keep bounded memory
        if len(self.frames) > MAX_FRAMES:
            del self.frames[:-MAX_FRAMES]

        # keep geom bounded too
        maxg = MAX_FRAMES
        if len(self._geom_midline_x) > maxg:
            del self._geom_midline_x[:-maxg]
        if len(self._geom_pelvis_center) > maxg:
            del self._geom_pelvis_center[:-maxg]
        for k in self._geom_tripod_L.keys():
            if len(self._geom_tripod_L[k]) > maxg:
                del self._geom_tripod_L[k][:-maxg]
        for k in self._geom_tripod_R.keys():
            if len(self._geom_tripod_R[k]) > maxg:
                del self._geom_tripod_R[k][:-maxg]

    def result(self) -> Optional[RearConsumerResult]:
        valid_frames = [f for f in self.frames if f is not None]

        # Conservative minimum: need enough accepted frames AND must have seen pose at all
        if (not self.pose_seen) or len(valid_frames) < 10:
            self.fallback_used = True
            logger.info(
                "RearMetrics result: accepted=%d valid=%d rejected_low_conf=%d rejected_bad_map=%d pose_seen=%s fallback=%s",
                self.accepted_frames,
                len(valid_frames),
                self.rejected_low_conf,
                self.rejected_bad_map,
                self.pose_seen,
                self.fallback_used,
            )
            out = _rear_metrics_fallback()
            if self._transform_meta:
                out["transform"] = dict(self._transform_meta)
            return out

        agg = aggregate_rear_metrics(
            valid_frames,
            config=self.config,
            fps=float(self._fps) if isinstance(self._fps, (int, float)) and self._fps > 0 else 0.0,
        )
        if not agg:
            self.fallback_used = True
            logger.info(
                "RearMetrics result: accepted=%d valid=%d rejected_low_conf=%d rejected_bad_map=%d pose_seen=%s fallback=%s",
                self.accepted_frames,
                len(valid_frames),
                self.rejected_low_conf,
                self.rejected_bad_map,
                self.pose_seen,
                self.fallback_used,
            )
            out = _rear_metrics_fallback()
            if self._transform_meta:
                out["transform"] = dict(self._transform_meta)
            return out

        drift = float(agg.get("drift_norm", agg.get("ankle_knee_drift_norm", 0.0)))
        ankle_offset = float(agg.get("ankle_offset_norm", 0.0))

        self.fallback_used = False
        cadence_value: Optional[int] = None
        if isinstance(self._fps, (int, float)) and self._fps and self._fps > 0:
            left_y = [float(f.get("left_ankle_y", np.nan)) for f in valid_frames]
            right_y = [float(f.get("right_ankle_y", np.nan)) for f in valid_frames]
            left_steps = compute_step_events(left_y, float(self._fps))
            right_steps = compute_step_events(right_y, float(self._fps))
            steps = len(left_steps) + len(right_steps)
            duration = len(valid_frames) / float(self._fps) if self._fps > 0 else 0.0
            if duration > 0 and steps > 0:
                cadence = int((steps / duration) * 60)
                cadence = int(max(0, min(cadence, 240)))
                if cadence > 0:
                    cadence_value = cadence

        result: Dict[str, Any] = {
            **agg,
            "hint": rear_drift_hint(drift, ankle_offset),
            "quality": {
                "accepted_frames": int(self.accepted_frames),
                "valid_frames": int(len(valid_frames)),
                "rejected_low_conf": int(self.rejected_low_conf),
                "rejected_bad_map": int(self.rejected_bad_map),
                "pose_seen": bool(self.pose_seen),
            },
        }

        if cadence_value is not None:
            result["cadence"] = cadence_value

        # attach transform info if we have it
        if self._transform_meta:
            result["transform"] = dict(self._transform_meta)

        # NEW: attach stable geometry for annotation (median/trimmed-mean)
        # Use same method as metrics config for consistency
        m = self.config.agg_method
        tr = float(self.config.trim_ratio)

        midline_x = _agg_float(self._geom_midline_x, method=m, trim_ratio=tr) if self._geom_midline_x else None
        pelvis = _agg_point(self._geom_pelvis_center, method=m, trim_ratio=tr) if self._geom_pelvis_center else None

        if midline_x is not None:
            result["midline_x_px"] = float(midline_x)
        if pelvis is not None:
            result["pelvis_center_px"] = pelvis

        L_out: Dict[str, Any] = {}
        for k in ("heel", "big_toe", "small_toe"):
            p = _agg_point(self._geom_tripod_L[k], method=m, trim_ratio=tr)
            if p is not None:
                L_out[k] = p
        if L_out:
            result["foot_L_tripod_px"] = L_out

        R_out: Dict[str, Any] = {}
        for k in ("heel", "big_toe", "small_toe"):
            p = _agg_point(self._geom_tripod_R[k], method=m, trim_ratio=tr)
            if p is not None:
                R_out[k] = p
        if R_out:
            result["foot_R_tripod_px"] = R_out

        logger.info(
            "RearMetrics result: accepted=%d valid=%d rejected_low_conf=%d rejected_bad_map=%d fallback=%s transform=%s",
            self.accepted_frames,
            len(valid_frames),
            self.rejected_low_conf,
            self.rejected_bad_map,
            self.fallback_used,
            self._transform_meta if self._transform_meta else None,
        )
        return result


# =========================================================
# Fallback
# =========================================================

def _rear_metrics_fallback() -> RearConsumerResult:
    return {
        "rear_symmetry_score": 0.0,

        "ankle_knee_drift_norm": 0.0,
        "drift_norm": 0.0,
        "left_ankle_offset_norm": 0.0,
        "right_ankle_offset_norm": 0.0,
        "ankle_alignment_norm": 0.0,
        "left_knee_offset_norm": 0.0,
        "right_knee_offset_norm": 0.0,
        "knee_alignment_norm": 0.0,
        "ankle_offset_norm": 0.0,

        "base_of_support_norm": 0.0,
        "knee_window_norm": 0.0,

        "knee_width_norm": 0.0,
        "ankle_width_norm": 0.0,
        "left_heel_offset_norm": 0.0,
        "right_heel_offset_norm": 0.0,

        "pelvic_drop_deg": 0.0,

        "left_ankle_eversion_deg": 0.0,
        "right_ankle_eversion_deg": 0.0,
        "left_knee_valgus_norm": 0.0,
        "right_knee_valgus_norm": 0.0,

        "left_foot_progression_deg": 0.0,
        "right_foot_progression_deg": 0.0,
        "left_heel_whip_deg": 0.0,
        "right_heel_whip_deg": 0.0,

        # NEW numeric metrics default
        "pelvis_dx_norm": 0.0,
        "foot_L_tripod_area_norm": 0.0,
        "foot_R_tripod_area_norm": 0.0,
        "foot_L_yaw_deg": 0.0,
        "foot_R_yaw_deg": 0.0,

        "hint": "Rear metrics low confidence",
    }
