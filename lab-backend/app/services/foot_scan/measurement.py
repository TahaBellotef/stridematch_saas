# app/services/foot_scan/measurement.py
"""
Foot length/width measurement from a binary segmentation mask.

Pipeline (see `_run_pipeline`), each step its own function:

 1. Clean the mask (close, fill holes, open, keep largest blob).
 2. Convex hull of the cleaned mask.
 3. PCA of the cleaned mask (once).
 4. Vote on which end is the toe vs the heel/leg side, using four
    independent geometric cues (taper, curvature, hull angle, border
    proximity) plus a geodesic-straightness confidence modifier.
 5. Detect the ankle (if any leg is attached) in a single deterministic
    pass over a thickness profile ordered by geodesic distance from the
    toe - not the straight-line PCA axis, which a bent/angled leg can
    skew (this was the root cause of every measurement bug found in
    earlier iterations of this module).
 6. Remove everything past the ankle. Never touch the heel or toe side.
 7. Recompute PCA on the trimmed mask.
 8. Length = heel-to-toe distance along that final axis.
 9. Width = local thickness (distance transform, not a projection slice)
    at the ball of the foot, found as the thickest point in the forefoot.
10. Classify the result as good / warning / fail (see `_classify`).

Everything here is a single deterministic pass - no retry loops, no
recomputing a decision against a different axis and hoping it converges.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import cv2
import numpy as np

from core.foot.image_ops import (
    find_contours,
    get_largest_contour,
    fill_holes,
    keep_largest_blob,
    morphological_close,
    morphological_open,
)


# ----------------------------------------------------------------------
# Public API
# ----------------------------------------------------------------------

@dataclass
class FootMeasurementResult:
    """Result of `measure_foot`. Field set is part of the public API -
    other modules (runner.py, schemas) depend on these exact names."""
    success: bool
    length_px: float = 0.0
    width_px: float = 0.0
    length_mm: float = 0.0
    width_mm: float = 0.0
    length_cm: float = 0.0
    width_cm: float = 0.0
    axis: Optional[Tuple[float, float]] = None
    center: Optional[Tuple[float, float]] = None
    heel_point: Optional[Tuple[float, float]] = None
    toe_point: Optional[Tuple[float, float]] = None
    confidence: float = 0.0
    warnings: List[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


def measure_foot(
    mask: np.ndarray,
    px_per_mm: float,
    *,
    valid_mask: Optional[np.ndarray] = None,
    image: Optional[np.ndarray] = None,
    debug_dir: Optional[Union[str, Path]] = None,
) -> FootMeasurementResult:
    """
    Measure foot length and width from a binary mask.

    Args:
        mask: Binary foot mask (H, W), as produced by segmentation. Does
            not need to be pre-cleaned - this function cleans it.
        px_per_mm: Pixels per millimeter from calibration.
        valid_mask: Optional mask of which canvas pixels came from real
            photographed content vs. synthetic black border-fill added
            during rectification - lets toe/heel identification penalize
            an end that sits at the edge of the actual photo, not just
            the canvas edge.
        image: Optional rectified color image, used only to draw debug
            overlays on a real background. Has no effect on the
            measurement itself.
        debug_dir: Optional directory. If given, writes the full 10-stage
            debug image set there (see module docstring), even if the
            measurement ultimately fails.

    Returns:
        FootMeasurementResult
    """
    trace = _PipelineTrace(image=image)
    result = _run_pipeline(mask, px_per_mm, valid_mask, trace)
    trace.result = result
    if debug_dir is not None:
        _write_debug_dump(Path(debug_dir), mask, trace)
    return result


def draw_measurement_debug(
    image: np.ndarray,
    result: FootMeasurementResult,
    mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Single-image production debug overlay (used by the API's `/debug`
    endpoint): mask, principal axis, heel/toe points, measurements text."""
    debug_img = image.copy()
    if mask is not None:
        debug_img = _overlay_mask(debug_img, mask, (0, 255, 0), alpha=0.3)

    if result.center is not None and result.axis is not None:
        center = np.array(result.center)
        axis = np.array(result.axis)
        half_length = result.length_px / 2
        _draw_line(debug_img, center - axis * half_length, center + axis * half_length, (255, 0, 0))
        cv2.circle(debug_img, tuple(center.astype(int)), 5, (0, 0, 255), -1)

    if result.heel_point is not None:
        _draw_point(debug_img, np.array(result.heel_point), (255, 0, 255), "Heel")
    if result.toe_point is not None:
        _draw_point(debug_img, np.array(result.toe_point), (0, 255, 255), "Toe")

    _draw_text_block(debug_img, [
        f"Length: {result.length_cm:.1f}cm ({result.length_mm:.0f}mm)",
        f"Width: {result.width_cm:.1f}cm ({result.width_mm:.0f}mm)",
        f"Confidence: {result.confidence:.2f}",
    ])
    return debug_img


# ----------------------------------------------------------------------
# Tuning constants (no magic numbers inline below)
# ----------------------------------------------------------------------

MIN_FOOT_PIXELS = 50

MASK_CLOSE_KERNEL = 5
MASK_CLOSE_ITERS = 2
MASK_OPEN_KERNEL = 3
MASK_OPEN_ITERS = 1

BORDER_MARGIN_PX = 20.0
BORDER_PENALTY_FACTOR = 0.05

HULL_ANGLE_SHARP_DEG = 60.0
HULL_ANGLE_FLAT_DEG = 180.0

TAPER_BAND_DISTANCES_MM: Tuple[float, ...] = (3.0, 8.0, 15.0, 25.0, 40.0)
TAPER_BAND_WIDTH_MM = 3.0
CURVATURE_WINDOW_MM = 15.0

CUE_WEIGHT_TAPER = 0.4
CUE_WEIGHT_CURVATURE = 0.3
CUE_WEIGHT_HULL_ANGLE = 0.3

ANKLE_BIN_MM = 4.0
ANKLE_MIN_FOOT_LENGTH_MM = 130.0
ANKLE_STABLE_MIN_RATIO = 1.10
ANKLE_HEEL_MARGIN_MM = 15.0
ANKLE_MIN_DECLINE_MM = 40.0
ANKLE_MIN_DECLINE_FRAC = 0.15
HEEL_MAX_VS_FOREFOOT_RATIO = 1.15

BALL_BIN_MM = 4.0
BALL_FOREFOOT_FRAC = 0.65

LENGTH_GOOD_MIN_MM, LENGTH_GOOD_MAX_MM = 220.0, 310.0
WIDTH_GOOD_MIN_MM, WIDTH_GOOD_MAX_MM = 70.0, 120.0
RATIO_GOOD_MIN, RATIO_GOOD_MAX = 2.2, 3.4

LENGTH_FAIL_MIN_MM, LENGTH_FAIL_MAX_MM = 170.0, 340.0
WIDTH_FAIL_MIN_MM, WIDTH_FAIL_MAX_MM = 50.0, 150.0


# ----------------------------------------------------------------------
# Internal dataclasses
# ----------------------------------------------------------------------

@dataclass
class _PCAResult:
    center: np.ndarray
    axis: np.ndarray
    perp_axis: np.ndarray


