"""Tests for energy score and flight ratio computation."""

from __future__ import annotations

import pytest

from app.services.analysis.metrics import (
    compute_energy_score,
    compute_flight_ratio,
)
from app.schemas import SideBioMetrics, RearBioMetrics


class TestComputeEnergySideScore:
    def test_perfect_side(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=180, osc=5.0, sym=95.0, contact_time=240,
        )
        score = compute_energy_score(bio, analysis_type="side")
        assert score == 100

    def test_degraded_side(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=145, osc=12.0, sym=80.0, contact_time=310,
        )
        score = compute_energy_score(bio, analysis_type="side")
        assert 0 <= score < 80

    def test_returns_zero_for_rear_bio_as_side(self):
        bio = RearBioMetrics(rear_quality="high")
        assert compute_energy_score(bio, analysis_type="side") == 0


class TestComputeEnergyRearScore:
    def test_no_metrics_returns_zero(self):
        bio = RearBioMetrics(rear_quality="high")
        assert compute_energy_score(bio, analysis_type="rear", rear_metrics=None) == 0

    def test_good_rear_metrics(self):
        rm = {
            "drift_norm": 0.01,
            "ankle_offset_norm": 0.01,
            "base_of_support_norm": 0.50,
            "rear_symmetry_score": 85.0,
        }
        bio = RearBioMetrics(rear_quality="high")
        score = compute_energy_score(bio, analysis_type="rear", rear_metrics=rm)
        assert 60 <= score <= 100

    def test_quality_does_not_affect_score(self):
        """rear_quality is a UX signal, not a score modifier."""
        rm = {
            "drift_norm": 0.01,
            "ankle_offset_norm": 0.01,
            "base_of_support_norm": 0.50,
            "rear_symmetry_score": 90.0,
        }
        bio = RearBioMetrics(rear_quality="low")
        score_low = compute_energy_score(bio, analysis_type="rear", rear_metrics=rm, rear_quality="low")
        score_high = compute_energy_score(bio, analysis_type="rear", rear_metrics=rm, rear_quality="high")
        assert score_low == score_high


class TestComputeFlightRatio:
    def test_normal(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=180, osc=7.5, sym=92.0, contact_time=240,
        )
        ratio = compute_flight_ratio(bio)
        # stride_time = 60000/180 = 333.3ms; flight = 333.3 - 240 = 93.3ms
        # ratio = 93.3/333.3 * 100 = ~28%
        assert 25.0 <= ratio <= 30.0

    def test_zero_cadence(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=0, osc=7.5, sym=92.0, contact_time=240,
        )
        assert compute_flight_ratio(bio) == 0.0

    def test_long_contact_zero_flight(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=180, osc=7.5, sym=92.0, contact_time=400,
        )
        ratio = compute_flight_ratio(bio)
        assert ratio == 0.0


# =========================================================
# Runner profile integration tests
# =========================================================

_PERFECT_SIDE = dict(
    knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
    cadence=180, osc=5.0, sym=95.0, contact_time=240,
)

_DEGRADED_SIDE = dict(
    knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
    cadence=145, osc=12.0, sym=80.0, contact_time=310,
)


