# app/services/foot_scan/sizing.py
"""Shoe size conversion from foot measurements."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass
class ShoeSizeResult:
    """Shoe sizes in various regional standards."""
    eu: float  # European (Paris point)
    us_men: float  # US Men (Brannock)
    us_women: float  # US Women (Brannock)
    uk: float  # UK sizing
    jp: float  # JP/Mondopoint (cm)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "eu": self.eu,
            "us_men": self.us_men,
            "us_women": self.us_women,
            "uk": self.uk,
            "jp": self.jp,
        }


def round_half(value: float) -> float:
    """Round to nearest 0.5."""
    return round(value * 2) / 2


def convert_to_shoe_sizes(
    length_cm: float,
    width_cm: float = None,
    fit: Literal["standard", "wide", "narrow"] = "standard",
) -> ShoeSizeResult:
    """
    Convert foot length to shoe sizes.

    Formulas:
    - EU (Paris point): (length_cm + 1.5) * 1.5
      - 1.5cm added for toe allowance
      - Multiply by 1.5 to convert to Paris points

    - US Men (Brannock): length_inches * 3 - 22
    - US Women (Brannock): length_inches * 3 - 21
    - UK: length_inches * 3 - 23
    - JP (Mondopoint): length_cm (direct)

    Args:
        length_cm: Foot length in centimeters
        width_cm: Foot width in centimeters (optional, for fit adjustment)
        fit: Fit preference for size adjustment

    Returns:
        ShoeSizeResult with all regional sizes
    """
    # Convert cm to inches
    length_inches = length_cm / 2.54

    # EU Size (Paris points)
    # Formula: (foot_length + toe_allowance) * paris_point_factor
    # Toe allowance is typically 1.0-1.5cm
    toe_allowance_cm = 1.5
    eu_size = round_half((length_cm + toe_allowance_cm) * 1.5)

    # US Men (Brannock formula)
    us_men = round_half(length_inches * 3 - 22)

    # US Women (Brannock formula - 1 size larger than men's)
    us_women = round_half(length_inches * 3 - 21)

    # UK (similar to US but different offset)
    uk = round_half(length_inches * 3 - 23)

    # JP (Mondopoint - direct cm measurement, rounded to 0.5)
    jp = round_half(length_cm)

    # Apply fit adjustments if width provided
    if width_cm is not None and fit != "standard":
        adjustment = _calculate_fit_adjustment(length_cm, width_cm, fit)
        eu_size += adjustment
        us_men += adjustment
        us_women += adjustment
        uk += adjustment
        # JP typically stays the same, just noted as wide/narrow

    # Clamp to valid ranges
    eu_size = max(30, min(52, eu_size))
    us_men = max(4, min(18, us_men))
    us_women = max(5, min(17, us_women))
    uk = max(3, min(16, uk))
    jp = max(20, min(32, jp))

    return ShoeSizeResult(
        eu=eu_size,
        us_men=us_men,
        us_women=us_women,
        uk=uk,
        jp=jp,
    )


def _calculate_fit_adjustment(
    length_cm: float,
    width_cm: float,
    fit: str,
) -> float:
    """
    Calculate size adjustment based on width.

    Wide feet may need to size up.
    Narrow feet may need to size down.
    """
    # Expected width as ratio of length (typical: 0.38)
    expected_ratio = 0.38
    actual_ratio = width_cm / length_cm if length_cm > 0 else expected_ratio

    if fit == "wide":
        if actual_ratio > expected_ratio * 1.1:  # Actually wide
            return 0.5
    elif fit == "narrow":
        if actual_ratio < expected_ratio * 0.9:  # Actually narrow
            return -0.5

    return 0.0


def get_size_recommendation(
    left_sizes: ShoeSizeResult,
    right_sizes: ShoeSizeResult,
) -> tuple:
    """
    Get recommended shoe size based on both feet.

    Always recommend the size for the larger foot.

    Args:
        left_sizes: Sizes for left foot
        right_sizes: Sizes for right foot

    Returns:
        Tuple of (recommended_sizes, larger_foot, length_diff_mm)
    """
    # Compare EU sizes (most universal)
    left_eu = left_sizes.eu
    right_eu = right_sizes.eu

    if left_eu >= right_eu:
        larger_foot = "left"
        recommended = left_sizes
        diff = (left_eu - right_eu) / 1.5 * 10  # Convert back to approximate mm
    else:
        larger_foot = "right"
        recommended = right_sizes
        diff = (right_eu - left_eu) / 1.5 * 10

    return recommended, larger_foot, abs(diff)


# Size conversion tables for display
EU_SIZE_TABLE = {
    35: {"us_m": 3, "us_w": 5, "uk": 2.5, "jp": 22},
    36: {"us_m": 4, "us_w": 6, "uk": 3.5, "jp": 23},
    37: {"us_m": 5, "us_w": 7, "uk": 4, "jp": 23.5},
    38: {"us_m": 6, "us_w": 8, "uk": 5, "jp": 24},
    39: {"us_m": 6.5, "us_w": 8.5, "uk": 5.5, "jp": 24.5},
    40: {"us_m": 7, "us_w": 9, "uk": 6, "jp": 25},
    41: {"us_m": 8, "us_w": 10, "uk": 7, "jp": 26},
    42: {"us_m": 9, "us_w": 11, "uk": 8, "jp": 27},
    43: {"us_m": 10, "us_w": 12, "uk": 9, "jp": 27.5},
    44: {"us_m": 11, "us_w": 13, "uk": 10, "jp": 28},
    45: {"us_m": 12, "us_w": 14, "uk": 11, "jp": 29},
    46: {"us_m": 13, "us_w": 15, "uk": 12, "jp": 30},
}


def lookup_size_table(eu_size: float) -> dict:
    """
    Look up sizes from conversion table.

    Uses nearest EU size for lookup.
    """
    eu_rounded = round(eu_size)
    if eu_rounded in EU_SIZE_TABLE:
        return EU_SIZE_TABLE[eu_rounded]

    # Find closest
    closest = min(EU_SIZE_TABLE.keys(), key=lambda x: abs(x - eu_size))
    return EU_SIZE_TABLE[closest]
