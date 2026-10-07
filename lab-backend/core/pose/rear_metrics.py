#
#  File: rear_metrics.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, degrees
from typing import Any, Dict, Iterable, List, Optional, Tuple, Literal

import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import find_peaks

from app.services.analysis.pipeline_types import RearFrameData, RearSessionMetrics
from app.utils.normalize import safe_float as _safe_float
from app.services.analysis.thresholds import (
    REAR_MIN_VISIBILITY,
    REAR_MIN_VISIBILITY_FOOT,
    REAR_MIN_BASELINE_PX,
    REAR_TRIM_RATIO,
)
from core.pose.keypoint_index import KeypointIndex

CoordSpace = Literal["canvas_px", "normalized"]

# ============================================================
# RTMPose BodyWithFeet (26 kpts) indices via KeypointIndex
# IMPORTANT: KeypointIndex MUST match the rtmlib BodyWithFeet output ordering.
# ============================================================

L_SHOULDER = int(KeypointIndex.LEFT_SHOULDER)   # 5
R_SHOULDER = int(KeypointIndex.RIGHT_SHOULDER)  # 6

L_HIP = int(KeypointIndex.LEFT_HIP)             # 11
R_HIP = int(KeypointIndex.RIGHT_HIP)            # 12

L_KNEE = int(KeypointIndex.LEFT_KNEE)           # 13
R_KNEE = int(KeypointIndex.RIGHT_KNEE)          # 14

L_ANKLE = int(KeypointIndex.LEFT_ANKLE)         # 15
R_ANKLE = int(KeypointIndex.RIGHT_ANKLE)        # 16

# Feet (BodyWithFeet / 26-kpt)
L_BIG_TOE   = int(KeypointIndex.LEFT_BIG_TOE)    # 20
R_BIG_TOE   = int(KeypointIndex.RIGHT_BIG_TOE)   # 21
L_SMALL_TOE = int(KeypointIndex.LEFT_SMALL_TOE)  # 22
R_SMALL_TOE = int(KeypointIndex.RIGHT_SMALL_TOE) # 23
L_HEEL      = int(KeypointIndex.LEFT_HEEL)       # 24
R_HEEL      = int(KeypointIndex.RIGHT_HEEL)      # 25

# ============================================================
# Types
# ============================================================

RearFrameMetrics = RearFrameData
RearGeom = Dict[str, Any]


@dataclass(frozen=True)
class RearMetricConfig:
    """
    Config knobs for robustness.

    - coord_space: documents what lm.x/lm.y represent (expected: normalized in [0..1])
    - min_visibility: filter frames where key landmarks are too uncertain
    - agg_method: robust aggregation method name
    """
    coord_space: CoordSpace = "canvas_px"
    min_visibility: float = REAR_MIN_VISIBILITY
    agg_method: str = "trimmed_mean"
    trim_ratio: float = REAR_TRIM_RATIO
    min_visibility_foot: float = REAR_MIN_VISIBILITY_FOOT
    min_baseline_px: float = REAR_MIN_BASELINE_PX
    gate_shoulders: bool = True  # include shoulders in the body-visibility gate


# ============================================================
# Low-level helpers
# ============================================================

def _finite(x: Any) -> bool:
    try:
        v = float(x)
        return np.isfinite(v)
    except Exception:
        return False

def _has_idx(lm, idx: int) -> bool:
    try:
        return lm is not None and hasattr(lm, "__len__") and 0 <= int(idx) < len(lm)
    except Exception:
        return False

def _lm_vis(lm, idx: int) -> float:
    """
    RTMPose compat:
    - may store confidence in .visibility or .score (depending on adapter)
    SAFE: returns 0.0 if idx is out of range.
    """
    if not _has_idx(lm, idx):
        return 0.0

    v = getattr(lm[idx], "visibility", None)
    if v is None:
        v = getattr(lm[idx], "score", None)

    # If a point exists but visibility is missing, treat as 1.0 (as before)
    return _safe_float(v, 1.0)

def _project(
    lm,
    idx: int,
    *,
    resized_wh: Tuple[int, int],
    offset: Tuple[int, int],
) -> Tuple[float, float]:
    """
    Project normalized coords into canvas space:
      x = lm.x * resized_width + offset_x
      y = lm.y * resized_height + offset_y

    SAFE: returns (nan, nan) if idx is out of range.
    """
    if not _has_idx(lm, idx):
        return (float("nan"), float("nan"))

    rw, rh = resized_wh
    ox, oy = offset

    x = _safe_float(getattr(lm[idx], "x", 0.0), 0.0)
    y = _safe_float(getattr(lm[idx], "y", 0.0), 0.0)

    return (x * float(rw) + float(ox), y * float(rh) + float(oy))

def _angle_from_vertical(ax: float, ay: float, bx: float, by: float) -> float:
    """Angle between segment A→B and the vertical axis."""
    return degrees(atan2(bx - ax, ay - by))

def _angle_from_horizontal(ax: float, ay: float, bx: float, by: float) -> float:
    """Angle between segment A→B and the horizontal axis."""
    return degrees(atan2(by - ay, bx - ax))

