"""Tests for utility normalization functions."""

from __future__ import annotations

import math

import pytest

from app.utils.normalize import (
    clean_str,
    strip_units,
    to_float,
    to_int,
    parse_price,
    sanitize_field,
    parse_bool,
    parse_rotate,
    safe_float,
)


class TestCleanStr:
    def test_none(self):
        assert clean_str(None) == ""

    def test_whitespace(self):
        assert clean_str("  Hello   World  ") == "hello world"

    def test_already_clean(self):
        assert clean_str("test") == "test"


class TestStripUnits:
    def test_grams(self):
        assert strip_units("250g") == "250"

    def test_usd(self):
        assert strip_units("$150") == "150"

    def test_comma(self):
        assert strip_units("1,500") == "1.500"

    def test_empty(self):
        assert strip_units("") == ""


class TestToFloat:
    def test_int(self):
        assert to_float(42) == 42.0

    def test_string(self):
        assert to_float("3.14") == 3.14

    def test_with_units(self):
        assert to_float("250g") == 250.0

    def test_none(self):
        assert to_float(None) is None

    def test_nan(self):
        assert to_float(float("nan")) is None

    def test_inf(self):
        assert to_float(float("inf")) is None

    def test_empty_string(self):
        assert to_float("") is None


class TestToInt:
    def test_normal(self):
        assert to_int("42") == 42

    def test_float_string(self):
        assert to_int("3.7") == 3

    def test_none(self):
        assert to_int(None) is None


class TestParsePrice:
    def test_dollar(self):
        assert parse_price("$150") == 150.0

    def test_euro(self):
        assert parse_price("120 eur") == 120.0

    def test_int(self):
        assert parse_price(130) == 130.0

    def test_none(self):
        assert parse_price(None) is None


class TestParseBool:
    def test_true_values(self):
        for v in ("1", "true", "True", "yes", "on"):
            assert parse_bool(v) is True

    def test_false_values(self):
        for v in ("0", "false", "no", "off"):
            assert parse_bool(v) is False

    def test_none(self):
        assert parse_bool(None) is None


class TestParseRotate:
    def test_valid_rotations(self):
        assert parse_rotate("0") == 0
        assert parse_rotate("90") == 90
        assert parse_rotate("180") == 180
        assert parse_rotate("270") == 270

    def test_wraparound(self):
        assert parse_rotate("360") == 0
        assert parse_rotate("450") == 90

    def test_invalid(self):
        assert parse_rotate("45") is None
        assert parse_rotate("abc") is None
        assert parse_rotate(None) is None


class TestSanitizeField:
    def test_numeric_field(self):
        result = sanitize_field("weight", "250g", {"weight"})
        assert result == 250.0

    def test_string_field(self):
        result = sanitize_field("name", "  Test  ", set())
        assert result == "Test"

    def test_empty_string(self):
        assert sanitize_field("name", "", set()) is None

    def test_none(self):
        assert sanitize_field("name", None, set()) is None


class TestSafeFloat:
    """Canonical safe_float used across the entire codebase."""

    def test_int(self):
        assert safe_float(42) == 42.0

    def test_float(self):
        assert safe_float(3.14) == 3.14

    def test_string_number(self):
        assert safe_float("7.5") == 7.5

    def test_nan_returns_default(self):
        assert safe_float(float("nan")) == 0.0
        assert safe_float(float("nan"), default=99.0) == 99.0

    def test_inf_returns_default(self):
        assert safe_float(float("inf")) == 0.0
        assert safe_float(float("-inf"), default=-1.0) == -1.0

    def test_none_returns_default(self):
        assert safe_float(None) == 0.0
        assert safe_float(None, default=5.0) == 5.0

    def test_garbage_string_returns_default(self):
        assert safe_float("not_a_number") == 0.0

    def test_bool_coercion(self):
        assert safe_float(True) == 1.0
        assert safe_float(False) == 0.0

    def test_custom_default(self):
        assert safe_float("bad", default=42.0) == 42.0
