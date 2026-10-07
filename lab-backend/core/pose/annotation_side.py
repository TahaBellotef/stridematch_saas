# core/pose/annotation_side.py
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
# Colors
# ============================================================

COLOR_BLUE = (99, 102, 241)
COLOR_JOINT = (0, 255, 127)          # #00FF7F green
COLOR_JOINT_OUTLINE = (255, 255, 255)   # white border ring
COLOR_BADGE_OK = (34, 197, 94)
COLOR_BADGE_WARN = (249, 115, 22)
COLOR_FAR = (160, 162, 245)           # lighter blue for far-side limbs


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
SIDE_SMOOTH_ALPHA = _env_float("SIDE_SMOOTH_ALPHA", 0.15)

# Extra smoothing for feet (they jitter most)
SIDE_FOOT_ALPHA = _env_float("SIDE_FOOT_ALPHA", 0.35)

# Confidence gating (visibility / score)
SIDE_MIN_VIS = _env_float("SIDE_MIN_VIS", 0.35)
SIDE_MIN_VIS_FOOT = _env_float("SIDE_MIN_VIS_FOOT", 0.45)

# Drawing thickness
SIDE_LINE_W = _env_int("SIDE_LINE_W", 6)
SIDE_DOT_R = _env_int("SIDE_DOT_R", 6)
SIDE_DOT_OUTLINE_R = _env_int("SIDE_DOT_OUTLINE_R", 10)

# Spike rejection (pixel-space): prevents sudden teleports
# Side view has much larger limb swing than rear; generous limits to avoid freezes
SIDE_MAX_JUMP_PX = _env_float("SIDE_MAX_JUMP_PX", 180.0)
SIDE_MAX_JUMP_PX_FOOT = _env_float("SIDE_MAX_JUMP_PX_FOOT", 220.0)

# Pose disappearance behavior
SIDE_MAX_MISSING_FRAMES = _env_int("SIDE_MAX_MISSING_FRAMES", 6)
SIDE_HOLD_LAST_FRAMES = _env_int("SIDE_HOLD_LAST_FRAMES", 3)

# Border reject: ignore points too close to edges
SIDE_BORDER_PAD_PX = _env_int("SIDE_BORDER_PAD_PX", 6)

# Angle smoothing
SIDE_ANGLE_ALPHA = _env_float("SIDE_ANGLE_ALPHA", 0.75)
SIDE_ANGLE_CLAMP_DEG = _env_float("SIDE_ANGLE_CLAMP_DEG", 15.0)

SIDE_DEBUG = _env_bool("APP_DEBUG", False)

SIDE_LINE_W_FAR = max(1, SIDE_LINE_W - 2)

# ============================================================
# Landmark indices (MediaPipe-style Pose)
# (This matches what your current annotation_side.py is using)
# ============================================================

IDX = {
    "HEAD": int(KeypointIndex.NOSE),  # 0 (ok if present in your KeypointIndex)

    "L_SH": int(KeypointIndex.LEFT_SHOULDER),
    "R_SH": int(KeypointIndex.RIGHT_SHOULDER),

    "L_EL": int(KeypointIndex.LEFT_ELBOW),
    "R_EL": int(KeypointIndex.RIGHT_ELBOW),
    "L_WR": int(KeypointIndex.LEFT_WRIST),
    "R_WR": int(KeypointIndex.RIGHT_WRIST),

    "L_HIP": int(KeypointIndex.LEFT_HIP),
    "R_HIP": int(KeypointIndex.RIGHT_HIP),
    "L_KNEE": int(KeypointIndex.LEFT_KNEE),
    "R_KNEE": int(KeypointIndex.RIGHT_KNEE),
    "L_ANK": int(KeypointIndex.LEFT_ANKLE),
    "R_ANK": int(KeypointIndex.RIGHT_ANKLE),

    "L_TOE": int(KeypointIndex.LEFT_BIG_TOE),    # 20
    "R_TOE": int(KeypointIndex.RIGHT_BIG_TOE),   # 21
    "L_HEEL": int(KeypointIndex.LEFT_HEEL),      # 24
    "R_HEEL": int(KeypointIndex.RIGHT_HEEL),     # 25
}

SIDE_USED = [
    IDX["L_SH"], IDX["R_SH"], IDX["L_EL"], IDX["R_EL"], IDX["L_WR"], IDX["R_WR"],
    IDX["L_HIP"], IDX["R_HIP"], IDX["L_KNEE"], IDX["R_KNEE"], IDX["L_ANK"], IDX["R_ANK"],
    IDX["L_HEEL"], IDX["R_HEEL"],
    IDX["L_TOE"], IDX["R_TOE"],
]

FOOT_POINTS = {
    IDX["L_ANK"], IDX["R_ANK"],
    IDX["L_HEEL"], IDX["R_HEEL"],
    IDX["L_TOE"], IDX["R_TOE"],
}

