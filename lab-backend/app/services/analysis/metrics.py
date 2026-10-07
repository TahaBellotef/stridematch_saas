# app/services/analysis/metrics.py

from __future__ import annotations

import logging
from typing import Any, Dict, Optional, Literal, Union, cast

logger = logging.getLogger(__name__)

from app.schemas import SideBioMetrics, RearBioMetrics
from app.services.analysis.thresholds import (
    # Side score constants
    SCORE_SIDE_OSC_PENALTY_PER_CM,
    SCORE_SIDE_GCT_PENALTY_PER_MS,
    SCORE_SIDE_CADENCE_PENALTY_PER_SPM,
    SCORE_SIDE_SYM_PENALTY_PER_PCT,
    SCORE_SIDE_SYM_THRESHOLD,
    SCORE_SIDE_OSC_BASE,
    SCORE_SIDE_GCT_BASE,
    SCORE_SIDE_CADENCE_BASE,
    SCORE_SIDE_HEIGHT_REF_CM,
    SCORE_SIDE_HEIGHT_OSC_PER_10CM,
    SCORE_SIDE_WEIGHT_REF_KG,
    SCORE_SIDE_WEIGHT_GCT_PER_10KG,
    SCORE_SIDE_PENALTY_SCALE_BEGINNER,
    SCORE_SIDE_PENALTY_SCALE_ADVANCED,
    SCORE_SIDE_PENALTY_SCALE_DEFAULT,
    # Rear score constants
    SCORE_REAR_DRIFT_SCALE,
    SCORE_REAR_OFFSET_SCALE,
    SCORE_REAR_DRIFT_THRESHOLD,
    SCORE_REAR_OFFSET_THRESHOLD,
    SCORE_REAR_SYM_PENALTY_PER_PCT,
    SCORE_REAR_SYM_THRESHOLD,
    SCORE_REAR_SYM_CLAMP_MIN,
    SCORE_REAR_SYM_FLOOR,
    SCORE_REAR_BOS_NARROW_THRESHOLD,
    SCORE_REAR_BOS_NARROW_SCALE,
    SCORE_REAR_BOS_WIDE_THRESHOLD,
    SCORE_REAR_BOS_WIDE_SCALE,
    SCORE_REAR_PELVIC_THRESHOLD,
    SCORE_REAR_PELVIC_PENALTY_PER_DEG,
    SCORE_REAR_EVERSION_THRESHOLD,
    SCORE_REAR_EVERSION_PENALTY_PER_DEG,
    SCORE_REAR_VALGUS_MALE_THRESHOLD,
    SCORE_REAR_VALGUS_FEMALE_THRESHOLD,
    SCORE_REAR_VALGUS_SCALE,
    # BMI-based penalty damping
    SCORE_REAR_BMI_NORMAL_UPPER,
    SCORE_REAR_BMI_PENALTY_PER_UNIT,
    SCORE_REAR_BMI_OVERWEIGHT_BASE,
    SCORE_REAR_BMI_MAX_SCALE,
)
from app.services.analysis.pipeline_types import RearSessionMetrics

AnalysisType = Literal["rear", "side"]
BioLike = Union[SideBioMetrics, RearBioMetrics]


# =========================================================
# PUBLIC ENTRYPOINT (used by runner.py + persistence.py)
# =========================================================

def compute_energy_score(
    bio: BioLike,
    *,
    analysis_type: AnalysisType = "side",
    rear_metrics: Optional[Union[RearSessionMetrics, Dict[str, Any]]] = None,
    rear_quality: Optional[Literal["low", "medium", "high"]] = None,
    runner_profile: Optional[Dict[str, Any]] = None,
) -> int:
    """
    Single 0..100 score used by the UI ring.

    - side: efficiency proxy (osc + contact + cadence + temporal symmetry)
    - rear: alignment proxy (rear metrics only; bio is not used)

    runner_profile keys (all optional):
      height_cm, weight_kg, age, gender,
      level, weekly_distance/weeklyDistance, surface
    """
    analysis_type = (analysis_type or "side").strip().lower()  # defensive
    if analysis_type not in ("rear", "side"):
        analysis_type = "side"

    if analysis_type == "side":
        if isinstance(bio, SideBioMetrics):
            return _compute_side_score(bio, runner_profile=runner_profile)
        return 0

    # rear
    return _compute_rear_score(rear_metrics, runner_profile=runner_profile)


