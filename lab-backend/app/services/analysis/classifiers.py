# app/services/analysis/classifiers.py

from __future__ import annotations

import math
from typing import Any, Dict, Optional, Literal, Tuple, Union

from app.schemas import SideBioMetrics, RearBioMetrics
from app.utils.normalize import safe_float as _safe_float
from app.services.analysis.thresholds import (
    PRONATION_SUPINATION_THRESHOLD,
    PRONATION_PRONATION_THRESHOLD,
    PELVIC_DROP_STABLE_MAX,
    FOOT_PROGRESSION_TOE_OUT_THRESHOLD,
    FOOT_PROGRESSION_TOE_IN_THRESHOLD,
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
    TRUNK_INCLINATION_EXCESSIVE_THRESHOLD,
    TRUNK_INCLINATION_NORMAL_MIN,
    BALANCE_GOOD_SYMMETRY_MIN,
    BALANCE_ASYMMETRY_MIN,
    GAIT_HIGH_OSC_THRESHOLD,
    GAIT_STIFF_KNEE_THRESHOLD,
    GAIT_ASYMMETRIC_SYM_THRESHOLD,
    GAIT_LONG_CONTACT_THRESHOLD,
    GAIT_SLOW_CADENCE_THRESHOLD,
    GAIT_SHORT_CONTACT_THRESHOLD,
    MOTION_GROUNDED_MAX,
    MOTION_BALANCED_MAX,
    LEGACY_STRIKE_FOREFOOT_KNEE,
    LEGACY_STRIKE_FOREFOOT_CT,
    LEGACY_STRIKE_MIDFOOT_KNEE_MIN,
    LEGACY_STRIKE_MIDFOOT_KNEE_MAX,
)

AnalysisType = Literal["rear", "side"]
BioLike = Union[SideBioMetrics, RearBioMetrics]


# ---------------- Helpers ----------------

def _has_side(analysis_type: Optional[str]) -> bool:
    return str(analysis_type or "").strip().lower() == "side"



# ---------------- Gait ----------------

def classify_gait(bio: BioLike, *, analysis_type: Optional[AnalysisType] = None) -> str:
    at = str(analysis_type or "").strip().lower()

    if isinstance(bio, RearBioMetrics) or at == "rear":
        rear_q = getattr(bio, "rear_quality", None)
        if rear_q == "low":
            return "rear_low_confidence"
        return "rear_alignment_only"

    has_side = _has_side(analysis_type)

    if bio.osc > GAIT_HIGH_OSC_THRESHOLD:
        return "high_oscillation"
    if bio.knee_mean < GAIT_STIFF_KNEE_THRESHOLD:
        return "stiff_runner"
    if bio.sym < GAIT_ASYMMETRIC_SYM_THRESHOLD:
        return "asymmetric"

    if has_side:
        if bio.contact_time > GAIT_LONG_CONTACT_THRESHOLD:
            return "long_contact"
        if bio.cadence < GAIT_SLOW_CADENCE_THRESHOLD:
            return "slow_cadence"
        if 0 < bio.contact_time < GAIT_SHORT_CONTACT_THRESHOLD:
            return "short_contact"

    return "efficient"


def infer_motion_type(flight_ratio: Optional[float]) -> Optional[str]:
    if flight_ratio is None:
        return None
    try:
        fr = float(flight_ratio)
    except Exception:
        return None
    if not (fr == fr):
        return None
    if 0.0 <= fr <= 1.5:
        fr *= 100.0
    fr = max(0.0, min(100.0, fr))
    if fr < MOTION_GROUNDED_MAX:
        return "grounded"
    if fr < MOTION_BALANCED_MAX:
        return "balanced"
    return "bouncy"


# ---------------- Strike (legacy knee-based, kept for backward compat) ----------------

def infer_strike_pattern(bio: BioLike, *, analysis_type: Optional[AnalysisType] = None) -> Optional[str]:
    if not _has_side(analysis_type):
        return None
    if not isinstance(bio, SideBioMetrics):
        return None
    if bio.contact_time <= 0:
        return None
    if bio.knee_mean < LEGACY_STRIKE_FOREFOOT_KNEE and bio.contact_time < LEGACY_STRIKE_FOREFOOT_CT:
        return "Forefoot tendency"
    if LEGACY_STRIKE_MIDFOOT_KNEE_MIN <= bio.knee_mean <= LEGACY_STRIKE_MIDFOOT_KNEE_MAX:
        return "Midfoot tendency"
    return "Heel tendency"


# ================================================================
# Spec-aligned classification functions (biomechanical parameters)
# ================================================================

# Param 1: Pronation (angle-based)
def classify_pronation_angle(angle_deg: float) -> str:
    """Per-leg pronation label from eversion angle. Spec IDs 1 (right) & 2 (left)."""
    if angle_deg < PRONATION_SUPINATION_THRESHOLD:
        return "supination"
    if angle_deg > PRONATION_PRONATION_THRESHOLD:
        return "pronation"
    return "neutral"


def infer_pronation_from_rear(rear_metrics: Dict[str, Any]) -> str:
    """Combined (average) pronation — kept for backward compat."""
    left_raw = rear_metrics.get("left_ankle_eversion_deg")
    right_raw = rear_metrics.get("right_ankle_eversion_deg")
    if left_raw is None and right_raw is None:
        return "neutral"  # no data available
    left_ev = _safe_float(left_raw) if left_raw is not None else None
    right_ev = _safe_float(right_raw) if right_raw is not None else None
    values = [v for v in (left_ev, right_ev) if v is not None]
    avg = sum(values) / len(values)
    if avg < PRONATION_SUPINATION_THRESHOLD:
        return "supination"
    if avg > PRONATION_PRONATION_THRESHOLD:
        return "pronation"
    return "neutral"


