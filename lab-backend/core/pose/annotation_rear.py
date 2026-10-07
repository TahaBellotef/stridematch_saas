# core/pose/annotation_rear.py
from __future__ import annotations

from typing import Dict, Any, Tuple, Optional
import logging
import os
import math

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.visualization_config import LABEL_BG, LABEL_TXT, OUT_W, OUT_H, STORE_DEBUG_SERIES
from core.pose.keypoint_index import KeypointIndex

logger = logging.getLogger(__name__)

# ============================================================
# Colors (REAR VIEW)
# ============================================================

COLOR_BLUE = (99, 102, 241)
COLOR_JOINT = (0, 255, 127)          # #00FF7F green
COLOR_JOINT_OUTLINE = (255, 255, 255)   # white border ring
COLOR_BADGE_OK = (34, 197, 94)
COLOR_BADGE_WARN = (249, 115, 22)


# Bold pill font — use bundled Open Sans Bold from fonts/ directory
_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "fonts")
try:
    _FONT_PILL = ImageFont.truetype(os.path.join(_FONTS_DIR, "OpenSans_SemiCondensed-Bold.ttf"), 22)
except Exception:
    try:
        _FONT_PILL = ImageFont.truetype("DejaVuSans-Bold.ttf", 22)
    except Exception:
        _FONT_PILL = ImageFont.load_default()

_FONT = ImageFont.load_default()

# ============================================================
# Env helpers
# ============================================================

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


def _env_bool(name: str, default: bool = False) -> bool:
    v = os.environ.get(name)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


# ============================================================
# Tuning knobs (product-ready defaults)
# ============================================================

# EMA smoothing: closer to 1.0 = smoother (more lag); closer to 0.0 = snappier (more jitter)
REAR_SMOOTH_ALPHA = _env_float("REAR_SMOOTH_ALPHA", 0.45)

# Extra smoothing for feet (they jitter most)
REAR_FOOT_ALPHA = _env_float("REAR_FOOT_ALPHA", 0.82)

# Confidence gating
REAR_MIN_VIS = _env_float("REAR_MIN_VIS", 0.35)
REAR_MIN_VIS_FOOT = _env_float("REAR_MIN_VIS_FOOT", 0.45)  # stricter than body

# Drawing thickness (outline then main)
REAR_LINE_W = _env_int("REAR_LINE_W", 6)
REAR_OUTLINE_W = _env_int("REAR_OUTLINE_W", 10)
REAR_DOT_R = _env_int("REAR_DOT_R", 6)
REAR_DOT_OUTLINE_R = _env_int("REAR_DOT_OUTLINE_R", 10)

# Spike rejection (pixel-space): prevents sudden teleports
REAR_MAX_JUMP_PX = _env_float("REAR_MAX_JUMP_PX", 85.0)
REAR_MAX_JUMP_PX_FOOT = _env_float("REAR_MAX_JUMP_PX_FOOT", 120.0)

# If pose disappears for N frames, clear EMA state (avoids "ghost overlay forever")
REAR_MAX_MISSING_FRAMES = _env_int("REAR_MAX_MISSING_FRAMES", 15)

# Hold last good overlay for a few frames when pose temporarily disappears (prevents blinking)
REAR_HOLD_LAST_FRAMES = _env_int("REAR_HOLD_LAST_FRAMES", 8)

# Border reject: if a decoded keypoint lands too close to the frame edge, ignore it
REAR_BORDER_PAD_PX = _env_int("REAR_BORDER_PAD_PX", 6)

REAR_PELVIS_APEX_FACTOR = _env_float("REAR_PELVIS_APEX_FACTOR", 0.25)  # 0.20–0.35 works well

# Foot model:
# Prefer true heel/toe if available. Otherwise synthesize toe/heel based on leg axis.
REAR_FOOT_MAX_LEN_PX = _env_float("REAR_FOOT_MAX_LEN_PX", 140.0)   # hard clamp
REAR_FOOT_LEN_FACTOR = _env_float("REAR_FOOT_LEN_FACTOR", 0.75)    # * (knee->ankle)
REAR_HEEL_SCALE = _env_float("REAR_HEEL_SCALE", 0.75)              # when synthesizing
REAR_TOE_SCALE = _env_float("REAR_TOE_SCALE", 1.15)

# Angle smoothing + clamp (to match "small degrees" look)
REAR_ANGLE_ALPHA = _env_float("REAR_ANGLE_ALPHA", 0.75)
REAR_ANGLE_CLAMP_DEG = _env_float("REAR_ANGLE_CLAMP_DEG", 15.0)

# Bootstrap stability: minimum visibility for core joints to count as "stable"
# Rear view ankles typically have lower confidence (~0.25-0.30)
REAR_STABLE_MIN_VIS = _env_float("REAR_STABLE_MIN_VIS", 0.15)

# Bootstrap stability: minimum 2D separation (px) between L/R ankles and hips
# Uses max(|dx|, |dy|) so it works when L/R overlap in X (rear view) or Y
REAR_STABLE_MIN_SEP_PX = _env_int("REAR_STABLE_MIN_SEP_PX", 8)

# How many consecutive stable frames needed before starting EMA overlay
REAR_STABLE_INIT_COUNT = _env_int("REAR_STABLE_INIT_COUNT", 1)

REAR_DEBUG = _env_bool("APP_DEBUG", False)

# ============================================================
# RTMPose (WholeBody) indices (GAIT subset)
# ============================================================

