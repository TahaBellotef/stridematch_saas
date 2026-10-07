# core/foot/homography.py
"""Homography computation and image warping for perspective correction."""
from __future__ import annotations

from typing import Tuple

import cv2
import numpy as np


def compute_homography(
    src_points: np.ndarray,
    dst_points: np.ndarray,
) -> np.ndarray:
    """
    Compute homography matrix from 4 point correspondences.

    Args:
        src_points: 4x2 array of source points
        dst_points: 4x2 array of destination points

    Returns:
        3x3 homography matrix H such that dst = H @ src
    """
    src = src_points.astype(np.float32).reshape(4, 2)
    dst = dst_points.astype(np.float32).reshape(4, 2)

    H, _ = cv2.findHomography(src, dst)
    return H


def invert_homography(H: np.ndarray) -> np.ndarray:
    """
    Compute inverse of homography matrix.

    Args:
        H: 3x3 homography matrix

    Returns:
        Inverse homography matrix
    """
    return np.linalg.inv(H)


def warp_point(
    point: np.ndarray,
    H: np.ndarray,
) -> np.ndarray:
    """
    Apply homography to a single point.

    Args:
        point: (x, y) coordinates
        H: 3x3 homography matrix

    Returns:
        Transformed (x, y) coordinates
    """
    x, y = point[0], point[1]
    w = H[2, 0] * x + H[2, 1] * y + H[2, 2]

    if abs(w) < 1e-10:
        return np.array([0.0, 0.0])

    x_out = (H[0, 0] * x + H[0, 1] * y + H[0, 2]) / w
    y_out = (H[1, 0] * x + H[1, 1] * y + H[1, 2]) / w

    return np.array([x_out, y_out])


def warp_points(
    points: np.ndarray,
    H: np.ndarray,
) -> np.ndarray:
    """
    Apply homography to multiple points.

    Args:
        points: Nx2 array of (x, y) coordinates
        H: 3x3 homography matrix

    Returns:
        Nx2 array of transformed coordinates
    """
    points = points.reshape(-1, 2).astype(np.float32)
    n = len(points)

    # Convert to homogeneous coordinates
    ones = np.ones((n, 1), dtype=np.float32)
    homogeneous = np.hstack([points, ones])  # Nx3

    # Apply homography
    transformed = homogeneous @ H.T  # Nx3

    # Convert back from homogeneous
    w = transformed[:, 2:3]
    w[np.abs(w) < 1e-10] = 1e-10  # Avoid division by zero
    result = transformed[:, :2] / w

    return result


def warp_image(
    image: np.ndarray,
    H: np.ndarray,
    output_size: Tuple[int, int],
    border_value: Tuple[int, ...] = (0, 0, 0),
) -> np.ndarray:
    """
    Warp image using homography with bilinear interpolation.

    Args:
        image: Input image (H, W, C) or (H, W)
        H: 3x3 homography matrix
        output_size: (width, height) of output image
        border_value: Value to use for pixels outside bounds

    Returns:
        Warped image
    """
    return cv2.warpPerspective(
        image,
        H,
        output_size,
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border_value,
    )


def warp_mask(
    mask: np.ndarray,
    H: np.ndarray,
    output_size: Tuple[int, int],
) -> np.ndarray:
    """
    Warp binary mask using homography with nearest-neighbor interpolation.

    Args:
        mask: Binary input mask (H, W)
        H: 3x3 homography matrix
        output_size: (width, height) of output mask

    Returns:
        Warped binary mask
    """
    return cv2.warpPerspective(
        mask,
        H,
        output_size,
        flags=cv2.INTER_NEAREST,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )


def compute_rectification_homography(
    quad_corners: np.ndarray,
    target_width: int,
    target_height: int,
) -> np.ndarray:
    """
    Compute homography to rectify a quadrilateral to a rectangle.

    Args:
        quad_corners: 4x2 array of quad corners (TL, TR, BR, BL order)
        target_width: Width of output rectangle
        target_height: Height of output rectangle

    Returns:
        3x3 homography matrix
    """
    src = quad_corners.astype(np.float32).reshape(4, 2)

    dst = np.array([
        [0, 0],  # TL
        [target_width - 1, 0],  # TR
        [target_width - 1, target_height - 1],  # BR
        [0, target_height - 1],  # BL
    ], dtype=np.float32)

    return compute_homography(src, dst)