class TestSideScoreWithRunnerProfile:
    """Verify that runner profile adjusts side score thresholds."""

    def test_beginner_scores_higher_than_no_profile(self):
        bio = SideBioMetrics(**_DEGRADED_SIDE)
        score_default = compute_energy_score(bio, analysis_type="side")
        score_beginner = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"level": "beginner", "weightKg": 75, "heightCm": 170, "age": 35},
        )
        assert score_beginner > score_default

    def test_advanced_scores_lower_than_no_profile(self):
        bio = SideBioMetrics(**_DEGRADED_SIDE)
        score_default = compute_energy_score(bio, analysis_type="side")
        score_advanced = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"level": "advanced", "weightKg": 75, "heightCm": 170, "age": 35},
        )
        assert score_advanced <= score_default

    def test_taller_runner_less_osc_penalty(self):
        """A 190cm runner should get less oscillation penalty than a 160cm runner."""
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=180, osc=10.5, sym=95.0, contact_time=240,
        )
        score_short = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"heightCm": 160, "weightKg": 65, "age": 30},
        )
        score_tall = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"heightCm": 190, "weightKg": 75, "age": 30},
        )
        assert score_tall > score_short

    def test_heavier_runner_less_gct_penalty(self):
        """A 100kg runner should get less GCT penalty than a 60kg runner."""
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=175, osc=7.0, sym=92.0, contact_time=300,
        )
        score_light = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"weightKg": 60, "heightCm": 170, "age": 30},
        )
        score_heavy = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"weightKg": 100, "heightCm": 170, "age": 30},
        )
        assert score_heavy > score_light

    def test_older_runner_cadence_leniency(self):
        """A 60-year-old runner should get less cadence penalty."""
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=150, osc=7.0, sym=92.0, contact_time=260,
        )
        score_young = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"age": 30, "weightKg": 75, "heightCm": 170},
        )
        score_older = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"age": 60, "weightKg": 75, "heightCm": 170},
        )
        assert score_older > score_young

    def test_trail_surface_osc_leniency(self):
        """Trail running should be more lenient on oscillation."""
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=175, osc=10.5, sym=92.0, contact_time=260,
        )
        score_road = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"surface": "road", "weightKg": 75, "heightCm": 170, "age": 30},
        )
        score_trail = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"surface": "trail", "weightKg": 75, "heightCm": 170, "age": 30},
        )
        assert score_trail >= score_road

    def test_low_mileage_gct_leniency(self):
        """<10km/week runners should get more GCT tolerance."""
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=170, osc=7.0, sym=92.0, contact_time=300,
        )
        score_high_mileage = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"weeklyDistance": "gt_50", "weightKg": 75, "heightCm": 170, "age": 30},
        )
        score_low_mileage = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"weeklyDistance": "lt_10", "weightKg": 75, "heightCm": 170, "age": 30},
        )
        assert score_low_mileage > score_high_mileage

    def test_perfect_score_unaffected_by_profile(self):
        """A perfect bio should still score 100 regardless of profile."""
        bio = SideBioMetrics(**_PERFECT_SIDE)
        score = compute_energy_score(
            bio, analysis_type="side",
            runner_profile={"level": "beginner", "weightKg": 100, "heightCm": 190, "age": 60},
        )
        assert score == 100


class TestRearScoreWithRunnerProfile:
    """Verify that runner profile adjusts rear score."""

    _GOOD_REAR = {
        "drift_norm": 0.02,
        "ankle_offset_norm": 0.01,
        "base_of_support_norm": 0.50,
        "rear_symmetry_score": 80.0,
        "left_knee_valgus_norm": 0.07,
        "right_knee_valgus_norm": 0.06,
    }

    def test_female_valgus_more_lenient(self):
        bio = RearBioMetrics(rear_quality="high")
        score_male = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._GOOD_REAR,
            runner_profile={"gender": "male"},
        )
        score_female = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._GOOD_REAR,
            runner_profile={"gender": "female"},
        )
        assert score_female >= score_male

    def test_level_has_no_effect_on_rear_score(self):
        """Level should not affect rear score (biomechanician point 10)."""
        bio = RearBioMetrics(rear_quality="high")
        score_intermediate = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._GOOD_REAR,
            runner_profile={"level": "intermediate"},
        )
        score_beginner = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._GOOD_REAR,
            runner_profile={"level": "beginner"},
        )
        score_advanced = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._GOOD_REAR,
            runner_profile={"level": "advanced"},
        )
        assert score_beginner == score_intermediate == score_advanced

    def test_score_always_0_to_100(self):
        """Score must always be clamped to [0, 100]."""
        extreme_rear = {
            "drift_norm": 0.5,
            "ankle_offset_norm": 0.5,
            "base_of_support_norm": 0.10,
            "rear_symmetry_score": 10.0,
            "pelvic_drop_deg": 30.0,
            "left_ankle_eversion_deg": 25.0,
            "right_ankle_eversion_deg": 25.0,
            "left_knee_valgus_norm": 0.3,
            "right_knee_valgus_norm": 0.3,
        }
        bio = RearBioMetrics(rear_quality="low")
        score = compute_energy_score(bio, analysis_type="rear", rear_metrics=extreme_rear)
        assert 0 <= score <= 100