def _angle_between_vectors(
    v1x: float, v1y: float, v2x: float, v2y: float
) -> float:
    """Signed angle from vector v1 to v2 (degrees). Positive = clockwise in screen coords."""
    cross = v1x * v2y - v1y * v2x
    dot = v1x * v2x + v1y * v2y
    return degrees(atan2(cross, dot))

def _range(values: Iterable[float]) -> float:
    vals = np.asarray([_safe_float(v, np.nan) for v in values], dtype=float)
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        return 0.0
    return float(np.max(vals) - np.min(vals))

def _mid(a: Tuple[float, float], b: Tuple[float, float]) -> Tuple[float, float]:
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)

def _tri_area_px2(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> float:
    # absolute triangle area in px^2
    return abs(
        (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) * 0.5
    )

# ============================================================
# Aggregation helpers
# ============================================================

def _aggregate(values: Iterable[float], *, method: str, trim_ratio: float) -> float:
    vals = np.asarray([_safe_float(v, np.nan) for v in values], dtype=float)
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        return 0.0

    if method == "mean":
        return float(np.mean(vals))
    if method == "median":
        return float(np.median(vals))

    vals.sort()
    k = int(round(trim_ratio * vals.size))
    if 2 * k >= vals.size:
        return float(np.mean(vals))
    return float(np.mean(vals[k: vals.size - k]))

def _rolling_median(values: List[float], window: int = 5) -> List[float]:
    if window <= 1:
        return values[:]
    arr = np.asarray(values, dtype=float)
    result = median_filter(arr, size=window, mode='nearest')
    return result.tolist()

# ============================================================
# Symmetry proxy 
# ============================================================

def compute_rear_symmetry(
    left_fpa: List[float],
    right_fpa: List[float],
    ankle_width_norm: Optional[List[float]] = None,
) -> float:
    """
    Rear-view symmetry proxy (0..100).

    Mirror-aware + lag-aware:
    - rear-view angles can be opposite signs => correlate L with -R
    - left/right steps are phase-shifted => take best correlation over small lags
    """
    if not left_fpa or not right_fpa:
        return 0.0

    n = min(len(left_fpa), len(right_fpa))
    if n < 20:
        return 0.0

    L = np.asarray(left_fpa[:n], float)
    R = np.asarray(right_fpa[:n], float)

    mask = np.isfinite(L) & np.isfinite(R)
    L = L[mask]
    R = R[mask]
    if L.size < 20:
        return 0.0

    Lz = (L - L.mean()) / (L.std() or 1.0)
    Rz = (R - R.mean()) / (R.std() or 1.0)

    T = -Rz

    max_lag = int(min(25, max(3, round(0.10 * Lz.size))))
    best_corr = 0.0

    for lag in range(-max_lag, max_lag + 1):
        if lag < 0:
            a = Lz[:lag]
            b = T[-lag:]
        elif lag > 0:
            a = Lz[lag:]
            b = T[:-lag]
        else:
            a = Lz
            b = T

        if a.size < 10:
            continue

        c = float(np.corrcoef(a, b)[0, 1])
        if np.isfinite(c):
            best_corr = max(best_corr, c)

    corr_score = max(0.0, min(1.0, best_corr))

    stability = 0.5
    if ankle_width_norm:
        aw = np.asarray(ankle_width_norm[:n], float)
        aw = aw[np.isfinite(aw)]
        if aw.size >= 5:
            aw_range = float(np.nanmax(aw) - np.nanmin(aw))
            stability = max(0.0, 1.0 - min(1.0, aw_range / 0.35))

    score = 0.7 * corr_score + 0.3 * stability
    return round(score * 100.0, 1)

# ============================================================
# Per-frame extraction
# ============================================================

def _body_gate_visibility(lm, *, gate_shoulders: bool) -> float:
    """Minimum visibility across the gating landmarks. Shoulders are included
    only when gate_shoulders is True (lower-body captures pass them out of frame)."""
    vals = [
        _lm_vis(lm, L_HIP), _lm_vis(lm, R_HIP),
        _lm_vis(lm, L_KNEE), _lm_vis(lm, R_KNEE),
        _lm_vis(lm, L_ANKLE), _lm_vis(lm, R_ANKLE),
    ]
    if gate_shoulders:
        vals.append(_lm_vis(lm, L_SHOULDER))
        vals.append(_lm_vis(lm, R_SHOULDER))
    return min(vals)


def extract_rear_frame_metrics(
    lm,
    *,
    resized_wh: Optional[Tuple[int, int]] = None,
    offset: Optional[Tuple[int, int]] = None,
    config: RearMetricConfig = RearMetricConfig(),
    debug_out: Optional[Dict[str, float]] = None,
    geom_out: Optional[RearGeom] = None,
) -> Optional[RearFrameMetrics]:
    """
    Compute rear-view proxy metrics for a single frame.

    Returns None if:
      - critical landmarks have low confidence
      - resized_wh/offset invalid
      - baseline too small (tiny subject / failure mode)

    NOTE: frame dict must stay float-only (aggregation assumes floats).
          Any geometry is written into geom_out (if provided).
    """

    if config.coord_space != "canvas_px":
        raise ValueError(
            f"rear_metrics expects canvas_px coordinates, got {config.coord_space}"
        )

    # --- validate mapping inputs ---
    if (
        resized_wh is None
        or not isinstance(resized_wh, (tuple, list))
        or len(resized_wh) != 2
        or offset is None
        or not isinstance(offset, (tuple, list))
        or len(offset) != 2
    ):
        return None

    try:
        resized_wh = (int(resized_wh[0]), int(resized_wh[1]))
        offset = (int(offset[0]), int(offset[1]))
    except Exception:
        return None

    # --- visibility gating ---
    body_gate = max(config.min_visibility, 0.0)
    foot_gate = max(config.min_visibility_foot, body_gate)

    key_body_vis = _body_gate_visibility(lm, gate_shoulders=config.gate_shoulders)
    key_heel_vis = min(_lm_vis(lm, L_HEEL), _lm_vis(lm, R_HEEL))

    if key_body_vis < body_gate:
        return None
    if key_heel_vis < foot_gate:
        return None

    # --- project to canvas pixels ---
    L_hip = _project(lm, L_HIP, resized_wh=resized_wh, offset=offset)
    R_hip = _project(lm, R_HIP, resized_wh=resized_wh, offset=offset)

    L_knee = _project(lm, L_KNEE, resized_wh=resized_wh, offset=offset)
    R_knee = _project(lm, R_KNEE, resized_wh=resized_wh, offset=offset)

    L_ank = _project(lm, L_ANKLE, resized_wh=resized_wh, offset=offset)
    R_ank = _project(lm, R_ANKLE, resized_wh=resized_wh, offset=offset)

    L_heel = _project(lm, L_HEEL, resized_wh=resized_wh, offset=offset)
    R_heel = _project(lm, R_HEEL, resized_wh=resized_wh, offset=offset)

    L_sh = _project(lm, L_SHOULDER, resized_wh=resized_wh, offset=offset)
    R_sh = _project(lm, R_SHOULDER, resized_wh=resized_wh, offset=offset)

    # finite sanity
    pts = [
        L_hip[0], L_hip[1], R_hip[0], R_hip[1],
        L_knee[0], L_knee[1], R_knee[0], R_knee[1],
        L_ank[0], L_ank[1], R_ank[0], R_ank[1],
    ]
    if not all(_finite(v) for v in pts):
        return None

    # --- baseline (shoulders preferred, else hips) ---
    hip_width_px = abs(R_hip[0] - L_hip[0])
    shoulder_width_px = abs(R_sh[0] - L_sh[0])

    baseline_px = float(max(shoulder_width_px, hip_width_px, config.min_baseline_px))

    # --- helper: toe center if available (better foot progression) ---
    def _toe_center(side: str) -> Optional[Tuple[float, float]]:
        if side == "left":
            a = _project(lm, L_BIG_TOE, resized_wh=resized_wh, offset=offset)
            b = _project(lm, L_SMALL_TOE, resized_wh=resized_wh, offset=offset)
            if min(_lm_vis(lm, L_BIG_TOE), _lm_vis(lm, L_SMALL_TOE)) < foot_gate:
                return None
        else:
            a = _project(lm, R_BIG_TOE, resized_wh=resized_wh, offset=offset)
            b = _project(lm, R_SMALL_TOE, resized_wh=resized_wh, offset=offset)
            if min(_lm_vis(lm, R_BIG_TOE), _lm_vis(lm, R_SMALL_TOE)) < foot_gate:
                return None

        if not (_finite(a[0]) and _finite(a[1]) and _finite(b[0]) and _finite(b[1])):
            return None
        return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)

    # --------------------------------------------------------
    # Core rear-view proxies
    # --------------------------------------------------------
    mid_hip_x = (L_hip[0] + R_hip[0]) / 2.0
    mid_ankle_x = (L_ank[0] + R_ank[0]) / 2.0
    mid_sh_x = (L_sh[0] + R_sh[0]) / 2.0

    # "midline" for rear view: blend shoulder & hip midlines for stability
    midline_x = 0.5 * (mid_sh_x + mid_hip_x)

    knee_width_px = abs(R_knee[0] - L_knee[0])
    ankle_width_px = abs(R_ank[0] - L_ank[0])
    drift_px = mid_hip_x - mid_ankle_x

    knee_width_norm = knee_width_px / baseline_px
    ankle_width_norm = ankle_width_px / baseline_px
    drift_norm = drift_px / baseline_px

    left_ankle_offset_norm = abs(L_ank[0] - midline_x) / baseline_px
    right_ankle_offset_norm = abs(R_ank[0] - midline_x) / baseline_px
    ankle_alignment_norm = (left_ankle_offset_norm + right_ankle_offset_norm) / 2.0

    left_knee_offset_norm = abs(L_knee[0] - midline_x) / baseline_px
    right_knee_offset_norm = abs(R_knee[0] - midline_x) / baseline_px
    knee_alignment_norm = (left_knee_offset_norm + right_knee_offset_norm) / 2.0

    heel_width_px = abs(R_heel[0] - L_heel[0])
    base_of_support_norm = heel_width_px / baseline_px
    knee_window_norm = knee_width_px / baseline_px

    pelvic_drop_deg = _angle_from_horizontal(L_hip[0], L_hip[1], R_hip[0], R_hip[1])

    # --------------------------------------------------------
    # Ankle eversion angle (spec param 1)
    # Angle between shank vector (KNEE→ANKLE) and rearfoot vector (ANKLE→HEEL)
    # Convention: positive = inward (pronation), negative = outward (supination)
    # --------------------------------------------------------
    def _eversion(knee, ankle, heel, side: str) -> float:
        # Shank vector: KNEE → ANKLE
        shank_x = ankle[0] - knee[0]
        shank_y = ankle[1] - knee[1]
        # Rearfoot vector: ANKLE → HEEL
        rf_x = heel[0] - ankle[0]
        rf_y = heel[1] - ankle[1]
        angle = _angle_between_vectors(shank_x, shank_y, rf_x, rf_y)
        # In rear view the left leg sits on the LEFT side of the screen
        # (opposite to front view), so the cross-product sign is inverted.
        # Negate left, keep right, to maintain positive = pronation.
        return -angle if side == "left" else angle

    left_ankle_eversion_deg = _eversion(L_knee, L_ank, L_heel, "left")
    right_ankle_eversion_deg = _eversion(R_knee, R_ank, R_heel, "right")

    # --------------------------------------------------------
    # Knee valgus: signed horizontal distance of KNEE from HIP→ANKLE line (spec param 3)
    # Positive = inward (valgus), negative = outward (varus)
    # --------------------------------------------------------
    def _knee_valgus(hip, knee, ankle, side: str) -> float:
        # Direction vector of HIP→ANKLE
        dx = ankle[0] - hip[0]
        dy = ankle[1] - hip[1]
        length = float(np.hypot(dx, dy))
        if length < 1e-6:
            return 0.0
        # Project knee onto HIP→ANKLE line; compute perpendicular distance
        # Using cross product: (ankle-hip) x (knee-hip) / |ankle-hip|
        kx = knee[0] - hip[0]
        ky = knee[1] - hip[1]
        cross = dx * ky - dy * kx
        perp = cross / length
        # For left leg: positive cross = knee is medial (valgus)
        # For right leg: flip sign for consistent convention
        return (perp / baseline_px) if side == "left" else (-perp / baseline_px)

    left_knee_valgus_norm = _knee_valgus(L_hip, L_knee, L_ank, "left")
    right_knee_valgus_norm = _knee_valgus(R_hip, R_knee, R_ank, "right")

    # heel vs ankle offsets (inward/outward proxy)
    left_heel_offset_px = L_heel[0] - L_ank[0]
    right_heel_offset_px = R_heel[0] - R_ank[0]
    heel_offset_inward_px = (left_heel_offset_px - right_heel_offset_px) / 2.0
    ankle_offset_norm = heel_offset_inward_px / baseline_px

    # foot progression proxy:
    # - prefer heel -> toe_center axis if toes are reliable
    # - else fallback to heel -> ankle axis
    L_toe = _toe_center("left")
    R_toe = _toe_center("right")

    if L_toe is not None:
        left_fpa = -_angle_from_vertical(L_heel[0], L_heel[1], L_toe[0], L_toe[1])
    else:
        left_fpa = -_angle_from_vertical(L_heel[0], L_heel[1], L_ank[0], L_ank[1])

    if R_toe is not None:
        right_fpa = _angle_from_vertical(R_heel[0], R_heel[1], R_toe[0], R_toe[1])
    else:
        right_fpa = _angle_from_vertical(R_heel[0], R_heel[1], R_ank[0], R_ank[1])

    # --------------------------------------------------------
    # NEW: pelvis center + foot tripod metrics (numeric)
    # --------------------------------------------------------
    pelvis_center = _mid(L_hip, R_hip)
    pelvis_dx_norm = (pelvis_center[0] - midline_x) / baseline_px

    # Tripod requires heel + big toe + small toe
    def _tripod(side: str) -> Optional[Tuple[Tuple[float, float], Tuple[float, float], Tuple[float, float]]]:
        if side == "left":
            heel = L_heel
            big = _project(lm, L_BIG_TOE, resized_wh=resized_wh, offset=offset)
            small = _project(lm, L_SMALL_TOE, resized_wh=resized_wh, offset=offset)
            if min(_lm_vis(lm, L_BIG_TOE), _lm_vis(lm, L_SMALL_TOE), _lm_vis(lm, L_HEEL)) < foot_gate:
                return None
        else:
            heel = R_heel
            big = _project(lm, R_BIG_TOE, resized_wh=resized_wh, offset=offset)
            small = _project(lm, R_SMALL_TOE, resized_wh=resized_wh, offset=offset)
            if min(_lm_vis(lm, R_BIG_TOE), _lm_vis(lm, R_SMALL_TOE), _lm_vis(lm, R_HEEL)) < foot_gate:
                return None

        if not all(_finite(v) for v in (heel[0], heel[1], big[0], big[1], small[0], small[1])):
            return None
        return (heel, big, small)

    L_tri = _tripod("left")
    R_tri = _tripod("right")

    # Normalize tripod area by baseline^2 (scale-invariant)
    inv_area_norm = 1.0 / (baseline_px * baseline_px)

    if L_tri is not None:
        L_area_norm = _tri_area_px2(L_tri[0], L_tri[1], L_tri[2]) * inv_area_norm
        # toe-line yaw (big->small); stable and simple
        L_yaw_deg = _angle_from_horizontal(L_tri[1][0], L_tri[1][1], L_tri[2][0], L_tri[2][1])
    else:
        L_area_norm = 0.0
        L_yaw_deg = 0.0

    if R_tri is not None:
        R_area_norm = _tri_area_px2(R_tri[0], R_tri[1], R_tri[2]) * inv_area_norm
        R_yaw_deg = _angle_from_horizontal(R_tri[1][0], R_tri[1][1], R_tri[2][0], R_tri[2][1])
    else:
        R_area_norm = 0.0
        R_yaw_deg = 0.0

    # Geometry output (kept OUT of frames aggregation)
    if geom_out is not None:
        geom_out["midline_x_px"] = float(midline_x)
        geom_out["pelvis_center_px"] = [float(pelvis_center[0]), float(pelvis_center[1])]

        if L_tri is not None:
            geom_out["foot_L_tripod_px"] = {
                "heel": [float(L_tri[0][0]), float(L_tri[0][1])],
                "big_toe": [float(L_tri[1][0]), float(L_tri[1][1])],
                "small_toe": [float(L_tri[2][0]), float(L_tri[2][1])],
            }
        if R_tri is not None:
            geom_out["foot_R_tripod_px"] = {
                "heel": [float(R_tri[0][0]), float(R_tri[0][1])],
                "big_toe": [float(R_tri[1][0]), float(R_tri[1][1])],
                "small_toe": [float(R_tri[2][0]), float(R_tri[2][1])],
            }

    if debug_out is not None:
        # quick mapping sanity (won't fail hard; just signals)
        try:
            lt = _project(lm, L_BIG_TOE, resized_wh=resized_wh, offset=offset)
            lh = _project(lm, L_HEEL, resized_wh=resized_wh, offset=offset)
            dist = float(np.hypot(lt[0] - lh[0], lt[1] - lh[1]))
            debug_out["left_toe_heel_dist_px"] = dist
        except Exception:
            debug_out["left_toe_heel_dist_px"] = 0.0

    # IMPORTANT: return float-only dict
    return {
        "knee_width_norm": float(knee_width_norm),
        "ankle_width_norm": float(ankle_width_norm),

        "ankle_knee_drift_norm": float(drift_norm),
        "drift_norm": float(drift_norm),

        "left_ankle_offset_norm": float(left_ankle_offset_norm),
        "right_ankle_offset_norm": float(right_ankle_offset_norm),
        "ankle_alignment_norm": float(ankle_alignment_norm),

        "left_knee_offset_norm": float(left_knee_offset_norm),
        "right_knee_offset_norm": float(right_knee_offset_norm),
        "knee_alignment_norm": float(knee_alignment_norm),

        "base_of_support_norm": float(base_of_support_norm),
        "knee_window_norm": float(knee_window_norm),

        "pelvic_drop_deg": float(pelvic_drop_deg),

        "ankle_offset_norm": float(ankle_offset_norm),
        "left_heel_offset_norm": float(left_heel_offset_px / baseline_px),
        "right_heel_offset_norm": float(right_heel_offset_px / baseline_px),

        "left_foot_progression_deg": float(left_fpa),
        "right_foot_progression_deg": float(right_fpa),

        "baseline_px": float(baseline_px),

        # Ankle vertical series (for cadence estimation)
        "left_ankle_y": float(L_ank[1]),
        "right_ankle_y": float(R_ank[1]),

        # NEW numeric metrics
        "pelvis_dx_norm": float(pelvis_dx_norm),
        "foot_L_tripod_area_norm": float(L_area_norm),
        "foot_R_tripod_area_norm": float(R_area_norm),
        "foot_L_yaw_deg": float(L_yaw_deg),
        "foot_R_yaw_deg": float(R_yaw_deg),

        # Spec: ankle eversion angle (param 1)
        "left_ankle_eversion_deg": float(left_ankle_eversion_deg),
        "right_ankle_eversion_deg": float(right_ankle_eversion_deg),

        # Spec: knee valgus deviation (param 3)
        "left_knee_valgus_norm": float(left_knee_valgus_norm),
        "right_knee_valgus_norm": float(right_knee_valgus_norm),
    }

