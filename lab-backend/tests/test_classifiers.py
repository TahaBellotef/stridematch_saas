"""Tests for biomechanical classification functions."""

from __future__ import annotations

import pytest

from app.services.analysis.classifiers import (
    classify_pronation_angle,
    classify_pelvic_drop,
    classify_knee_valgus,
    classify_knee_flexion_at_impact,
    classify_foot_strike,
    classify_gct,
    classify_cadence,
    classify_gct_asymmetry,
    classify_foot_progression,
    classify_balance_score,
    classify_trunk_inclination,
    classify_gait,
    infer_motion_type,
    infer_strike_pattern,
    infer_pronation_from_rear,
    compute_balance_score,
)
from app.services.analysis.thresholds import (
    PRONATION_SUPINATION_THRESHOLD,
    PRONATION_PRONATION_THRESHOLD,
    PELVIC_DROP_STABLE_MAX,
    KNEE_VALGUS_THRESHOLD,
    KNEE_FLEXION_IMPACT_STEEP_MAX,
    KNEE_FLEXION_IMPACT_OPTIMAL_MAX,
    FOOT_STRIKE_HEEL_THRESHOLD,
    FOOT_STRIKE_MID_THRESHOLD,
    GCT_DYNAMIC_MAX,
    GCT_STANDARD_MAX,
    CADENCE_LOW_MAX,
    CADENCE_EFFICIENT_MAX,
    GCT_ASYMMETRY_THRESHOLD,
    FOOT_PROGRESSION_TOE_OUT_THRESHOLD,
    FOOT_PROGRESSION_TOE_IN_THRESHOLD,
    BALANCE_GOOD_SYMMETRY_MIN,
    BALANCE_ASYMMETRY_MIN,
    TRUNK_INCLINATION_EXCESSIVE_THRESHOLD,
    TRUNK_INCLINATION_NORMAL_MIN,
)
from app.schemas import SideBioMetrics, RearBioMetrics


# ---- Pronation ----

class TestClassifyPronationAngle:
    def test_supination(self):
        assert classify_pronation_angle(PRONATION_SUPINATION_THRESHOLD - 1) == "supination"

    def test_neutral(self):
        assert classify_pronation_angle(0.0) == "neutral"

    def test_pronation(self):
        assert classify_pronation_angle(PRONATION_PRONATION_THRESHOLD + 1) == "pronation"

    def test_boundary_low(self):
        assert classify_pronation_angle(PRONATION_SUPINATION_THRESHOLD) == "neutral"

    def test_boundary_high(self):
        assert classify_pronation_angle(PRONATION_PRONATION_THRESHOLD) == "neutral"


class TestInferPronationFromRear:
    def test_neutral(self):
        m = {"left_ankle_eversion_deg": 2.0, "right_ankle_eversion_deg": -2.0}
        assert infer_pronation_from_rear(m) == "neutral"

    def test_pronation(self):
        m = {"left_ankle_eversion_deg": 8.0, "right_ankle_eversion_deg": 6.0}
        assert infer_pronation_from_rear(m) == "pronation"

    def test_supination(self):
        m = {"left_ankle_eversion_deg": -7.0, "right_ankle_eversion_deg": -8.0}
        assert infer_pronation_from_rear(m) == "supination"


# ---- Pelvic Drop ----

class TestClassifyPelvicDrop:
    def test_stable(self):
        assert classify_pelvic_drop(5.0) == "stable"

    def test_stable_negative(self):
        assert classify_pelvic_drop(-8.0) == "stable"

    def test_unstable(self):
        assert classify_pelvic_drop(PELVIC_DROP_STABLE_MAX + 1) == "unstable_drop"

    def test_boundary(self):
        assert classify_pelvic_drop(PELVIC_DROP_STABLE_MAX) == "stable"


# ---- Knee Valgus ----

class TestClassifyKneeValgus:
    def test_both_aligned(self):
        m = {"left_knee_valgus_norm": 0.02, "right_knee_valgus_norm": 0.03}
        assert classify_knee_valgus(m) == ("aligned", "aligned")

    def test_left_valgus(self):
        m = {"left_knee_valgus_norm": 0.08, "right_knee_valgus_norm": 0.01}
        assert classify_knee_valgus(m) == ("dynamic_valgus", "aligned")

    def test_both_valgus(self):
        m = {"left_knee_valgus_norm": 0.1, "right_knee_valgus_norm": 0.2}
        assert classify_knee_valgus(m) == ("dynamic_valgus", "dynamic_valgus")


# ---- Knee Flexion at Impact ----

class TestClassifyKneeFlexionAtImpact:
    def test_steep(self):
        assert classify_knee_flexion_at_impact(10.0) == "steep"

    def test_optimal(self):
        assert classify_knee_flexion_at_impact(20.0) == "optimal"

    def test_excessive(self):
        assert classify_knee_flexion_at_impact(30.0) == "excessive"

    def test_boundary_steep_optimal(self):
        assert classify_knee_flexion_at_impact(KNEE_FLEXION_IMPACT_STEEP_MAX) == "optimal"

    def test_boundary_optimal_excessive(self):
        assert classify_knee_flexion_at_impact(KNEE_FLEXION_IMPACT_OPTIMAL_MAX) == "optimal"


# ---- Foot Strike ----

class TestClassifyFootStrike:
    def test_heel(self):
        assert classify_foot_strike(10.0) == "heel"

    def test_midfoot(self):
        assert classify_foot_strike(0.0) == "midfoot"

    def test_forefoot(self):
        assert classify_foot_strike(-10.0) == "forefoot"

    def test_boundary_heel(self):
        assert classify_foot_strike(FOOT_STRIKE_HEEL_THRESHOLD) == "midfoot"

    def test_boundary_forefoot(self):
        assert classify_foot_strike(FOOT_STRIKE_MID_THRESHOLD) == "midfoot"


