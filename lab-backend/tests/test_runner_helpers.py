"""Tests for runner.py helper functions."""

from __future__ import annotations

from app.services.analysis.runner import _opt_float, _round_int, _coerce_bool, _coerce_rotate_cw


class TestOptFloat:
    def test_none_returns_none(self):
        assert _opt_float(None) is None

    def test_int(self):
        assert _opt_float(5) == 5.0

    def test_float(self):
        assert _opt_float(3.14) == 3.14

    def test_string_number(self):
        assert _opt_float("2.5") == 2.5

    def test_nan_returns_default(self):
        result = _opt_float(float("nan"))
        assert result == 0.0  # safe_float default


class TestRoundInt:
    def test_normal(self):
        assert _round_int(3.7) == 4

    def test_none_returns_default(self):
        assert _round_int(None) == 0
        assert _round_int(None, default=42) == 42


class TestCoerceBool:
    def test_true_strings(self):
        for v in ("1", "true", "yes", "True", "YES"):
            assert _coerce_bool(v) is True

    def test_false_strings(self):
        for v in ("0", "false", "no", "False", "NO"):
            assert _coerce_bool(v) is False

    def test_bool_passthrough(self):
        assert _coerce_bool(True) is True
        assert _coerce_bool(False) is False

    def test_none(self):
        assert _coerce_bool(None) is None

    def test_garbage(self):
        assert _coerce_bool("maybe") is None


class TestCoerceRotateCw:
    def test_valid_rotations(self):
        assert _coerce_rotate_cw(0) == 0
        assert _coerce_rotate_cw(90) == 90
        assert _coerce_rotate_cw(180) == 180
        assert _coerce_rotate_cw(270) == 270

    def test_wraparound(self):
        assert _coerce_rotate_cw(360) == 0
        assert _coerce_rotate_cw(450) == 90

    def test_none(self):
        assert _coerce_rotate_cw(None) is None

    def test_bool_rejected(self):
        assert _coerce_rotate_cw(True) is None

    def test_invalid_angle(self):
        assert _coerce_rotate_cw(45) is None