# ============================================================
# Aggregation
# ============================================================

def aggregate_rear_metrics(
    frames: List[RearFrameData],
    *,
    config: RearMetricConfig = RearMetricConfig(),
    fps: float = 0.0,
) -> Optional[RearSessionMetrics]:
    """
    Aggregate frame-level rear metrics into stable session values.
    """
    if not frames:
        return None

    series: Dict[str, List[float]] = {}
    for key in frames[0].keys():
        series[key] = [float(f.get(key, np.nan)) for f in frames]

    smoothed_keys = {
        "knee_width_norm",
        "ankle_width_norm",
        "ankle_knee_drift_norm",
        "drift_norm",
        "left_ankle_offset_norm",
        "right_ankle_offset_norm",
        "ankle_alignment_norm",
        "left_knee_offset_norm",
        "right_knee_offset_norm",
        "knee_alignment_norm",
        "ankle_offset_norm",
        "base_of_support_norm",
        "knee_window_norm",
        "pelvic_drop_deg",
        "left_foot_progression_deg",
        "right_foot_progression_deg",

        # NEW numeric metrics worth smoothing
        "pelvis_dx_norm",
        "foot_L_tripod_area_norm",
        "foot_R_tripod_area_norm",
        "foot_L_yaw_deg",
        "foot_R_yaw_deg",

        # Spec params
        "left_ankle_eversion_deg",
        "right_ankle_eversion_deg",
        "left_knee_valgus_norm",
        "right_knee_valgus_norm",
    }
    smoothed: Dict[str, List[float]] = {}
    for key in smoothed_keys:
        if key in series:
            smoothed[key] = _rolling_median(series[key], window=5)

    def agg(key: str) -> float:
        values = smoothed.get(key) or series.get(key) or []
        return _aggregate(values, method=config.agg_method, trim_ratio=config.trim_ratio)

    left_whip = _range(smoothed.get("left_foot_progression_deg", series.get("left_foot_progression_deg", [])))
    right_whip = _range(smoothed.get("right_foot_progression_deg", series.get("right_foot_progression_deg", [])))

    rear_symmetry_score = compute_rear_symmetry(
        smoothed.get("left_foot_progression_deg", series.get("left_foot_progression_deg", [])),
        smoothed.get("right_foot_progression_deg", series.get("right_foot_progression_deg", [])),
        ankle_width_norm=smoothed.get("ankle_width_norm", series.get("ankle_width_norm", [])),
    )

    out: Dict[str, float] = {
        "knee_width_norm": round(agg("knee_width_norm"), 4),
        "ankle_width_norm": round(agg("ankle_width_norm"), 4),
        "ankle_knee_drift_norm": round(agg("ankle_knee_drift_norm"), 4),
        "drift_norm": round(agg("drift_norm"), 4),
        "left_ankle_offset_norm": round(agg("left_ankle_offset_norm"), 4),
        "right_ankle_offset_norm": round(agg("right_ankle_offset_norm"), 4),
        "ankle_alignment_norm": round(agg("ankle_alignment_norm"), 4),
        "left_knee_offset_norm": round(agg("left_knee_offset_norm"), 4),
        "right_knee_offset_norm": round(agg("right_knee_offset_norm"), 4),
        "knee_alignment_norm": round(agg("knee_alignment_norm"), 4),
        "ankle_offset_norm": round(agg("ankle_offset_norm"), 4),

        "base_of_support_norm": round(agg("base_of_support_norm"), 4),
        "knee_window_norm": round(agg("knee_window_norm"), 4),
        # Use abs() before aggregation: left/right drops are signed opposites
        # and would cancel each other out in a mean. We care about magnitude.
        "pelvic_drop_deg": round(_aggregate(
            [abs(v) for v in (smoothed.get("pelvic_drop_deg") or series.get("pelvic_drop_deg") or [])],
            method=config.agg_method, trim_ratio=config.trim_ratio,
        ), 2),

        "left_foot_progression_deg": round(agg("left_foot_progression_deg"), 2),
        "right_foot_progression_deg": round(agg("right_foot_progression_deg"), 2),
        "left_heel_whip_deg": round(float(left_whip), 2),
        "right_heel_whip_deg": round(float(right_whip), 2),

        "left_heel_offset_norm": round(agg("left_heel_offset_norm"), 4),
        "right_heel_offset_norm": round(agg("right_heel_offset_norm"), 4),

        "rear_symmetry_score": float(rear_symmetry_score),

        # NEW aggregated numeric metrics
        "pelvis_dx_norm": round(agg("pelvis_dx_norm"), 4),
        "foot_L_tripod_area_norm": round(agg("foot_L_tripod_area_norm"), 6),
        "foot_R_tripod_area_norm": round(agg("foot_R_tripod_area_norm"), 6),
        "foot_L_yaw_deg": round(agg("foot_L_yaw_deg"), 2),
        "foot_R_yaw_deg": round(agg("foot_R_yaw_deg"), 2),

        # Spec: ankle eversion (param 1)
        "left_ankle_eversion_deg": round(agg("left_ankle_eversion_deg"), 2),
        "right_ankle_eversion_deg": round(agg("right_ankle_eversion_deg"), 2),

        # Spec: knee valgus (param 3)
        "left_knee_valgus_norm": round(agg("left_knee_valgus_norm"), 4),
        "right_knee_valgus_norm": round(agg("right_knee_valgus_norm"), 4),
    }

    # --- GCT asymmetry from rear ankle Y (spec param 13) ---
    left_ay = series.get("left_ankle_y", [])
    right_ay = series.get("right_ankle_y", [])

    if fps > 0 and len(left_ay) > 10 and len(right_ay) > 10:
        ct_left = _rear_contact_time_ms(left_ay, fps)
        ct_right = _rear_contact_time_ms(right_ay, fps)
        if ct_left > 0 and ct_right > 0:
            avg_ct = (ct_left + ct_right) / 2.0
            out["contact_time_left"] = round(ct_left, 1)
            out["contact_time_right"] = round(ct_right, 1)
            out["contact_time"] = round(avg_ct, 1)
            out["gct_asymmetry_pct"] = round(abs(ct_left - ct_right) / avg_ct * 100, 1)

    # --- Métriques tab (rear-view-differentiators-proposal.pdf) ---
    # Métrique 1: Vitesse de pronation — peak |dθ/dt| of eversion (deg/s).
    # Métrique 2: Stabilité dynamique — 1 - CV(tripod area) during contact.
    # Métrique 2b: Affaissement du pied — (max-min)/max of tripod area.
    # Métrique 3: Profil d'asymétrie — mean of per-side metric deltas.
    left_ev_series = smoothed.get("left_ankle_eversion_deg") or series.get("left_ankle_eversion_deg") or []
    right_ev_series = smoothed.get("right_ankle_eversion_deg") or series.get("right_ankle_eversion_deg") or []

    pv_left = _peak_angular_velocity_deg_s(left_ev_series, fps)
    pv_right = _peak_angular_velocity_deg_s(right_ev_series, fps)
    if pv_left is not None:
        out["pronation_velocity_left_deg_s"] = round(pv_left, 1)
    if pv_right is not None:
        out["pronation_velocity_right_deg_s"] = round(pv_right, 1)

    left_tripod_series = smoothed.get("foot_L_tripod_area_norm") or series.get("foot_L_tripod_area_norm") or []
    right_tripod_series = smoothed.get("foot_R_tripod_area_norm") or series.get("foot_R_tripod_area_norm") or []

    pelvic_series = smoothed.get("pelvic_drop_deg") or series.get("pelvic_drop_deg") or []
    drift_avg = out.get("drift_norm", 0.0)
    stability = _foot_stability_pct(
        left_tripod_series=left_tripod_series,
        right_tripod_series=right_tripod_series,
        drift_avg=drift_avg,
        pelvic_series=pelvic_series,
        left_eversion_series=left_ev_series,
        right_eversion_series=right_ev_series,
    )
    if stability is not None:
        out["foot_stability_pct"] = round(stability, 1)

    arch = _arch_collapse_pct(
        left_tripod_series=left_tripod_series,
        right_tripod_series=right_tripod_series,
    )
    if arch is not None:
        out["arch_collapse_pct"] = round(arch, 1)

    asym = _foot_asymmetry_pct(
        gct_asym_pct=out.get("gct_asymmetry_pct"),
        left_eversion=out.get("left_ankle_eversion_deg"),
        right_eversion=out.get("right_ankle_eversion_deg"),
        left_fpa=out.get("left_foot_progression_deg"),
        right_fpa=out.get("right_foot_progression_deg"),
    )
    if asym is not None:
        out["foot_asymmetry_pct"] = round(asym, 1)

    return out