@dataclass
class _ToeHeelVote:
    toe_is_min: bool
    confidence: float
    scores: dict


@dataclass
class _AnkleResult:
    ankle_found: bool
    heel_distance_mm: float
    cut_distance_mm: Optional[float]
    profile_distance_mm: np.ndarray
    profile_thickness_mm: np.ndarray
    distance_map: np.ndarray
    crop_origin: Tuple[int, int]


@dataclass
class _WidthResult:
    width_px: float
    ball_pixel: np.ndarray


@dataclass
class _PipelineTrace:
    """Every intermediate value the pipeline computes, collected purely so
    a full debug dump can be written at the end - even for a measurement
    that failed partway through. Never read by the algorithm itself."""
    image: Optional[np.ndarray] = None
    cleaned_mask: Optional[np.ndarray] = None
    hull: Optional[np.ndarray] = None
    initial_pca: Optional[_PCAResult] = None
    initial_length_px: float = 0.0
    toe_point: Optional[np.ndarray] = None
    toe_heel_vote: Optional[_ToeHeelVote] = None
    ankle: Optional[_AnkleResult] = None
    final_mask: Optional[np.ndarray] = None
    final_pca: Optional[_PCAResult] = None
    final_heel_point: Optional[np.ndarray] = None
    final_toe_point: Optional[np.ndarray] = None
    width: Optional[_WidthResult] = None
    result: Optional[FootMeasurementResult] = None
    classification: str = ""
    classification_messages: List[str] = field(default_factory=list)
    fail_reason: str = ""


# ----------------------------------------------------------------------
# Orchestration
# ----------------------------------------------------------------------

def _run_pipeline(
    mask: np.ndarray,
    px_per_mm: float,
    valid_mask: Optional[np.ndarray],
    trace: _PipelineTrace,
) -> FootMeasurementResult:
    """The ten-step pipeline described in the module docstring, as a
    straight-line sequence of named steps with no loops or retries."""
    cleaned = _clean_mask(mask)
    trace.cleaned_mask = cleaned

    points = _extract_points(cleaned)
    if len(points) < MIN_FOOT_PIXELS:
        return _fail(f"No connected component found ({len(points)} foreground pixels)", trace)
    if _touches_every_border(cleaned):
        return _fail("Segmented region touches all four image borders - this cannot be a single foot", trace)

    landmarks = _locate_landmarks(cleaned, points, px_per_mm, valid_mask, trace)
    if landmarks is None:
        return _fail("Could not identify toe/heel landmarks", trace)
    dt, toe_point = landmarks

    final_points, final_dt = _remove_leg(cleaned, dt, points, toe_point, px_per_mm, trace)

    measured = _measure_final(final_points, final_dt, toe_point, px_per_mm, trace)
    if measured is None:
        return _fail("Could not locate the ball of the foot for a width measurement", trace)
    heel_point, toe_point_final, final_pca, length_px, length_mm, width, width_mm = measured

    level, messages = _classify(length_mm, width_mm)
    trace.classification = level
    trace.classification_messages = messages
    if level == "fail":
        return _fail(messages[0] if messages else "Measurement out of plausible range", trace, length_mm, width_mm)

    confidence = _compute_confidence(len(final_points), length_px, trace.toe_heel_vote.confidence, cleaned.shape)
    if level == "warning":
        confidence *= 0.6

    return FootMeasurementResult(
        success=True,
        length_px=length_px,
        width_px=width.width_px,
        length_mm=length_mm,
        width_mm=width_mm,
        length_cm=length_mm / 10.0,
        width_cm=width_mm / 10.0,
        axis=(float(final_pca.axis[0]), float(final_pca.axis[1])),
        center=(float(final_pca.center[0]), float(final_pca.center[1])),
        heel_point=(float(heel_point[0]), float(heel_point[1])),
        toe_point=(float(toe_point_final[0]), float(toe_point_final[1])),
        confidence=float(np.clip(confidence, 0.0, 1.0)),
        warnings=messages,
    )


def _locate_landmarks(
    cleaned: np.ndarray, points: np.ndarray, px_per_mm: float,
    valid_mask: Optional[np.ndarray], trace: _PipelineTrace,
) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """STEPS 2-4: hull, PCA, and the toe/heel vote. Returns (distance
    transform, toe point), or None if the vote could not be computed at
    all (a fully degenerate mask)."""
    hull = _compute_convex_hull(cleaned)
    trace.hull = hull
    dt = _distance_transform(cleaned)

    initial_pca = _compute_pca(points)
    trace.initial_pca = initial_pca
    initial_proj, _ = _project(points, initial_pca)
    trace.initial_length_px = float(np.max(initial_proj) - np.min(initial_proj))

    vote = _identify_toe_heel(cleaned, dt, hull, points, initial_proj, px_per_mm, valid_mask)
    trace.toe_heel_vote = vote
    if vote.scores.get("score_min", 0) == 0 and vote.scores.get("score_max", 0) == 0:
        return None

    toe_point = points[int(np.argmin(initial_proj) if vote.toe_is_min else np.argmax(initial_proj))]
    trace.toe_point = toe_point
    return dt, toe_point


def _remove_leg(
    cleaned: np.ndarray, dt: np.ndarray, points: np.ndarray, toe_point: np.ndarray,
    px_per_mm: float, trace: _PipelineTrace,
) -> Tuple[np.ndarray, np.ndarray]:
    """STEPS 5-6: detect the ankle and remove everything past it. Falls
    back to the uncut, cleaned mask if no cut is found or the cut would
    leave too little behind. Returns (final_points, final_dt)."""
    ankle = _detect_ankle(cleaned, dt, points, toe_point, px_per_mm)
    trace.ankle = ankle

    final_mask = cleaned
    if ankle is not None and ankle.cut_distance_mm is not None:
        trimmed = _apply_ankle_cut(cleaned, ankle, px_per_mm)
        if cv2.countNonZero(trimmed) >= MIN_FOOT_PIXELS:
            final_mask = trimmed
    trace.final_mask = final_mask

    final_points = _extract_points(final_mask)
    final_dt = dt if final_mask is cleaned else _distance_transform(final_mask)
    return final_points, final_dt


def _measure_final(
    final_points: np.ndarray, final_dt: np.ndarray,
    toe_point: np.ndarray, px_per_mm: float, trace: _PipelineTrace,
) -> Optional[Tuple[np.ndarray, np.ndarray, _PCAResult, float, float, _WidthResult, float]]:
    """STEPS 7-9: recompute PCA on the trimmed mask, then measure length
    (heel-to-toe along the final axis) and width (at the ball). Returns
    None if no width could be found at all."""
    final_pca = _compute_pca(final_points)
    trace.final_pca = final_pca

    heel_point, toe_point_final, heel_proj, toe_proj = _locate_toe_heel_on_axis(final_points, final_pca, toe_point)
    trace.final_heel_point = heel_point
    trace.final_toe_point = toe_point_final

    final_proj = _project(final_points, final_pca)[0]
    length_px = float(abs(toe_proj - heel_proj))

    width = _find_ball(
        final_dt, final_points, final_proj,
        float(np.min(final_proj)), float(np.max(final_proj)),
        px_per_mm, toe_proj, heel_proj,
    )
    trace.width = width
    if width is None:
        return None

    length_mm = length_px / px_per_mm
    width_mm = width.width_px / px_per_mm
    return heel_point, toe_point_final, final_pca, length_px, length_mm, width, width_mm