# Param 2: Pelvic Drop
def classify_pelvic_drop(pelvic_drop_deg: float) -> str:
    if abs(pelvic_drop_deg) <= PELVIC_DROP_STABLE_MAX:
        return "stable"
    return "unstable_drop"


# Param 3: Knee Valgus
def classify_knee_valgus(rear_metrics: Dict[str, Any]) -> Tuple[str, str]:
    """Returns (left_label, right_label)."""
    left_v = _safe_float(rear_metrics.get("left_knee_valgus_norm", 0))
    right_v = _safe_float(rear_metrics.get("right_knee_valgus_norm", 0))

    def _label(v: float) -> str:
        if v > KNEE_VALGUS_THRESHOLD:
            return "dynamic_valgus"
        return "aligned"

    return _label(left_v), _label(right_v)


# Param 4: Knee Flexion at Impact
def classify_knee_flexion_at_impact(flexion_deg: float) -> str:
    if flexion_deg < KNEE_FLEXION_IMPACT_STEEP_MAX:
        return "steep"
    if flexion_deg <= KNEE_FLEXION_IMPACT_OPTIMAL_MAX:
        return "optimal"
    return "excessive"


# Param 7: Foot Strike (angle-based)
def classify_foot_strike(angle_deg: float) -> str:
    if angle_deg > FOOT_STRIKE_HEEL_THRESHOLD:
        return "heel"
    if angle_deg >= FOOT_STRIKE_MID_THRESHOLD:
        return "midfoot"
    return "forefoot"


# Param 10: GCT
def classify_gct(gct_ms: int) -> str:
    if gct_ms < GCT_DYNAMIC_MAX:
        return "dynamic"
    if gct_ms <= GCT_STANDARD_MAX:
        return "standard"
    return "long"


# Param 11: Cadence
def classify_cadence(cadence: int) -> str:
    if cadence < CADENCE_LOW_MAX:
        return "low"
    if cadence <= CADENCE_EFFICIENT_MAX:
        return "efficient"
    return "high"


# Param 12: GCT Asymmetry
def classify_gct_asymmetry(pct: float) -> str:
    if pct <= GCT_ASYMMETRY_THRESHOLD:
        return "symmetrical"
    return "asymmetric"


# Param 2b: Foot Angle Progression (rear)
def classify_foot_progression(left_deg: float, right_deg: float) -> Tuple[str, str]:
    """
    Classify L/R foot angle progression.
    Positive = toe-out, Negative = toe-in, ~0 = neutral.
    Spec: evolution of heel-toe vector in transversal/frontal plane.
    """
    def _label(deg: float) -> str:
        if deg > FOOT_PROGRESSION_TOE_OUT_THRESHOLD:
            return "toe_out"
        if deg < FOOT_PROGRESSION_TOE_IN_THRESHOLD:
            return "toe_in"
        return "neutral"
    return _label(left_deg), _label(right_deg)


# Param 15: Balance Score
def classify_balance_score(score_pct: float) -> str:
    """
    % symmetry across L/R biomechanical parameters.
    >= 95% → good_symmetry
    90-95% → asymmetry
    < 90%  → dangerous_asymmetry
    """
    if score_pct >= BALANCE_GOOD_SYMMETRY_MIN:
        return "good_symmetry"
    if score_pct >= BALANCE_ASYMMETRY_MIN:
        return "asymmetry"
    return "dangerous_asymmetry"


def compute_balance_score(params: Dict[str, Any]) -> Optional[float]:
    """
    Compute balance score as the average L/R symmetry across all
    available bilateral parameters. Returns 0-100%.
    """
    pairs = [
        ("knee_flexion_at_impact_left", "knee_flexion_at_impact_right"),
        ("knee_flexion_at_toe_off_left", "knee_flexion_at_toe_off_right"),
        ("knee_flexion_stance_left", "knee_flexion_stance_right"),
        ("knee_flexion_aerial_left", "knee_flexion_aerial_right"),
        ("contact_time_left", "contact_time_right"),
        ("left_ankle_eversion_deg", "right_ankle_eversion_deg"),
        ("left_knee_valgus_norm", "right_knee_valgus_norm"),
        ("left_foot_progression_deg", "right_foot_progression_deg"),
    ]
    ratios = []
    for lk, rk in pairs:
        lv = params.get(lk)
        rv = params.get(rk)
        if lv is None or rv is None:
            continue
        try:
            lf, rf = float(lv), float(rv)
        except (ValueError, TypeError):
            continue
        max_val = max(abs(lf), abs(rf))
        if max_val < 1e-6:
            ratios.append(100.0)  # both ~0 = perfect symmetry
            continue
        diff = abs(lf - rf)
        ratio = max(0.0, 100.0 - (diff / max_val) * 100.0)
        ratios.append(ratio)

    if not ratios:
        return None
    return round(sum(ratios) / len(ratios), 1)


# Param 14: Trunk Inclination
def classify_trunk_inclination(angle_deg: float) -> str:
    if angle_deg > TRUNK_INCLINATION_EXCESSIVE_THRESHOLD:
        return "excessive"
    if angle_deg >= TRUNK_INCLINATION_NORMAL_MIN:
        return "normal"
    return "back"