def _peak_angular_velocity_deg_s(series_deg: List[float], fps: float) -> Optional[float]:
    """Peak |dθ/dt| (deg/s) of a smoothed eversion series.
    Per rear-view-differentiators-proposal.pdf §Métrique 1, classification thresholds
    (<150 / 150-300 / >300 °/s) are defined against peak_pronation_velocity. A 3-frame
    median pre-filter is applied to suppress single-frame jitter before differentiation."""
    if not series_deg or fps <= 0:
        return None
    arr = np.array([v for v in series_deg if v is not None and not np.isnan(v)], dtype=float)
    if arr.size < 3:
        return None
    smoothed_arr = _rolling_median(arr.tolist(), window=3)
    arr = np.array(smoothed_arr, dtype=float)
    diff = np.abs(np.diff(arr)) * fps  # deg per frame -> deg per second
    if diff.size == 0:
        return None
    return float(np.nanmax(diff))


def _foot_stability_pct(
    *,
    left_tripod_series: List[float],
    right_tripod_series: List[float],
    drift_avg: float,
    pelvic_series: List[float],
    left_eversion_series: List[float],
    right_eversion_series: List[float],
) -> Optional[float]:
    """
    Per rear-view-differentiators-proposal.pdf §Métrique 2:
      stability_pct = max(0, 1 - CV(tripod_area_norm)) × 100
    where CV = std/mean of the tripod area series during contact.
    Averaged across L/R when both are available.

    Falls back to the prior drift+pelvic+eversion composite when the tripod
    series is unusable (occluded toes, sparse landmarks).
    """
    tripod_score = _tripod_cv_stability(left_tripod_series, right_tripod_series)
    if tripod_score is not None:
        return tripod_score

    drift_pen = min(abs(float(drift_avg or 0.0)) / 0.10, 1.0)

    pelvic_arr = np.array([abs(v) for v in pelvic_series if v is not None and not np.isnan(v)], dtype=float)
    pelvic_var = float(np.nanvar(pelvic_arr)) if pelvic_arr.size >= 5 else 0.0
    pelvic_pen = min(pelvic_var / 25.0, 1.0)

    def _ev_var(s: List[float]) -> float:
        a = np.array([v for v in s if v is not None and not np.isnan(v)], dtype=float)
        return float(np.nanvar(a)) if a.size >= 5 else 0.0

    ev_var = (_ev_var(left_eversion_series) + _ev_var(right_eversion_series)) / 2.0
    ev_pen = min(ev_var / 9.0, 1.0)

    if drift_pen == 0.0 and pelvic_pen == 0.0 and ev_pen == 0.0:
        # Not enough signal to score
        return None

    score = 100.0 * (1.0 - 0.4 * drift_pen - 0.3 * pelvic_pen - 0.3 * ev_pen)
    return max(0.0, min(100.0, score))