# ============================================================
# Small math helpers
# ============================================================

def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _finite(v: object) -> bool:
    try:
        return math.isfinite(float(v))
    except Exception:
        return False


def _norm2(dx: float, dy: float) -> float:
    return float((dx * dx + dy * dy) ** 0.5)


def _valid_lm_point(p) -> bool:
    x = getattr(p, "x", None)
    y = getattr(p, "y", None)
    if not _finite(x) or not _finite(y):
        return False

    # normalized coords should be around [0..1], allow a bit of spill
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

    max_idx = max(v for v in IDX.values() if isinstance(v, int))
    if len(lm) <= max_idx:
        return False
    
    # require hips at minimum
    return _valid_lm_point(lm[IDX["L_HIP"]]) or _valid_lm_point(lm[IDX["R_HIP"]])

def _dev_angle_deg(dx_px: float, ref_len_px: float) -> float:
    ref = max(60.0, float(ref_len_px))
    return float(math.degrees(math.atan2(float(dx_px), ref)))

def _limit_vec(vx: float, vy: float, max_len: float) -> Tuple[float, float]:
    n = _norm2(vx, vy)
    if n <= 1e-6:
        return (0.0, 0.0)
    if n <= max_len:
        return (vx, vy)
    s = max_len / n
    return (vx * s, vy * s)

def _synth_toe_from_leg(
    ankle: Tuple[int, int],
    knee: Tuple[int, int],
    *,
    max_len: float,
    toe_scale: float,
    canvas_w: int,
    canvas_h: int,
) -> Tuple[int, int]:
    ax, ay = float(ankle[0]), float(ankle[1])
    kx, ky = float(knee[0]), float(knee[1])

    vx, vy = ax - kx, ay - ky
    vx, vy = _limit_vec(vx, vy, max_len)

    tx = ax + toe_scale * vx
    ty = ay + toe_scale * vy

    tx = _clamp(tx, 0.0, float(canvas_w - 1))
    ty = _clamp(ty, 0.0, float(canvas_h - 1))
    return (int(round(tx)), int(round(ty)))

def _synth_head(mid_sh: Tuple[int,int], mid_hip: Tuple[int,int], img_size: Tuple[int,int]) -> Tuple[int,int]:
    w, h = img_size
    vx = float(mid_sh[0] - mid_hip[0])
    vy = float(mid_sh[1] - mid_hip[1])
    L = (vx*vx + vy*vy) ** 0.5

    if L < 1.0:
        # fallback: straight up a bit
        return (mid_sh[0], max(0, mid_sh[1] - 40))

    ux, uy = vx / L, vy / L
    head_len = 0.45 * L
    hx = float(mid_sh[0]) + ux * head_len
    hy = float(mid_sh[1]) + uy * head_len - 0.10 * L
    return (int(_clamp(hx, 0, w - 1)), int(_clamp(hy, 0, h - 1)))


# ============================================================
# Projection helper (normalized -> canvas pixels)
# ============================================================

def point_scaled_float(
    lm,
    index: int,
    *,
    scale: Tuple[int, int] | None,
    offset: Tuple[int, int] | None,
    img_size: Tuple[int, int],
    flip_x: bool = False,
) -> Tuple[float, float]:
    """
    Normalized coords -> IMAGE float pixels (not OUT_W/OUT_H).
    x = (lm.x * resized_w) + offset_x
    y = (lm.y * resized_h) + offset_y
    """
    if not isinstance(scale, (tuple, list)) or len(scale) != 2:
        scale = img_size
    if not isinstance(offset, (tuple, list)) or len(offset) != 2:
        offset = (0, 0)

    img_w, img_h = img_size
    nw, nh = int(scale[0]), int(scale[1])
    ox, oy = int(offset[0]), int(offset[1])

    x = float(getattr(lm[index], "x", 0.0)) * float(nw) + float(ox)
    y = float(getattr(lm[index], "y", 0.0)) * float(nh) + float(oy)

    if flip_x:
        x = (float(img_w - 1)) - x

    return (_clamp(x, 0.0, float(img_w - 1)), _clamp(y, 0.0, float(img_h - 1)))


def as_int_pt(pt: Tuple[float, float]) -> Tuple[int, int]:
    return (int(round(pt[0])), int(round(pt[1])))


def _in_border(p: Tuple[float, float], pad: float, *, img_size: Tuple[int, int]) -> bool:
    x, y = float(p[0]), float(p[1])
    w, h = img_size
    return not (x < pad or y < pad or x > float(w - 1 - pad) or y > float(h - 1 - pad))


# ============================================================
# Angle helpers
# ============================================================

