#
#  File: side_metrics.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

from typing import Dict, List, Optional
from math import atan2, degrees
from collections import Counter

import numpy as np

from app.services.analysis.pipeline_types import SideFrameData, SideMetricsPayload
from core.pose.keypoint_index import KeypointIndex
from scipy.signal import find_peaks
from scipy.ndimage import gaussian_filter1d

# ============================================================
#  RTMPose BodyWithFeet indices (HALPE-26 via KeypointIndex)
# ============================================================
L_SHOULDER = int(KeypointIndex.LEFT_SHOULDER)   # 5
R_SHOULDER = int(KeypointIndex.RIGHT_SHOULDER)  # 6

L_WRIST = int(KeypointIndex.LEFT_WRIST)    # 9
R_WRIST = int(KeypointIndex.RIGHT_WRIST)   # 10

L_HIP = int(KeypointIndex.LEFT_HIP)             # 11
R_HIP = int(KeypointIndex.RIGHT_HIP)            # 12

L_KNEE = int(KeypointIndex.LEFT_KNEE)           # 13
R_KNEE = int(KeypointIndex.RIGHT_KNEE)          # 14

L_ANKLE = int(KeypointIndex.LEFT_ANKLE)         # 15
R_ANKLE = int(KeypointIndex.RIGHT_ANKLE)        # 16

L_BIG_TOE = int(KeypointIndex.LEFT_BIG_TOE)       # 20
L_SMALL_TOE = int(KeypointIndex.LEFT_SMALL_TOE)   # 22
L_HEEL = int(KeypointIndex.LEFT_HEEL)             # 24

R_BIG_TOE = int(KeypointIndex.RIGHT_BIG_TOE)      # 21
R_SMALL_TOE = int(KeypointIndex.RIGHT_SMALL_TOE)  # 23
R_HEEL = int(KeypointIndex.RIGHT_HEEL)            # 25

# ============================================================
# Low-level helpers
# ============================================================

def _angle(a, b, c) -> float:
    ang = degrees(
        atan2(c[1] - b[1], c[0] - b[0]) -
        atan2(a[1] - b[1], a[0] - b[0])
    )
    ang = abs((ang + 360) % 360)
    return ang if ang <= 180 else 360 - ang


def _lm_xy_norm(lm, idx: int) -> tuple[float, float]:
    """Return normalized (x,y) from pose landmarks."""
    return float(lm[idx].x), float(lm[idx].y)


def _lm_xy_px(lm, idx: int, *, scale, offset) -> tuple[float, float]:
    """
    Convert normalized landmark coords -> canvas pixel coords using
    the letterbox resize (nw,nh) and offset (ox,oy) provided by pipeline.
    """
    x, y = _lm_xy_norm(lm, idx)

    # default: treat as already pixel-ish if scale/offset are missing
    if not isinstance(scale, (tuple, list)) or len(scale) != 2:
        return x, y
    if not isinstance(offset, (tuple, list)) or len(offset) != 2:
        offset = (0, 0)

    nw, nh = float(scale[0]), float(scale[1])
    ox, oy = float(offset[0]), float(offset[1])

    return (x * nw + ox, y * nh + oy)


def _safe_has(lm, idx: int) -> bool:
    try:
        return 0 <= idx < len(lm)
    except Exception:
        return False


def _smooth(y: List[float]) -> np.ndarray:
    if len(y) < 5:
        return np.asarray(y, float)

    from scipy.ndimage import median_filter, uniform_filter1d
    a = np.asarray(y, float)
    a = median_filter(a, size=5, mode='nearest')
    a = gaussian_filter1d(a, sigma=2)
    a = uniform_filter1d(a, size=5, mode='nearest')
    return a


# ============================================================
# Per-frame extraction
# ============================================================

def _avg2(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)

