# app/services/foot_scan/segmentation.py
"""Foot segmentation from rectified image."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple

import cv2
import numpy as np

from core.foot.image_ops import (
    to_grayscale,
    threshold_binary,
    adaptive_threshold,
    morphological_close,
    morphological_open,
    fill_holes,
    keep_largest_blob,
    find_contours,
    get_largest_contour,
)


@dataclass
class SegmentationResult:
    """Result of foot segmentation."""
    success: bool
    mask: Optional[np.ndarray] = None  # Binary mask (H, W)
    contour: Optional[np.ndarray] = None  # Foot contour
    area: float = 0.0  # Foot area in pixels
    confidence: float = 0.0
    touches_edge: bool = False
    warnings: List[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []


def segment_foot(
    image: np.ndarray,
    paper_rect: Optional[Tuple[int, int, int, int]] = None,
    valid_mask: Optional[np.ndarray] = None,
    min_foot_ratio: float = 0.01,
    max_foot_ratio: float = 0.6,
) -> SegmentationResult:
    """
    Segment foot from a rectified image where the foot rests on the floor
    beside the A4 paper (not on top of it).

    The approach:
    1. Build a candidate region = anywhere that's real photo content
       (valid_mask) and NOT the paper interior (paper_rect) - the foot can
       only be in the floor area around the paper.
    2. Detect skin-tone color within that region. Color is the primary,
       trusted signal because a textured/cracked floor can have local
       brightness contrast that fools brightness thresholding into picking
       up floor texture instead of the foot. Brightness thresholding is
       only used as a fallback when color detection finds nothing usable
       (e.g. unusual lighting), not unioned in unconditionally.
    3. Clean up with morphological operations.
    4. Keep largest connected component.

    Args:
        image: Input BGR image (rectified, with floor margin around the paper)
        paper_rect: (x0, y0, x1, y1) of the paper's own interior in `image`,
            excluded from candidates since the foot is never on the paper
        valid_mask: Binary mask of real photo content vs. synthetic
            black border-fill outside the original photo's bounds
        min_foot_ratio: Minimum foot area as fraction of image
        max_foot_ratio: Maximum foot area as fraction of image

    Returns:
        SegmentationResult with binary mask
    """
    h, w = image.shape[:2]
    image_area = h * w

    # Restrict to the floor area: not the paper interior, not synthetic
    # border-fill beyond the original photo's bounds.
    candidate_mask = np.full((h, w), 255, dtype=np.uint8)
    if paper_rect is not None:
        paper_mask = create_paper_mask((h, w), _rect_to_corners(paper_rect))
        candidate_mask = cv2.bitwise_and(candidate_mask, cv2.bitwise_not(paper_mask))
    if valid_mask is not None:
        candidate_mask = cv2.bitwise_and(candidate_mask, valid_mask)

    color_mask = cv2.bitwise_and(_segment_by_color(image), candidate_mask)

    if np.count_nonzero(color_mask) >= image_area * min_foot_ratio:
        mask = color_mask
    else:
        gray = to_grayscale(image)
        # Otsu's threshold must be computed from the candidate region's OWN
        # pixel histogram, not the whole image's. The paper has already
        # been excluded from `candidate_mask` by this point, but computing
        # Otsu over the whole frame still includes it - its very bright
        # outlier pixels pull the automatic threshold up, so the split
        # found is "paper vs. everything else" rather than "foot vs.
        # floor". Against a plain/low-contrast floor (a "simple
        # background"), that mis-aimed threshold classifies most of the
        # floor as the foot, which is exactly what made the floor-ring
        # area get measured instead of the foot.
        brightness_mask = cv2.bitwise_and(_segment_by_brightness(gray, candidate_mask), candidate_mask)
        mask = cv2.bitwise_or(color_mask, brightness_mask)

    # Clean up mask. The photo often contains a second, incidental foot/leg
    # (e.g. the photographer's standing foot) which is frequently the larger
    # blob simply because it's closer to the camera - so we select the blob
    # nearest to the paper (the one actually placed for measurement) rather
    # than the largest one.
    mask = clean_foot_mask(mask, paper_rect=paper_rect)

    # Validate result
    result = _validate_segmentation(mask, h, w, min_foot_ratio, max_foot_ratio, paper_rect=paper_rect)

    return result


def _rect_to_corners(rect: Tuple[int, int, int, int]) -> np.ndarray:
    """Convert an axis-aligned (x0, y0, x1, y1) rect to 4 corner points."""
    x0, y0, x1, y1 = rect
    return np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dtype=np.float32)


def _distance_to_rect(points: np.ndarray, rect: Tuple[int, int, int, int]) -> float:
    """Minimum Euclidean distance from any point to an axis-aligned rect (0 if inside/touching)."""
    x0, y0, x1, y1 = rect
    dx = np.maximum(np.maximum(x0 - points[:, 0], points[:, 0] - x1), 0)
    dy = np.maximum(np.maximum(y0 - points[:, 1], points[:, 1] - y1), 0)
    return float(np.sqrt(dx ** 2 + dy ** 2).min())


def _keep_blob_nearest_rect(
    mask: np.ndarray,
    rect: Tuple[int, int, int, int],
    min_area_ratio: float = 0.005,
) -> np.ndarray:
    """Keep only the connected component closest to `rect`, among components
    large enough to plausibly be a foot (filters out small noise blobs).

    Selects via `cv2.connectedComponents` (raster labeling) rather than
    `cv2.findContours` + `cv2.drawContours(..., FILLED)`. A mask coming out
    of morphological close/open can have a thin (1px) bridge or notch that
    makes the traced contour polygon self-intersecting; `cv2.contourArea`'s
    shoelace-formula area and the FILLED scan-fill both then count area
    that was never actually foreground, in one observed case inflating a
    ~100k px region into ~350k px while the bounding box stayed identical.
    Connected-component labels never go through a polygon intermediate, so
    they always reproduce exactly the original foreground pixels.
    """
    h, w = mask.shape
    num_labels, labels = cv2.connectedComponents((mask > 0).astype(np.uint8))
    if num_labels <= 1:
        return mask

    min_area = h * w * min_area_ratio
    candidates = []
    for label in range(1, num_labels):
        ys, xs = np.nonzero(labels == label)
        area = len(xs)
        distance = _distance_to_rect(np.column_stack([xs, ys]), rect)
        candidates.append((label, area, distance))

    eligible = [c for c in candidates if c[1] >= min_area] or candidates
    best_label = min(eligible, key=lambda c: c[2])[0]

    return np.where(labels == best_label, 255, 0).astype(np.uint8)




def _segment_by_brightness(gray: np.ndarray, candidate_mask: Optional[np.ndarray] = None) -> np.ndarray:
    """
    Segment foot using brightness thresholding.
    Assumes white paper background.

    Otsu's threshold is computed from `candidate_mask`'s own pixels only
    (the floor area beside the paper), not the whole frame. Otsu picks the
    threshold that best splits whatever histogram it's given into two
    classes - if the paper (very bright, already excluded from
    `candidate_mask` downstream) is included in that histogram, the split
    found is "paper vs. everything else" instead of "foot vs. floor",
    which can misclassify most of a plain/low-contrast floor as foot.
    """
    if candidate_mask is not None and np.count_nonzero(candidate_mask) > 0:
        candidate_values = gray[candidate_mask > 0]
        otsu_threshold = _otsu_threshold_value(candidate_values)
        # adaptiveThreshold compares each pixel to the mean of its local
        # neighborhood (block_size=51) - a window straddling the
        # paper/floor boundary has the paper's much brighter pixels
        # pulling that local mean up, so floor pixels just outside the
        # paper end up looking "dark relative to their neighborhood" even
        # though they're identical to the rest of the floor. That
        # produces a false-positive halo tracing the *entire paper
        # perimeter*, which then merges with the real foot blob into one
        # connected component (the foot is placed right beside the
        # paper). Replacing non-candidate pixels (paper + invalid
        # border-fill) with the candidate region's own median before
        # running adaptiveThreshold removes that cross-boundary bias -
        # every local window near the paper now sees floor-like values on
        # both sides instead of a sharp brightness cliff.
        fill_value = int(np.median(candidate_values))
        gray_for_adaptive = np.where(candidate_mask > 0, gray, fill_value).astype(np.uint8)
    else:
        otsu_threshold = _otsu_threshold_value(gray.reshape(-1))
        gray_for_adaptive = gray

    _, binary = cv2.threshold(gray, otsu_threshold, 255, cv2.THRESH_BINARY_INV)

    # Alternative: adaptive thresholding for varying lighting
    adaptive = adaptive_threshold(gray_for_adaptive, block_size=51, c=5, invert=True)

    # Combine both methods
    combined = cv2.bitwise_or(binary, adaptive)

    return combined


def _otsu_threshold_value(values: np.ndarray) -> float:
    """Compute Otsu's optimal threshold from an arbitrary 1-D sample of
    pixel values rather than a full image, so it can be restricted to a
    specific region's own histogram."""
    sample = values.reshape(-1, 1).astype(np.uint8)
    threshold_value, _ = cv2.threshold(sample, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return float(threshold_value)


def _segment_by_color(image: np.ndarray) -> np.ndarray:
    """
    Segment foot using color information.
    Detects skin-like colors.
    """
    # Convert to HSV
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)

    # Skin color range (broad)
    # Hue: 0-25 (red-orange-yellow range)
    # Saturation: 20-255 (not too gray)
    # Value: 30-255 (not too dark)
    lower_skin = np.array([0, 20, 30], dtype=np.uint8)
    upper_skin = np.array([25, 255, 255], dtype=np.uint8)

    mask1 = cv2.inRange(hsv, lower_skin, upper_skin)

    # Also check for darker skin tones
    lower_skin2 = np.array([0, 10, 20], dtype=np.uint8)
    upper_skin2 = np.array([20, 255, 200], dtype=np.uint8)

    mask2 = cv2.inRange(hsv, lower_skin2, upper_skin2)

    # Combine
    return cv2.bitwise_or(mask1, mask2)


