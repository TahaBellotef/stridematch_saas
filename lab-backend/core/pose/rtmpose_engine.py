# core/pose/rtmpose_engine.py
# Aioka Development Team © 2025 All rights reserved.
# Author: @macitch (https://www.github.com/macitch)

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Optional, Tuple

import numpy as np
from PIL import Image

try:
    # High-level rtmlib "solutions"
    from rtmlib import Body  # 17 kpts
    try:
        # Older docs/some forks used this name (rare)
        from rtmlib import Body_with_feet  # type: ignore
    except Exception:
        Body_with_feet = None  # type: ignore

    try:
        # Current upstream uses CamelCase
        from rtmlib import BodyWithFeet  # 26 kpts
    except Exception:
        BodyWithFeet = None  # type: ignore

    try:
        from rtmlib import Wholebody  # 133 kpts (optional)
    except Exception:
        Wholebody = None  # type: ignore

except ImportError as exc:  # pragma: no cover
    Body = None  # type: ignore
    Body_with_feet = None  # type: ignore
    BodyWithFeet = None  # type: ignore
    Wholebody = None  # type: ignore
    _rtmlib_import_error = exc
else:
    _rtmlib_import_error = None

from .results import Landmark, PoseLandmarks, PoseResultCompat

logger = logging.getLogger(__name__)

# Use invalid normalized coords that your validators will reject.
# Your _valid_lm_point allows [-0.25..1.25], so -1.0 is safely invalid.
INVALID_XY = -1.0


def _clamp01(v: float) -> float:
    return float(max(0.0, min(1.0, v)))


def _env_float(name: str, default: float) -> float:
    v = os.environ.get(name)
    if v is None:
        return default
    try:
        return float(str(v).strip())
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    v = os.environ.get(name)
    if v is None:
        return default
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _norm_mode_token(s: str) -> str:
    return (s or "").strip().lower().replace("-", "_").replace(" ", "")


def _pick_speed_mode(token: str) -> str:
    """
    rtmlib solutions typically accept: {'performance','lightweight','balanced'}.
    Also allow s/m/l shorthand.
    """
    t = _norm_mode_token(token)
    speed_map = {"s": "lightweight", "m": "balanced", "l": "performance"}
    t = speed_map.get(t, t)
    if t not in {"performance", "lightweight", "balanced"}:
        return "balanced"
    return t

def _finite_xy(px: float, py: float) -> bool:
    return bool(np.isfinite(px) and np.isfinite(py))


# ============================================================
# Tracking helpers (keypoint-derived bbox + hysteresis)
# ============================================================
@dataclass
class PersonTrackState:
    bbox_xyxy: Optional[Tuple[float, float, float, float]] = None  # pixel coords
    stable_idx: Optional[int] = None
    switch_votes: int = 0
    missed_frames: int = 0