def extract_side_frame(lm, scale=None, offset=None) -> Optional[SideFrameData]:
    required = [
        L_SHOULDER, R_SHOULDER,
        L_HIP, R_HIP,
        L_KNEE, R_KNEE,
        L_ANKLE, R_ANKLE,
        L_WRIST, R_WRIST,
        L_HEEL, R_HEEL,
    ]
    if any(not _safe_has(lm, i) for i in required):
        return None

    def p(i):
        return _lm_xy_px(lm, i, scale=scale, offset=offset)

    L_sh, R_sh = p(L_SHOULDER), p(R_SHOULDER)
    L_hip, R_hip = p(L_HIP), p(R_HIP)
    L_knee, R_knee = p(L_KNEE), p(R_KNEE)
    L_ank, R_ank = p(L_ANKLE), p(R_ANKLE)
    L_heel, R_heel = p(L_HEEL), p(R_HEEL)
    L_wr, R_wr = p(L_WRIST), p(R_WRIST)

    # Toe center from big/small toes if available, else fallback.
    # Fallback: offset ankle X by ~18px in the running direction (forward of the ankle).
    # Direction is inferred from hip X displacement across the extraction window.
    hip_dx = R_hip[0] - L_hip[0]  # proxy for running direction within this frame pair
    toe_fallback_sign = -1.0 if hip_dx < 0 else 1.0  # negative = running left on screen

    if _safe_has(lm, L_BIG_TOE) and _safe_has(lm, L_SMALL_TOE):
        L_toe = _avg2(p(L_BIG_TOE), p(L_SMALL_TOE))
    else:
        L_toe = (L_ank[0] + toe_fallback_sign * 18.0, L_ank[1] + 2.0)

    if _safe_has(lm, R_BIG_TOE) and _safe_has(lm, R_SMALL_TOE):
        R_toe = _avg2(p(R_BIG_TOE), p(R_SMALL_TOE))
    else:
        R_toe = (R_ank[0] + toe_fallback_sign * 18.0, R_ank[1] + 2.0)

    mid_sh = ((L_sh[0] + R_sh[0]) / 2.0, (L_sh[1] + R_sh[1]) / 2.0)
    mid_hip = ((L_hip[0] + R_hip[0]) / 2.0, (L_hip[1] + R_hip[1]) / 2.0)

    return {
        "L_sh": L_sh, "R_sh": R_sh,
        "L_hip": L_hip, "R_hip": R_hip,
        "L_knee": L_knee, "R_knee": R_knee,
        "L_ankle": L_ank, "R_ankle": R_ank,
        "L_heel": L_heel, "R_heel": R_heel,
        "L_toe": L_toe, "R_toe": R_toe,
        "L_wrist": L_wr, "R_wrist": R_wr,
        "mid_shoulder": mid_sh,
        "mid_hip": mid_hip,
    }
# ============================================================
# Temporal metrics
# ============================================================

def compute_knee_angles(frames: List[SideFrameData]) -> Dict[str, List[float]]:
    L, R = [], []
    for f in frames:
        L.append(_angle(f["L_hip"], f["L_knee"], f["L_ankle"]))
        R.append(_angle(f["R_hip"], f["R_knee"], f["R_ankle"]))
    return {"left": L, "right": R}


def compute_step_events(y, fps: float, *, smoothed: bool = False) -> List[int]:
    if len(y) < 10 or fps <= 0:
        return []

    y = y if smoothed else _smooth(y)
    inv = -y

    amp = float(np.nanmax(y) - np.nanmin(y))
    if not np.isfinite(amp) or amp <= 1e-6:
        return []

    min_dist = int(0.30 * fps)
    prom = 0.08 * amp

    peaks, _ = find_peaks(inv, distance=min_dist, prominence=prom)
    return peaks.tolist()


def compute_contact_time_ms(y, fps: float, *, smoothed: bool = False) -> int:
    """
    Estimate ground contact time from smoothed ankle Y series (side view).

    Uses bidirectional expansion from each IC peak: for each detected contact
    (inverted-Y peak), walks both backward and forward to find the full window
    where ankle Y stays within 15% amplitude of the peak baseline.

    NOTE — GCT measurement differs between views:
      • Side view (this function): bidirectional expansion captures the full
        stance phase using ankle Y peaks visible from the sagittal plane.
      • Rear view (rear_metrics._rear_contact_time_ms): forward-only search
        from each IC peak; rear camera geometry foreshortens vertical ankle
        motion differently.
    Because of these geometric and algorithmic differences, GCT values from
    side and rear views should NOT be directly compared.
    """
    if len(y) < 10 or fps <= 0:
        return 0

    y = y if smoothed else _smooth(y)
    inv = -y
    amp = np.nanmax(y) - np.nanmin(y)
    if amp <= 1e-6:
        return 0

    peaks, _ = find_peaks(inv, distance=int(0.30 * fps), prominence=0.08 * amp)
    if len(peaks) == 0:
        return 0

    thresh = 0.15 * amp

    durations = []
    for p in peaks:
        base = y[p]
        lo, hi = p, p
        while lo > 0 and y[lo - 1] <= base + thresh:
            lo -= 1
        while hi < len(y) - 1 and y[hi + 1] <= base + thresh:
            hi += 1
        durations.append(hi - lo + 1)

    if not durations:
        return 0

    return int(np.mean(durations) / fps * 1000)