def _fail(message: str, trace: _PipelineTrace, length_mm: float = 0.0, width_mm: float = 0.0) -> FootMeasurementResult:
    trace.fail_reason = message
    return FootMeasurementResult(success=False, length_mm=length_mm, width_mm=width_mm, confidence=0.0, warnings=[message])


# ----------------------------------------------------------------------
# STEP 1: mask cleanup
# ----------------------------------------------------------------------

def _clean_mask(mask: np.ndarray) -> np.ndarray:
    """Close small gaps, fill enclosed holes, open away thin noise, then
    keep only the largest connected component - everything downstream
    assumes a single solid blob."""
    binary = (mask > 0).astype(np.uint8) * 255
    closed = morphological_close(binary, kernel_size=MASK_CLOSE_KERNEL, iterations=MASK_CLOSE_ITERS)
    filled = fill_holes(closed)
    opened = morphological_open(filled, kernel_size=MASK_OPEN_KERNEL, iterations=MASK_OPEN_ITERS)
    return keep_largest_blob(opened)


def _extract_points(mask: np.ndarray) -> np.ndarray:
    """(x, y) coordinates of every foreground pixel."""
    y_coords, x_coords = np.nonzero(mask)
    return np.column_stack([x_coords, y_coords]).astype(np.float64)


def _touches_every_border(mask: np.ndarray) -> bool:
    """True if the mask touches all four canvas edges at once - a strong
    signal that segmentation captured far more than a single foot."""
    h, w = mask.shape
    return bool(
        np.any(mask[0, :] > 0) and np.any(mask[h - 1, :] > 0)
        and np.any(mask[:, 0] > 0) and np.any(mask[:, w - 1] > 0)
    )


# ----------------------------------------------------------------------
# STEP 2: convex hull
# ----------------------------------------------------------------------

def _compute_convex_hull(mask: np.ndarray) -> Optional[np.ndarray]:
    """Convex hull polygon (N, 2) of the mask's largest contour."""
    contour = get_largest_contour(find_contours(mask))
    if contour is None:
        return None
    hull = cv2.convexHull(contour)
    return hull.reshape(-1, 2).astype(np.float64)


# ----------------------------------------------------------------------
# STEP 3: PCA
# ----------------------------------------------------------------------

def _compute_pca(points: np.ndarray) -> _PCAResult:
    """Principal axis of a point cloud (OpenCV's PCA, not hand-rolled
    eigenmath - same result, far easier to verify by inspection)."""
    mean, eigenvectors = cv2.PCACompute(points.astype(np.float64), mean=None)
    center = mean.reshape(2)
    axis = eigenvectors[0]
    perp_axis = np.array([-axis[1], axis[0]])
    return _PCAResult(center=center, axis=axis, perp_axis=perp_axis)


def _project(points: np.ndarray, pca: _PCAResult) -> Tuple[np.ndarray, np.ndarray]:
    """Signed distance of each point from `pca.center` along the
    principal axis and its perpendicular."""
    centered = points - pca.center
    return centered @ pca.axis, centered @ pca.perp_axis


def _distance_transform(mask: np.ndarray) -> np.ndarray:
    """Per-pixel distance to the nearest background pixel - true 2D local
    thickness (half the cross-section at that point), unlike a
    perpendicular-projection span which a skewed axis can inflate."""
    return cv2.distanceTransform((mask > 0).astype(np.uint8), cv2.DIST_L2, 5)


# ----------------------------------------------------------------------
# STEP 4: toe/heel identification by geometric voting
# ----------------------------------------------------------------------

def _thickness_band_profile(
    dt: np.ndarray, points: np.ndarray, projections: np.ndarray,
    anchor_proj: float, direction: float, px_per_mm: float,
) -> np.ndarray:
    """Local thickness sampled at fixed real-world distances out from
    `anchor_proj`, moving in `direction` along the axis - the input to
    `_taper_score`."""
    band_px = TAPER_BAND_WIDTH_MM * px_per_mm
    values = []
    for distance_mm in TAPER_BAND_DISTANCES_MM:
        target = anchor_proj + direction * distance_mm * px_per_mm
        in_band = np.abs(projections - target) <= band_px
        if not np.any(in_band):
            values.append(np.nan)
            continue
        band_points = points[in_band]
        xs = np.clip(band_points[:, 0].astype(int), 0, dt.shape[1] - 1)
        ys = np.clip(band_points[:, 1].astype(int), 0, dt.shape[0] - 1)
        values.append(float(np.max(dt[ys, xs])))
    return np.array(values)


def _taper_score(band_profile: np.ndarray) -> float:
    """1.0 = thickness grows smoothly from near zero moving away from this
    end (a real anatomical taper). 0.0 = thickness is already large right
    at the end and stays flat (a shaft abruptly truncated by the photo
    frame, not a taper)."""
    valid = band_profile[~np.isnan(band_profile)]
    if len(valid) < 2 or valid[-1] <= 0:
        return 0.5
    starts_thin = 1.0 - min(1.0, valid[0] / valid[-1])
    grows_outward = float(np.mean(np.diff(valid) >= -1.0))
    return float(np.clip(starts_thin * grows_outward, 0.0, 1.0))


def _curvature_score(contour: np.ndarray, point: np.ndarray, px_per_mm: float) -> float:
    """1.0 = the contour turns sharply near `point` (a rounded anatomical
    tip). 0.0 = it runs locally straight (a hard frame-clipped edge)."""
    n = len(contour)
    if n < 6:
        return 0.5
    distances = np.sum((contour - point) ** 2, axis=1)
    center_idx = int(np.argmin(distances))
    half_window = max(3, int(round(CURVATURE_WINDOW_MM * px_per_mm)))
    idxs = [(center_idx + k) % n for k in range(-half_window, half_window + 1)]
    window_points = contour[idxs]
    arc_length = float(np.sum(np.linalg.norm(np.diff(window_points, axis=0), axis=1)))
    chord_length = float(np.linalg.norm(window_points[-1] - window_points[0]))
    if arc_length <= 1e-6:
        return 0.5
    straightness = min(1.0, chord_length / arc_length)
    return float(np.clip(1.0 - straightness, 0.0, 1.0))


def _hull_angle_score(hull: np.ndarray, point: np.ndarray) -> float:
    """1.0 = the convex hull has a sharp vertex at this point (a genuine
    geometric peak, like a toe or heel). 0.0 = the hull runs locally
    straight through it (a flat, frame-clipped cut)."""
    n = len(hull)
    if n < 3:
        return 0.5
    distances = np.linalg.norm(hull - point, axis=1)
    i = int(np.argmin(distances))
    prev_pt, this_pt, next_pt = hull[(i - 1) % n], hull[i], hull[(i + 1) % n]
    v1, v2 = prev_pt - this_pt, next_pt - this_pt
    denom = np.linalg.norm(v1) * np.linalg.norm(v2)
    if denom < 1e-6:
        return 0.5
    cos_angle = np.clip(np.dot(v1, v2) / denom, -1.0, 1.0)
    angle_deg = np.degrees(np.arccos(cos_angle))
    span = HULL_ANGLE_FLAT_DEG - HULL_ANGLE_SHARP_DEG
    return float(np.clip((HULL_ANGLE_FLAT_DEG - angle_deg) / span, 0.0, 1.0))