def angle_abc(a: Tuple[int, int], b: Tuple[int, int], c: Tuple[int, int]) -> float:
    """
    Angle at point b, between BA and BC, returned in [0..180]
    """
    ax, ay = float(a[0]), float(a[1])
    bx, by = float(b[0]), float(b[1])
    cx, cy = float(c[0]), float(c[1])

    abx, aby = ax - bx, ay - by
    cbx, cby = cx - bx, cy - by

    # dot / norms
    dot = abx * cbx + aby * cby
    nab = _norm2(abx, aby)
    ncb = _norm2(cbx, cby)
    if nab <= 1e-6 or ncb <= 1e-6:
        return 0.0

    cosv = dot / (nab * ncb)
    cosv = _clamp(cosv, -1.0, 1.0)
    return float(math.degrees(math.acos(cosv)))


def angle_from_vertical(top: Tuple[int, int], bottom: Tuple[int, int]) -> float:
    """
    Angle between segment (bottom->top) and vertical axis in degrees.
    """
    dx = float(top[0] - bottom[0])
    dy = float(bottom[1] - top[1])
    return float(abs(math.degrees(math.atan2(dx, dy))))


def _ema_value(store: Dict[str, float], key: str, value: float, alpha: float) -> float:
    prev = store.get(key)
    if prev is None:
        store[key] = float(value)
    else:
        store[key] = float(alpha) * float(prev) + (1.0 - float(alpha)) * float(value)
    return float(store[key])


# ============================================================
# Direction + near-side inference (kept from your original)
# ============================================================

def _mean_valid(values: list[float]) -> Optional[float]:
    vals = [v for v in values if v is not None and np.isfinite(v)]
    if not vals:
        return None
    return float(np.mean(vals))


def _mean_attr(lm, indices: list[int], attr: str) -> Optional[float]:
    values = []
    for i in indices:
        try:
            v = getattr(lm[i], attr, None)
        except Exception:
            v = None
        if v is None:
            continue
        values.append(float(v))
    return _mean_valid(values)

def near_side_is_left(lm, *, direction: Optional[str] = None, buffers: Optional[Dict[str, Any]] = None) -> bool:
    """
    Detect which anatomical side is closer to the camera.

    Primary signal: **visibility / confidence score**.
    The near-side joints are directly visible to the camera and consistently
    have higher scores than the occluded far-side joints.  Z-depth from 2-D
    pose models is unreliable for side views and used only as a weak tie-breaker.
    """
    left_ids = [IDX["L_SH"], IDX["L_HIP"], IDX["L_KNEE"], IDX["L_ANK"]]
    right_ids = [IDX["R_SH"], IDX["R_HIP"], IDX["R_KNEE"], IDX["R_ANK"]]

    for lh, rh in ((IDX["L_HEEL"], IDX["R_HEEL"]),):
        if lh < len(lm) and rh < len(lm) and _valid_lm_point(lm[lh]) and _valid_lm_point(lm[rh]):
            left_ids.append(lh)
            right_ids.append(rh)

    # ---- Primary signal: visibility / score ----
    left_vis = _mean_attr(lm, left_ids, "visibility")
    if left_vis is None:
        left_vis = _mean_attr(lm, left_ids, "score")
    right_vis = _mean_attr(lm, right_ids, "visibility")
    if right_vis is None:
        right_vis = _mean_attr(lm, right_ids, "score")

    if left_vis is not None and right_vis is not None:
        vis_diff = left_vis - right_vis
        if abs(vis_diff) > 0.03:          # small threshold — visibility is reliable
            return vis_diff > 0           # higher vis = near side

    # ---- Weak tie-breaker: Z-depth (smaller = closer) ----
    left_z = _mean_attr(lm, left_ids, "z")
    right_z = _mean_attr(lm, right_ids, "z")
    if left_z is not None and right_z is not None:
        z_diff = abs(left_z - right_z)
        if z_diff > 0.05:
            return left_z < right_z

    return True  # default left

def _update_direction_state(lm, buffers: Dict[str, Any]) -> Optional[str]:
    state = buffers.setdefault(
        "direction_state",
        {"samples": [], "direction": None, "last_mid_x": None},
    )

    direction = state.get("direction")
    if direction in {"left_to_right", "right_to_left", "unknown"}:
        return direction

    try:
        mid_x = (float(lm[IDX["L_HIP"]].x) + float(lm[IDX["R_HIP"]].x)) / 2.0
    except Exception:
        return None

    last_mid_x = state.get("last_mid_x")
    if last_mid_x is None or abs(mid_x - last_mid_x) > 1e-4:
        state["samples"].append(mid_x)
        state["last_mid_x"] = mid_x

    samples = state["samples"]
    max_samples = 15
    min_samples = 5
    thresh = 0.01

    if len(samples) >= min_samples:
        delta = samples[-1] - samples[0]
        if delta > thresh:
            state["direction"] = "left_to_right"
        elif delta < -thresh:
            state["direction"] = "right_to_left"
        elif len(samples) >= max_samples:
            state["direction"] = "unknown"

    if len(samples) > max_samples:
        state["samples"] = samples[-max_samples:]

    return state.get("direction")