def _tripod_cv_stability(
    left_series: List[float],
    right_series: List[float],
) -> Optional[float]:
    """Mean of (1 - CV) × 100 across both feet's tripod-area series.
    Returns None when neither side has ≥5 valid samples or mean ≈ 0."""
    parts: List[float] = []
    for s in (left_series, right_series):
        a = np.array([v for v in s if v is not None and not np.isnan(v)], dtype=float)
        if a.size < 5:
            continue
        mean = float(np.nanmean(a))
        if mean <= 1e-9:
            continue
        cv = float(np.nanstd(a)) / mean
        parts.append(max(0.0, min(1.0, 1.0 - cv)) * 100.0)
    if not parts:
        return None
    return float(np.mean(parts))


def _arch_collapse_pct(
    *,
    left_tripod_series: List[float],
    right_tripod_series: List[float],
) -> Optional[float]:
    """Per rear-view-differentiators-proposal.pdf §Métrique 2 complementary:
      tripod_collapse_ratio = (max - min) / max  (per side, during contact)
    Returned as a 0–100 percentage averaged across L/R. Frontend buckets:
    <10% rigid, 10–25% normal, >25% significant collapse."""
    parts: List[float] = []
    for s in (left_tripod_series, right_tripod_series):
        a = np.array([v for v in s if v is not None and not np.isnan(v)], dtype=float)
        if a.size < 5:
            continue
        mx = float(np.nanmax(a))
        mn = float(np.nanmin(a))
        if mx <= 1e-9:
            continue
        parts.append(max(0.0, min(1.0, (mx - mn) / mx)) * 100.0)
    if not parts:
        return None
    return float(np.mean(parts))