def _border_penalty(point: np.ndarray, mask_shape: Tuple[int, int], valid_mask: Optional[np.ndarray]) -> float:
    """Confidence multiplier: 1.0 normally, crushed to BORDER_PENALTY_FACTOR
    if `point` sits within BORDER_MARGIN_PX of the canvas edge or of the
    photographed content's own edge (`valid_mask`). A real toe or heel
    cannot coincide with wherever the camera frame happened to stop, no
    matter how convincing the other cues look."""
    h, w = mask_shape
    x, y = point
    margin = BORDER_MARGIN_PX
    if x <= margin or x >= w - 1 - margin or y <= margin or y >= h - 1 - margin:
        return BORDER_PENALTY_FACTOR
    if valid_mask is not None:
        x0, x1 = max(0, int(x - margin)), min(w, int(x + margin) + 1)
        y0, y1 = max(0, int(y - margin)), min(h, int(y + margin) + 1)
        patch = valid_mask[y0:y1, x0:x1]
        if patch.size > 0 and np.any(patch == 0):
            return BORDER_PENALTY_FACTOR
    return 1.0


def _bounding_box(mask: np.ndarray, margin: int = 2) -> Tuple[int, int, int, int]:
    """(x0, y0, x1, y1) bounding box of the mask's foreground, expanded by
    `margin` px - used to crop geodesic-distance computations to the
    relevant region instead of the full rectified canvas."""
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    x0, x1 = max(0, int(xs.min()) - margin), min(w, int(xs.max()) + margin + 1)
    y0, y1 = max(0, int(ys.min()) - margin), min(h, int(ys.max()) + margin + 1)
    return x0, y0, x1, y1


def _geodesic_distance_map(mask: np.ndarray, seed: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int]]:
    """
    Distance from `seed` to every mask pixel, in steps of a region grown
    one ring at a time and constrained to the mask (a "grassfire"
    propagation). Unlike a straight-line or PCA-projection distance, this
    follows the shape's own bends, so it stays meaningful even when a leg
    is attached at an angle to the foot.

    Run on a crop of the mask's bounding box, not the full (usually much
    larger) rectified canvas, purely for speed - identical result, since
    nothing outside the mask's own bounding box can be part of any path.

    Returns (distance_map, crop_origin); unreached pixels are -1.
    """
    x0, y0, x1, y1 = _bounding_box(mask)
    cropped = (mask[y0:y1, x0:x1] > 0).astype(np.uint8)
    seed_x = int(np.clip(int(seed[0]) - x0, 0, cropped.shape[1] - 1))
    seed_y = int(np.clip(int(seed[1]) - y0, 0, cropped.shape[0] - 1))

    if cropped[seed_y, seed_x] == 0:
        ys, xs = np.nonzero(cropped)
        d2 = (xs - seed_x) ** 2 + (ys - seed_y) ** 2
        nearest = int(np.argmin(d2))
        seed_x, seed_y = int(xs[nearest]), int(ys[nearest])

    distance = np.full(cropped.shape, -1, dtype=np.int32)
    distance[seed_y, seed_x] = 0
    frontier = np.zeros(cropped.shape, dtype=np.uint8)
    frontier[seed_y, seed_x] = 1
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))

    remaining = int(np.count_nonzero(cropped)) - 1
    step = 0
    while remaining > 0:
        grown = cv2.dilate(frontier, kernel, iterations=1)
        newly_reached = (grown > 0) & (cropped > 0) & (distance < 0)
        if not np.any(newly_reached):
            break
        step += 1
        distance[newly_reached] = step
        remaining -= int(np.count_nonzero(newly_reached))
        frontier = newly_reached.astype(np.uint8)

    return distance, (x0, y0)


def _geodesic_lookup(distance_map: np.ndarray, crop_origin: Tuple[int, int], point: np.ndarray) -> Optional[int]:
    """Geodesic-distance value at `point` (full-image coordinates)."""
    x0, y0 = crop_origin
    x = int(np.clip(int(point[0]) - x0, 0, distance_map.shape[1] - 1))
    y = int(np.clip(int(point[1]) - y0, 0, distance_map.shape[0] - 1))
    value = int(distance_map[y, x])
    return value if value >= 0 else None


def _geodesic_straightness(mask: np.ndarray, point_a: np.ndarray, point_b: np.ndarray) -> float:
    """
    Ratio (<=1.0) of straight-line distance to geodesic (through-the-mask)
    distance between two points. Close to 1.0: the shape runs essentially
    straight between them, so the principal axis faithfully describes it.
    Well below 1.0: the shape bends between them (e.g. a leg attached at
    an angle), so the straight-line axis is a poorer description - this
    scales down the overall toe/heel confidence rather than favoring
    either side, since a bend affects both ends equally.
    """
    euclidean = float(np.linalg.norm(point_b - point_a))
    if euclidean <= 0:
        return 1.0
    distance_map, crop_origin = _geodesic_distance_map(mask, point_a)
    geodesic = _geodesic_lookup(distance_map, crop_origin, point_b)
    if geodesic is None or geodesic <= 0:
        return 1.0
    return float(np.clip(euclidean / geodesic, 0.0, 1.0))