def _iou_xyxy(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    a_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    b_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    denom = a_area + b_area - inter
    return float(inter / denom) if denom > 0 else 0.0


def _center_dist_norm(
    a: Tuple[float, float, float, float],
    b: Tuple[float, float, float, float],
    w: int,
    h: int,
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    acx, acy = (ax1 + ax2) / 2.0, (ay1 + ay2) / 2.0
    bcx, bcy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
    d = float(((acx - bcx) ** 2 + (acy - bcy) ** 2) ** 0.5)
    diag = float((w * w + h * h) ** 0.5)
    return d / diag if diag > 1e-6 else 1.0


def _bbox_area(b: Tuple[float, float, float, float]) -> float:
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _compute_bbox_from_kpts(
    person_kpts_xy: np.ndarray,  # (K,2) pixel coords
    person_scores: np.ndarray,   # (K,)
    *,
    min_kpt_score: float,
    pad_px: float = 10.0,
) -> Optional[Tuple[float, float, float, float]]:
    if person_kpts_xy.ndim != 2 or person_kpts_xy.shape[1] < 2:
        return None
    if person_scores.ndim != 1:
        return None

    good = (
        np.isfinite(person_kpts_xy[:, 0])
        & np.isfinite(person_kpts_xy[:, 1])
        & (person_scores >= min_kpt_score)
    )
    if int(np.sum(good)) < 4:
        return None

    xs = person_kpts_xy[good, 0].astype(float)
    ys = person_kpts_xy[good, 1].astype(float)

    x1 = float(np.min(xs) - pad_px)
    y1 = float(np.min(ys) - pad_px)
    x2 = float(np.max(xs) + pad_px)
    y2 = float(np.max(ys) + pad_px)
    return (x1, y1, x2, y2)


def _select_tracked_person(
    *,
    boxes_xyxy: list[Tuple[float, float, float, float]],
    per_person_score: np.ndarray,  # (P,)
    img_w: int,
    img_h: int,
    state: PersonTrackState,
    min_person_score: float,
) -> int:
    """
    Product-ish selection:
      - locks onto a stable target
      - only allows switching if the stable target is "lost" for N frames
      - otherwise keeps stable_idx even if background person spikes score
    Depends on helpers in your file:
      - _env_int(name, default)
      - _env_float(name, default)
    """

    n_persons = min(len(boxes_xyxy), int(per_person_score.size))
    if n_persons <= 0:
        state.bbox_xyxy = None
        state.stable_idx = None
        state.switch_votes = 0
        return 0

    # ---- tuning knobs (env overridable) ----
    reset_after_misses = _env_int("POSE_TRACK_RESET_AFTER_MISSES", 90)

    # scoring weights (used for initial lock + optional re-lock after lost)
    iou_weight = _env_float("POSE_TRACK_IOU_W", 2.2)
    center_weight = _env_float("POSE_TRACK_CENTER_W", 1.0)
    area_weight = _env_float("POSE_TRACK_AREA_W", 0.80)
    score_weight = _env_float("POSE_TRACK_SCORE_W", 0.60)

    # gating (helps a lot with treadmill captures)
    center_gate = _env_float("POSE_TRACK_CENTER_GATE", 0.22)  # 0 disables

    # hard lock rule
    only_switch_after_misses = _env_int("POSE_TRACK_ONLY_SWITCH_AFTER_MISSES", 1) == 1
    min_misses_to_switch = _env_int("POSE_TRACK_MIN_MISSES_TO_SWITCH", 45)

    # takeover guards (only used when switching is allowed)
    min_keep_iou = _env_float("POSE_TRACK_MIN_KEEP_IOU", 0.25)
    min_area_ratio = _env_float("POSE_TRACK_MIN_AREA_RATIO", 0.80)  # 0 disables
    takeover_margin = _env_float("POSE_TRACK_TAKEOVER_SCORE_MARGIN", 0.35)  # 0 disables

    # If state got stale due to misses, reset completely
    if state.missed_frames >= reset_after_misses:
        state.bbox_xyxy = None
        state.stable_idx = None
        state.switch_votes = 0
        state.missed_frames = 0

    # Filter by score first
    valid_idx = [
        i
        for i in range(n_persons)
        if float(per_person_score[i]) >= float(min_person_score)
    ]
    if not valid_idx:
        # no valid candidates — keep stable if it is still in-range, else fallback to argmax in-range
        if state.stable_idx is not None and 0 <= int(state.stable_idx) < n_persons:
            return int(state.stable_idx)
        return int(np.argmax(per_person_score[:n_persons])) if n_persons > 0 else 0

    # Optional center gating
    if center_gate and center_gate > 0:
        gated = []
        cx0, cy0 = img_w / 2.0, img_h / 2.0
        max_dx = center_gate * img_w
        max_dy = center_gate * img_h
        for i in valid_idx:
            x1, y1, x2, y2 = boxes_xyxy[i]
            cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
            if abs(cx - cx0) <= max_dx and abs(cy - cy0) <= max_dy:
                gated.append(i)
        if gated:
            valid_idx = gated

    # No lock yet: choose best subject by score + area (prefer largest person = closest to camera)
    if (
        state.bbox_xyxy is None
        or state.stable_idx is None
        or state.stable_idx >= n_persons
        or state.stable_idx not in valid_idx
    ):
        # Normalize area across candidates so the largest person gets a strong bonus
        areas = [_bbox_area(boxes_xyxy[i]) for i in valid_idx]
        max_area = max(areas) if areas else 1.0
        max_area = max(max_area, 1e-6)

        best = max(
            valid_idx,
            key=lambda i: (
                float(per_person_score[i])
                + area_weight * (_bbox_area(boxes_xyxy[i]) / max_area)
            ),
        )
        state.bbox_xyxy = boxes_xyxy[best]
        state.stable_idx = int(best)
        state.switch_votes = 0
        state.missed_frames = 0
        return int(best)

    prev = state.bbox_xyxy
    prev_area = max(1e-6, _bbox_area(prev))

    # -----------------------------
    # IoU-based identity resolution: RTMPose can reorder person indices
    # between frames, so we must find which current index best matches
    # the stored bbox rather than blindly trusting stable_idx.
    # -----------------------------
    iou_reident_thresh = _env_float("POSE_TRACK_REIDENT_IOU", 0.30)

    si = int(state.stable_idx)
    best_iou_match = -1.0
    best_iou_idx = si  # fallback to stored index

    for i in valid_idx:
        iou_val = _iou_xyxy(prev, boxes_xyxy[i])
        if iou_val > best_iou_match:
            best_iou_match = iou_val
            best_iou_idx = i

    # If the stored index doesn't match well but another person does,
    # update stable_idx to follow the correct person
    if best_iou_match >= iou_reident_thresh:
        si = best_iou_idx
        state.stable_idx = si
    elif si < len(boxes_xyxy):
        # stored index has low IoU too — check if it's still somewhat valid
        stored_iou = _iou_xyxy(prev, boxes_xyxy[si]) if si < len(boxes_xyxy) else 0.0
        if stored_iou < iou_reident_thresh * 0.5:
            # stored index is a completely different person, use best match
            si = best_iou_idx
            state.stable_idx = si

    # -----------------------------
    # "lost" signal for stable target
    # -----------------------------
    stable_ok = True
    if si >= n_persons:
        stable_ok = False
    else:
        if float(per_person_score[si]) < float(min_person_score):
            stable_ok = False

    if not stable_ok:
        state.missed_frames += 1
    else:
        state.missed_frames = 0

    logger.debug(
        "TRACK | stable=%s missed=%d votes=%d iou_match=%.3f",
        state.stable_idx,
        state.missed_frames,
        state.switch_votes,
        best_iou_match,
    )

    # -----------------------------
    # HARD LOCK: don't switch unless lost long enough
    # -----------------------------
    if only_switch_after_misses and state.missed_frames < min_misses_to_switch:
        # refresh bbox for the re-identified stable target
        if si < len(boxes_xyxy):
            state.bbox_xyxy = boxes_xyxy[si]
        state.switch_votes = 0
        return int(si)

    # If we got here, switching is allowed (we're "lost-ish")
    best_idx = int(state.stable_idx)
    best_val = -1e9
    stable_val = -1e9

    for i in valid_idx:
        box = boxes_xyxy[i]
        iou = _iou_xyxy(prev, box)
        cdist = _center_dist_norm(prev, box, img_w, img_h)
        area = max(1e-6, _bbox_area(box))
        area_ratio = min(area / prev_area, 4.0)

        val = (
            iou_weight * iou
            + center_weight * (1.0 - cdist)
            + area_weight * float(np.log(area_ratio))
            + score_weight * float(per_person_score[i])
        )

        if i == si:
            stable_val = val

        if val > best_val:
            best_val = val
            best_idx = int(i)

    # If best is the stable, relock and reset votes
    if best_idx == si:
        state.switch_votes = 0
        state.bbox_xyxy = boxes_xyxy[best_idx]
        return int(best_idx)

    # -----------------------------
    # Takeover guards (when switching is allowed)
    # -----------------------------
    best_box = boxes_xyxy[best_idx]
    best_iou = _iou_xyxy(prev, best_box)

    cand_area = max(1e-6, _bbox_area(best_box))
    area_ratio = cand_area / prev_area

    if min_area_ratio > 0.0 and area_ratio < min_area_ratio:
        state.switch_votes = 0
        return int(si)

    if takeover_margin > 0.0 and stable_val > -1e8:
        if (best_val - stable_val) < takeover_margin:
            state.switch_votes = 0
            return int(si)

    if best_iou < min_keep_iou:
        state.switch_votes = 0
        return int(si)

    # vote-based switching (optional; keep it, but now it only happens after lost)
    switch_patience = _env_int("POSE_TRACK_SWITCH_PATIENCE", 60)
    state.switch_votes += 1

    if state.switch_votes >= switch_patience:
        state.stable_idx = best_idx
        state.bbox_xyxy = best_box
        state.switch_votes = 0
        state.missed_frames = 0
        return int(best_idx)

    return int(si)

class PoseInferenceEngine:
    """
    RTMLib inference wrapper with explicit keypoint-set selection.

    Added: person-lock tracking to prevent background person hijack.
    """

    def __init__(self, fps: float = 30.0):
        if Body is None:
            raise RuntimeError(
                "rtmlib is not installed. Install the `rtmlib` package to run RTMPose inference."
            ) from _rtmlib_import_error

        self.fps = float(fps) if fps and fps > 0 else 30.0

        # Set ONNX thread env vars before model init (only if not already set)
        _default_threads = str(max(2, (os.cpu_count() or 2) // 2))
        if "OMP_NUM_THREADS" not in os.environ:
            os.environ["OMP_NUM_THREADS"] = _default_threads
        if "ORT_NUM_THREADS" not in os.environ:
            os.environ["ORT_NUM_THREADS"] = _default_threads

        self.device = os.environ.get("RTMPOSE_DEVICE", "cpu").strip()
        self.backend = os.environ.get("RTMPOSE_BACKEND", "onnxruntime").strip()

        requested_raw = os.environ.get("RTMPOSE_MODE", "balanced")
        requested = _norm_mode_token(requested_raw)

        # Optional hard check. If 0, we auto-set based on chosen solution.
        self.expected_kpts = _env_int("RTMPOSE_EXPECTED_KPTS", 0)

        # Robustness knobs
        self.min_person_score = _env_float("RTMPOSE_MIN_PERSON_SCORE", 0.25)
        self.min_kpt_score = _env_float("RTMPOSE_MIN_KPT_SCORE", 0.10)

        # Tracking state (locks onto one person across frames)
        self._track = PersonTrackState()

        # Determine which Solution to use
        solution_ctor: Callable[..., Any]
        solution_name: str
        speed_mode: str

        has_26 = BodyWithFeet is not None or Body_with_feet is not None
        has_133 = Wholebody is not None

        self._log_available_solutions(requested_raw)

        if requested in {"wholebody", "rtmw", "133"}:
            if not has_133:
                raise RuntimeError(
                    "You requested Wholebody/133 keypoints, but your installed rtmlib does not expose `Wholebody`."
                )
            solution_ctor = Wholebody  # type: ignore[assignment]
            solution_name = "Wholebody"
            speed_mode = _pick_speed_mode(os.environ.get("RTMPOSE_SPEED", "balanced"))
            if self.expected_kpts <= 0:
                self.expected_kpts = 133

        elif requested in {"halpe26", "halpe_26", "bodywithfeet", "body_with_feet", "26"}:
            if not has_26:
                raise RuntimeError(
                    "You requested 26 keypoints (halpe26/body_with_feet), but your installed rtmlib "
                    "does not provide `BodyWithFeet` (or legacy `Body_with_feet`). "
                    "Install/upgrade rtmlib to a version that includes it."
                )
            solution_ctor = (BodyWithFeet or Body_with_feet)  # type: ignore[assignment]
            solution_name = "BodyWithFeet" if BodyWithFeet is not None else "Body_with_feet"
            speed_mode = _pick_speed_mode(os.environ.get("RTMPOSE_SPEED", "balanced"))
            if self.expected_kpts <= 0:
                self.expected_kpts = 26

        else:
            solution_ctor = Body  # type: ignore[assignment]
            solution_name = "Body"
            speed_mode = _pick_speed_mode(os.environ.get("RTMPOSE_SPEED", requested_raw))
            if self.expected_kpts <= 0:
                self.expected_kpts = 17

        logger.info(
            "Initializing RTMLib: solution=%s speed_mode=%s backend=%s device=%s "
            "(min_person_score=%.2f min_kpt_score=%.2f expected_kpts=%d requested=%r)",
            solution_name,
            speed_mode,
            self.backend,
            self.device,
            self.min_person_score,
            self.min_kpt_score,
            self.expected_kpts,
            requested_raw,
        )

        self._estimator = solution_ctor(
            mode=speed_mode,
            backend=self.backend,
            device=self.device,
            to_openpose=False,
        )

        self._probe_model_kpt_count(expected=self.expected_kpts, solution=solution_name)

    def _log_available_solutions(self, requested_raw: str) -> None:
        try:
            keys = list(getattr(Body, "MODE", {}).keys()) if Body is not None else []
        except Exception:
            keys = []
        logger.info("rtmlib.Body.MODE available keys: %s", keys)
        logger.info(
            "rtmlib solutions available: Body=%s BodyWithFeet=%s Body_with_feet=%s Wholebody=%s",
            Body is not None,
            BodyWithFeet is not None,
            Body_with_feet is not None,
            Wholebody is not None,
        )
        logger.info("Requested RTMPOSE_MODE=%r", requested_raw)

    def _probe_model_kpt_count(self, *, expected: int, solution: str) -> None:
        if expected <= 0:
            return

        dummy = np.zeros((256, 256, 3), dtype=np.uint8)  # BGR
        try:
            result = self._estimator(dummy)
        except Exception:
            logger.exception("RTMLib probe inference failed (cannot verify keypoint count).")
            return

        if not result:
            logger.warning("RTMLib probe returned no detections (blank dummy). Skipping kpt count verify.")
            return

        try:
            keypoints, _scores = result
            kpts = np.asarray(keypoints, dtype=float)
            if kpts.ndim != 3 or kpts.shape[0] == 0:
                logger.warning("RTMLib probe unexpected keypoint shape: %s", getattr(kpts, "shape", None))
                return
            num_kpts = int(kpts.shape[1])
        except Exception:
            logger.warning("RTMLib probe could not parse estimator output")
            return

        logger.info("RTMLib probe: solution=%s outputs num_kpts=%d (expected=%d)", solution, num_kpts, expected)

        if num_kpts != expected:
            raise RuntimeError(
                f"RTMLib model mismatch: expected {expected} keypoints but got {num_kpts}. "
                f"Selected solution '{solution}' is not outputting the intended keypoint set."
            )

    def infer(self, image: Image.Image, ts_ms: int) -> PoseResultCompat:
        # ts_ms currently unused; kept for interface compatibility.
        if image is None:
            self._track.missed_frames += 1
            return PoseResultCompat(pose_landmarks=None)

        rgb = image if getattr(image, "mode", None) == "RGB" else image.convert("RGB")
        width, height = rgb.size
        if width <= 0 or height <= 0:
            self._track.missed_frames += 1
            return PoseResultCompat(pose_landmarks=None)

        arr = np.asarray(rgb)
        if arr.ndim != 3 or arr.shape[-1] != 3:
            self._track.missed_frames += 1
            return PoseResultCompat(pose_landmarks=None)

        # rtmlib expects BGR — use cv2 for SIMD-optimized conversion
        import cv2
        bgr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)

        try:
            result = self._estimator(bgr)
        except Exception:
            logger.exception("RTMLib inference failed")
            self._track.missed_frames += 1
            return PoseResultCompat(pose_landmarks=None)

        if not result:
            self._track.missed_frames += 1
            return PoseResultCompat(pose_landmarks=None)

        self._track.missed_frames = 0

        try:
            keypoints, scores = result
        except (TypeError, ValueError):
            return PoseResultCompat(pose_landmarks=None)

        kpts = np.asarray(keypoints, dtype=float)
        if kpts.ndim != 3 or kpts.shape[0] == 0:
            return PoseResultCompat(pose_landmarks=None)

        num_persons, num_kpts, _ = kpts.shape

        # Parse scores robustly
        scs = None
        if scores is not None:
            scs = np.asarray(scores, dtype=float)

        # per_person score
        if scs is not None and scs.ndim == 1 and scs.shape[0] == num_persons:
            per_person = np.nan_to_num(scs.astype(float), nan=0.0, posinf=0.0, neginf=0.0)
            per_kpt = None
        else:
            if scs is None or scs.ndim != 2 or scs.shape[0] != num_persons:
                scs = np.zeros((num_persons, num_kpts), dtype=float)
            elif scs.shape[1] != num_kpts:
                tmp = np.zeros((num_persons, num_kpts), dtype=float)
                w = min(num_kpts, int(scs.shape[1]))
                tmp[:, :w] = scs[:, :w]
                scs = tmp

            per_person = np.nanmean(scs, axis=1).astype(float)
            per_person = np.nan_to_num(per_person, nan=0.0, posinf=0.0, neginf=0.0)
            per_kpt = scs

        # Build keypoint-derived bboxes for each person (pixel space)
        boxes: list[Tuple[float, float, float, float]] = []
        for p in range(num_persons):
            person_xy = kpts[p]  # (K,2) px in resized image coords
            if per_kpt is not None:
                person_sc = per_kpt[p]
            else:
                # if we only have per-person score, treat all kpts as that score (not ideal but works)
                person_sc = np.full((num_kpts,), float(per_person[p]), dtype=float)

            bb = _compute_bbox_from_kpts(
                person_xy,
                person_sc,
                min_kpt_score=float(self.min_kpt_score),
                pad_px=float(_env_float("POSE_TRACK_BBOX_PAD_PX", 12.0)),
            )
            if bb is None:
                # fallback tiny box at center to avoid crashes; will get filtered by score anyway
                bb = (width * 0.49, height * 0.49, width * 0.51, height * 0.51)
            # Clamp to image extents (optional)
            x1, y1, x2, y2 = bb
            x1 = float(max(0.0, min(x1, width)))
            x2 = float(max(0.0, min(x2, width)))
            y1 = float(max(0.0, min(y1, height)))
            y2 = float(max(0.0, min(y2, height)))
            boxes.append((x1, y1, x2, y2))

        # ✅ Tracking-based person selection (fixes background hijack)
        best_idx = _select_tracked_person(
            boxes_xyxy=boxes,
            per_person_score=per_person,
            img_w=int(width),
            img_h=int(height),
            state=self._track,
            min_person_score=float(self.min_person_score),
        )
        if best_idx < 0 or best_idx >= num_persons or best_idx >= per_person.shape[0]:
            # Defensive clamp for stale track indices across frames.
            best_idx = 0
        best_score = float(per_person[best_idx]) if per_person.size else 0.0
        if best_score < float(self.min_person_score):
            return PoseResultCompat(pose_landmarks=None)

        person_kpts = kpts[best_idx]  # (K,2)

        # per-kpt scores for selected person
        if per_kpt is not None:
            person_scores = per_kpt[best_idx]
        else:
            person_scores = np.full((num_kpts,), best_score, dtype=float)

        out: list[Landmark] = []
        for i in range(num_kpts):
            pt = person_kpts[i]
            if not hasattr(pt, "__len__") or len(pt) < 2:
                out.append(Landmark(x=INVALID_XY, y=INVALID_XY, z=0.0, visibility=0.0))
                continue

            px = float(pt[0])
            py = float(pt[1])
            conf = float(person_scores[i]) if i < person_scores.shape[0] else 0.0
            conf = _clamp01(conf)

            if conf < float(self.min_kpt_score) or not _finite_xy(px, py):
                out.append(Landmark(x=INVALID_XY, y=INVALID_XY, z=0.0, visibility=0.0))
                continue

            nx = _clamp01(px / float(width))
            ny = _clamp01(py / float(height))
            out.append(Landmark(x=nx, y=ny, z=0.0, visibility=conf))

        return PoseResultCompat(pose_landmarks=PoseLandmarks(landmark=out))

    def close(self) -> None:
        pass