# ============================================================
# Drawing helpers 
# ============================================================

def draw_label(draw: ImageDraw.ImageDraw, text: str, origin):
    """
    Keep this for quick debug text; your UI-style badges use draw_pill().
    """
    x, y = origin
    bbox = draw.textbbox((x, y), text, font=_FONT)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.rectangle([(x, y - h - 4), (x + w + 6, y)], fill=LABEL_BG)
    draw.text((x + 3, y - h - 2), text, fill=LABEL_TXT, font=_FONT)


def draw_dot(d: ImageDraw.ImageDraw, pt: Tuple[int, int], r: int = SIDE_DOT_R) -> None:
    ro = max(r + 2, SIDE_DOT_OUTLINE_R)

    d.ellipse(
        [(pt[0] - ro, pt[1] - ro), (pt[0] + ro, pt[1] + ro)],
        fill=COLOR_JOINT_OUTLINE,
        outline=None,
    )
    d.ellipse(
        [(pt[0] - r, pt[1] - r), (pt[0] + r, pt[1] + r)],
        fill=COLOR_JOINT,
        outline=None,
    )

def draw_dot_faded(d, pt):
    r = max(3, SIDE_DOT_R - 1)
    ro = r + 2
    d.ellipse(
        [(pt[0]-ro, pt[1]-ro), (pt[0]+ro, pt[1]+ro)],
        fill=(200, 200, 220),
        outline=None,
    )
    d.ellipse(
        [(pt[0]-r, pt[1]-r), (pt[0]+r, pt[1]+r)],
        fill=COLOR_FAR,
        outline=None,
    )

def draw_segment(d: ImageDraw.ImageDraw, a: Tuple[int, int], b: Tuple[int, int]) -> None:
    d.line([a, b], fill=COLOR_BLUE, width=SIDE_LINE_W)


def draw_pill(
    draw: ImageDraw.ImageDraw,
    text: str,
    anchor: Tuple[int, int],
    *,
    value: float,
    warn_threshold: float,
) -> None:
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

    pill = COLOR_BADGE_WARN if abs(float(value)) >= float(warn_threshold) else COLOR_BADGE_OK

    draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=r, fill=pill, outline=None)
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    draw.text((cx, cy), text, fill=(255, 255, 255), font=_FONT_PILL, anchor="mm")


# ============================================================
# Consumer wrapper (SIDE VIEW)
# ============================================================

class SideAnnotationConsumer:
    requires_pose = True
    produces_image = True
    mutates_buffers = True
    frame_order_dependent = True
    disable_external_pose_smoothing = True

    def __init__(self, buffers: Dict[str, Any], snapshot: Dict[str, Any]):
        self.buffers = buffers
        self.snapshot = snapshot

        self._ema_pts: Dict[int, Tuple[float, float]] = {}
        self._ema_bars: Dict[str, float] = {}
        self._ema_age: Dict[int, int] = {}  # frames since last update per landmark

        self._missing_pose_frames = 0
        self._init_stable_count = 0

        self._debug_frames = 0
        self._debug_enabled = os.environ.get("APP_DEBUG", "").lower() in {"1", "true", "yes", "y", "on"}

    def consume(
        self,
        frame_idx: int,
        image: Image.Image,
        pose_result,
        *,
        scale=None,   # (nw, nh)
        offset=None,  # (ox, oy)
        **kwargs,
    ):
        if self._debug_enabled and self._debug_frames < 5:
            logger.info("SideAnnotationConsumer scale=%s offset=%s", scale, offset)
            self._debug_frames += 1

        if not isinstance(scale, (tuple, list)) or len(scale) != 2:
            scale = image.size
        else:
            scale = (int(scale[0]), int(scale[1]))

        if not isinstance(offset, (tuple, list)) or len(offset) != 2:
            offset = (0, 0)
        else:
            offset = (int(offset[0]), int(offset[1]))

        return annotate_side_frame(
            image=image,
            pose_result=pose_result,
            buffers=self.buffers,
            snapshot=self.snapshot,
            frame_idx=frame_idx,
            resized_wh=scale,
            offset=offset,
            ema_pts=self._ema_pts,
            ema_bars=self._ema_bars,
            ema_age=self._ema_age,
            have_any_pose_ref=self,
        )


# ============================================================
# Annotation entry point (SIDE VIEW)
# ============================================================