def _identify_toe_heel(
    mask: np.ndarray,
    dt: np.ndarray,
    hull: Optional[np.ndarray],
    points: np.ndarray,
    projections: np.ndarray,
    px_per_mm: float,
    valid_mask: Optional[np.ndarray],
) -> _ToeHeelVote:
    """
    Decide which of the point cloud's two PCA extremes is the toe, by
    combining independent geometric cues rather than a single width
    comparison (which a frame-clipped leg can fool):

    - distance-transform taper (weight 0.4): does local thickness shrink
      smoothly to near zero approaching this end?
    - contour curvature (weight 0.3): does the boundary turn sharply here?
    - convex hull angle (weight 0.3): is there a genuine sharp hull vertex
      here, or does the hull run straight through (a flat cut)?
    - border penalty (multiplier): crushes the score of an end at the
      edge of the photographed content, regardless of the above.

    Geodesic straightness between the two candidates scales the overall
    confidence (it can't favor either side - see `_geodesic_straightness`).
    """
    point_min = points[int(np.argmin(projections))]
    point_max = points[int(np.argmax(projections))]
    min_proj, max_proj = float(np.min(projections)), float(np.max(projections))

    band_min = _thickness_band_profile(dt, points, projections, min_proj, 1.0, px_per_mm)
    band_max = _thickness_band_profile(dt, points, projections, max_proj, -1.0, px_per_mm)
    taper_min, taper_max = _taper_score(band_min), _taper_score(band_max)

    if hull is not None and len(hull) >= 3:
        hull_min, hull_max = _hull_angle_score(hull, point_min), _hull_angle_score(hull, point_max)
    else:
        hull_min = hull_max = 0.5

    contour = get_largest_contour(find_contours(mask))
    if contour is not None:
        contour = contour.reshape(-1, 2).astype(np.float64)
        curve_min = _curvature_score(contour, point_min, px_per_mm)
        curve_max = _curvature_score(contour, point_max, px_per_mm)
    else:
        curve_min = curve_max = 0.5

    border_min = _border_penalty(point_min, mask.shape, valid_mask)
    border_max = _border_penalty(point_max, mask.shape, valid_mask)

    score_min = (CUE_WEIGHT_TAPER * taper_min + CUE_WEIGHT_CURVATURE * curve_min + CUE_WEIGHT_HULL_ANGLE * hull_min) * border_min
    score_max = (CUE_WEIGHT_TAPER * taper_max + CUE_WEIGHT_CURVATURE * curve_max + CUE_WEIGHT_HULL_ANGLE * hull_max) * border_max

    total = score_min + score_max
    raw_confidence = abs(score_min - score_max) / total if total > 0 else 0.0
    straightness = _geodesic_straightness(mask, point_min, point_max)
    confidence = float(np.clip(raw_confidence * (0.5 + 0.5 * straightness), 0.0, 1.0))

    scores = {
        "taper_min": round(taper_min, 2), "taper_max": round(taper_max, 2),
        "curvature_min": round(curve_min, 2), "curvature_max": round(curve_max, 2),
        "hull_angle_min": round(hull_min, 2), "hull_angle_max": round(hull_max, 2),
        "border_min": border_min, "border_max": border_max,
        "geodesic_straightness": round(straightness, 2),
        "score_min": round(score_min, 3), "score_max": round(score_max, 3),
    }
    return _ToeHeelVote(toe_is_min=score_min >= score_max, confidence=confidence, scores=scores)


def _locate_toe_heel_on_axis(
    points: np.ndarray, pca: _PCAResult, toe_point: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, float, float]:
    """
    Re-express the already-decided toe point against a (possibly new) PCA
    axis by which extreme it's now closer to, rather than re-deciding
    toe/heel from scratch - the axis can rotate or flip sign once PCA is
    recomputed on the ankle-trimmed mask, but the toe itself doesn't move.

    Returns (heel_point, toe_point, heel_proj, toe_proj).
    """
    projections, _ = _project(points, pca)
    min_proj, max_proj = float(np.min(projections)), float(np.max(projections))
    toe_proj_current = float((toe_point - pca.center) @ pca.axis)
    toe_is_min = abs(min_proj - toe_proj_current) <= abs(max_proj - toe_proj_current)
    heel_proj, toe_proj = (max_proj, min_proj) if toe_is_min else (min_proj, max_proj)
    heel_point = pca.center + pca.axis * heel_proj
    toe_point_final = pca.center + pca.axis * toe_proj
    return heel_point, toe_point_final, heel_proj, toe_proj


# ----------------------------------------------------------------------
# STEP 5: ankle detection (single pass) + STEP 6: leg removal
# ----------------------------------------------------------------------

def _thickness_vs_geodesic_profile(
    dt: np.ndarray,
    points: np.ndarray,
    distance_map: np.ndarray,
    crop_origin: Tuple[int, int],
    px_per_mm: float,
    bin_mm: float = ANKLE_BIN_MM,
) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """
    Local thickness binned by geodesic distance from the toe - not by
    straight-line PCA projection - so ankle detection follows the foot's
    true centerline even when a leg is attached at an angle, instead of
    being skewed by an axis fitted through a bent shape.

    Returns (bin_centers_mm, thickness_mm), ordered by increasing distance
    from the toe, or None if there isn't enough data.
    """
    x0, y0 = crop_origin
    xs = np.clip(points[:, 0].astype(int) - x0, 0, distance_map.shape[1] - 1)
    ys = np.clip(points[:, 1].astype(int) - y0, 0, distance_map.shape[0] - 1)
    geo_steps = distance_map[ys, xs]
    valid = geo_steps >= 0
    if np.count_nonzero(valid) < 20:
        return None

    geo_mm = geo_steps[valid] / px_per_mm
    points_valid = points[valid]
    dt_xs = np.clip(points_valid[:, 0].astype(int), 0, dt.shape[1] - 1)
    dt_ys = np.clip(points_valid[:, 1].astype(int), 0, dt.shape[0] - 1)
    dt_vals = dt[dt_ys, dt_xs]

    max_geo_mm = float(np.max(geo_mm))
    if max_geo_mm <= 0:
        return None
    n_bins = max(20, min(150, int(round(max_geo_mm / bin_mm))))
    edges = np.linspace(0.0, max_geo_mm, n_bins + 1)
    bin_idx = np.clip(np.digitize(geo_mm, edges) - 1, 0, n_bins - 1)

    thickness = np.full(n_bins, np.nan)
    for i in range(n_bins):
        in_bin = bin_idx == i
        if np.count_nonzero(in_bin) >= 5:
            thickness[i] = float(np.max(dt_vals[in_bin])) * 2.0

    if np.count_nonzero(~np.isnan(thickness)) < 12:
        return None

    bin_centers = (edges[:-1] + edges[1:]) / 2
    return bin_centers, thickness


def _find_heel_peak(thickness_mm: np.ndarray, start_bin: int, bin_mm: float, forefoot_max_mm: float) -> int:
    """
    The heel is the LAST local thickness maximum, found by position (not
    by peak height - the ball of the foot is often thicker than the
    heel), that is followed by a sustained decline AND is no more than
    HEEL_MAX_VS_FOREFOOT_RATIO times `forefoot_max_mm` thick.

    The forefoot-relative ceiling exists because a calf is reliably
    wider than the foot itself: without it, a leg that widens past the
    heel before eventually tapering toward the photo frame (confirmed on
    a real photo) produces a candidate peak even taller than the ball,
    which the decline check alone can't distinguish from a genuine heel -
    both are "a peak followed by a decline." A calf bump failing this
    ceiling is skipped in favor of an earlier, shorter candidate.

    The decline requirement exists so an incidental fluctuation
    (segmentation-edge noise) can't be mistaken for the heel - a real
    heel apex is always followed by either an ankle pinch or a long taper
    toward wherever the photo frame ends.

    Falls back to the last bin (the data simply ends, no leg attached) if
    no peak satisfies both requirements.
    """
    n = len(thickness_mm)
    ceiling = forefoot_max_mm * HEEL_MAX_VS_FOREFOOT_RATIO
    candidates = []
    for i in range(start_bin, n - 1):
        if np.isnan(thickness_mm[i]) or thickness_mm[i] <= 0 or thickness_mm[i] > ceiling:
            continue
        left = thickness_mm[i - 1] if i > 0 else np.nan
        right = thickness_mm[i + 1]
        if thickness_mm[i] >= np.nan_to_num(left, nan=-np.inf) and thickness_mm[i] >= np.nan_to_num(right, nan=-np.inf):
            candidates.append(i)

    for peak_idx in reversed(candidates):
        tail = thickness_mm[peak_idx + 1:]
        tail_valid = tail[~np.isnan(tail)]
        if len(tail_valid) * bin_mm < ANKLE_MIN_DECLINE_MM:
            continue
        if tail_valid[-1] > thickness_mm[peak_idx] * (1 - ANKLE_MIN_DECLINE_FRAC):
            continue
        return peak_idx

    return n - 1