IDX = {
    "L_SH": int(KeypointIndex.LEFT_SHOULDER),     # 5
    "R_SH": int(KeypointIndex.RIGHT_SHOULDER),    # 6

    "L_HIP": int(KeypointIndex.LEFT_HIP),         # 11
    "R_HIP": int(KeypointIndex.RIGHT_HIP),        # 12

    "L_KNEE": int(KeypointIndex.LEFT_KNEE),       # 13
    "R_KNEE": int(KeypointIndex.RIGHT_KNEE),      # 14

    "L_ANK": int(KeypointIndex.LEFT_ANKLE),       # 15
    "R_ANK": int(KeypointIndex.RIGHT_ANKLE),      # 16

    # Feet (BodyWithFeet / 26-kpt) — MUST match KeypointIndex
    "L_BIG_TOE": int(KeypointIndex.LEFT_BIG_TOE),       # 20
    "R_BIG_TOE": int(KeypointIndex.RIGHT_BIG_TOE),      # 21
    "L_SMALL_TOE": int(KeypointIndex.LEFT_SMALL_TOE),   # 22
    "R_SMALL_TOE": int(KeypointIndex.RIGHT_SMALL_TOE),  # 23
    "L_HEEL": int(KeypointIndex.LEFT_HEEL),             # 24
    "R_HEEL": int(KeypointIndex.RIGHT_HEEL),            # 25
}

# Used landmarks for smoothing
REAR_USED = [
    IDX["L_SH"], IDX["R_SH"],
    IDX["L_HIP"], IDX["R_HIP"],
    IDX["L_KNEE"], IDX["R_KNEE"],
    IDX["L_ANK"], IDX["R_ANK"],
    IDX["L_HEEL"], IDX["R_HEEL"],
    IDX["L_BIG_TOE"], IDX["L_SMALL_TOE"],
    IDX["R_BIG_TOE"], IDX["R_SMALL_TOE"],
]

FOOT_POINTS = {
    IDX["L_ANK"], IDX["R_ANK"],
    IDX["L_HEEL"], IDX["R_HEEL"],
    IDX["L_BIG_TOE"], IDX["L_SMALL_TOE"],
    IDX["R_BIG_TOE"], IDX["R_SMALL_TOE"],
}

# ============================================================
# Geometry helpers
# ============================================================

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def point_scaled_float(lm, index: int, *, scale, offset, img_size: Tuple[int, int]) -> Tuple[float, float]:
    if not isinstance(scale, (tuple, list)) or len(scale) != 2:
        scale = img_size
    if not isinstance(offset, (tuple, list)) or len(offset) != 2:
        offset = (0, 0)

    img_w, img_h = img_size
    nw, nh = int(scale[0]), int(scale[1])
    ox, oy = int(offset[0]), int(offset[1])

    x = float(getattr(lm[index], "x", 0.0)) * float(nw) + float(ox)
    y = float(getattr(lm[index], "y", 0.0)) * float(nh) + float(oy)
    return (_clamp(x, 0.0, float(img_w - 1)), _clamp(y, 0.0, float(img_h - 1)))


def as_int_pt(pt: Tuple[float, float]) -> Tuple[int, int]:
    return (int(round(pt[0])), int(round(pt[1])))


def _norm2(vx: float, vy: float) -> float:
    return float((vx * vx + vy * vy) ** 0.5)


def _limit_vec(vx: float, vy: float, max_len: float) -> Tuple[float, float]:
    n = _norm2(vx, vy)
    if n <= 1e-6:
        return (0.0, 0.0)
    if n <= max_len:
        return (vx, vy)
    s = max_len / n
    return (vx * s, vy * s)


def _finite(v: object) -> bool:
    try:
        return math.isfinite(float(v))
    except (IndexError, AttributeError, ValueError, TypeError):
        return False


def _valid_lm_point(p) -> bool:
    x = getattr(p, "x", None)
    y = getattr(p, "y", None)
    if not _finite(x) or not _finite(y):
        return False

    # normalized coords should be around [0..1], allow some spill
    if float(x) < -0.25 or float(x) > 1.25 or float(y) < -0.25 or float(y) > 1.25:
        return False

    vis = getattr(p, "visibility", None)
    if vis is None:
        vis = getattr(p, "score", None)
    if vis is not None and _finite(vis):
        fv = float(vis)
        if fv < 0.0 or fv > 1.0:
            return False

    return True


def _valid_pose_result(pose_result) -> bool:
    if pose_result is None:
        return False

    pl = getattr(pose_result, "pose_landmarks", None)
    if pl is None:
        return False

    lm = getattr(pl, "landmark", None)
    if lm is None or not hasattr(lm, "__len__"):
        return False

    if len(lm) == 0:
        return False

    if len(lm) <= max(IDX.values()):
        return False

    return _valid_lm_point(lm[IDX["L_HIP"]]) and _valid_lm_point(lm[IDX["R_HIP"]])