def clean_foot_mask(
    mask: np.ndarray,
    close_size: int = 5,
    open_size: int = 3,
    paper_rect: Optional[Tuple[int, int, int, int]] = None,
) -> np.ndarray:
    """
    Clean up foot segmentation mask.

    1. Morphological close (fill small holes)
    2. Fill larger holes
    3. Morphological open (remove noise)
    4. Keep one blob - the one nearest `paper_rect` if given (the photo may
       contain a second, incidental foot/leg elsewhere in frame), otherwise
       simply the largest

    Args:
        mask: Binary input mask
        close_size: Kernel size for closing
        open_size: Kernel size for opening
        paper_rect: Optional (x0, y0, x1, y1) of the paper; when given,
            disambiguates between multiple skin-colored blobs by proximity
            to the paper instead of picking whichever is largest

    Returns:
        Cleaned binary mask
    """
    # Close to fill small gaps
    mask = morphological_close(mask, kernel_size=close_size, iterations=2)

    # Fill interior holes
    mask = fill_holes(mask)

    # Open to remove small noise
    mask = morphological_open(mask, kernel_size=open_size, iterations=1)

    # Keep only one connected component
    if paper_rect is not None:
        mask = _keep_blob_nearest_rect(mask, paper_rect)
    else:
        mask = keep_largest_blob(mask)

    return mask