def _find_ankle_after_heel(thickness_mm: np.ndarray, heel_idx: int) -> Optional[int]:
    """
    First bin strictly past the heel that is a genuine INTERIOR local
    minimum - strictly thinner than both neighbors, with the profile
    recovering (rising again) afterward - and at least
    ANKLE_STABLE_MIN_RATIO thinner than the heel. Stops at the FIRST
    qualifying bin (nearest the heel), since the ankle is the narrowest
    point immediately above the heel, not whichever later dip happens to
    be narrowest.

    Deliberately requires a real rise afterward (excludes the profile's
    own trailing edge): a leg that simply tapers continuously to wherever
    the photo frame ends never recovers, so without this check the last
    bin of ANY declining profile would trivially look like a "minimum"
    even though there's no actual pinch - that case is a continuous
    taper, not an ankle, and is handled by the caller's fallback instead.
    """
    n = len(thickness_mm)
    heel_thickness = thickness_mm[heel_idx]
    if np.isnan(heel_thickness) or heel_thickness <= 0:
        return None
    for i in range(heel_idx + 1, n - 1):
        if np.isnan(thickness_mm[i]) or thickness_mm[i] <= 0:
            continue
        prev_val, next_val = thickness_mm[i - 1], thickness_mm[i + 1]
        if np.isnan(prev_val) or np.isnan(next_val):
            continue
        is_local_min = prev_val > thickness_mm[i] and next_val > thickness_mm[i]
        if is_local_min and heel_thickness / thickness_mm[i] > ANKLE_STABLE_MIN_RATIO:
            return i
    return None


def _detect_ankle(
    mask: np.ndarray, dt: np.ndarray, points: np.ndarray, toe_point: np.ndarray, px_per_mm: float,
) -> Optional[_AnkleResult]:
    """
    STEP 5: locate the ankle in a single deterministic pass - build one
    thickness profile ordered by geodesic distance from the toe, then read
    the heel and ankle positions off it directly. No retrying with a
    different axis, no repeated trimming.

    Returns None if there isn't enough data to build a profile at all
    (caller should treat the mask as already just the bare foot).
    """
    distance_map, crop_origin = _geodesic_distance_map(mask, toe_point)
    profile = _thickness_vs_geodesic_profile(dt, points, distance_map, crop_origin, px_per_mm)
    if profile is None:
        return None
    bin_centers_mm, thickness_mm = profile

    start_bin = int(np.searchsorted(bin_centers_mm, ANKLE_MIN_FOOT_LENGTH_MM))
    forefoot = thickness_mm[:start_bin]
    forefoot_valid = forefoot[~np.isnan(forefoot)]
    forefoot_max_mm = float(np.max(forefoot_valid)) if len(forefoot_valid) else float(np.nanmax(thickness_mm))

    heel_idx = _find_heel_peak(thickness_mm, start_bin, ANKLE_BIN_MM, forefoot_max_mm)
    ankle_idx = _find_ankle_after_heel(thickness_mm, heel_idx)

    heel_distance_mm = float(bin_centers_mm[heel_idx])

    if ankle_idx is not None:
        cut_distance_mm = float(bin_centers_mm[ankle_idx] + ANKLE_HEEL_MARGIN_MM)
    elif heel_idx < len(thickness_mm) - 1:
        # `_find_heel_peak` only returns an interior index when there's a
        # sustained decline after it (see its docstring). No clean
        # pinch-then-rise was found, so whatever is declining past the
        # heel peak is leg material tapering toward the frame edge, not
        # foot - cut right past the heel itself rather than leaving it in.
        cut_distance_mm = float(heel_distance_mm + ANKLE_HEEL_MARGIN_MM)
    else:
        cut_distance_mm = None  # heel is the last bin - no leg attached

    return _AnkleResult(
        ankle_found=cut_distance_mm is not None,
        heel_distance_mm=heel_distance_mm,
        cut_distance_mm=cut_distance_mm,
        profile_distance_mm=bin_centers_mm,
        profile_thickness_mm=thickness_mm,
        distance_map=distance_map,
        crop_origin=crop_origin,
    )


def _apply_ankle_cut(mask: np.ndarray, ankle: _AnkleResult, px_per_mm: float) -> np.ndarray:
    """STEP 6: keep only pixels within the detected ankle distance of the
    toe (geodesically) - removes the leg, never the heel or toes, which
    are always nearer to the toe than any attached leg material."""
    if ankle.cut_distance_mm is None:
        return mask
    h, w = mask.shape
    x0, y0 = ankle.crop_origin
    crop_h, crop_w = ankle.distance_map.shape
    within = (ankle.distance_map >= 0) & (ankle.distance_map <= ankle.cut_distance_mm * px_per_mm)
    keep = np.zeros((h, w), dtype=np.uint8)
    keep[y0:y0 + crop_h, x0:x0 + crop_w] = within.astype(np.uint8) * 255
    return cv2.bitwise_and((mask > 0).astype(np.uint8) * 255, keep)


# ----------------------------------------------------------------------
# STEP 9 (length is computed inline in `_run_pipeline`) /
# STEP 9b: width at the ball of the foot
# ----------------------------------------------------------------------

def _thickness_vs_axis_profile(
    dt: np.ndarray, points: np.ndarray, projections: np.ndarray,
    min_proj: float, max_proj: float, px_per_mm: float, bin_mm: float = BALL_BIN_MM,
) -> Optional[Tuple[np.ndarray, np.ndarray]]:
    """Local thickness binned by straight-line PCA projection - safe to
    use for the ball-of-foot search because by this point the leg has
    already been removed (STEP 6), so the remaining span is short enough
    that axis skew is no longer a concern.

    Returns (thickness, bin_edges) or None if there isn't enough data.
    """
    span = max_proj - min_proj
    if span <= 0:
        return None
    bin_px = max(1.0, bin_mm * px_per_mm)
    n_bins = max(20, min(150, int(round(span / bin_px))))
    edges = np.linspace(min_proj, max_proj, n_bins + 1)
    xs = np.clip(points[:, 0].astype(int), 0, dt.shape[1] - 1)
    ys = np.clip(points[:, 1].astype(int), 0, dt.shape[0] - 1)
    dt_vals = dt[ys, xs]

    thickness = np.full(n_bins, np.nan)
    for i in range(n_bins):
        in_bin = (projections >= edges[i]) & (projections < edges[i + 1])
        if np.count_nonzero(in_bin) >= 5:
            thickness[i] = float(np.max(dt_vals[in_bin])) * 2.0

    if np.count_nonzero(~np.isnan(thickness)) < 12:
        return None
    return thickness, edges