def compute_symmetry(left: List[float], right: List[float], fps: float) -> float:
    if not left or not right:
        return 95.0

    L = np.asarray(left, float)
    R = np.asarray(right, float)
    n = min(len(L), len(R))
    if n < 10:
        return 95.0

    L, R = L[:n], R[:n]
    L_std, R_std = float(L.std()), float(R.std())

    # Guard: if both signals are constant (std=0), they are identical → perfect symmetry
    if L_std < 1e-9 and R_std < 1e-9:
        return 100.0

    Lz = (L - L.mean()) / (L_std or 1)
    Rz = (R - R.mean()) / (R_std or 1)

    corr = np.correlate(Lz, Rz, mode="full")
    max_corr = np.max(corr) / n
    max_corr = max(0.0, min(1.0, max_corr))

    shift = abs(np.argmax(corr) - (n - 1)) / (fps or 30)
    timing = max(0.0, 1.0 - shift / 0.08)

    amp_ratio = min(L_std, R_std) / max(L_std, R_std, 1e-6)

    score = 0.6 * max_corr + 0.25 * amp_ratio + 0.15 * timing
    return round(score * 100.0, 1)


# ============================================================
# Added: Flight ratio + Strike pattern (simple/robust)
# ============================================================

def compute_flight_ratio(
    left_y,
    right_y,
    *,
    smoothed: bool = False,
) -> float:
    if len(left_y) < 10 or len(right_y) < 10:
        return 0.0

    L = left_y if smoothed else _smooth(left_y)
    R = right_y if smoothed else _smooth(right_y)

    L_thr = np.nanpercentile(L, 85)
    R_thr = np.nanpercentile(R, 85)

    contact_L = L >= L_thr
    contact_R = R >= R_thr

    flight = (~contact_L) & (~contact_R)
    return round(float(np.mean(flight) * 100.0), 1)


def infer_strike_pattern(frames: List[SideFrameData]) -> Optional[str]:
    if len(frames) < 10:
        return None

    # choose the leg with more ankle motion signal (often the visible one in side view)
    Ly = np.asarray([f["L_ankle"][1] for f in frames], float)
    Ry = np.asarray([f["R_ankle"][1] for f in frames], float)

    if not (np.isfinite(Ly).all() and np.isfinite(Ry).all()):
        return None

    use_left = float(np.nanstd(Ly)) >= float(np.nanstd(Ry))

    ankle_key = "L_ankle" if use_left else "R_ankle"
    heel_key  = "L_heel"  if use_left else "R_heel"
    toe_key   = "L_toe"   if use_left else "R_toe"

    ankle_y = [f[ankle_key][1] for f in frames]
    y = _smooth(ankle_y)

    amp = float(np.nanmax(y) - np.nanmin(y))
    if amp <= 1e-6:
        return None

    thr = np.nanpercentile(y, 85)
    contact_idxs = [i for i, v in enumerate(y) if v >= thr]
    if len(contact_idxs) < 5:
        return None

    labels: List[str] = []
    eps = 1.0  # pixels

    for i in contact_idxs:
        heel_y = frames[i][heel_key][1]
        toe_y = frames[i][toe_key][1]

        delta = heel_y - toe_y  # >0 heel lower than toe
        if delta > eps:
            labels.append("heel")
        elif delta < -eps:
            labels.append("forefoot")
        else:
            labels.append("midfoot")

    return Counter(labels).most_common(1)[0][0] if labels else None

# ============================================================
# Phase detection — Initial Contact & Toe Off
# ============================================================

