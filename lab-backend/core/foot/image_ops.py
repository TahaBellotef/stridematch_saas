# core/foot/image_ops.py
"""Low-level OpenCV utilities for foot scan image processing."""
from __future__ import annotations

from typing import List, Optional, Tuple

import cv2
import numpy as np


def to_grayscale(image: np.ndarray) -> np.ndarray:
    """
    Convert BGR/RGB image to grayscale.

    Args:
        image: Input image (H, W, 3) or (H, W)

    Returns:
        Grayscale image (H, W) dtype uint8
    """
    if len(image.shape) == 2:
        return image
    if image.shape[2] == 4:  # RGBA
        image = cv2.cvtColor(image, cv2.COLOR_RGBA2RGB)
    return cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)


def gaussian_blur(image: np.ndarray, ksize: int = 5) -> np.ndarray:
    """
    Apply Gaussian blur to image.

    Args:
        image: Input image
        ksize: Kernel size (must be odd)

    Returns:
        Blurred image
    """
    return cv2.GaussianBlur(image, (ksize, ksize), 0)


def sobel_edges(
    image: np.ndarray,
    ksize: int = 3,
    threshold: Optional[float] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute Sobel edge magnitude and direction.

    Args:
        image: Grayscale image (H, W)
        ksize: Sobel kernel size
        threshold: Optional threshold for binary edge mask

    Returns:
        Tuple of (magnitude, direction) arrays
        If threshold provided, magnitude is binarized
    """
    grad_x = cv2.Sobel(image, cv2.CV_64F, 1, 0, ksize=ksize)
    grad_y = cv2.Sobel(image, cv2.CV_64F, 0, 1, ksize=ksize)

    magnitude = np.sqrt(grad_x**2 + grad_y**2)
    direction = np.arctan2(grad_y, grad_x)

    if threshold is not None:
        magnitude = (magnitude >= threshold).astype(np.uint8)
    else:
        # Normalize to 0-255
        magnitude = np.clip(magnitude / magnitude.max() * 255, 0, 255).astype(np.uint8)

    return magnitude, direction


def canny_edges(
    image: np.ndarray,
    low_threshold: float = 50,
    high_threshold: float = 150,
) -> np.ndarray:
    """
    Apply Canny edge detection.

    Args:
        image: Grayscale image
        low_threshold: Lower threshold for hysteresis
        high_threshold: Upper threshold for hysteresis

    Returns:
        Binary edge image
    """
    return cv2.Canny(image, low_threshold, high_threshold)


def threshold_binary(
    image: np.ndarray,
    threshold: float,
    invert: bool = False,
) -> np.ndarray:
    """
    Apply binary thresholding.

    Args:
        image: Grayscale image
        threshold: Threshold value (0-255)
        invert: If True, use inverse thresholding

    Returns:
        Binary image (0 or 255)
    """
    thresh_type = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    _, result = cv2.threshold(image, threshold, 255, thresh_type)
    return result


def adaptive_threshold(
    image: np.ndarray,
    block_size: int = 11,
    c: float = 2,
    invert: bool = False,
) -> np.ndarray:
    """
    Apply adaptive Gaussian thresholding.

    Args:
        image: Grayscale image
        block_size: Size of neighborhood for threshold calculation
        c: Constant subtracted from mean
        invert: If True, use inverse thresholding

    Returns:
        Binary image
    """
    thresh_type = cv2.THRESH_BINARY_INV if invert else cv2.THRESH_BINARY
    return cv2.adaptiveThreshold(
        image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, thresh_type, block_size, c
    )


def dilate(
    mask: np.ndarray,
    kernel_size: int = 3,
    iterations: int = 1,
) -> np.ndarray:
    """
    Dilate binary mask.

    Args:
        mask: Binary input mask
        kernel_size: Size of structuring element
        iterations: Number of dilation iterations

    Returns:
        Dilated mask
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    return cv2.dilate(mask, kernel, iterations=iterations)


def erode(
    mask: np.ndarray,
    kernel_size: int = 3,
    iterations: int = 1,
) -> np.ndarray:
    """
    Erode binary mask.

    Args:
        mask: Binary input mask
        kernel_size: Size of structuring element
        iterations: Number of erosion iterations

    Returns:
        Eroded mask
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    return cv2.erode(mask, kernel, iterations=iterations)


def morphological_close(
    mask: np.ndarray,
    kernel_size: int = 3,
    iterations: int = 1,
) -> np.ndarray:
    """
    Apply morphological closing (dilate then erode).
    Useful for closing small holes.

    Args:
        mask: Binary input mask
        kernel_size: Size of structuring element
        iterations: Number of close iterations

    Returns:
        Closed mask
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    return cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=iterations)


def morphological_open(
    mask: np.ndarray,
    kernel_size: int = 3,
    iterations: int = 1,
) -> np.ndarray:
    """
    Apply morphological opening (erode then dilate).
    Useful for removing small noise.

    Args:
        mask: Binary input mask
        kernel_size: Size of structuring element
        iterations: Number of open iterations

    Returns:
        Opened mask
    """
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE, (kernel_size, kernel_size)
    )
    return cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=iterations)


def find_contours(
    mask: np.ndarray,
    mode: int = cv2.RETR_EXTERNAL,
) -> List[np.ndarray]:
    """
    Find contours in binary mask.

    Args:
        mask: Binary image
        mode: Contour retrieval mode

    Returns:
        List of contours (each contour is Nx1x2 array)
    """
    contours, _ = cv2.findContours(mask, mode, cv2.CHAIN_APPROX_SIMPLE)
    return list(contours)