def _find_ball(
    dt: np.ndarray, points: np.ndarray, projections: np.ndarray,
    min_proj: float, max_proj: float, px_per_mm: float,
    toe_proj: float, heel_proj: float,
) -> Optional[_WidthResult]:
    """
    STEP 9b: the ball of the foot - the standard shoe-sizing reference for
    "foot width" - as the bin of maximum local thickness within the
    forefoot (closer to the toe than BALL_FOREFOOT_FRAC of the way to the
    heel). Restricting to the forefoot avoids the heel, which can be
    nearly as thick as the ball on some feet.

    Width comes directly from the distance transform at the ball's own
    location, not a perpendicular-projection slice span - a slice spans a
    nonzero range of axis positions and combines every point in that
    range into one min/max, which a slightly misaligned axis inflates;
    the distance transform value at a single location does not.
    """
    profile = _thickness_vs_axis_profile(dt, points, projections, min_proj, max_proj, px_per_mm)
    if profile is None:
        return None
    thickness, edges = profile
    bin_centers = (edges[:-1] + edges[1:]) / 2

    forefoot_limit = toe_proj + (heel_proj - toe_proj) * BALL_FOREFOOT_FRAC
    in_forefoot = bin_centers <= forefoot_limit if toe_proj <= heel_proj else bin_centers >= forefoot_limit

    candidates = np.where(in_forefoot, thickness, np.nan)
    if np.count_nonzero(~np.isnan(candidates)) == 0:
        return None
    best_bin = int(np.nanargmax(candidates))
    thickness_px = float(thickness[best_bin])

    in_bin = (projections >= edges[best_bin]) & (projections < edges[best_bin + 1])
    bin_points = points[in_bin]
    xs = np.clip(bin_points[:, 0].astype(int), 0, dt.shape[1] - 1)
    ys = np.clip(bin_points[:, 1].astype(int), 0, dt.shape[0] - 1)
    ball_pixel = bin_points[int(np.argmax(dt[ys, xs]))]

    return _WidthResult(width_px=thickness_px, ball_pixel=ball_pixel)


# ----------------------------------------------------------------------
# STEP 10: validation
# ----------------------------------------------------------------------

def _classify(length_mm: float, width_mm: float) -> Tuple[str, List[str]]:
    """
    Three-tier validation: GOOD measurements pass silently. WARNING
    measurements are still returned, just with lower confidence, rather
    than rejected for being close to a threshold. FAIL is reserved for
    measurements that cannot be a real foot at all.
    """
    if (
        length_mm < LENGTH_FAIL_MIN_MM or length_mm > LENGTH_FAIL_MAX_MM
        or width_mm < WIDTH_FAIL_MIN_MM or width_mm > WIDTH_FAIL_MAX_MM
    ):
        return "fail", [f"Length {length_mm:.0f}mm / width {width_mm:.0f}mm is not a plausible foot."]

    ratio = length_mm / width_mm if width_mm > 0 else 0.0
    messages = []
    if not (LENGTH_GOOD_MIN_MM <= length_mm <= LENGTH_GOOD_MAX_MM):
        messages.append(f"Unusual foot length: {length_mm:.1f}mm")
    if not (WIDTH_GOOD_MIN_MM <= width_mm <= WIDTH_GOOD_MAX_MM):
        messages.append(f"Unusual foot width: {width_mm:.1f}mm")
    if not (RATIO_GOOD_MIN <= ratio <= RATIO_GOOD_MAX):
        messages.append(f"Unusual length/width ratio: {ratio:.2f}")

    return ("warning" if messages else "good"), messages


def _compute_confidence(n_points: int, length_px: float, vote_confidence: float, mask_shape: Tuple[int, int]) -> float:
    """Blend of how much data went into the measurement, how reasonable
    its scale is relative to the image, and how decisively the toe/heel
    vote was won."""
    h, w = mask_shape
    diag = float(np.hypot(h, w))
    confidence = 0.5 + 0.5 * vote_confidence
    if n_points < 1000:
        confidence *= 0.8
    if length_px < diag * 0.1:
        confidence *= 0.8
    return confidence


# ----------------------------------------------------------------------
# Drawing primitives (shared by production + debug-dump rendering)
# ----------------------------------------------------------------------

def _overlay_mask(image: np.ndarray, mask: Optional[np.ndarray], color: Tuple[int, int, int], alpha: float = 0.4) -> np.ndarray:
    if mask is None:
        return image.copy()
    color_layer = np.zeros_like(image)
    color_layer[mask > 0] = color
    return cv2.addWeighted(image, 1 - alpha, color_layer, alpha, 0)


def _draw_point(image: np.ndarray, point: np.ndarray, color: Tuple[int, int, int], label: Optional[str] = None) -> None:
    p = tuple(np.array(point).astype(int))
    cv2.circle(image, p, 8, color, -1)
    if label:
        cv2.putText(image, label, (p[0] + 10, p[1]), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)


def _draw_line(image: np.ndarray, p1: np.ndarray, p2: np.ndarray, color: Tuple[int, int, int], thickness: int = 2) -> None:
    cv2.line(image, tuple(np.array(p1).astype(int)), tuple(np.array(p2).astype(int)), color, thickness)


