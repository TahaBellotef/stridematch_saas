#
#  File: utils/normalize.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations
from typing import Optional, Union
import re
import math


# ---------------------------------------------------------
# Cleaning helpers
# ---------------------------------------------------------

def clean_str(value: Optional[str]) -> str:
    """
    Normalize strings:
      - lowercase
      - trim whitespace
      - collapse repeating spaces
    """
    if value is None:
        return ""
    value = value.strip().lower()
    return re.sub(r"\s+", " ", value)


def strip_units(s: str) -> str:
    """
    Remove common units/symbols present in shoe catalog fields:
      - g, mm, cm, kg
      - $, €, usd, eur
      - commas → replaced with dot
    """
    if not s:
        return ""

    s = s.lower()

    # Strip units from end of string (anchored to avoid corrupting words like "gore-tex")
    s = re.sub(r"\s*(usd|eur|mm|cm|kg|g|[$€])\s*$", "", s)
    # Also strip leading currency symbols
    s = re.sub(r"^[$€]\s*", "", s)
    s = s.replace(",", ".")
    return s.strip()


# ---------------------------------------------------------
# Numeric coercion / safe parsing
# ---------------------------------------------------------

def safe_float(v: object, default: float = 0.0) -> float:
    """
    Canonical safe float conversion for the entire codebase.
    Converts any value to float, returning `default` on failure or NaN/Inf.
    """
    try:
        result = float(v)  # type: ignore[arg-type]
        return result if math.isfinite(result) else default
    except Exception:
        return default


def _safe_float(s: str) -> Optional[float]:
    """Internal: string-to-float for normalize helpers (returns None on failure)."""
    try:
        value = float(s)
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    except Exception:
        return None


def to_float(value: object) -> Optional[float]:
    """
    Safely convert to float:
      - strings with units allowed
      - invalid formats return None
      - NaN/inf sanitized to None
    """
    if value is None:
        return None

    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return None
        return float(value)

    cleaned = strip_units(str(value))
    if cleaned == "":
        return None

    return _safe_float(cleaned)


def to_int(value: object) -> Optional[int]:
    """
    Convert to integer safely:
      - returns None on invalid
      - fractional floats truncated like int()
    """
    f = to_float(value)
    return int(f) if f is not None else None


# ---------------------------------------------------------
# Price parsing
# ---------------------------------------------------------

def parse_price(value: object) -> Optional[float]:
    """
    Convert price-like values into a numeric float:
      - "$150" → 150.0
      - "120 eur" → 120.0
      - 130 → 130.0
    """
    if value is None:
        return None

    try:
        s = str(value).lower()
        s = re.sub(r"(usd|eur|[$€])", "", s)
        s = s.replace(",", "").strip()
        if not s:
            return None
        return _safe_float(s)
    except Exception:
        return None


# ---------------------------------------------------------
# Field normalization for DynamoDB updates
# ---------------------------------------------------------

def sanitize_field(field: str, value: object, numeric_fields: set) -> Optional[object]:
    """
    Normalize a field before sending it to DynamoDB:
      - for numeric fields: convert to float or None
      - empty strings → None
      - strings trimmed
    """
    if value is None:
        return None

    if isinstance(value, str):
        v = value.strip()
        if not v:
            return None
        if field in numeric_fields:
            return to_float(v)
        return v

    if field in numeric_fields:
        return to_float(value)

    return value


# ---------------------------------------------------------
# Form / query-string coercion
# ---------------------------------------------------------

def parse_bool(value: Optional[str]) -> Optional[bool]:
    """Coerce a form/query-string value to bool (None if absent)."""
    if value is None:
        return None
    return value.lower() in {"1", "true", "yes", "on"}


def parse_rotate(value: Optional[str]) -> Optional[int]:
    """Coerce a rotation string to a valid 0/90/180/270 int (None if invalid)."""
    try:
        rot = int(value) % 360  # type: ignore[arg-type]
        return rot if rot in {0, 90, 180, 270} else None
    except Exception:
        return None