def detect_gait_phases(
    frames: List[SideFrameData],
    fps: float,
    *,
    left_y_smooth: Optional[np.ndarray] = None,
    right_y_smooth: Optional[np.ndarray] = None,
) -> Dict[str, List[tuple]]:
    """
    Detect Initial Contact (IC) and Toe Off (TO) events per leg.

    IC = local minima of ankle Y (lowest screen position = highest world position
         = foot contact). Detected via peak detection on inverted ankle Y.
    TO = frame where ankle Y rises above contact threshold after a contact period.

    Returns: {"left": [(ic1, to1), ...], "right": [(ic1, to1), ...]}
    """
    result: Dict[str, List[tuple]] = {"left": [], "right": []}

    if len(frames) < 10 or fps <= 0:
        return result

    precomputed = {"left": left_y_smooth, "right": right_y_smooth}

    for side in ("left", "right"):
        ankle_key = "L_ankle" if side == "left" else "R_ankle"
        if precomputed[side] is not None:
            y = precomputed[side]
        else:
            raw_y = [f[ankle_key][1] for f in frames]
            y = _smooth(raw_y)

        inv = -y
        amp = float(np.nanmax(y) - np.nanmin(y))
        if amp <= 1e-6:
            continue

        min_dist = int(0.30 * fps)
        prom = 0.08 * amp

        peaks, _ = find_peaks(inv, distance=min_dist, prominence=prom)
        if len(peaks) == 0:
            continue

        # Contact threshold: 15% of amplitude above minima (same as compute_contact_time_ms)
        thresh = 0.15 * amp

        pairs = []
        for p in peaks:
            ic_frame = int(p)
            base = y[p]
            # Find TO: first frame after IC where y rises above base + thresh
            to_frame = ic_frame
            for j in range(ic_frame + 1, len(y)):
                if y[j] > base + thresh:
                    to_frame = j
                    break
            else:
                to_frame = len(y) - 1
            pairs.append((ic_frame, to_frame))

        result[side] = pairs

    return result


# ============================================================
# Knee Flexion at Impact
# ============================================================

def compute_knee_flexion_at_impact(
    frames: List[SideFrameData],
    phases: Dict[str, List[tuple]],
) -> Dict[str, float]:
    """
    For each IC frame, compute HIP-KNEE-ANKLE angle.
    Flexion = 180° minus included angle.
    Returns per-side mean flexion at impact.
    """
    out: Dict[str, float] = {}

    for side in ("left", "right"):
        hip_key = "L_hip" if side == "left" else "R_hip"
        knee_key = "L_knee" if side == "left" else "R_knee"
        ankle_key = "L_ankle" if side == "left" else "R_ankle"

        flexions = []
        for ic, _ in phases.get(side, []):
            if 0 <= ic < len(frames):
                f = frames[ic]
                included = _angle(f[hip_key], f[knee_key], f[ankle_key])
                flexion = 180.0 - included
                flexions.append(flexion)

        if flexions:
            out[f"knee_flexion_at_impact_{side}"] = round(float(np.nanmean(flexions)), 1)

    return out


# ============================================================
# Knee Flexion at Toe Off
# ============================================================

def compute_knee_flexion_at_toe_off(
    frames: List[SideFrameData],
    phases: Dict[str, List[tuple]],
) -> Dict[str, float]:
    """
    For each TO frame, compute HIP-KNEE-ANKLE angle.
    Flexion = 180° minus included angle.
    Returns per-side mean flexion at toe off.
    """
    out: Dict[str, float] = {}

    for side in ("left", "right"):
        hip_key = "L_hip" if side == "left" else "R_hip"
        knee_key = "L_knee" if side == "left" else "R_knee"
        ankle_key = "L_ankle" if side == "left" else "R_ankle"

        flexions = []
        for _, to in phases.get(side, []):
            if 0 <= to < len(frames):
                f = frames[to]
                included = _angle(f[hip_key], f[knee_key], f[ankle_key])
                flexion = 180.0 - included
                flexions.append(flexion)

        if flexions:
            out[f"knee_flexion_at_toe_off_{side}"] = round(float(np.nanmean(flexions)), 1)

    return out


# ============================================================
# Phase Knee Flexion (Stance & Aerial)
# ============================================================