def _draw_text_block(image: np.ndarray, lines: List[str], origin: Tuple[int, int] = (10, 30), line_height: int = 28, color: Tuple[int, int, int] = (255, 255, 255)) -> None:
    y = origin[1]
    for line in lines:
        cv2.putText(image, line, (origin[0], y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        y += line_height


def _render_profile_plot(
    distance_mm: np.ndarray, thickness_mm: np.ndarray, markers: Dict[str, Tuple[Optional[float], Tuple[int, int, int]]],
    width: int = 800, height: int = 300,
) -> np.ndarray:
    """Minimal hand-rolled line plot (no plotting library dependency) for
    the 07_thickness_profile.png debug image."""
    canvas = np.full((height, width, 3), 255, dtype=np.uint8)
    valid = ~np.isnan(thickness_mm)
    if np.count_nonzero(valid) < 2:
        return canvas
    xs, ys = distance_mm[valid], thickness_mm[valid]
    x_min, x_max = float(xs.min()), float(xs.max())
    y_max = float(ys.max()) * 1.15 if ys.max() > 0 else 1.0
    margin = 40

    def to_canvas(x: float, y: float) -> Tuple[int, int]:
        px = margin + (x - x_min) / max(1e-6, x_max - x_min) * (width - 2 * margin)
        py = height - margin - y / max(1e-6, y_max) * (height - 2 * margin)
        return int(px), int(py)

    pts = np.array([to_canvas(x, y) for x, y in zip(xs, ys)], dtype=np.int32)
    cv2.polylines(canvas, [pts], False, (200, 100, 0), 2)
    cv2.line(canvas, (margin, height - margin), (width - margin, height - margin), (0, 0, 0), 1)
    cv2.line(canvas, (margin, margin), (margin, height - margin), (0, 0, 0), 1)

    for label, (x, color) in markers.items():
        if x is None:
            continue
        px, _ = to_canvas(x, 0)
        cv2.line(canvas, (px, margin), (px, height - margin), color, 1)
        cv2.putText(canvas, label, (px + 4, margin + 14), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)

    cv2.putText(canvas, "thickness (mm) vs geodesic distance from toe (mm)", (margin, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
    return canvas


# ----------------------------------------------------------------------
# Debug dump (10-stage image set)
# ----------------------------------------------------------------------

def _write_debug_dump(directory: Path, mask: np.ndarray, trace: _PipelineTrace) -> None:
    """
    Write the full ten-stage debug dump to `directory`, from whatever the
    pipeline computed before it stopped - every field on `trace` is
    None-checked, so a measurement that failed partway through still
    produces images for every stage it reached. This is the primary tool
    for diagnosing why a given photo failed or measured incorrectly.
    """
    directory.mkdir(parents=True, exist_ok=True)
    base = trace.image if trace.image is not None else cv2.cvtColor((mask > 0).astype(np.uint8) * 255, cv2.COLOR_GRAY2BGR)
    cv2.imwrite(str(directory / "01_rectified.png"), base)

    if trace.cleaned_mask is None:
        return
    cv2.imwrite(str(directory / "02_mask.png"), _overlay_mask(base, trace.cleaned_mask, (0, 255, 0)))

    _dump_hull(directory, base, trace)
    _dump_pca(directory, base, trace)
    _dump_toe_heel(directory, base, trace)
    _dump_ankle(directory, base, trace)

    if trace.final_mask is not None:
        cv2.imwrite(str(directory / "09_final_mask.png"), _overlay_mask(base, trace.final_mask, (0, 255, 0)))

    _dump_measurement(directory, base, trace)


def _dump_hull(directory: Path, base: np.ndarray, trace: _PipelineTrace) -> None:
    if trace.hull is None:
        return
    img = _overlay_mask(base, trace.cleaned_mask, (0, 255, 0), 0.25)
    cv2.polylines(img, [trace.hull.astype(np.int32)], True, (255, 0, 255), 2)
    cv2.imwrite(str(directory / "03_convex_hull.png"), img)


def _dump_pca(directory: Path, base: np.ndarray, trace: _PipelineTrace) -> None:
    if trace.initial_pca is None:
        return
    img = _overlay_mask(base, trace.cleaned_mask, (0, 255, 0), 0.25)
    half = trace.initial_length_px / 2
    pca = trace.initial_pca
    _draw_line(img, pca.center - pca.axis * half, pca.center + pca.axis * half, (255, 0, 0))
    cv2.imwrite(str(directory / "04_pca.png"), img)


def _dump_toe_heel(directory: Path, base: np.ndarray, trace: _PipelineTrace) -> None:
    if trace.toe_point is None:
        return
    img = _overlay_mask(base, trace.cleaned_mask, (0, 255, 0), 0.25)
    _draw_point(img, trace.toe_point, (0, 255, 255), "Toe (initial)")
    if trace.toe_heel_vote is not None:
        _draw_text_block(img, [f"toe/heel vote confidence={trace.toe_heel_vote.confidence:.2f}"])
    cv2.imwrite(str(directory / "05_toe_heel.png"), img)


def _dump_ankle(directory: Path, base: np.ndarray, trace: _PipelineTrace) -> None:
    """Writes 06_medial_axis (geodesic-distance heatmap), 07_thickness_profile
    (the line plot ankle detection is read off of), and 08_ankle (original
    vs. trimmed mask, so exactly what got cut is visible)."""
    ankle = trace.ankle
    if ankle is None:
        return

    img = _overlay_mask(base, trace.cleaned_mask, (0, 255, 0), 0.25)
    dm = ankle.distance_map
    valid = dm >= 0
    heat = np.zeros(dm.shape, dtype=np.uint8)
    if np.any(valid):
        heat[valid] = np.clip(dm[valid] * 255 / max(1, int(dm.max())), 0, 255).astype(np.uint8)
    heat_color = cv2.applyColorMap(heat, cv2.COLORMAP_JET)
    x0, y0 = ankle.crop_origin
    ch, cw = dm.shape
    region = img[y0:y0 + ch, x0:x0 + cw]
    mask_region = trace.cleaned_mask[y0:y0 + ch, x0:x0 + cw] > 0
    blended = cv2.addWeighted(region, 0.4, heat_color, 0.6, 0)
    region[mask_region] = blended[mask_region]
    cv2.imwrite(str(directory / "06_medial_axis.png"), img)

    markers: Dict[str, Tuple[Optional[float], Tuple[int, int, int]]] = {"heel": (ankle.heel_distance_mm, (255, 0, 255))}
    if ankle.cut_distance_mm is not None:
        markers["ankle cut"] = (ankle.cut_distance_mm, (0, 0, 255))
    plot = _render_profile_plot(ankle.profile_distance_mm, ankle.profile_thickness_mm, markers)
    cv2.imwrite(str(directory / "07_thickness_profile.png"), plot)

    img2 = _overlay_mask(base, trace.cleaned_mask, (0, 255, 255), 0.25)
    if trace.final_mask is not None:
        img2 = _overlay_mask(img2, trace.final_mask, (0, 255, 0), 0.4)
    _draw_text_block(img2, [
        f"heel ~{ankle.heel_distance_mm:.0f}mm from toe",
        f"ankle cut: {'%.0fmm' % ankle.cut_distance_mm if ankle.cut_distance_mm is not None else 'none found'}",
    ])
    cv2.imwrite(str(directory / "08_ankle.png"), img2)


def _dump_measurement(directory: Path, base: np.ndarray, trace: _PipelineTrace) -> None:
    result = trace.result
    if result is None or not result.success:
        img = _overlay_mask(base, trace.cleaned_mask, (255, 0, 0), 0.3)
        _draw_text_block(img, [f"FAILED: {trace.fail_reason}"], color=(0, 0, 255))
        cv2.imwrite(str(directory / "10_measurement.png"), img)
        return

    img = _overlay_mask(base, trace.final_mask, (0, 255, 0), 0.3)
    if result.center is not None and result.axis is not None:
        center, axis = np.array(result.center), np.array(result.axis)
        half = result.length_px / 2
        _draw_line(img, center - axis * half, center + axis * half, (255, 0, 0))
    if result.toe_point is not None:
        _draw_point(img, np.array(result.toe_point), (0, 255, 255), "Toe")
    if result.heel_point is not None:
        _draw_point(img, np.array(result.heel_point), (255, 0, 255), "Heel")
    if trace.width is not None and trace.final_pca is not None:
        half_width_px = result.width_px / 2
        p1 = trace.width.ball_pixel - trace.final_pca.perp_axis * half_width_px
        p2 = trace.width.ball_pixel + trace.final_pca.perp_axis * half_width_px
        _draw_line(img, p1, p2, (0, 140, 255))
        _draw_point(img, p1, (0, 140, 255))
        _draw_point(img, p2, (0, 140, 255))
    if trace.final_mask is not None:
        contour = get_largest_contour(find_contours(trace.final_mask))
        if contour is not None:
            x, y, bw, bh = cv2.boundingRect(contour)
            cv2.rectangle(img, (x, y), (x + bw, y + bh), (128, 128, 128), 1)
    _draw_text_block(img, [
        f"Length: {result.length_mm:.0f}mm  Width: {result.width_mm:.0f}mm",
        f"Confidence: {result.confidence:.2f}",
        f"Classification: {trace.classification}",
    ])
    cv2.imwrite(str(directory / "10_measurement.png"), img)