def _validate_segmentation(
    mask: np.ndarray,
    h: int,
    w: int,
    min_ratio: float,
    max_ratio: float,
    paper_rect: Optional[Tuple[int, int, int, int]] = None,
) -> SegmentationResult:
    """Validate segmentation result and compute metrics."""
    warnings = []

    # Count foot pixels
    foot_pixels = np.count_nonzero(mask)
    image_area = h * w
    foot_ratio = foot_pixels / image_area

    # Check size constraints
    if foot_pixels < 100:
        return SegmentationResult(
            success=False,
            confidence=0.0,
            warnings=["No foot detected in image"]
        )

    # `max_ratio` is checked against the full *padded* canvas (paper plus
    # floor margin on every side), which with the default margin is ~9x
    # the paper's own area - so a hard cap at `max_ratio` of that canvas
    # would only ever trip at ~5x the area of an A4 sheet. A real bare
    # foot's area is roughly 0.3-0.5x a sheet of A4, so when the paper's
    # own footprint is known, that's a far tighter and more physically
    # meaningful bound: a segmented "foot" bigger than the paper itself is
    # almost certainly the floor around it, not a foot, and is rejected
    # outright rather than just flagged - silently handing an
    # implausibly large region to measurement() is what previously turned
    # a segmentation failure into a confusing "includes leg/ankle" error
    # two stages downstream.
    if paper_rect is not None:
        x0, y0, x1, y1 = paper_rect
        paper_area = max(1, (x1 - x0) * (y1 - y0))
        if foot_pixels > paper_area * 1.5:
            return SegmentationResult(
                success=False,
                confidence=0.0,
                warnings=[
                    "Detected region is much larger than the A4 paper - this is almost "
                    "certainly background/floor, not the foot. Check that the floor has "
                    "enough contrast against the foot, or retake with a less uniform background."
                ],
            )

    if foot_ratio < min_ratio:
        warnings.append("Foot appears too small in frame")

    if foot_ratio > max_ratio:
        warnings.append("Detected region too large - may include background")

    # Check if foot touches edges
    touches_edge = _mask_touches_edge(mask, margin=5)
    if touches_edge:
        warnings.append("Foot touches image edge - measurement may be incomplete")

    # Find contour
    contours = find_contours(mask)
    contour = get_largest_contour(contours)

    # Calculate confidence
    confidence = 1.0
    if foot_ratio < min_ratio:
        confidence *= 0.7
    if foot_ratio > max_ratio:
        confidence *= 0.7
    if touches_edge:
        confidence *= 0.85

    # Check contour solidity (foot should be relatively solid)
    if contour is not None:
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        contour_area = cv2.contourArea(contour)

        if hull_area > 0:
            solidity = contour_area / hull_area
            if solidity < 0.7:
                warnings.append("Irregular foot shape detected")
                confidence *= 0.9

    return SegmentationResult(
        success=True,
        mask=mask,
        contour=contour,
        area=float(foot_pixels),
        confidence=min(1.0, confidence),
        touches_edge=touches_edge,
        warnings=warnings,
    )


