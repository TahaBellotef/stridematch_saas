"""fps resolution must prefer the measured rate (frames/duration) over the
source's reported average_rate, which is unreliable for VFR/WEBM and caused
result videos to play many times too fast."""
from __future__ import annotations

from core.pose.pipeline import _fps_from_counts


def test_webm_prefers_measured_over_misleading_average_rate():
    # WEBM: metadata says 60 fps, but the true rate is ~36 (290 frames / 8.016 s).
    assert abs(_fps_from_counts(290, 8.016, 60) - 36.2) < 0.5


def test_mp4_measured_matches_reality():
    assert abs(_fps_from_counts(367, 10.75, 34.3) - 34.1) < 0.5


def test_falls_back_to_average_rate_without_duration():
    # No container duration (pathological WEBM) -> use a plausible average_rate.
    assert _fps_from_counts(0, None, 30) == 30.0


def test_absurd_measured_is_rejected():
    # A bogus huge measured rate (e.g. ms-timebase artifact) falls back.
    assert _fps_from_counts(100000, 1.0, 30) == 30.0


def test_absurd_average_rate_is_rejected():
    # average_rate of 1000 (WEBM timebase) with no usable counts -> default 30.
    assert _fps_from_counts(0, None, 1000) == 30.0


def test_default_when_nothing_is_known():
    assert _fps_from_counts(0, None, None) == 30.0
