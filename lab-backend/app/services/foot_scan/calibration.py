# app/services/foot_scan/calibration.py
"""A4 paper detection for calibration."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Literal, Optional, Tuple

import cv2
import numpy as np

from core.foot.image_ops import (
    to_grayscale,
    gaussian_blur,
    sobel_edges,
    canny_edges,
    threshold_binary,
    find_contours,
    approximate_polygon,
    order_quad_corners,
    polygon_area,
    distance,
    quad_corner_angles,
    compute_adaptive_threshold,
    dilate,
)
from core.foot.homography import estimate_px_per_mm


# A4 aspect ratio: 297/210 = 1.414
A4_ASPECT_RATIO = 297.0 / 210.0
A4_ASPECT_TOLERANCE = 0.22  # +/-22% tolerance - loosened from 0.15 so paper
# photographed at a moderate angle (foreshortening the apparent aspect ratio)
# isn't rejected outright; perspective skew is already penalized separately
# in _validate_and_refine rather than hard-rejected here.


@dataclass
class A4DetectionResult:
    """Result of A4 paper detection."""
    detected: bool
    corners: Optional[np.ndarray] = None  # 4x2 array if detected
    orientation: Optional[Literal["portrait", "landscape"]] = None
    area: float = 0.0
    px_per_mm: float = 0.0
    confidence: float = 0.0
    warnings: List[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


def detect_a4_paper(
    image: np.ndarray,
    min_area_ratio: float = 0.01,
    debug: bool = False,
) -> Tuple[A4DetectionResult, Optional[np.ndarray]]:
    """
    Detect A4 paper in image for calibration.

    Uses two-stage detection:
    1. Sobel edge detection with adaptive threshold
    2. Fallback to brightness thresholding

    Args:
        image: Input BGR image
        min_area_ratio: Minimum quad area as fraction of image area
        debug: If True, return debug visualization

    Returns:
        Tuple of (A4DetectionResult, debug_image or None)
    """
    h, w = image.shape[:2]
    image_area = h * w

    # Convert to grayscale
    gray = to_grayscale(image)

    # Try stage 1: Edge-based detection
    result, debug_img = _detect_via_edges(gray, image_area, min_area_ratio, debug)

    if result.detected:
        result = _validate_and_refine(result, gray, image_area)
        if debug:
            debug_img = _draw_debug(image, result)
        return result, debug_img

    # Try stage 2: Brightness-based detection
    result, debug_img = _detect_via_brightness(gray, image_area, min_area_ratio, debug)

    if result.detected:
        result = _validate_and_refine(result, gray, image_area)
        if debug:
            debug_img = _draw_debug(image, result)
        return result, debug_img

    # Try stage 3: Canny-edge-based detection. More robust than the Sobel +
    # adaptive-threshold pass above against busy/textured floor backgrounds
    # (e.g. a patterned carpet) where the floor's own texture produces gradient
    # noise that competes with the paper's edge - Canny's hysteresis + dilation
    # closes small gaps in the paper outline without also picking up as much
    # of the surrounding texture.
    result, debug_img = _detect_via_canny(gray, image_area, min_area_ratio, debug)

    if result.detected:
        result = _validate_and_refine(result, gray, image_area)
        if debug:
            debug_img = _draw_debug(image, result)
        return result, debug_img

    # Detection failed
    return A4DetectionResult(
        detected=False,
        confidence=0.0,
        warnings=["Could not detect A4 paper"]
    ), None


def _detect_via_edges(
    gray: np.ndarray,
    image_area: float,
    min_area_ratio: float,
    debug: bool,
) -> Tuple[A4DetectionResult, Optional[np.ndarray]]:
    """Stage 1: Detect A4 using Sobel edge detection."""
    # Blur to reduce noise
    blurred = gaussian_blur(gray, 5)

    # Compute adaptive threshold
    threshold = compute_adaptive_threshold(blurred.flatten())

    # Get Sobel edges
    edges, _ = sobel_edges(blurred, threshold=threshold)

    # Find contours
    contours = find_contours(edges)

    return _find_a4_quad(
        contours, image_area, min_area_ratio, debug, edges if debug else None
    )


def _detect_via_brightness(
    gray: np.ndarray,
    image_area: float,
    min_area_ratio: float,
    debug: bool,
) -> Tuple[A4DetectionResult, Optional[np.ndarray]]:
    """Stage 2: Detect A4 via brightness thresholding (white paper)."""
    # Compute brightness threshold
    mean_val = np.mean(gray)
    threshold = min(220, mean_val + 20)

    # Threshold for bright (white) regions
    binary = threshold_binary(gray, threshold, invert=False)

    # Find contours
    contours = find_contours(binary)

    return _find_a4_quad(
        contours, image_area, min_area_ratio, debug, binary if debug else None
    )


def _detect_via_canny(
    gray: np.ndarray,
    image_area: float,
    min_area_ratio: float,
    debug: bool,
) -> Tuple[A4DetectionResult, Optional[np.ndarray]]:
    """Stage 3: Detect A4 using Canny edges.

    More robust than Sobel + a single adaptive threshold against busy/
    textured floor backgrounds (e.g. a patterned carpet), where floor
    texture produces gradient noise that can rival the paper's own edge
    strength. Canny's hysteresis thresholding suppresses weak/disconnected
    texture edges better, and a light dilation closes small gaps in the
    paper's outline (e.g. where the foot overlaps it) so it forms one
    closed contour instead of several broken ones.
    """
    blurred = gaussian_blur(gray, 5)
    edges = canny_edges(blurred, low_threshold=40, high_threshold=120)
    closed = dilate(edges, kernel_size=3, iterations=2)

    contours = find_contours(closed)

    return _find_a4_quad(
        contours, image_area, min_area_ratio, debug, closed if debug else None
    )


def _quad_from_contour(contour: np.ndarray) -> Optional[np.ndarray]:
    """
    Reduce a contour to a 4-point quadrilateral.

    Tries progressively coarser Douglas-Peucker tolerances instead of a
    single fixed epsilon: real paper edges are often slightly wrinkled,
    shadowed, or have a corner clipped by the photo frame, which can make
    one epsilon yield 5+ points (noise) or 3 (a corner merged away) even
    though the underlying shape is still clearly a quad. If no epsilon
    gives exactly 4 points, fall back to the minimum-area bounding
    rectangle of the contour's convex hull, accepted only if the contour
    is close enough in shape to that rectangle (most of a true paper quad's
    area should already be inside its own bounding rect).
    """
    for epsilon_factor in (0.01, 0.02, 0.03, 0.05, 0.08):
        approx = approximate_polygon(contour, epsilon_factor=epsilon_factor)
        if len(approx) == 4:
            return approx.reshape(4, 2).astype(np.float32)

    hull = cv2.convexHull(contour)
    hull_area = cv2.contourArea(hull)
    if hull_area <= 0:
        return None

    rect = cv2.minAreaRect(hull)
    rect_w, rect_h = rect[1]
    rect_area = rect_w * rect_h
    if rect_area <= 0:
        return None

    rectangularity = hull_area / rect_area
    if rectangularity < 0.80:
        return None

    return cv2.boxPoints(rect).astype(np.float32)


def _find_a4_quad(
    contours: List[np.ndarray],
    image_area: float,
    min_area_ratio: float,
    debug: bool,
    debug_base: Optional[np.ndarray],
) -> Tuple[A4DetectionResult, Optional[np.ndarray]]:
    """Find the best quadrilateral that could be A4 paper."""
    if not contours:
        return A4DetectionResult(detected=False), None

    # Sort by area descending
    contours = sorted(contours, key=cv2.contourArea, reverse=True)

    best_result = None
    best_score = 0.0

    for contour in contours[:10]:  # Check top 10 largest
        area = cv2.contourArea(contour)

        # Skip too small
        if area < image_area * min_area_ratio:
            continue

        quad = _quad_from_contour(contour)
        if quad is None:
            continue

        corners = order_quad_corners(quad)

        # Check aspect ratio
        orientation, aspect_score = _check_aspect_ratio(corners)
        if orientation is None:
            continue

        # Calculate score
        score = aspect_score * (area / image_area)

        if score > best_score:
            best_score = score
            px_per_mm = estimate_px_per_mm(corners, orientation)

            best_result = A4DetectionResult(
                detected=True,
                corners=corners,
                orientation=orientation,
                area=area,
                px_per_mm=px_per_mm,
                confidence=min(1.0, aspect_score),
            )

    if best_result is None:
        return A4DetectionResult(detected=False), None

    debug_img = None
    if debug and debug_base is not None:
        debug_img = cv2.cvtColor(debug_base, cv2.COLOR_GRAY2BGR)

    return best_result, debug_img


def _check_aspect_ratio(corners: np.ndarray) -> Tuple[Optional[str], float]:
    """
    Check if quadrilateral has A4 aspect ratio.

    Returns:
        Tuple of (orientation or None, aspect_score)
    """
    # Calculate edge lengths
    width_top = distance(corners[0], corners[1])
    width_bottom = distance(corners[3], corners[2])
    height_left = distance(corners[0], corners[3])
    height_right = distance(corners[1], corners[2])

    avg_width = (width_top + width_bottom) / 2
    avg_height = (height_left + height_right) / 2

    if avg_width < 1 or avg_height < 1:
        return None, 0.0

    # Calculate aspect ratio
    if avg_width >= avg_height:
        # Landscape: width > height
        aspect = avg_width / avg_height
        target = A4_ASPECT_RATIO
        orientation = "landscape"
    else:
        # Portrait: height > width
        aspect = avg_height / avg_width
        target = A4_ASPECT_RATIO
        orientation = "portrait"

    # Check if within tolerance
    deviation = abs(aspect - target) / target

    if deviation > A4_ASPECT_TOLERANCE:
        return None, 0.0

    # Score based on how close to ideal
    score = 1.0 - (deviation / A4_ASPECT_TOLERANCE)
    return orientation, score


def _validate_and_refine(
    result: A4DetectionResult,
    gray: np.ndarray,
    image_area: float,
) -> A4DetectionResult:
    """Validate detection and add warnings."""
    warnings = []

    # Check area ratio
    area_ratio = result.area / image_area

    if area_ratio < 0.12:
        warnings.append("A4 paper appears too small in frame")
        result.confidence *= 0.75

    if area_ratio > 0.85:
        warnings.append("A4 paper too close to camera")
        result.confidence *= 0.9

    # Check corner angles (should be close to 90°)
    if result.corners is not None:
        angles = quad_corner_angles(result.corners)
        avg_deviation = np.mean([abs(a - 90) for a in angles])

        if avg_deviation > 12:
            warnings.append("Paper appears skewed")
            result.confidence *= max(0.5, 1.0 - avg_deviation / 45)

    # Check edge parallelism
    if result.corners is not None:
        corners = result.corners
        width_top = distance(corners[0], corners[1])
        width_bottom = distance(corners[3], corners[2])
        height_left = distance(corners[0], corners[3])
        height_right = distance(corners[1], corners[2])

        width_ratio = max(width_top, width_bottom) / max(1, min(width_top, width_bottom))
        height_ratio = max(height_left, height_right) / max(1, min(height_left, height_right))

        if width_ratio > 1.25 or height_ratio > 1.25:
            warnings.append("Camera angle too steep")
            result.confidence *= 0.85

    result.warnings = warnings
    result.confidence = max(0.0, min(1.0, result.confidence))

    return result


def _draw_debug(image: np.ndarray, result: A4DetectionResult) -> np.ndarray:
    """Draw debug visualization."""
    debug_img = image.copy()

    if result.corners is not None:
        corners = result.corners.astype(np.int32)

        # Draw quadrilateral
        cv2.polylines(debug_img, [corners], True, (0, 255, 0), 2)

        # Draw corners with labels
        labels = ["TL", "TR", "BR", "BL"]
        for i, (corner, label) in enumerate(zip(corners, labels)):
            cv2.circle(debug_img, tuple(corner), 8, (0, 0, 255), -1)
            cv2.putText(
                debug_img, label,
                (corner[0] + 10, corner[1] - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
            )

        # Add info text
        info = f"Conf: {result.confidence:.2f} | {result.orientation} | {result.px_per_mm:.2f} px/mm"
        cv2.putText(
            debug_img, info,
            (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2
        )

        # Add warnings
        for i, warning in enumerate(result.warnings):
            cv2.putText(
                debug_img, warning,
                (10, 60 + i * 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1
            )

    return debug_img