def annotate_side_frame(
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
    ema_age: Optional[Dict[int, int]] = None,
    have_any_pose_ref: Optional[SideAnnotationConsumer] = None,
):
    if image is None or not hasattr(image, "size"):
        return image

    if ema_pts is None:
        ema_pts = {}
    if ema_bars is None:
        ema_bars = {}
    if ema_age is None:
        ema_age = {}

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

    # --------------------------------------------------------
    # Pose validation + hold-last-good
    # --------------------------------------------------------
    has_pose = _valid_pose_result(pose_result)

    if SIDE_DEBUG and frame_idx < 3:
        logger.info(
            "side: image.size=%s OUT=(%s,%s) resized_wh=%s offset=%s has_pose=%s",
            image.size, OUT_W, OUT_H, resized_wh, offset, has_pose
        )

    if not has_pose:
        if have_any_pose_ref is not None:
            have_any_pose_ref._missing_pose_frames += 1
            if have_any_pose_ref._missing_pose_frames <= SIDE_HOLD_LAST_FRAMES and ema_pts:
                # keep drawing last known skeleton
                pass
            else:
                if have_any_pose_ref._missing_pose_frames >= SIDE_MAX_MISSING_FRAMES:
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

    # landmarks
    lm = None
    if has_pose:
        try:
            lm = pose_result.pose_landmarks.landmark
        except Exception:
            lm = None

    if lm is None:
        return image


    d = ImageDraw.Draw(image)
    canvas_w, canvas_h = image.size

    # --------------------------------------------------------
    # Bootstrap stable pose before starting EMA 
    # Keep it simple: require hips+shoulders visible for 2 frames
    # --------------------------------------------------------
    if not ema_pts:
        stable = True
        try:
            core = [IDX["L_HIP"], IDX["R_HIP"], IDX["L_SH"], IDX["R_SH"], IDX["L_ANK"], IDX["R_ANK"]]
            for i in core:
                if i >= len(lm) or not _valid_lm_point(lm[i]):
                    stable = False
                    break
                vis = getattr(lm[i], "visibility", None)
                if vis is None:
                    vis = getattr(lm[i], "score", None)
                vis = float(vis if vis is not None else 1.0)
                if vis < 0.60:
                    stable = False
                    break
        except Exception:
            stable = False

        if stable and have_any_pose_ref is not None:
            have_any_pose_ref._init_stable_count += 1
        elif have_any_pose_ref is not None:
            have_any_pose_ref._init_stable_count = 0
            return image

        if have_any_pose_ref is not None and have_any_pose_ref._init_stable_count < 2:
            return image

    # --------------------------------------------------------
    # Update EMA points
    # --------------------------------------------------------

    _STALE_MAX = 4  # drop landmarks not updated for this many frames

    pad = float(SIDE_BORDER_PAD_PX)
    # Age all tracked points; updated ones get reset below
    for idx in list(ema_age.keys()):
        ema_age[idx] = ema_age[idx] + 1

    for idx in SIDE_USED:
        if idx >= len(lm):
            continue
        p = lm[idx]
        if not _valid_lm_point(p):
            continue

        vis = getattr(p, "visibility", None)
        if vis is None:
            vis = getattr(p, "score", None)
        vis = float(vis if vis is not None else 1.0)

        is_foot = idx in FOOT_POINTS
        min_vis = SIDE_MIN_VIS_FOOT if is_foot else SIDE_MIN_VIS
        alpha = SIDE_FOOT_ALPHA if is_foot else SIDE_SMOOTH_ALPHA
        max_jump = SIDE_MAX_JUMP_PX_FOOT if is_foot else SIDE_MAX_JUMP_PX

        # Low-vis: still update but with heavier smoothing to avoid freeze
        if vis < min_vis:
            if idx not in ema_pts:
                continue  # don't init from low-vis
            alpha = min(0.70, alpha + 0.25)  # heavier smoothing for low confidence

        cur = point_scaled_float(
            lm,
            idx,
            scale=resized_wh,
            offset=offset,
            img_size=image.size,
            flip_x=False,
        )

        if not _in_border(cur, pad, img_size=image.size):
            continue

        if idx not in ema_pts:
            ema_pts[idx] = cur
            ema_age[idx] = 0
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
        ema_age[idx] = 0

    # Drop stale far-side points so they don't freeze in place
    for idx in list(ema_pts.keys()):
        if ema_age.get(idx, 0) > _STALE_MAX:
            del ema_pts[idx]

    # --------------------------------------------------------
    # Require key points
    # --------------------------------------------------------

    # Near-side joints are always required; far-side may be absent
    required = [
        IDX["L_SH"], IDX["R_SH"],
        IDX["L_HIP"], IDX["R_HIP"],
    ]
    if any(i not in ema_pts for i in required):
        return image

    def P(i: int) -> Tuple[int, int]:
        return as_int_pt(ema_pts[i])

    def P_or(i: int, fallback: Tuple[int, int]) -> Tuple[int, int]:
        return as_int_pt(ema_pts[i]) if i in ema_pts else fallback

    # --------------------------------------------------------
    # Smoothed points (pixels)
    # --------------------------------------------------------
    L_sh, R_sh = P(IDX["L_SH"]), P(IDX["R_SH"])

    L_el = P_or(IDX["L_EL"], L_sh)
    R_el = P_or(IDX["R_EL"], R_sh)
    L_wr = P_or(IDX["L_WR"], L_el)
    R_wr = P_or(IDX["R_WR"], R_el)

    L_hip, R_hip = P(IDX["L_HIP"]), P(IDX["R_HIP"])
    L_knee = P_or(IDX["L_KNEE"], L_hip)
    R_knee = P_or(IDX["R_KNEE"], R_hip)
    L_ank = P_or(IDX["L_ANK"], L_knee)
    R_ank = P_or(IDX["R_ANK"], R_knee)

    mid_sh = ((L_sh[0] + R_sh[0]) // 2, (L_sh[1] + R_sh[1]) // 2)
    mid_hip = ((L_hip[0] + R_hip[0]) // 2, (L_hip[1] + R_hip[1]) // 2)

    L_heel = P(IDX["L_HEEL"]) if IDX["L_HEEL"] in ema_pts else L_ank
    R_heel = P(IDX["R_HEEL"]) if IDX["R_HEEL"] in ema_pts else R_ank

    # toe proxy: prefer true toe; else synthesize from shank direction (rear-like stability)

    def _toe_ok(idx: int) -> bool:
        if idx not in ema_pts:
            return False
        if idx >= len(lm):
            return False
        try:
            v = getattr(lm[idx], "visibility", None)
            if v is None:
                v = getattr(lm[idx], "score", None)
            return float(v if v is not None else 1.0) >= SIDE_MIN_VIS_FOOT
        except Exception:
            return True
    
    if _toe_ok(IDX["L_TOE"]):
        L_toe = P(IDX["L_TOE"])
    else:
        L_toe = _synth_toe_from_leg(
            L_ank, L_knee,
            max_len=120.0, toe_scale=1.15,
            canvas_w=canvas_w, canvas_h=canvas_h,
        )

    if _toe_ok(IDX["R_TOE"]):
        R_toe = P(IDX["R_TOE"])
    else:
        R_toe = _synth_toe_from_leg(
            R_ank, R_knee,
            max_len=120.0, toe_scale=1.15,
            canvas_w=canvas_w, canvas_h=canvas_h,
        )

    # --------------------------------------------------------
    # Rear-style dashed reference midline through hip midpoint
    # --------------------------------------------------------
    midline_x = int(round(mid_hip[0]))
    top_y = max(0, min(L_sh[1], R_sh[1]) - 60)
    bot_y = min(canvas_h - 1, max(L_ank[1], R_ank[1]) + 80)

    dash_len = 18
    gap_len = 14
    y = top_y
    while y < bot_y:
        y2 = min(bot_y, y + dash_len)
        d.line([(midline_x, y), (midline_x, y2)], fill=COLOR_BLUE, width=SIDE_LINE_W)
        y = y2 + gap_len
    

    # ✅ IMPROVED: Multi-frame consensus for near-side detection
    near_left_votes = buffers.setdefault("near_left_votes", {"left": 0, "right": 0, "locked": False})
    
    if not near_left_votes["locked"]:
        # Accumulate votes over first 10 frames
        current_vote = near_side_is_left(lm, direction=None, buffers=buffers)
        
        if current_vote:
            near_left_votes["left"] += 1
        else:
            near_left_votes["right"] += 1
        
        total_votes = near_left_votes["left"] + near_left_votes["right"]
        
        # Lock after 10 frames with clear majority (7/10)
        if total_votes >= 10:
            near_left = near_left_votes["left"] >= 7
            near_left_votes["locked"] = True
            buffers["near_left_locked"] = near_left
            logger.info(
                "near_side_locked: left=%s (votes: L=%d R=%d)",
                near_left,
                near_left_votes["left"],
                near_left_votes["right"],
            )
        else:
            # Use majority vote so far (but don't lock yet)
            near_left = near_left_votes["left"] > near_left_votes["right"]
    else:
        near_left = buffers.get("near_left_locked", True)

    # --------------------------------------------------------
    # Select primary (near-side) joints for metrics
    # --------------------------------------------------------
    if near_left:
        P_knee = L_knee
        P_ank = L_ank
        P_toe = L_toe
    else:
        P_knee = R_knee
        P_ank = R_ank
        P_toe = R_toe
    # --------------------------------------------------------
    # Rear-style deviation metrics for pills (small signed degrees)
    # --------------------------------------------------------
    c = float(SIDE_ANGLE_CLAMP_DEG)
    ref_len_px = float(max(180.0, abs(P_ank[1] - mid_hip[1]) + 1))
    knee_dev_raw = _dev_angle_deg(float(P_knee[0] - midline_x), ref_len_px)
    ank_dev_raw  = _dev_angle_deg(float(P_ank[0] - midline_x), ref_len_px)

    knee_to_toe_px = int(P_toe[0] - P_knee[0])
    
    trunk_dev_raw = _dev_angle_deg(float(mid_sh[0] - mid_hip[0]), ref_len_px)

    # Match rear: clamp around +/-15 deg (not +/-45)
    knee_dev_raw = _clamp(knee_dev_raw, -c, c)
    ank_dev_raw  = _clamp(ank_dev_raw, -c, c)
    trunk_dev_raw = _clamp(trunk_dev_raw, -c, c)

    knee_dev = _ema_value(ema_bars, "knee_dev", knee_dev_raw, SIDE_ANGLE_ALPHA)
    ank_dev  = _ema_value(ema_bars, "ank_dev", ank_dev_raw, SIDE_ANGLE_ALPHA)
    trunk_dev = _ema_value(ema_bars, "trunk_dev", trunk_dev_raw, SIDE_ANGLE_ALPHA)

    def _angle_badge(v: float) -> str:
        return f"{v:+.1f}°"    

    # --------------------------------------------------------
    # Metrics (side)
    # --------------------------------------------------------
    L_knee_ang = angle_abc(L_hip, L_knee, L_ank)
    R_knee_ang = angle_abc(R_hip, R_knee, R_ank)

    L_hip_ang = angle_abc(mid_sh, L_hip, L_knee)
    R_hip_ang = angle_abc(mid_sh, R_hip, R_knee)

    # simple ankle angle proxy: knee-ankle-toe
    L_ankle_ang = angle_abc(L_knee, L_ank, L_toe)
    R_ankle_ang = angle_abc(R_knee, R_ank, R_toe)

    L_elbow_ang = angle_abc(L_sh, L_el, L_wr)
    R_elbow_ang = angle_abc(R_sh, R_el, R_wr)

    # foot strike proxy: ankle->toe vs vertical (you can refine later)
    foot_strike_L = angle_from_vertical(L_toe, L_ank)
    foot_strike_R = angle_from_vertical(R_toe, R_ank)

    foot_strike = foot_strike_L if near_left else foot_strike_R


    # pick primary (near side)
    if near_left:
        knee_ang = L_knee_ang
        hip_ang = L_hip_ang
        ankle_ang = L_ankle_ang
        elbow_ang = L_elbow_ang
    else:
        knee_ang = R_knee_ang
        hip_ang = R_hip_ang
        ankle_ang = R_ankle_ang
        elbow_ang = R_elbow_ang

    # Knee->toe guide (pixels)
    knee_to_toe_px = int(P_toe[0] - P_knee[0])

    # COM delta (same idea as your original)
    mid_hip_y = buffers.setdefault("mid_hip_y", [])
    mid_hip_y.append(mid_hip[1])
    if len(mid_hip_y) > 30:
        del mid_hip_y[:-30]
    com_delta = int(mid_hip[1] - np.mean(mid_hip_y[-10:])) if len(mid_hip_y) >= 10 else 0

    # --------------------------------------------------------
    # Persist buffers (unchanged contract)
    # --------------------------------------------------------
    buffers.setdefault("knee_angles", []).extend([L_knee_ang, R_knee_ang])
    buffers.setdefault("left_knee", []).append(L_knee_ang)
    buffers.setdefault("right_knee", []).append(R_knee_ang)
    buffers.setdefault("left_ankle_y", []).append(L_ank[1])
    buffers.setdefault("right_ankle_y", []).append(R_ank[1])

    if STORE_DEBUG_SERIES:
        buffers.setdefault("frame_series", []).append({
            "L_hip": L_hip, "R_hip": R_hip,
            "L_knee": L_knee, "R_knee": R_knee,
            "L_ankle": L_ank, "R_ankle": R_ank,
            "L_heel": L_heel, "R_heel": R_heel,
            "L_toe": L_toe, "R_toe": R_toe,
            "mid_shoulder": mid_sh,
            "mid_hip": mid_hip,
            "near_left": near_left,
        })

    # --------------------------------------------------------
    # Draw skeleton (far side first, then near side on top)
    # --------------------------------------------------------
    # torso (shared, always full color)
    draw_segment(d, L_sh, R_sh)
    draw_segment(d, L_hip, R_hip)
    draw_segment(d, mid_sh, mid_hip)

    def _draw_far_seg(a, b):
        d.line([a, b], fill=COLOR_FAR, width=SIDE_LINE_W_FAR)

    def _has(name: str) -> bool:
        return IDX[name] in ema_pts

    if near_left:
        # Far side = right — legs only (no arm), drawn if fresh
        if _has("R_SH") and _has("R_HIP"):
            _draw_far_seg(R_sh, R_hip)
        if _has("R_HIP") and _has("R_KNEE"):
            _draw_far_seg(R_hip, R_knee)
        if _has("R_KNEE") and _has("R_ANK"):
            _draw_far_seg(R_knee, R_ank)
        if _has("R_ANK") and _has("R_HEEL"):
            _draw_far_seg(R_ank, R_heel)
        if _has("R_HEEL") and _has("R_TOE"):
            _draw_far_seg(R_heel, R_toe)
        # Near side = left (full skeleton)
        draw_segment(d, L_sh, L_hip)
        draw_segment(d, L_sh, L_el)
        draw_segment(d, L_el, L_wr)
        draw_segment(d, L_hip, L_knee)
        draw_segment(d, L_knee, L_ank)
        draw_segment(d, L_ank, L_heel)
        draw_segment(d, L_heel, L_toe)
        draw_segment(d, L_ank, L_toe)
    else:
        # Far side = left — legs only (no arm), drawn if fresh
        if _has("L_SH") and _has("L_HIP"):
            _draw_far_seg(L_sh, L_hip)
        if _has("L_HIP") and _has("L_KNEE"):
            _draw_far_seg(L_hip, L_knee)
        if _has("L_KNEE") and _has("L_ANK"):
            _draw_far_seg(L_knee, L_ank)
        if _has("L_ANK") and _has("L_HEEL"):
            _draw_far_seg(L_ank, L_heel)
        if _has("L_HEEL") and _has("L_TOE"):
            _draw_far_seg(L_heel, L_toe)
        # Near side = right (full skeleton)
        draw_segment(d, R_sh, R_hip)
        draw_segment(d, R_sh, R_el)
        draw_segment(d, R_el, R_wr)
        draw_segment(d, R_hip, R_knee)
        draw_segment(d, R_knee, R_ank)
        draw_segment(d, R_ank, R_heel)
        draw_segment(d, R_heel, R_toe)
        draw_segment(d, R_ank, R_toe)

    # Dots: far side faded (legs only, no arm), near side full
    if near_left:
        far_idx_pts = [
            ("R_HIP", R_hip), ("R_KNEE", R_knee), ("R_ANK", R_ank),
            ("R_HEEL", R_heel), ("R_TOE", R_toe),
        ]
        near_pts = [L_sh, L_el, L_wr, L_hip, L_knee, L_ank, L_heel, L_toe]
    else:
        far_idx_pts = [
            ("L_HIP", L_hip), ("L_KNEE", L_knee), ("L_ANK", L_ank),
            ("L_HEEL", L_heel), ("L_TOE", L_toe),
        ]
        near_pts = [R_sh, R_el, R_wr, R_hip, R_knee, R_ank, R_heel, R_toe]

    for name, pt in far_idx_pts:
        if _has(name):
            draw_dot_faded(d, pt)
    for pt in near_pts:
        draw_dot(d, pt)

    # --------------------------------------------------------
    # Pills display
    # --------------------------------------------------------
    # smooth some displayed bars (visual stability)

    # use the already-chosen near-side foot_strike from earlier
    foot_disp = _ema_value(
        ema_bars,
        "foot",
        _clamp(float(foot_strike), -c, c),
        SIDE_ANGLE_ALPHA,
    )

    com_disp = _ema_value(ema_bars, "com", float(com_delta), 0.65)

    WARN_DEG = 8.0  # match rear

    # Pills placed to the right of the body (offset from rightmost joint X)
    _PILL_BODY_OFFSET = 28  # px gap between body and pill

    # Rightmost body X at each level for pill anchoring
    body_right_sh = max(L_sh[0], R_sh[0])
    body_right_hip = max(L_hip[0], R_hip[0])
    body_right_knee = max(L_knee[0], R_knee[0])
    body_right_ank = max(L_ank[0], R_ank[0])
    body_right_toe = max(L_toe[0], R_toe[0])

    def _body_pill(text: str, body_x: int, y: int, *, value: float, warn_thr: float) -> None:
        """Draw a pill to the right of the body at the given joint level."""
        x = min(body_x + _PILL_BODY_OFFSET, canvas_w - 160)
        draw_pill(d, text, (x, max(10, y)), value=value, warn_threshold=warn_thr)

    _body_pill(_angle_badge(trunk_dev), body_right_sh, mid_sh[1] - 20, value=trunk_dev, warn_thr=WARN_DEG)
    _body_pill(_angle_badge(knee_dev), body_right_knee, P_knee[1] - 20, value=knee_dev, warn_thr=WARN_DEG)
    _body_pill(_angle_badge(ank_dev), body_right_ank, P_ank[1] - 20, value=ank_dev, warn_thr=WARN_DEG)

    # --------------------------------------------------------
    # Snapshot capture
    # --------------------------------------------------------
    if snapshot.get("img") is None and frame_idx >= 10:
        snapshot["img"] = np.array(image)

    return image