class TestRearScoreBMI:
    """Verify BMI-based penalty scaling (replaces old height/weight/age damping)."""

    _MODERATE_REAR = {
        "drift_norm": 0.04,
        "ankle_offset_norm": 0.03,
        "base_of_support_norm": 0.50,
        "rear_symmetry_score": 70.0,
        "pelvic_drop_deg": 12.0,
        "left_ankle_eversion_deg": 12.0,
        "right_ankle_eversion_deg": 11.0,
    }

    def test_normal_bmi_no_penalty_adjustment(self):
        """BMI <= 25 should have penalty_scale = 1.0 (no adjustment)."""
        bio = RearBioMetrics(rear_quality="high")
        # 170cm, 70kg → BMI = 24.2 (normal)
        score = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 170, "weight_kg": 70},
        )
        # Same runner with exact reference values
        score_ref = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 175, "weight_kg": 75},
        )
        # Both normal BMI, should be very close (same penalty_scale = 1.0)
        assert abs(score - score_ref) <= 1

    def test_high_bmi_harsher_penalties(self):
        """BMI > 25 should result in harsher penalties (lower score)."""
        bio = RearBioMetrics(rear_quality="high")
        # Normal BMI: 180cm, 75kg → BMI = 23.1
        score_normal = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 180, "weight_kg": 75},
        )
        # High BMI: 170cm, 95kg → BMI = 32.9
        score_high_bmi = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 170, "weight_kg": 95},
        )
        assert score_high_bmi < score_normal

    def test_tall_lean_runner_not_penalized(self):
        """A tall lean runner (190cm/70kg, BMI=19.4) should NOT get harsher penalties."""
        bio = RearBioMetrics(rear_quality="high")
        # Average: 170cm, 70kg → BMI = 24.2
        score_average = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 170, "weight_kg": 70},
        )
        # Tall lean: 190cm, 70kg → BMI = 19.4
        score_tall_lean = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 190, "weight_kg": 70},
        )
        # Both have normal BMI — scores should be identical
        assert score_tall_lean == score_average

    def test_bmi_penalty_capped(self):
        """Penalty scale should be capped at 1.20 (max 20% harsher)."""
        bio = RearBioMetrics(rear_quality="high")
        # Very high BMI: 160cm, 120kg → BMI = 46.9
        score_extreme = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 160, "weight_kg": 120},
        )
        # Still high but less: 170cm, 100kg → BMI = 34.6
        score_high = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"height_cm": 170, "weight_kg": 100},
        )
        # Both above cap threshold — difference should be small (both hit 1.20 cap)
        assert abs(score_extreme - score_high) <= 3

    def test_treadmill_more_lenient_than_road(self):
        """Treadmill should be more lenient (higher score) — rolling band adds variability."""
        bio = RearBioMetrics(rear_quality="high")
        score_road = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"surface": "road"},
        )
        score_treadmill = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"surface": "treadmill"},
        )
        assert score_treadmill > score_road

    def test_trail_same_as_road(self):
        """Trail and road should produce identical scores."""
        bio = RearBioMetrics(rear_quality="high")
        score_road = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"surface": "road"},
        )
        score_trail = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=self._MODERATE_REAR,
            runner_profile={"surface": "trail"},
        )
        assert score_trail == score_road

    def test_fixed_thresholds_not_affected_by_height(self):
        """Pelvic drop and eversion thresholds should NOT change with height."""
        bio = RearBioMetrics(rear_quality="high")
        rm = {
            "drift_norm": 0.01,
            "ankle_offset_norm": 0.01,
            "base_of_support_norm": 0.50,
            "rear_symmetry_score": 90.0,
            "pelvic_drop_deg": 11.0,  # just above 10° threshold
        }
        # Short runner
        score_short = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=rm,
            runner_profile={"height_cm": 155, "weight_kg": 55},
        )
        # Tall runner (same BMI range)
        score_tall = compute_energy_score(
            bio, analysis_type="rear", rear_metrics=rm,
            runner_profile={"height_cm": 195, "weight_kg": 85},
        )
        # Both normal BMI — should get same pelvic penalty
        assert score_short == score_tall