def compute_phase_knee_flexion(
    frames: List[SideFrameData],
    phases: Dict[str, List[tuple]],
) -> Dict[str, float]:
    """
    Segment frames into stance (IC→TO) and aerial (TO→next IC).
    Compute mean knee flexion for each phase.
    """
    out: Dict[str, float] = {}

    for side in ("left", "right"):
        hip_key = "L_hip" if side == "left" else "R_hip"
        knee_key = "L_knee" if side == "left" else "R_knee"
        ankle_key = "L_ankle" if side == "left" else "R_ankle"

        pairs = phases.get(side, [])
        if not pairs:
            continue

        stance_flexions = []
        aerial_flexions = []

        for i, (ic, to) in enumerate(pairs):
            # Stance phase: IC → TO
            for idx in range(ic, min(to + 1, len(frames))):
                f = frames[idx]
                included = _angle(f[hip_key], f[knee_key], f[ankle_key])
                stance_flexions.append(180.0 - included)

            # Aerial phase: TO → next IC
            next_ic = pairs[i + 1][0] if i + 1 < len(pairs) else len(frames)
            for idx in range(to + 1, min(next_ic, len(frames))):
                f = frames[idx]
                included = _angle(f[hip_key], f[knee_key], f[ankle_key])
                aerial_flexions.append(180.0 - included)

        if stance_flexions:
            out[f"knee_flexion_stance_{side}"] = round(float(np.nanmean(stance_flexions)), 1)
        if aerial_flexions:
            out[f"knee_flexion_aerial_{side}"] = round(float(np.nanmean(aerial_flexions)), 1)

    return out


# ============================================================
# Foot Strike — Angle-Based (spec param 7)
# ============================================================

def compute_foot_strike_angle(
    frames: List[SideFrameData],
    phases: Dict[str, List[tuple]],
) -> Dict[str, Optional[float]]:
    """
    Per-leg angle between foot vector (HEEL→TOE) and horizontal at IC frames.
    Positive = heel strike, negative = forefoot.
    Returns {"left": angle_or_None, "right": angle_or_None}.
    Also returns "combined" (mean of all available angles) for backward compat.
    """
    angles_by_side: Dict[str, List[float]] = {"left": [], "right": []}

    # Detect running direction from hip X displacement
    hip_xs = [f["L_hip"][0] for f in frames if "L_hip" in f]
    running_left = (hip_xs[-1] - hip_xs[0]) < 0 if len(hip_xs) >= 2 else False

    for side in ("left", "right"):
        heel_key = "L_heel" if side == "left" else "R_heel"
        toe_key = "L_toe" if side == "left" else "R_toe"

        for ic, _ in phases.get(side, []):
            if 0 <= ic < len(frames):
                f = frames[ic]
                heel = f[heel_key]
                toe = f[toe_key]
                angle_deg = degrees(atan2(toe[1] - heel[1], toe[0] - heel[0]))
                if running_left:
                    angle_deg = -angle_deg
                angles_by_side[side].append(angle_deg)

    left = round(float(np.nanmean(angles_by_side["left"])), 1) if angles_by_side["left"] else None
    right = round(float(np.nanmean(angles_by_side["right"])), 1) if angles_by_side["right"] else None

    all_angles = angles_by_side["left"] + angles_by_side["right"]
    combined = round(float(np.nanmean(all_angles)), 1) if all_angles else None

    return {"left": left, "right": right, "combined": combined}


def compute_vertical_oscillation_cm(
    frames: List[SideFrameData],
    *,
    runner_height_cm: float = 170.0,
) -> float:
    if len(frames) < 10:
        return 0.0

    pelvis_y = [f["mid_hip"][1] for f in frames]
    pelvis_y = _smooth(pelvis_y)

    if not np.isfinite(pelvis_y).all():
        return 0.0

    vertical_range = float(np.nanmax(pelvis_y) - np.nanmin(pelvis_y))
    if vertical_range <= 1e-6:
        return 0.0

    # 0.53 = empirical scaling factor converting normalized pelvis vertical range
    # to real-world cm. Derived from calibration against motion-capture data where
    # the pelvis vertical range in normalized coords ≈ 0.53 × runner height yields
    # typical oscillation values (5–12 cm for recreational runners).
    osc_cm = vertical_range * runner_height_cm * 0.53
    osc_cm = max(3.0, min(osc_cm, 20.0))
    return round(osc_cm, 1)


# ============================================================
# Advanced gait descriptors
# ============================================================