def _mask_touches_edge(mask: np.ndarray, margin: int = 5) -> bool:
    """Check if mask has non-zero pixels near image edges."""
    h, w = mask.shape

    # Check top edge
    if np.any(mask[:margin, :] > 0):
        return True

    # Check bottom edge
    if np.any(mask[-margin:, :] > 0):
        return True

    # Check left edge
    if np.any(mask[:, :margin] > 0):
        return True

    # Check right edge
    if np.any(mask[:, -margin:] > 0):
        return True

    return False


def create_paper_mask(
    image_shape: Tuple[int, int],
    a4_corners: np.ndarray,
) -> np.ndarray:
    """
    Create binary mask for A4 paper region.

    Args:
        image_shape: (height, width) of image
        a4_corners: 4x2 array of A4 paper corners

    Returns:
        Binary mask (255 inside paper, 0 outside)
    """
    mask = np.zeros(image_shape[:2], dtype=np.uint8)
    corners = a4_corners.astype(np.int32).reshape((-1, 1, 2))
    cv2.fillPoly(mask, [corners], 255)
    return mask


def draw_segmentation_debug(
    image: np.ndarray,
    result: SegmentationResult,
) -> np.ndarray:
    """Draw debug visualization of segmentation."""
    debug_img = image.copy()

    if result.mask is not None:
        # Create colored overlay
        overlay = np.zeros_like(debug_img)
        overlay[result.mask > 0] = (0, 255, 0)  # Green

        # Blend with original
        debug_img = cv2.addWeighted(debug_img, 0.7, overlay, 0.3, 0)

    if result.contour is not None:
        # Draw contour
        cv2.drawContours(debug_img, [result.contour], -1, (0, 0, 255), 2)

    # Add info
    info = f"Area: {result.area:.0f}px | Conf: {result.confidence:.2f}"
    cv2.putText(
        debug_img, info,
        (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2
    )

    # Add warnings
    for i, warning in enumerate(result.warnings):
        cv2.putText(
            debug_img, warning,
            (10, 60 + i * 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 165, 255), 1
        )

    return debug_img