def _pose_is_stable(
    lm,
    *,
    scale: Tuple[int, int],
    offset: Tuple[int, int],
    img_size: Tuple[int, int],
) -> bool:
    core_idxs = [
        IDX["L_HIP"], IDX["R_HIP"],
        IDX["L_KNEE"], IDX["R_KNEE"],
        IDX["L_ANK"], IDX["R_ANK"],
        IDX["L_SH"], IDX["R_SH"],
    ]

    try:
        # Basic landmark validity
        if any(not _valid_lm_point(lm[i]) for i in core_idxs):
            return False

        # Confidence/visibility gating
        min_vis = float(REAR_STABLE_MIN_VIS)
        for i in core_idxs:
            vis = getattr(lm[i], "visibility", None)
            if vis is None:
                vis = getattr(lm[i], "score", None)
            vis_f = float(vis or 0.0)
            if vis_f < min_vis:
                return False

        # Project to pixel space using the *actual* image size
        L_ank = point_scaled_float(lm, IDX["L_ANK"], scale=scale, offset=offset, img_size=img_size)
        R_ank = point_scaled_float(lm, IDX["R_ANK"], scale=scale, offset=offset, img_size=img_size)
        L_hip = point_scaled_float(lm, IDX["L_HIP"], scale=scale, offset=offset, img_size=img_size)
        R_hip = point_scaled_float(lm, IDX["R_HIP"], scale=scale, offset=offset, img_size=img_size)

        # Reject degenerate/narrow poses (helps bootstrap EMA)
        # Use max(|dx|, |dy|) — in rear view L/R can overlap in X but differ in Y
        min_sep = float(REAR_STABLE_MIN_SEP_PX)
        ank_sep = max(abs(L_ank[0] - R_ank[0]), abs(L_ank[1] - R_ank[1]))
        if ank_sep < min_sep:
            return False
        hip_sep = max(abs(L_hip[0] - R_hip[0]), abs(L_hip[1] - R_hip[1]))
        if hip_sep < min_sep:
            return False

        return True
    except (IndexError, AttributeError, ValueError, TypeError):
        return False

def _log_stability_failure(lm, *, scale, offset, img_size) -> None:
    """Log which stability check failed (debug only)."""
    core_idxs = [
        IDX["L_HIP"], IDX["R_HIP"],
        IDX["L_KNEE"], IDX["R_KNEE"],
        IDX["L_ANK"], IDX["R_ANK"],
        IDX["L_SH"], IDX["R_SH"],
    ]
    try:
        for i in core_idxs:
            if not _valid_lm_point(lm[i]):
                logger.info("rear_stable_fail: invalid landmark idx=%d", i)
                return

        min_vis = float(REAR_STABLE_MIN_VIS)
        for i in core_idxs:
            vis = getattr(lm[i], "visibility", None)
            if vis is None:
                vis = getattr(lm[i], "score", None)
            vis_f = float(vis or 0.0)
            if vis_f < min_vis:
                logger.info("rear_stable_fail: low vis idx=%d vis=%.3f threshold=%.2f", i, vis_f, min_vis)
                return

        L_ank = point_scaled_float(lm, IDX["L_ANK"], scale=scale, offset=offset, img_size=img_size)
        R_ank = point_scaled_float(lm, IDX["R_ANK"], scale=scale, offset=offset, img_size=img_size)
        L_hip = point_scaled_float(lm, IDX["L_HIP"], scale=scale, offset=offset, img_size=img_size)
        R_hip = point_scaled_float(lm, IDX["R_HIP"], scale=scale, offset=offset, img_size=img_size)

        min_sep = float(REAR_STABLE_MIN_SEP_PX)
        ank_sep = max(abs(L_ank[0] - R_ank[0]), abs(L_ank[1] - R_ank[1]))
        hip_sep = max(abs(L_hip[0] - R_hip[0]), abs(L_hip[1] - R_hip[1]))
        if ank_sep < min_sep:
            logger.info("rear_stable_fail: narrow ankles sep=%.1f threshold=%.0f", ank_sep, min_sep)
        elif hip_sep < min_sep:
            logger.info("rear_stable_fail: narrow hips sep=%.1f threshold=%.0f", hip_sep, min_sep)
    except Exception:
        pass


# ============================================================
# Drawing helpers
# ============================================================

def draw_label(draw: ImageDraw.ImageDraw, text: str, origin):
    x, y = origin
    bbox = draw.textbbox((x, y), text, font=_FONT)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rectangle([(x, y - h - 4), (x + w + 6, y)], fill=LABEL_BG)
    draw.text((x + 3, y - h - 2), text, fill=LABEL_TXT, font=_FONT)


def draw_dot(d: ImageDraw.ImageDraw, pt: Tuple[int, int], r: int = REAR_DOT_R) -> None:
    ro = max(r + 2, REAR_DOT_OUTLINE_R)

    # outline ring
    d.ellipse(
        [(pt[0] - ro, pt[1] - ro), (pt[0] + ro, pt[1] + ro)],
        fill=COLOR_JOINT_OUTLINE,
        outline=None,
    )
    # inner fill
    d.ellipse(
        [(pt[0] - r, pt[1] - r), (pt[0] + r, pt[1] + r)],
        fill=COLOR_JOINT,
        outline=None,
    )


def draw_segment(d: ImageDraw.ImageDraw, a: Tuple[int, int], b: Tuple[int, int]) -> None:
    d.line([a, b], fill=COLOR_BLUE, width=REAR_LINE_W)

# ============================================================
# Rear-metrics -> annotation helpers
# ============================================================