def _foot_asymmetry_pct(
    *,
    gct_asym_pct: Optional[float],
    left_eversion: Optional[float],
    right_eversion: Optional[float],
    left_fpa: Optional[float],
    right_fpa: Optional[float],
) -> Optional[float]:
    """
    Composite L/R asymmetry percentage (0–100, higher = more asymmetric).
    Mean of available components:
      - GCT asymmetry % (already 0-100, capped at 50)
      - |L-R eversion| scaled so 10° = 50%
      - |L-R foot progression| scaled so 8° = 50%
    Returns None if no signal is available.
    """
    parts: List[float] = []
    if gct_asym_pct is not None and not np.isnan(gct_asym_pct):
        parts.append(min(float(gct_asym_pct), 50.0))
    if left_eversion is not None and right_eversion is not None:
        parts.append(min(abs(float(left_eversion) - float(right_eversion)) / 10.0 * 50.0, 50.0))
    if left_fpa is not None and right_fpa is not None:
        parts.append(min(abs(float(left_fpa) - float(right_fpa)) / 8.0 * 50.0, 50.0))
    if not parts:
        return None
    # Average components — keeps the scale 0–50 for typical, 50–100 for extreme.
    return float(sum(parts) / len(parts))


def _rear_contact_time_ms(ankle_y: List[float], fps: float) -> float:
    """
    Estimate ground contact time from ankle Y series (rear view).
    Contact = foot on ground = ankle at lowest Y position (highest on screen).
    Uses peak detection on inverted Y + 15% amplitude threshold.

    NOTE — GCT measurement differs between views:
      • Rear view (this function): forward-only search from each IC peak to the
        first frame exceeding the contact threshold. The rear camera geometry
        foreshortens vertical ankle motion differently than a side view.
      • Side view (side_metrics.compute_contact_time_ms): uses bidirectional
        expansion from each IC peak (both backward and forward) to find the
        full contact window via ankle Y position.
    Because of these geometric and algorithmic differences, GCT values from
    rear and side views should NOT be directly compared.
    """
    y = np.array(ankle_y, dtype=float)
    if len(y) < 10 or fps <= 0:
        return 0.0

    # Smooth
    kernel = np.ones(5) / 5
    y = np.convolve(y, kernel, mode="same")

    amp = float(np.nanmax(y) - np.nanmin(y))
    if amp < 1e-6:
        return 0.0

    inv = -y
    min_dist = max(int(0.30 * fps), 1)
    prom = 0.08 * amp

    peaks, _ = find_peaks(inv, distance=min_dist, prominence=prom)
    if len(peaks) < 2:
        return 0.0

    thresh = 0.15 * amp
    durations = []
    for p in peaks:
        base = y[p]
        for j in range(int(p) + 1, len(y)):
            if y[j] > base + thresh:
                contact_frames = j - int(p)
                durations.append(contact_frames / fps * 1000.0)
                break

    if not durations:
        return 0.0
    return float(np.nanmean(durations))

# ============================================================
# Interpretation helpers (optional layer)
# ============================================================

def rear_drift_hint(drift_norm: float, ankle_offset_norm: float) -> str:
    if drift_norm > 0.06 or ankle_offset_norm > 0.03:
        return "Higher inward collapse observed; stability options may help."
    if drift_norm < -0.03 or ankle_offset_norm < -0.03:
        return "Lower inward collapse observed; neutral options likely suitable."
    return "Moderate rear-foot alignment observed."

def rear_pronation_bucket(drift_norm: float, ankle_offset_norm: float) -> str:
    offset = _safe_float(ankle_offset_norm, 0.0)
    if drift_norm > 0.06 or offset > 0.03:
        return "higher_inward_collapse"
    if drift_norm < -0.03 or offset < -0.03:
        return "lower_inward_collapse"
    return "moderate_alignment"