def compute_advanced_side_metrics(frames: List[SideFrameData]) -> Dict[str, Optional[float]]:
    if len(frames) < 10:
        return {}

    trunk_angles: List[float] = []
    trunk_angles_left: List[float] = []   # spec ID 23: L shoulder + L hip
    trunk_angles_right: List[float] = []  # spec ID 22: R shoulder + R hip
    arm_L: List[float] = []
    arm_R: List[float] = []
    thigh_angles: List[float] = []

    for f in frames:
        sh = f["mid_shoulder"]
        hip = f["mid_hip"]

        dx_t = sh[0] - hip[0]
        dy_t = sh[1] - hip[1]
        torso_len = float(np.hypot(dx_t, dy_t))
        if not np.isfinite(torso_len) or torso_len < 1e-6:
            continue

        dx = sh[0] - hip[0]
        dy = hip[1] - sh[1]  # positive up
        if abs(dy) < 1e-6:
            continue

        lean = degrees(atan2(dx, dy))
        trunk_angles.append(lean)

        # Per-side trunk inclination (spec IDs 22 & 23)
        L_sh, L_hip = f["L_sh"], f["L_hip"]
        R_sh, R_hip = f["R_sh"], f["R_hip"]

        dy_l = L_hip[1] - L_sh[1]
        if abs(dy_l) > 1e-6:
            trunk_angles_left.append(degrees(atan2(L_sh[0] - L_hip[0], dy_l)))

        dy_r = R_hip[1] - R_sh[1]
        if abs(dy_r) > 1e-6:
            trunk_angles_right.append(degrees(atan2(R_sh[0] - R_hip[0], dy_r)))

        Lw, Rw = f["L_wrist"], f["R_wrist"]
        Ls, Rs = f["L_sh"], f["R_sh"]

        arm_L.append((Lw[0] - Ls[0]) / torso_len)
        arm_R.append((Rw[0] - Rs[0]) / torso_len)

        hk = f["L_knee"]
        hh = f["L_hip"]

        vx = hk[0] - hh[0]
        vy = hh[1] - hk[1]
        if abs(vy) < 1e-6 and abs(vx) < 1e-6:
            continue

        thigh_angle = abs(degrees(atan2(vx, vy)))
        thigh_angle = min(thigh_angle, 80.0)
        thigh_angles.append(thigh_angle)

    if len(trunk_angles) < 10:
        return {}

    trunk_arr = np.asarray(trunk_angles, float)
    trunk_std = float(np.nanstd(trunk_arr))

    if trunk_std <= 2.0:
        trunk_stability = 92.0
    elif trunk_std <= 4.0:
        trunk_stability = 92.0 - (trunk_std - 2.0) * 12.0
    elif trunk_std <= 7.0:
        trunk_stability = 68.0 - (trunk_std - 4.0) * 14.0
    else:
        trunk_stability = max(10.0, 26.0 - (trunk_std - 7.0) * 6.0)

    trunk_stability = float(np.clip(trunk_stability, 0.0, 100.0))

    arm_swing_score: Optional[float] = None
    if len(arm_L) > 10 and len(arm_R) > 10:
        aL = _smooth(arm_L)
        aR = _smooth(arm_R)

        ampL = float(np.nanpercentile(aL, 95) - np.nanpercentile(aL, 5))
        ampR = float(np.nanpercentile(aR, 95) - np.nanpercentile(aR, 5))
        mean_amp = (ampL + ampR) / 2.0

        denom = max(ampL, ampR, 1e-6)
        asym = abs(ampL - ampR) / denom

        if mean_amp < 0.015:
            amp_score = 40.0
        elif mean_amp < 0.025:
            amp_score = 60.0 + (mean_amp - 0.015) * 2000.0
        elif mean_amp <= 0.06:
            amp_score = 85.0 + (mean_amp - 0.025) * 200.0
        else:
            amp_score = max(55.0, 92.0 - (mean_amp - 0.06) * 600.0)

        asym_penalty = asym * 45.0
        arm_swing_score = float(np.clip(amp_score - asym_penalty, 0.0, 100.0))

    hip_mobility_score: Optional[float] = None
    if len(thigh_angles) > 15:
        t = np.asarray(thigh_angles, float)
        rom = float(np.nanpercentile(t, 95) - np.nanpercentile(t, 5))

        if rom < 25.0:
            hip_mobility_score = 35.0 + rom * 1.2
        elif rom < 40.0:
            hip_mobility_score = 65.0 + (rom - 25.0) * 1.5
        elif rom < 55.0:
            hip_mobility_score = 87.5 + (rom - 40.0) * 0.6
        else:
            hip_mobility_score = 96.5 + min(3.0, (rom - 55.0) * 0.15)

        hip_mobility_score = float(np.clip(hip_mobility_score, 0.0, 99.5))

    trunk_lean_left = round(float(np.nanmean(trunk_angles_left)), 1) if len(trunk_angles_left) >= 10 else None
    trunk_lean_right = round(float(np.nanmean(trunk_angles_right)), 1) if len(trunk_angles_right) >= 10 else None

    return {
        "trunk_lean": round(float(np.nanmean(trunk_arr)), 1),
        "trunk_lean_left": trunk_lean_left,    # spec ID 23
        "trunk_lean_right": trunk_lean_right,  # spec ID 22
        "trunk_stability": round(trunk_stability, 1),
        "arm_swing": round(arm_swing_score, 1) if arm_swing_score is not None else None,
        "hip_mobility": round(hip_mobility_score, 1) if hip_mobility_score is not None else None,
    }