# ---------------------------------------------------------------------------
# Métriques tab — rear-view-differentiators-proposal.pdf
# ---------------------------------------------------------------------------
class TestRearDifferentiatorMetrics:
    """Verify the four cards from documents/rear-view-differentiators-proposal.pdf."""

    def setup_method(self):
        from core.pose import rear_metrics
        self.rm = rear_metrics

    def test_peak_velocity_returns_max_not_mean(self):
        # 1 deg jump per frame at 100 fps = 100 deg/s, then 5 deg jump = 500 deg/s.
        # Mean would be 300; spec asks for peak.
        series = [0.0, 1.0, 2.0, 3.0, 8.0]
        peak = self.rm._peak_angular_velocity_deg_s(series, fps=100.0)
        assert peak == pytest.approx(500.0, abs=1.0)

    def test_peak_velocity_buckets_match_pdf(self):
        # PDF: <150 slow, 150–300 moderate, >300 fast (per Métrique 1).
        slow = self.rm._peak_angular_velocity_deg_s([0.0, 0.5, 1.0, 1.5, 2.0], fps=100.0)
        fast = self.rm._peak_angular_velocity_deg_s([0.0, 1.0, 2.0, 3.0, 7.0], fps=100.0)
        assert slow is not None and slow < 150.0
        assert fast is not None and fast > 300.0

    def test_arch_collapse_is_max_minus_min_over_max(self):
        # Single side, area goes from 0.10 to 0.20 → ratio = 0.50 → 50%.
        out = self.rm._arch_collapse_pct(
            left_tripod_series=[0.10, 0.15, 0.20, 0.18, 0.12],
            right_tripod_series=[],
        )
        assert out == pytest.approx(50.0, abs=0.5)

    def test_arch_collapse_averages_left_and_right(self):
        # Left collapses 50%, right collapses 10% → mean 30%.
        out = self.rm._arch_collapse_pct(
            left_tripod_series=[0.10, 0.20, 0.15, 0.18, 0.12],
            right_tripod_series=[0.10, 0.10, 0.11, 0.10, 0.105],
        )
        assert 25.0 <= out <= 35.0

    def test_arch_collapse_none_on_empty(self):
        assert self.rm._arch_collapse_pct(
            left_tripod_series=[],
            right_tripod_series=[],
        ) is None

    def test_stability_uses_tripod_cv_when_available(self):
        # Steady tripod (low CV) → high stability score (>85% bucket).
        steady = [0.10, 0.101, 0.099, 0.100, 0.102, 0.099, 0.101]
        score = self.rm._tripod_cv_stability(steady, steady)
        assert score is not None and score > 85.0

    def test_stability_falls_back_when_tripod_unusable(self):
        # No tripod data → must fall back to drift+pelvic+eversion composite,
        # not return None.
        score = self.rm._foot_stability_pct(
            left_tripod_series=[],
            right_tripod_series=[],
            drift_avg=0.05,
            pelvic_series=[1.0, 2.0, 1.5, 1.8, 2.1, 1.4],
            left_eversion_series=[3.0, 4.0, 3.5, 3.8, 4.1, 3.6],
            right_eversion_series=[3.0, 4.0, 3.5, 3.8, 4.1, 3.6],
        )
        assert score is not None and 0.0 <= score <= 100.0