def get_largest_contour(
    contours: List[np.ndarray],
    min_area: float = 0,
) -> Optional[np.ndarray]:
    """
    Get the largest contour by area.

    Args:
        contours: List of contours
        min_area: Minimum area threshold

    Returns:
        Largest contour or None if no valid contour found
    """
    if not contours:
        return None

    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < min_area:
        return None

    return largest


def fill_holes(mask: np.ndarray) -> np.ndarray:
    """
    Fill holes in binary mask using flood fill from borders.

    Args:
        mask: Binary mask (0 or 255)

    Returns:
        Mask with holes filled
    """
    # Create a copy to flood fill
    h, w = mask.shape[:2]

    # Create a mask for flood fill (needs to be 2 pixels larger)
    flood_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)

    # Invert the mask
    inverted = cv2.bitwise_not(mask)

    # Flood fill from (0, 0) to find exterior
    cv2.floodFill(inverted, flood_mask, (0, 0), 255)

    # Invert back and combine with original
    inverted = cv2.bitwise_not(inverted)
    filled = mask | inverted

    return filled


def keep_largest_blob(mask: np.ndarray) -> np.ndarray:
    """
    Keep only the largest connected component in the mask.

    Args:
        mask: Binary mask

    Returns:
        Mask with only largest blob
    """
    contours = find_contours(mask)
    if not contours:
        return mask

    largest = get_largest_contour(contours)
    if largest is None:
        return mask

    result = np.zeros_like(mask)
    cv2.drawContours(result, [largest], -1, 255, cv2.FILLED)
    return result


def laplacian_variance(image: np.ndarray) -> float:
    """
    Calculate Laplacian variance as a measure of image sharpness.
    Higher values indicate sharper images.

    Args:
        image: Grayscale image

    Returns:
        Variance of Laplacian
    """
    laplacian = cv2.Laplacian(image, cv2.CV_64F)
    return float(laplacian.var())


def compute_adaptive_threshold(values: np.ndarray) -> float:
    """
    Compute adaptive threshold based on image statistics.
    Uses mean + sqrt(variance) formula from frontend.

    Args:
        values: Array of pixel values

    Returns:
        Computed threshold value
    """
    mean = np.mean(values)
    variance = np.var(values)
    return float(mean + np.sqrt(max(variance, 0)))


def approximate_polygon(
    contour: np.ndarray,
    epsilon_factor: float = 0.02,
) -> np.ndarray:
    """
    Approximate contour with polygon using Douglas-Peucker algorithm.

    Args:
        contour: Input contour
        epsilon_factor: Approximation accuracy as fraction of arc length

    Returns:
        Approximated polygon contour
    """
    epsilon = epsilon_factor * cv2.arcLength(contour, True)
    return cv2.approxPolyDP(contour, epsilon, True)


def order_quad_corners(corners: np.ndarray) -> np.ndarray:
    """
    Order quadrilateral corners as: top-left, top-right, bottom-right, bottom-left.
    Uses sum (x+y) and difference (x-y) method.

    Args:
        corners: 4x2 array of corner points

    Returns:
        Ordered 4x2 array
    """
    corners = corners.reshape(4, 2)

    # Sum and diff
    s = corners.sum(axis=1)  # x + y
    d = np.diff(corners, axis=1).flatten()  # x - y

    ordered = np.zeros((4, 2), dtype=corners.dtype)
    ordered[0] = corners[np.argmin(s)]  # top-left: smallest x+y
    ordered[2] = corners[np.argmax(s)]  # bottom-right: largest x+y
    ordered[1] = corners[np.argmax(d)]  # top-right: largest x-y
    ordered[3] = corners[np.argmin(d)]  # bottom-left: smallest x-y

    return ordered


def polygon_area(corners: np.ndarray) -> float:
    """
    Calculate polygon area using shoelace formula.

    Args:
        corners: Nx2 array of polygon vertices

    Returns:
        Polygon area (always positive)
    """
    n = len(corners)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += corners[i, 0] * corners[j, 1]
        area -= corners[j, 0] * corners[i, 1]
    return abs(area) / 2.0


def distance(p1: np.ndarray, p2: np.ndarray) -> float:
    """
    Calculate Euclidean distance between two points.

    Args:
        p1: First point (x, y)
        p2: Second point (x, y)

    Returns:
        Distance
    """
    return float(np.linalg.norm(p1 - p2))


def quad_corner_angles(corners: np.ndarray) -> List[float]:
    """
    Calculate interior angles at each corner of a quadrilateral.

    Args:
        corners: 4x2 array of corner points (ordered)

    Returns:
        List of 4 angles in degrees
    """
    angles = []
    n = len(corners)

    for i in range(n):
        # Vectors from current corner to neighbors
        prev_idx = (i - 1) % n
        next_idx = (i + 1) % n

        v1 = corners[prev_idx] - corners[i]
        v2 = corners[next_idx] - corners[i]

        # Dot product and magnitudes
        dot = np.dot(v1, v2)
        mag1 = np.linalg.norm(v1)
        mag2 = np.linalg.norm(v2)

        if mag1 * mag2 < 1e-6:
            angles.append(0.0)
            continue

        cos_angle = np.clip(dot / (mag1 * mag2), -1, 1)
        angle_deg = np.degrees(np.arccos(cos_angle))
        angles.append(angle_deg)

    return angles