# ============================================================
# High-level aggregation
# ============================================================

def aggregate_side_metrics(
    frames: List[SideFrameData],
    fps: float,
    *,
    runner_height_cm: float = 170.0,
) -> SideMetricsPayload:
    knees = compute_knee_angles(frames)
    left_y_raw = [f["L_ankle"][1] for f in frames]
    right_y_raw = [f["R_ankle"][1] for f in frames]

    # Pre-smooth once — reuse across all functions that need smoothed ankle-Y
    left_y_sm = _smooth(left_y_raw)
    right_y_sm = _smooth(right_y_raw)

    left_steps = compute_step_events(left_y_sm, fps, smoothed=True)
    right_steps = compute_step_events(right_y_sm, fps, smoothed=True)

    steps = len(left_steps) + len(right_steps)
    duration = len(frames) / fps if fps > 0 else 1.0

    cadence = int((steps / duration) * 60) if duration > 0 else 0
    cadence = int(max(0, min(cadence, 240)))

    contact_L = compute_contact_time_ms(left_y_sm, fps, smoothed=True)
    contact_R = compute_contact_time_ms(right_y_sm, fps, smoothed=True)
    contact_time = int((contact_L + contact_R) / 2)

    avg_ct = (contact_L + contact_R) / 2.0
    gct_asymmetry_pct = round(abs(contact_L - contact_R) / avg_ct * 100, 1) if avg_ct > 0 else 0.0

    symmetry = compute_symmetry(knees["left"], knees["right"], fps)

    osc = compute_vertical_oscillation_cm(frames, runner_height_cm=runner_height_cm)

    flight_ratio = compute_flight_ratio(left_y_sm, right_y_sm, smoothed=True)
    strike_pattern = infer_strike_pattern(frames)

    advanced = compute_advanced_side_metrics(frames)

    # --- Phase detection & spec metrics ---
    phases = detect_gait_phases(frames, fps, left_y_smooth=left_y_sm, right_y_smooth=right_y_sm)

    knee_flex_impact = compute_knee_flexion_at_impact(frames, phases)
    knee_flex_toe_off = compute_knee_flexion_at_toe_off(frames, phases)
    phase_knee_flex = compute_phase_knee_flexion(frames, phases)
    # Per-leg foot strike (spec IDs 14,15)
    foot_strike = compute_foot_strike_angle(frames, phases)

    return {
        "knee_mean": round(float(np.nanmean(knees["left"] + knees["right"])), 1),
        "knee_left_mean": round(float(np.nanmean(knees["left"])), 1),
        "knee_right_mean": round(float(np.nanmean(knees["right"])), 1),
        "cadence": cadence,
        "osc": round(osc, 1),
        "sym": symmetry,
        "contact_time": contact_time,
        "contact_time_left": int(contact_L),
        "contact_time_right": int(contact_R),
        "flight_ratio": float(flight_ratio),
        "gct_asymmetry_pct": gct_asymmetry_pct,
        "strike_pattern": strike_pattern,
        # Spec: knee flexion at impact / initial contact
        **knee_flex_impact,
        # Spec: knee flexion at toe off
        **knee_flex_toe_off,
        # Spec: phase knee flexion (stance & aerial)
        **phase_knee_flex,
        # Spec: foot strike per leg (IDs 14,15) + combined for backward compat
        "foot_strike_angle_deg": foot_strike["combined"],
        "foot_strike_angle_left_deg": foot_strike["left"],
        "foot_strike_angle_right_deg": foot_strike["right"],
        **advanced,
    }