# =========================================================
# SIDE SCORE (SideBioMetrics only)
# =========================================================

def _compute_side_score(
    bio: SideBioMetrics,
    *,
    runner_profile: Optional[Dict[str, Any]] = None,
) -> int:
    rp = runner_profile or {}
    height_cm = float(rp.get("height_cm") or rp.get("heightCm") or SCORE_SIDE_HEIGHT_REF_CM)
    weight_kg = float(rp.get("weight_kg") or rp.get("weightKg") or SCORE_SIDE_WEIGHT_REF_KG)
    age = int(rp.get("age") or 35)
    level = rp.get("level", "intermediate")
    weekly_distance = rp.get("weekly_distance") or rp.get("weeklyDistance") or "10_25"
    surface = rp.get("surface", "road")

    # --- Physical-adjusted thresholds ---
    osc_threshold = SCORE_SIDE_OSC_BASE + (height_cm - SCORE_SIDE_HEIGHT_REF_CM) / 10.0 * SCORE_SIDE_HEIGHT_OSC_PER_10CM
    gct_threshold = SCORE_SIDE_GCT_BASE + (weight_kg - SCORE_SIDE_WEIGHT_REF_KG) / 10.0 * SCORE_SIDE_WEIGHT_GCT_PER_10KG

    # Older runners (50+) and heavier runners naturally have lower cadence
    cadence_threshold = SCORE_SIDE_CADENCE_BASE
    if age >= 50:
        cadence_threshold -= (age - 50) * 0.3
    if weight_kg > 90:
        cadence_threshold -= (weight_kg - 90.0) * 0.2

    # --- Training profile adjustments ---
    if level == "beginner":
        osc_threshold += 1.0
        gct_threshold += 15.0
        cadence_threshold -= 5.0
    elif level == "advanced":
        osc_threshold -= 0.5
        gct_threshold -= 5.0
        cadence_threshold += 3.0

    if weekly_distance == "lt_10":
        gct_threshold += 10.0
        cadence_threshold -= 3.0
    elif weekly_distance == "gt_50":
        gct_threshold -= 5.0
        cadence_threshold += 2.0

    if surface == "trail":
        osc_threshold += 1.0
    elif surface == "treadmill":
        osc_threshold -= 0.5
        gct_threshold -= 5.0

    # --- Penalty scale factor based on level ---
    if level == "beginner":
        penalty_scale = SCORE_SIDE_PENALTY_SCALE_BEGINNER
    elif level == "advanced":
        penalty_scale = SCORE_SIDE_PENALTY_SCALE_ADVANCED
    else:
        penalty_scale = SCORE_SIDE_PENALTY_SCALE_DEFAULT

    score = 100.0

    if bio.osc > osc_threshold:
        score -= (bio.osc - osc_threshold) * SCORE_SIDE_OSC_PENALTY_PER_CM * penalty_scale

    if bio.contact_time > gct_threshold:
        score -= (bio.contact_time - gct_threshold) * SCORE_SIDE_GCT_PENALTY_PER_MS * penalty_scale

    if bio.cadence < cadence_threshold:
        score -= (cadence_threshold - bio.cadence) * SCORE_SIDE_CADENCE_PENALTY_PER_SPM * penalty_scale

    if bio.sym < SCORE_SIDE_SYM_THRESHOLD:
        score -= (SCORE_SIDE_SYM_THRESHOLD - bio.sym) * SCORE_SIDE_SYM_PENALTY_PER_PCT

    return int(max(0, min(100, round(score))))


# =========================================================
# REAR SCORE (rear_metrics only)
# =========================================================