# ---- GCT ----

class TestClassifyGCT:
    def test_dynamic(self):
        assert classify_gct(220) == "dynamic"

    def test_standard(self):
        assert classify_gct(250) == "standard"

    def test_long(self):
        assert classify_gct(300) == "long"

    def test_boundary(self):
        assert classify_gct(GCT_DYNAMIC_MAX) == "standard"
        assert classify_gct(GCT_STANDARD_MAX) == "standard"


# ---- Cadence ----

class TestClassifyCadence:
    def test_low(self):
        assert classify_cadence(150) == "low"

    def test_efficient(self):
        assert classify_cadence(170) == "efficient"

    def test_high(self):
        assert classify_cadence(190) == "high"

    def test_boundary(self):
        assert classify_cadence(CADENCE_LOW_MAX) == "efficient"
        assert classify_cadence(CADENCE_EFFICIENT_MAX) == "efficient"


# ---- GCT Asymmetry ----

class TestClassifyGCTAsymmetry:
    def test_symmetrical(self):
        assert classify_gct_asymmetry(2.0) == "symmetrical"

    def test_asymmetric(self):
        assert classify_gct_asymmetry(5.0) == "asymmetric"

    def test_boundary(self):
        assert classify_gct_asymmetry(GCT_ASYMMETRY_THRESHOLD) == "symmetrical"


# ---- Foot Progression ----

class TestClassifyFootProgression:
    def test_neutral_both(self):
        assert classify_foot_progression(0.0, 0.0) == ("neutral", "neutral")

    def test_toe_out(self):
        l, r = classify_foot_progression(10.0, 0.0)
        assert l == "toe_out"
        assert r == "neutral"

    def test_toe_in(self):
        l, r = classify_foot_progression(-10.0, -10.0)
        assert l == "toe_in"
        assert r == "toe_in"


# ---- Balance Score ----

class TestClassifyBalanceScore:
    def test_good_symmetry(self):
        assert classify_balance_score(97.0) == "good_symmetry"

    def test_asymmetry(self):
        assert classify_balance_score(92.0) == "asymmetry"

    def test_dangerous(self):
        assert classify_balance_score(85.0) == "dangerous_asymmetry"

    def test_boundary(self):
        assert classify_balance_score(BALANCE_GOOD_SYMMETRY_MIN) == "good_symmetry"
        assert classify_balance_score(BALANCE_ASYMMETRY_MIN) == "asymmetry"


class TestComputeBalanceScore:
    def test_perfect_symmetry(self):
        params = {
            "left_ankle_eversion_deg": 3.0,
            "right_ankle_eversion_deg": 3.0,
        }
        score = compute_balance_score(params)
        assert score == 100.0

    def test_no_data(self):
        assert compute_balance_score({}) is None

    def test_partial_data(self):
        params = {
            "left_ankle_eversion_deg": 4.0,
            "right_ankle_eversion_deg": 2.0,
        }
        score = compute_balance_score(params)
        assert score is not None
        assert 0.0 <= score <= 100.0


# ---- Trunk Inclination ----

class TestClassifyTrunkInclination:
    def test_excessive(self):
        assert classify_trunk_inclination(15.0) == "excessive"

    def test_normal(self):
        assert classify_trunk_inclination(5.0) == "normal"

    def test_back(self):
        assert classify_trunk_inclination(-3.0) == "back"


# ---- Gait ----

class TestClassifyGait:
    def test_rear_high_quality(self):
        bio = RearBioMetrics(rear_quality="high")
        assert classify_gait(bio, analysis_type="rear") == "rear_alignment_only"

    def test_rear_low_quality(self):
        bio = RearBioMetrics(rear_quality="low")
        assert classify_gait(bio, analysis_type="rear") == "rear_low_confidence"

    def test_side_efficient(self, side_bio):
        assert classify_gait(side_bio, analysis_type="side") == "efficient"

    def test_side_high_oscillation(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=175, osc=15.0, sym=92.0, contact_time=255,
        )
        assert classify_gait(bio, analysis_type="side") == "high_oscillation"


# ---- Motion Type ----

class TestInferMotionType:
    def test_none_input(self):
        assert infer_motion_type(None) is None

    def test_grounded(self):
        assert infer_motion_type(10.0) == "grounded"

    def test_balanced(self):
        assert infer_motion_type(25.0) == "balanced"

    def test_bouncy(self):
        assert infer_motion_type(40.0) == "bouncy"

    def test_fraction_to_percent_conversion(self):
        # 0.25 → 25% → balanced
        assert infer_motion_type(0.25) == "balanced"


# ---- Strike Pattern ----

class TestInferStrikePattern:
    def test_none_for_rear(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=175, osc=7.5, sym=92.0, contact_time=255,
        )
        assert infer_strike_pattern(bio, analysis_type="rear") is None

    def test_none_for_zero_contact(self):
        bio = SideBioMetrics(
            knee_mean=160.0, knee_left_mean=158.0, knee_right_mean=162.0,
            cadence=175, osc=7.5, sym=92.0, contact_time=0,
        )
        assert infer_strike_pattern(bio, analysis_type="side") is None

    def test_heel_tendency(self):
        bio = SideBioMetrics(
            knee_mean=170.0, knee_left_mean=170.0, knee_right_mean=170.0,
            cadence=175, osc=7.5, sym=92.0, contact_time=260,
        )
        result = infer_strike_pattern(bio, analysis_type="side")
        assert result == "Heel tendency"