def rectify_to_a4(
    image: np.ndarray,
    quad_corners: np.ndarray,
    orientation: str = "portrait",
    scale: float = 1.0,
    margin_ratio: float = 1.0,
) -> Tuple[np.ndarray, np.ndarray, float, Tuple[int, int, int, int], np.ndarray]:
    """
    Rectify image so that detected A4 paper becomes a rectangle, keeping a
    margin of surrounding floor in the output frame.

    A4 dimensions: 210mm x 297mm
    Portrait: 210 wide, 297 tall
    Landscape: 297 wide, 210 tall

    A naive rectification maps the paper quad to a canvas sized exactly to
    the paper's own footprint, which crops away anything beside the paper -
    including a foot placed next to it rather than on top of it. We instead
    map the paper into a larger canvas with margin on each side so a nearby
    foot is preserved for segmentation.

    Args:
        image: Input image
        quad_corners: 4x2 array of A4 corners (TL, TR, BR, BL)
        orientation: "portrait" or "landscape"
        scale: Output scale factor
        margin_ratio: Extra floor margin around the paper, as a multiple of
            the paper's own width/height on each side. 1.0 = one full
            paper-width/-height of margin on every side (enough for a foot
            placed beside a 210x297mm sheet).

    Returns:
        Tuple of:
        - Rectified image (paper + surrounding floor margin)
        - Homography matrix used
        - Pixels per mm in rectified image
        - paper_rect_px: (x0, y0, x1, y1) of the paper itself within the
          rectified image
        - valid_mask: binary mask (255 = real photo content, 0 = synthetic
          black border-fill outside the original photo's bounds)
    """
    # A4 dimensions in mm
    A4_WIDTH_MM = 210
    A4_HEIGHT_MM = 297

    if orientation == "landscape":
        width_mm, height_mm = A4_HEIGHT_MM, A4_WIDTH_MM
    else:
        width_mm, height_mm = A4_WIDTH_MM, A4_HEIGHT_MM

    # Paper resolution: 1 pixel = 0.5mm by default
    px_per_mm = 2.0 * scale
    paper_width_px = int(width_mm * px_per_mm)
    paper_height_px = int(height_mm * px_per_mm)

    margin_x = int(paper_width_px * margin_ratio)
    margin_y = int(paper_height_px * margin_ratio)

    target_width = paper_width_px + 2 * margin_x
    target_height = paper_height_px + 2 * margin_y

    src = quad_corners.astype(np.float32).reshape(4, 2)
    dst = np.array([
        [margin_x, margin_y],  # TL
        [margin_x + paper_width_px - 1, margin_y],  # TR
        [margin_x + paper_width_px - 1, margin_y + paper_height_px - 1],  # BR
        [margin_x, margin_y + paper_height_px - 1],  # BL
    ], dtype=np.float32)

    H = compute_homography(src, dst)

    rectified = warp_image(image, H, (target_width, target_height))

    # warpPerspective fills canvas area with no corresponding source pixel
    # using solid black (borderValue). Once the canvas extends beyond the
    # paper, that black fill must not be mistaken for foot by segmentation.
    source_mask = np.full(image.shape[:2], 255, dtype=np.uint8)
    valid_mask = warp_mask(source_mask, H, (target_width, target_height))

    paper_rect_px = (
        margin_x,
        margin_y,
        margin_x + paper_width_px,
        margin_y + paper_height_px,
    )

    return rectified, H, px_per_mm, paper_rect_px, valid_mask


def estimate_px_per_mm(
    quad_corners: np.ndarray,
    orientation: str = "portrait",
) -> float:
    """
    Estimate pixels per mm from detected A4 quad.

    Args:
        quad_corners: 4x2 array of A4 corners (TL, TR, BR, BL)
        orientation: "portrait" or "landscape"

    Returns:
        Estimated pixels per mm
    """
    # A4 dimensions in mm
    A4_WIDTH_MM = 210
    A4_HEIGHT_MM = 297

    if orientation == "landscape":
        width_mm, height_mm = A4_HEIGHT_MM, A4_WIDTH_MM
    else:
        width_mm, height_mm = A4_WIDTH_MM, A4_HEIGHT_MM

    corners = quad_corners.reshape(4, 2)

    # Measure widths (top and bottom edges)
    width_top = np.linalg.norm(corners[1] - corners[0])
    width_bottom = np.linalg.norm(corners[2] - corners[3])
    avg_width = (width_top + width_bottom) / 2

    # Measure heights (left and right edges)
    height_left = np.linalg.norm(corners[3] - corners[0])
    height_right = np.linalg.norm(corners[2] - corners[1])
    avg_height = (height_left + height_right) / 2

    # Calculate px/mm from both dimensions
    px_per_mm_width = avg_width / width_mm
    px_per_mm_height = avg_height / height_mm

    # Return average
    return (px_per_mm_width + px_per_mm_height) / 2