def _compute_rear_score(
    rear_metrics: Optional[Union[RearSessionMetrics, Dict[str, Any]]],
    *,
    runner_profile: Optional[Dict[str, Any]] = None,
) -> int:
    """
    Rear-only alignment score (0..100).

    Penalty scaling is based on BMI (IMC):
      - BMI <= 25: no adjustment (penalty_scale = 1.0)
      - BMI > 25: penalties get harsher (+2% per BMI unit above 25)

    Thresholds are fixed (not adjusted by height/age/weight/level).
    Only BMI affects penalty scaling. Only gender affects valgus threshold.
    """
    if not isinstance(rear_metrics, dict) or not rear_metrics:
        return 0

    def f(key: str) -> Optional[float]:
        try:
            v = rear_metrics.get(key)
            return float(v) if v is not None else None
        except Exception:
            return None

    # --- Extract runner profile ---
    rp = runner_profile or {}
    height_cm = float(rp.get("height_cm") or rp.get("heightCm") or 170.0)
    weight_kg = float(rp.get("weight_kg") or rp.get("weightKg") or 75.0)
    gender = rp.get("gender", "male")
    surface = rp.get("surface", "road")

    # --- BMI-based penalty scaling ---
    # BMI = weight(kg) / height(m)^2
    # Normal BMI: no adjustment. High BMI: penalties are harsher.
    height_m = height_cm / 100.0
    bmi = weight_kg / (height_m ** 2) if height_m > 0 else 25.0

    if bmi <= SCORE_REAR_BMI_NORMAL_UPPER:
        penalty_scale = SCORE_REAR_BMI_OVERWEIGHT_BASE
    else:
        penalty_scale = min(
            SCORE_REAR_BMI_MAX_SCALE,
            SCORE_REAR_BMI_OVERWEIGHT_BASE + (bmi - SCORE_REAR_BMI_NORMAL_UPPER) * SCORE_REAR_BMI_PENALTY_PER_UNIT,
        )

    # --- Fixed thresholds (no height/age adjustments) ---
    drift_threshold = SCORE_REAR_DRIFT_THRESHOLD
    bos_narrow = SCORE_REAR_BOS_NARROW_THRESHOLD
    bos_wide = SCORE_REAR_BOS_WIDE_THRESHOLD
    pelvic_threshold = SCORE_REAR_PELVIC_THRESHOLD
    eversion_threshold = SCORE_REAR_EVERSION_THRESHOLD

    # --- Raw metrics ---
    drift = f("drift_norm")
    offset = f("ankle_offset_norm")
    bos = f("base_of_support_norm")
    rear_sym = f("rear_symmetry_score")

    logger.info(
        "Rear score inputs: sym=%.1f drift=%.4f offset=%.4f bos=%.4f "
        "pelvic=%.2f L_ev=%.2f R_ev=%.2f L_val=%.4f R_val=%.4f "
        "bmi=%.1f penalty_scale=%.2f",
        rear_sym or 0, drift or 0, offset or 0, bos or 0,
        f("pelvic_drop_deg") or 0,
        f("left_ankle_eversion_deg") or 0, f("right_ankle_eversion_deg") or 0,
        f("left_knee_valgus_norm") or 0, f("right_knee_valgus_norm") or 0,
        bmi, penalty_scale,
    )

    score = 100.0

    # Symmetry (penalty_scale applied)
    if rear_sym is not None:
        rear_sym = max(SCORE_REAR_SYM_CLAMP_MIN, min(100.0, rear_sym))
        if rear_sym < SCORE_REAR_SYM_THRESHOLD:
            penalty = (SCORE_REAR_SYM_THRESHOLD - rear_sym) * SCORE_REAR_SYM_PENALTY_PER_PCT * penalty_scale
            score -= penalty
            logger.info("  sym penalty: -%.1f (sym=%.1f thr=%.1f) -> score=%.1f", penalty, rear_sym, SCORE_REAR_SYM_THRESHOLD, score)
        score = max(score, SCORE_REAR_SYM_FLOOR)

    # Drift penalty (fixed threshold, penalty_scale applied)
    if drift is not None:
        d = abs(drift)
        if d > drift_threshold:
            penalty = (d - drift_threshold) * SCORE_REAR_DRIFT_SCALE * penalty_scale
            score -= penalty
            logger.info("  drift penalty: -%.1f (d=%.4f thr=%.4f) -> score=%.1f", penalty, d, drift_threshold, score)

    # Offset penalty (penalty_scale applied)
    if offset is not None:
        o = abs(offset)
        if o > SCORE_REAR_OFFSET_THRESHOLD:
            penalty = (o - SCORE_REAR_OFFSET_THRESHOLD) * SCORE_REAR_OFFSET_SCALE * penalty_scale
            score -= penalty
            logger.info("  offset penalty: -%.1f (o=%.4f thr=%.4f) -> score=%.1f", penalty, o, SCORE_REAR_OFFSET_THRESHOLD, score)

    # Base of support penalty (fixed thresholds — already normalized to hip width)
    if bos is not None:
        if bos < bos_narrow:
            penalty = (bos_narrow - bos) * SCORE_REAR_BOS_NARROW_SCALE * penalty_scale
            score -= penalty
            logger.info("  BOS narrow penalty: -%.1f (bos=%.4f thr=%.4f) -> score=%.1f", penalty, bos, bos_narrow, score)
        elif bos > bos_wide:
            penalty = (bos - bos_wide) * SCORE_REAR_BOS_WIDE_SCALE * penalty_scale
            score -= penalty
            logger.info("  BOS wide penalty: -%.1f (bos=%.4f thr=%.4f) -> score=%.1f", penalty, bos, bos_wide, score)

    # Pelvic drop penalty (fixed threshold)
    pelvic = f("pelvic_drop_deg")
    if pelvic is not None:
        pd = abs(pelvic)
        if pd > pelvic_threshold:
            penalty = (pd - pelvic_threshold) * SCORE_REAR_PELVIC_PENALTY_PER_DEG * penalty_scale
            score -= penalty
            logger.info("  pelvic penalty: -%.1f (pd=%.2f thr=%.2f) -> score=%.1f", penalty, pd, pelvic_threshold, score)

    # Eversion penalty (fixed threshold)
    for key in ("left_ankle_eversion_deg", "right_ankle_eversion_deg"):
        ev = f(key)
        if ev is not None:
            ev_abs = abs(ev)
            if ev_abs > eversion_threshold:
                penalty = (ev_abs - eversion_threshold) * SCORE_REAR_EVERSION_PENALTY_PER_DEG * penalty_scale
                score -= penalty
                logger.info("  %s penalty: -%.1f (ev=%.2f thr=%.2f) -> score=%.1f", key, penalty, ev_abs, eversion_threshold, score)

    # Valgus penalty (gender only, no weight/level adjustment — biomechanician point 8)
    valgus_threshold = SCORE_REAR_VALGUS_FEMALE_THRESHOLD if gender == "female" else SCORE_REAR_VALGUS_MALE_THRESHOLD

    for key in ("left_knee_valgus_norm", "right_knee_valgus_norm"):
        val = f(key)
        if val is not None and val > valgus_threshold:
            penalty = (val - valgus_threshold) * SCORE_REAR_VALGUS_SCALE * penalty_scale
            score -= penalty
            logger.info("  %s penalty: -%.1f (val=%.4f thr=%.4f) -> score=%.1f", key, penalty, val, valgus_threshold, score)

    # Surface adjustment (biomechanician point 9)
    # Road and trail are identical — StrideMatch is not for mud/unstable surfaces.
    # Treadmill: rolling band creates more stride variability → more lenient.
    if surface == "treadmill":
        score = score * 0.95 + 100.0 * 0.05

    # No level adjustment (biomechanician point 10)

    final = int(max(0, min(100, round(score))))
    logger.info("  FINAL rear score: %d (raw=%.1f bmi=%.1f)", final, score, bmi)
    return final


# =========================================================
# Flight ratio (SideBioMetrics only)
# =========================================================

def compute_flight_ratio(bio: SideBioMetrics) -> float:
    """
    Fallback / UI-friendly flight ratio computed from cadence + contact time.
    Returns percentage (0..100).
    """
    if bio.cadence <= 0:
        return 0.0

    stride_time_ms = 60000.0 / float(bio.cadence)
    flight_time = max(0.0, stride_time_ms - float(bio.contact_time))
    return round((flight_time / stride_time_ms) * 100.0, 1)