def _get_rear_metrics(buffers: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Best-effort lookup for rear metrics payload produced by RearMetricsConsumer.
    Supports multiple buffer layouts (pipelines vary).
    """
    if not isinstance(buffers, dict):
        return None

    candidates = [
        buffers.get("rear_geom"),
        buffers.get("rear_metrics"),
        (buffers.get("metrics") or {}).get("rear"),
        (buffers.get("analysis") or {}).get("rear_metrics"),
        (buffers.get("results") or {}).get("rear_metrics"),
    ]
    for c in candidates:
        if isinstance(c, dict) and c:
            return c
    return None


def _pt_from_metrics(m: Dict[str, Any], key: str) -> Optional[Tuple[int, int]]:
    """
    Reads: m[key] == [x, y] or (x, y) in pixel space.
    """
    v = m.get(key)
    if not (isinstance(v, (list, tuple)) and len(v) == 2):
        return None
    try:
        return (int(round(float(v[0]))), int(round(float(v[1]))))
    except Exception:
        return None


def _tripod_from_metrics(
    m: Dict[str, Any],
    key: str,
) -> Optional[Tuple[Tuple[int, int], Tuple[int, int], Tuple[int, int]]]:
    """
    Reads: m[key] == {"heel":[x,y], "big_toe":[x,y], "small_toe":[x,y]}
    Returns: (heel, big_toe, small_toe)
    """
    t = m.get(key)
    if not isinstance(t, dict):
        return None

    def _p(k: str) -> Optional[Tuple[int, int]]:
        v = t.get(k)
        if not (isinstance(v, (list, tuple)) and len(v) == 2):
            return None
        try:
            return (int(round(float(v[0]))), int(round(float(v[1]))))
        except Exception:
            return None

    heel = _p("heel")
    big = _p("big_toe")
    small = _p("small_toe")
    if heel and big and small:
        return (heel, big, small)
    return None   


# ============================================================
# Angle + smoothing helpers
# ============================================================

def _ema_value(store: Dict[str, float], key: str, value: float, alpha: float) -> float:
    prev = store.get(key)
    if prev is None:
        store[key] = float(value)
    else:
        store[key] = float(alpha) * float(prev) + (1.0 - float(alpha)) * float(value)
    return float(store[key])


def _dev_angle_deg(dx_px: float, ref_len_px: float) -> float:
    ref = max(60.0, float(ref_len_px))
    return float(math.degrees(math.atan2(float(dx_px), ref)))


# ============================================================
# Foot helpers (heel, ankle, toe_center)
# ============================================================

def _in_border(p: Tuple[float, float], pad: float, img_size: Tuple[int, int]) -> bool:
    x, y = float(p[0]), float(p[1])
    w, h = img_size
    return not (x < pad or y < pad or x > float(w - 1 - pad) or y > float(h - 1 - pad))

def _cap_foot_len(
    ankle: Tuple[float, float],
    pt: Tuple[float, float],
    max_len: float,
) -> Tuple[float, float]:
    ax, ay = ankle
    px, py = pt
    vx, vy = px - ax, py - ay
    vx, vy = _limit_vec(vx, vy, max_len)
    return (ax + vx, ay + vy)


def _foot_max_len_px(knee: Optional[Tuple[float, float]], ankle: Tuple[float, float]) -> float:
    hard = float(REAR_FOOT_MAX_LEN_PX)
    if knee is None:
        return hard
    kx, ky = knee
    ax, ay = ankle
    shank = _norm2(ax - kx, ay - ky)
    dyn = float(REAR_FOOT_LEN_FACTOR) * float(shank)
    return float(max(35.0, min(hard, dyn)))


def _avg2(a: Optional[Tuple[float, float]], b: Optional[Tuple[float, float]]) -> Optional[Tuple[float, float]]:
    if a is None:
        return b
    if b is None:
        return a
    return ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)


def _synth_foot_points(
    ankle: Tuple[float, float],
    knee: Optional[Tuple[float, float]],
    heel_raw: Optional[Tuple[float, float]],
    toe_raw: Optional[Tuple[float, float]],
    *,
    img_size: Tuple[int, int],
) -> Tuple[Tuple[int, int], Tuple[int, int], Tuple[int, int]]:
    img_w, img_h = img_size

    ax, ay = float(ankle[0]), float(ankle[1])
    ankle_f = (ax, ay)

    max_len = _foot_max_len_px(knee, ankle_f)

    def _clamp_img(p: Tuple[float, float]) -> Tuple[float, float]:
        return (
            _clamp(p[0], 0.0, float(img_w - 1)),
            _clamp(p[1], 0.0, float(img_h - 1)),
        )

    # --------------------------------------------------
    # EARLY RETURN: real heel + toe available
    # --------------------------------------------------
    if heel_raw is not None and toe_raw is not None:
        heel_f = _cap_foot_len(ankle_f, heel_raw, max_len)
        toe_f  = _cap_foot_len(ankle_f, toe_raw,  max_len)

        heel_f  = _clamp_img(heel_f)
        toe_f   = _clamp_img(toe_f)
        ankle_f = _clamp_img(ankle_f)  

        return (
            as_int_pt(heel_f),
            as_int_pt(ankle_f),
            as_int_pt(toe_f),
        )

    # --------------------------------------------------
    # Direction synthesis fallback
    # --------------------------------------------------
    if heel_raw is not None:
        vx, vy = float(heel_raw[0]) - ax, float(heel_raw[1]) - ay
    elif toe_raw is not None:
        vx, vy = ax - float(toe_raw[0]), ay - float(toe_raw[1])
    elif knee is not None:
        kx, ky = float(knee[0]), float(knee[1])
        vx, vy = ax - kx, ay - ky
    else:
        vx, vy = 0.0, 40.0

    vx, vy = _limit_vec(vx, vy, max_len)
    if _norm2(vx, vy) < 1e-3:
        vx, vy = 0.0, 40.0

    heel_f = (ax + float(REAR_HEEL_SCALE) * vx, ay + float(REAR_HEEL_SCALE) * vy)
    toe_f  = (ax - float(REAR_TOE_SCALE)  * vx, ay - float(REAR_TOE_SCALE)  * vy)

    if heel_raw is not None:
        heel_f = _cap_foot_len(ankle_f, heel_raw, max_len)
    if toe_raw is not None:
        toe_f = _cap_foot_len(ankle_f, toe_raw, max_len)

    heel_f  = _clamp_img(heel_f)
    toe_f   = _clamp_img(toe_f)
    ankle_f = _clamp_img(ankle_f)

    return (
        as_int_pt(heel_f),
        as_int_pt(ankle_f),
        as_int_pt(toe_f),
    )
# ============================================================
# Consumer (REAR) with smoothing
# ============================================================

class RearAnnotationConsumer:
    requires_pose = True
    produces_image = True
    mutates_buffers = True
    frame_order_dependent = True
    disable_external_pose_smoothing = True

    def __init__(self, buffers: Dict[str, Any], snapshot: Dict[str, Any], draw_upper_body: bool = True):
        self.buffers = buffers
        self.snapshot = snapshot
        # Lower-body captures (shoulders out of frame) draw only hips -> feet.
        self._draw_upper_body = draw_upper_body
        self._ema_bars: Dict[str, float] = {}
        self._ema_pts: Dict[int, Tuple[float, float]] = {}

        self._init_stable_count = 0
        self._missing_pose_frames = 0

        self._debug_frames = 0
        self._debug_enabled = os.environ.get("APP_DEBUG", "").lower() in {"1", "true", "yes", "y", "on"}

    def consume(
        self,
        frame_idx: int,
        image: Image.Image,
        pose_result,
        *,
        scale=None,
        offset=None,
        **kwargs,
    ):
        t = kwargs.get("transform")
        if REAR_DEBUG and t and frame_idx < 3:
            logger.info("rear: transform=%s", t)

        if self._debug_enabled and self._debug_frames < 5:
            if scale is None or offset is None:
                raise RuntimeError("RearAnnotationConsumer missing scale/offset mapping")
            logger.info("RearAnnotationConsumer scale=%s offset=%s", scale, offset)
            self._debug_frames += 1

        if not isinstance(scale, (tuple, list)) or len(scale) != 2:
            scale = image.size
        else:
            scale = (int(scale[0]), int(scale[1]))

        if not isinstance(offset, (tuple, list)) or len(offset) != 2:
            offset = (0, 0)
        else:
            offset = (int(offset[0]), int(offset[1]))

        return annotate_rear_frame(
            image=image,
            pose_result=pose_result,
            buffers=self.buffers,
            snapshot=self.snapshot,
            frame_idx=frame_idx,
            resized_wh=scale,
            offset=offset,
            ema_pts=self._ema_pts,
            ema_bars=self._ema_bars,
            have_any_pose_ref=self,
            draw_upper_body=self._draw_upper_body,
        )


# ============================================================
# Annotation (REAR VIEW)
# ============================================================

def annotate_rear_frame(
    image: Image.Image,
    pose_result,
    buffers: Dict[str, Any],
    snapshot: Dict[str, Any],
    frame_idx: int,
    *,
    resized_wh: Optional[Tuple[int, int]] = None,
    offset: Optional[Tuple[int, int]] = None,
    ema_pts: Optional[Dict[int, Tuple[float, float]]] = None,
    ema_bars: Optional[Dict[str, float]] = None,
    have_any_pose_ref: Optional["RearAnnotationConsumer"] = None,
    draw_upper_body: bool = True,
):
    if image is None or not hasattr(image, "size"):
        return image

    d = ImageDraw.Draw(image)

    if REAR_DEBUG and frame_idx % 30 == 0:
        d.text((10, 10), f"rear_annot f={frame_idx}", fill=(255, 255, 0), font=_FONT)

    if ema_pts is None:
        ema_pts = {}
    if ema_bars is None:
        ema_bars = {}

    # normalize scale/offset
    try:
        img_w, img_h = image.size
        if not isinstance(resized_wh, (tuple, list)) or len(resized_wh) != 2:
            resized_wh = (img_w, img_h)
        else:
            rw, rh = int(resized_wh[0]), int(resized_wh[1])
            resized_wh = (img_w, img_h) if (rw <= 0 or rh <= 0) else (rw, rh)

        if not isinstance(offset, (tuple, list)) or len(offset) != 2:
            offset = (0, 0)
        else:
            offset = (int(offset[0]), int(offset[1]))
    except Exception:
        resized_wh = image.size
        offset = (0, 0)

    # ------------------------------------------------------------------
    # Pose validation + hold-last-good behavior
    # ------------------------------------------------------------------
    has_pose = _valid_pose_result(pose_result)

    _diag = frame_idx < 10  # diagnostic logging for first 10 frames

    if _diag:
        logger.info("rear_diag[%d]: image.size=%s resized_wh=%s offset=%s has_pose=%s ema_pts_len=%d",
                frame_idx, image.size, resized_wh, offset, has_pose, len(ema_pts))

    if not has_pose:
        if _diag:
            logger.info("rear_diag[%d]: GATE=no_pose (pose_result=%s)", frame_idx, type(pose_result).__name__)
        if have_any_pose_ref is not None:
            have_any_pose_ref._missing_pose_frames += 1
            if have_any_pose_ref._missing_pose_frames <= REAR_HOLD_LAST_FRAMES and ema_pts:
                pass
            else:
                if have_any_pose_ref._missing_pose_frames >= REAR_MAX_MISSING_FRAMES:
                    ema_pts.clear()
                    ema_bars.clear()
                    have_any_pose_ref._init_stable_count = 0
                    have_any_pose_ref._missing_pose_frames = 0
                return image
        else:
            return image
    else:
        if have_any_pose_ref is not None:
            have_any_pose_ref._missing_pose_frames = 0

    lm = None
    if has_pose:
        try:
            lm = pose_result.pose_landmarks.landmark
        except Exception:
            lm = None

    if _diag and lm is not None:
        # Log key landmark positions for diagnosis
        try:
            lhip = lm[IDX["L_HIP"]]
            rhip = lm[IDX["R_HIP"]]
            logger.info(
                "rear_diag[%d]: L_HIP=(%.3f,%.3f,vis=%.2f) R_HIP=(%.3f,%.3f,vis=%.2f) num_lm=%d",
                frame_idx,
                float(getattr(lhip, "x", -1)), float(getattr(lhip, "y", -1)),
                float(getattr(lhip, "visibility", -1)),
                float(getattr(rhip, "x", -1)), float(getattr(rhip, "y", -1)),
                float(getattr(rhip, "visibility", -1)),
                len(lm),
            )
        except Exception:
            logger.info("rear_diag[%d]: could not read hip landmarks", frame_idx)

    # ------------------------------------------------------------------
    # Bootstrap stable pose before starting EMA
    # ------------------------------------------------------------------
    if has_pose and lm is not None and not ema_pts:
        if have_any_pose_ref is None:
            if _diag:
                logger.info("rear_diag[%d]: GATE=no_pose_ref (have_any_pose_ref is None)", frame_idx)
            return image

        stable = False
        try:
            stable = _pose_is_stable(lm, scale=resized_wh, offset=offset, img_size=image.size)
        except Exception:
            stable = False

        if _diag:
            logger.info("rear_diag[%d]: bootstrap stable=%s init_count=%d need=%d",
                    frame_idx, stable, have_any_pose_ref._init_stable_count, REAR_STABLE_INIT_COUNT)

        if stable:
            have_any_pose_ref._init_stable_count += 1
        else:
            if frame_idx < 60:
                _log_stability_failure(lm, scale=resized_wh, offset=offset, img_size=image.size)
            have_any_pose_ref._init_stable_count = 0
            return image

        if have_any_pose_ref._init_stable_count < REAR_STABLE_INIT_COUNT:
            return image

    # ------------------------------------------------------------------
    # Update EMA points (ONLY when we have valid pose landmarks)
    # ------------------------------------------------------------------
    if has_pose and lm is not None:
        pad = int(REAR_BORDER_PAD_PX)
        for idx in REAR_USED:
            try:
                p = lm[idx]
            except Exception:
                continue

            if not _valid_lm_point(p):
                continue

            vis = getattr(p, "visibility", None)
            if vis is None:
                vis = getattr(p, "score", None)
            vis = float(vis if vis is not None else 1.0)

            is_foot = idx in FOOT_POINTS
            min_vis = REAR_MIN_VIS_FOOT if is_foot else REAR_MIN_VIS
            alpha = REAR_FOOT_ALPHA if is_foot else REAR_SMOOTH_ALPHA
            max_jump = REAR_MAX_JUMP_PX_FOOT if is_foot else REAR_MAX_JUMP_PX

            if vis < min_vis and idx in ema_pts:
                continue

            try:
                cur = point_scaled_float(lm, idx, scale=resized_wh, offset=offset, img_size=image.size)
            except Exception:
                continue

            img_w, img_h = image.size
            if cur[0] < pad or cur[1] < pad or cur[0] > (img_w - 1 - pad) or cur[1] > (img_h - 1 - pad):
                continue

            if idx not in ema_pts:
                ema_pts[idx] = cur
                continue

            px, py = ema_pts[idx]
            dx = cur[0] - px
            dy = cur[1] - py

            if (dx * dx + dy * dy) > (max_jump * max_jump):
                continue

            ema_pts[idx] = (
                alpha * px + (1.0 - alpha) * cur[0],
                alpha * py + (1.0 - alpha) * cur[1],
            )

    # ------------------------------------------------------------------
    # Require core points
    # ------------------------------------------------------------------
    required = [
        IDX["L_SH"], IDX["R_SH"],
        IDX["L_HIP"], IDX["R_HIP"],
        IDX["L_KNEE"], IDX["R_KNEE"],
        IDX["L_ANK"], IDX["R_ANK"],
    ]
    missing_core = [i for i in required if i not in ema_pts]
    if missing_core:
        if _diag:
            logger.info("rear_diag[%d]: GATE=missing_core_pts missing=%s ema_keys=%s",
                    frame_idx, missing_core, sorted(ema_pts.keys()))
        return image

    if _diag:
        logger.info("rear_diag[%d]: DRAWING (all gates passed, ema_pts=%d)", frame_idx, len(ema_pts))

    def PF(i: int) -> Tuple[float, float]:
        v = ema_pts[i]
        return (float(v[0]), float(v[1]))

    def P(i: int) -> Tuple[int, int]:
        return as_int_pt(ema_pts[i])

    # --------------------------------------------------------
    # Smoothed landmarks (pixels)
    # --------------------------------------------------------
    L_sh = P(IDX["L_SH"])
    R_sh = P(IDX["R_SH"])
    L_hip = P(IDX["L_HIP"])
    R_hip = P(IDX["R_HIP"])
    L_knee = P(IDX["L_KNEE"])
    R_knee = P(IDX["R_KNEE"])
    L_ank = P(IDX["L_ANK"])
    R_ank = P(IDX["R_ANK"])

    # --------------------------------------------------------
    # Pelvis + foot tripod points
    # Prefer RearMetricsConsumer outputs if present.
    # --------------------------------------------------------
    rear_m = _get_rear_metrics(buffers) or {}

    # Prefer a metrics-provided apex if you ever add it later
    pelvis_pt = _pt_from_metrics(rear_m, "pelvis_apex_px")
    tripod_L = _tripod_from_metrics(rear_m, "foot_L_tripod_px")
    tripod_R = _tripod_from_metrics(rear_m, "foot_R_tripod_px")

    if pelvis_pt is None:
        # synthesize apex along trunk axis: mid_hip -> mid_shoulders
        mid_hip = ((L_hip[0] + R_hip[0]) * 0.5, (L_hip[1] + R_hip[1]) * 0.5)
        mid_sh  = ((L_sh[0]  + R_sh[0])  * 0.5, (L_sh[1]  + R_sh[1])  * 0.5)

        t = float(REAR_PELVIS_APEX_FACTOR)
        ax = mid_hip[0] + t * (mid_sh[0] - mid_hip[0])
        ay = mid_hip[1] + t * (mid_sh[1] - mid_hip[1])
        pelvis_pt = (int(round(ax)), int(round(ay)))

    # --------------------------------------------------------
    # Center line (dashed) through hip midpoint
    # --------------------------------------------------------
    midline_x = None
    if isinstance(rear_m, dict):
        v = rear_m.get("midline_x_px")
        if isinstance(v, (int, float)) and math.isfinite(float(v)):
            midline_x = int(round(float(v)))

    img_w, img_h = image.size

    mid_hip_x = midline_x if midline_x is not None else int(round((L_hip[0] + R_hip[0]) / 2.0))
    top_y = max(0, min(L_sh[1], R_sh[1]) - 60)
    bot_y = min(img_h - 1, max(L_ank[1], R_ank[1]) + 80)

    if draw_upper_body:
        dash_len = 18
        gap_len = 14
        y = top_y
        while y < bot_y:
            y2 = min(bot_y, y + dash_len)
            d.line([(mid_hip_x, y), (mid_hip_x, y2)], fill=COLOR_BLUE, width=max(1, REAR_LINE_W - 2))
            y = y2 + gap_len

    # --------------------------------------------------------
    # Skeleton
    # --------------------------------------------------------
    if draw_upper_body:
        draw_segment(d, L_sh, R_sh)
        draw_segment(d, L_sh, L_hip)
        draw_segment(d, R_sh, R_hip)
    draw_segment(d, L_hip, R_hip)

    draw_segment(d, L_hip, L_knee)
    draw_segment(d, L_knee, L_ank)
    draw_segment(d, R_hip, R_knee)
    draw_segment(d, R_knee, R_ank)

    if draw_upper_body and pelvis_pt is not None:
        draw_segment(d, L_hip, pelvis_pt)
        draw_segment(d, pelvis_pt, R_hip)
        draw_segment(d, R_hip, L_hip)

    # --------------------------------------------------------
    # Foot: heel -> ankle -> toe_center
    # --------------------------------------------------------
    padf = float(REAR_BORDER_PAD_PX)

    def _raw(idx: int) -> Optional[Tuple[float, float]]:
        v = ema_pts.get(idx)
        if v is None:
            return None
        p = (float(v[0]), float(v[1]))
        if not _in_border(p, padf, image.size):
            return None
        return p

    L_heel_raw = _raw(IDX["L_HEEL"])
    R_heel_raw = _raw(IDX["R_HEEL"])

    L_big = _raw(IDX["L_BIG_TOE"])
    L_small = _raw(IDX["L_SMALL_TOE"])
    R_big = _raw(IDX["R_BIG_TOE"])
    R_small = _raw(IDX["R_SMALL_TOE"])

    L_toe_raw = _avg2(L_big, L_small)
    R_toe_raw = _avg2(R_big, R_small)

    L_heel_pt, L_ank_pt, L_toe_pt = _synth_foot_points(
        ankle=PF(IDX["L_ANK"]),
        knee=PF(IDX["L_KNEE"]),
        heel_raw=L_heel_raw,
        toe_raw=L_toe_raw,
        img_size=image.size,
    )

    R_heel_pt, R_ank_pt, R_toe_pt = _synth_foot_points(
        ankle=PF(IDX["R_ANK"]),
        knee=PF(IDX["R_KNEE"]),
        heel_raw=R_heel_raw,
        toe_raw=R_toe_raw,
        img_size=image.size,
    )

    # --------------------------------------------------------
    # Foot skeleton (rear view Y-shape):
    #     Ankle
    #       |
    #     Heel
    #      / \
    #  BigToe  SmallToe
    # --------------------------------------------------------
    L_heel_i = as_int_pt(L_heel_raw) if L_heel_raw is not None else None
    L_big_i = as_int_pt(L_big) if L_big is not None else None
    L_small_i = as_int_pt(L_small) if L_small is not None else None

    R_heel_i = as_int_pt(R_heel_raw) if R_heel_raw is not None else None
    R_big_i = as_int_pt(R_big) if R_big is not None else None
    R_small_i = as_int_pt(R_small) if R_small is not None else None

    # Left foot
    if L_heel_i is not None:
        draw_segment(d, L_ank, L_heel_i)
        if L_big_i is not None:
            draw_segment(d, L_heel_i, L_big_i)
        if L_small_i is not None:
            draw_segment(d, L_heel_i, L_small_i)

    # Right foot
    if R_heel_i is not None:
        draw_segment(d, R_ank, R_heel_i)
        if R_big_i is not None:
            draw_segment(d, R_heel_i, R_big_i)
        if R_small_i is not None:
            draw_segment(d, R_heel_i, R_small_i)

    # All dots drawn AFTER all segments so dots appear on top
    _joint_dots = [L_hip, R_hip, L_knee, R_knee, L_ank, R_ank]
    if draw_upper_body:
        _joint_dots = [L_sh, R_sh, *_joint_dots]
    for pt in _joint_dots:
        draw_dot(d, pt)
    if draw_upper_body and pelvis_pt is not None:
        draw_dot(d, pelvis_pt)
    for pt in (L_heel_i, L_big_i, L_small_i, R_heel_i, R_big_i, R_small_i):
        if pt is not None:
            draw_dot(d, pt)

    # --------------------------------------------------------
    # Angle "deviation" badges (stable small degrees)
    # --------------------------------------------------------
    hip_mid_y = int(round((L_hip[1] + R_hip[1]) / 2.0))
    knee_mid_y = int(round((L_knee[1] + R_knee[1]) / 2.0))
    ank_mid_y = int(round((L_ank[1] + R_ank[1]) / 2.0))

    hip_mid_x = int(round((L_hip[0] + R_hip[0]) / 2.0))
    knee_mid_x = int(round((L_knee[0] + R_knee[0]) / 2.0))
    ank_mid_x = int(round((L_ank[0] + R_ank[0]) / 2.0))

    ref_len_px = float(max(180.0, abs(hip_mid_y - ank_mid_y)))

    hip_deg_raw = _dev_angle_deg(float(hip_mid_x - mid_hip_x), ref_len_px)
    knee_deg_raw = _dev_angle_deg(float(knee_mid_x - mid_hip_x), ref_len_px)
    ank_deg_raw = _dev_angle_deg(float(ank_mid_x - mid_hip_x), ref_len_px)

    c = float(REAR_ANGLE_CLAMP_DEG)
    hip_deg_raw = _clamp(hip_deg_raw, -c, c)
    knee_deg_raw = _clamp(knee_deg_raw, -c, c)
    ank_deg_raw = _clamp(ank_deg_raw, -c, c)

    hip_deg = _ema_value(ema_bars, "hip_deg", hip_deg_raw, REAR_ANGLE_ALPHA)
    knee_deg = _ema_value(ema_bars, "knee_deg", knee_deg_raw, REAR_ANGLE_ALPHA)
    ank_deg = _ema_value(ema_bars, "ank_deg", ank_deg_raw, REAR_ANGLE_ALPHA)

    def _angle_badge(deg: float) -> str:
        return f"{deg:+.1f}°"

    def draw_pill(draw: ImageDraw.ImageDraw, text: str, anchor: Tuple[int, int], *, value: float) -> None:
        x, y = anchor
        pad_x = 18
        pad_y = 12
        r = 16

        bbox = draw.textbbox((0, 0), text, font=_FONT_PILL)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        w = tw + pad_x * 2
        h = th + pad_y * 2

        x0, y0 = x, y
        x1, y1 = x + w, y + h

        pill = COLOR_BADGE_WARN if abs(float(value)) >= 8.0 else COLOR_BADGE_OK

        draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=r, fill=pill, outline=None)
        cx = (x0 + x1) / 2
        cy = (y0 + y1) / 2
        draw.text((cx, cy), text, fill=(255, 255, 255), font=_FONT_PILL, anchor="mm")

    img_w, img_h = image.size  # safe even if already set above

    # Pills placed to the right of the body (offset from rightmost joint X)
    _PILL_BODY_OFFSET = 28

    body_right_hip = max(L_hip[0], R_hip[0])
    body_right_knee = max(L_knee[0], R_knee[0])
    body_right_ank = max(L_ank[0], R_ank[0])

    def _body_pill(text: str, body_x: int, y: int, *, value: float) -> None:
        x = min(body_x + _PILL_BODY_OFFSET, img_w - 160)
        draw_pill(d, text, (x, max(10, y)), value=value)

    _body_pill(_angle_badge(hip_deg), body_right_hip, hip_mid_y - 20, value=hip_deg)
    _body_pill(_angle_badge(knee_deg), body_right_knee, knee_mid_y - 20, value=knee_deg)
    _body_pill(_angle_badge(ank_deg), body_right_ank, min(img_h - 60, ank_mid_y - 20), value=ank_deg)

    # --------------------------------------------------------
    # Optional: debug series
    # --------------------------------------------------------
    if STORE_DEBUG_SERIES:
        buffers.setdefault("rear_frame_series", []).append({
            "mid_hip_x": int(mid_hip_x),
            "ref_len_px": float(ref_len_px),
            "hip_deg": float(hip_deg),
            "knee_deg": float(knee_deg),
            "ank_deg": float(ank_deg),
            "foot_L_has_toe": bool(L_toe_raw is not None),
            "foot_R_has_toe": bool(R_toe_raw is not None),
        })

    # --------------------------------------------------------
    # Snapshot capture
    # --------------------------------------------------------
    if snapshot.get("img") is None and frame_idx >= 10:
        snapshot["img"] = np.array(image)

    # Optional on-frame debug
    if REAR_DEBUG and frame_idx % 30 == 0:
        logger.info(
            "rear_angles: hip=%+.2f knee=%+.2f ank=%+.2f ref=%.1f missing=%s toe(L,R)=(%s,%s)",
            hip_deg, knee_deg, ank_deg, ref_len_px,
            getattr(have_any_pose_ref, "_missing_pose_frames", None),
            L_toe_raw is not None,
            R_toe_raw is not None,
        )

    return image