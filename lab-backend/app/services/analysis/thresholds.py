"""
Centralised biomechanical classification thresholds.

All values are sourced from the biomechanician spec document (Feb 2026).
Each constant is annotated with the spec parameter ID for traceability.
When thresholds change, update this single file — classifiers.py, runner.py,
and any downstream consumers import from here.
"""

from __future__ import annotations


# =============================================================================
# Spec Param 1: Pronation (ankle eversion angle, degrees)
# =============================================================================
# Positive = inward (pronation), negative = outward (supination)
PRONATION_SUPINATION_THRESHOLD = -5.0   # < -5° → supination
PRONATION_PRONATION_THRESHOLD = 5.0     # > 5°  → pronation
# Between -5° and 5° → neutral

# =============================================================================
# Spec Param 2: Pelvic Drop (degrees)
# =============================================================================
PELVIC_DROP_STABLE_MAX = 10.0  # |deg| <= 10° → stable; > 10° → unstable_drop

# =============================================================================
# Spec Param 2b: Foot Angle Progression (degrees, rear view)
# =============================================================================
# Positive = toe-out, negative = toe-in
FOOT_PROGRESSION_TOE_OUT_THRESHOLD = 5.0   # > 5°  → toe_out
FOOT_PROGRESSION_TOE_IN_THRESHOLD = -5.0   # < -5° → toe_in

# =============================================================================
# Spec Param 3: Knee Valgus (normalised perpendicular distance)
# =============================================================================
# Positive = inward (valgus); normalised by shoulder/hip baseline
KNEE_VALGUS_THRESHOLD = 0.05  # > 0.05 → dynamic_valgus; else aligned

# =============================================================================
# Spec Param 4: Knee Flexion at Initial Contact (degrees)
# =============================================================================
KNEE_FLEXION_IMPACT_STEEP_MAX = 15.0    # < 15° → steep
KNEE_FLEXION_IMPACT_OPTIMAL_MAX = 25.0  # 15–25° → optimal; > 25° → excessive

# =============================================================================
# Spec Param 7: Foot Strike Angle (degrees)
# =============================================================================
# Angle between foot vector (HEEL→TOE) and horizontal at IC
FOOT_STRIKE_HEEL_THRESHOLD = 5.0   # > 5°  → heel strike
FOOT_STRIKE_MID_THRESHOLD = -5.0   # -5° to 5° → midfoot; < -5° → forefoot

# =============================================================================
# Spec Param 10: Ground Contact Time (ms)
# =============================================================================
GCT_DYNAMIC_MAX = 240    # < 240 ms → dynamic
GCT_STANDARD_MAX = 270   # 240–270 ms → standard; > 270 → long

# =============================================================================
# Spec Param 11: Cadence (steps per minute)
# =============================================================================
CADENCE_LOW_MAX = 165     # < 165 spm → low
CADENCE_EFFICIENT_MAX = 180  # 165–180 spm → efficient; > 180 → high

# =============================================================================
# Spec Param 12: GCT Asymmetry (percentage)
# =============================================================================
GCT_ASYMMETRY_THRESHOLD = 3.0  # <= 3% → symmetrical; > 3% → asymmetric

# =============================================================================
# Spec Param 14: Trunk Inclination (degrees, signed: positive = forward)
# =============================================================================
TRUNK_INCLINATION_EXCESSIVE_THRESHOLD = 10.0  # > 10° → excessive
TRUNK_INCLINATION_NORMAL_MIN = 0.0            # 0–10° → normal; < 0° → back

# =============================================================================
# Spec Param 15: Balance Score (percentage)
# =============================================================================
BALANCE_GOOD_SYMMETRY_MIN = 95.0   # >= 95% → good_symmetry
BALANCE_ASYMMETRY_MIN = 90.0       # 90–95% → asymmetry; < 90% → dangerous

# =============================================================================
# Gait classification (side-view heuristics)
# =============================================================================
GAIT_HIGH_OSC_THRESHOLD = 10.0         # osc > 10 cm
GAIT_STIFF_KNEE_THRESHOLD = 155.0      # knee_mean < 155°
GAIT_ASYMMETRIC_SYM_THRESHOLD = 80.0   # sym < 80%
GAIT_LONG_CONTACT_THRESHOLD = 300      # contact_time > 300 ms
GAIT_SLOW_CADENCE_THRESHOLD = 150      # cadence < 150 spm
GAIT_SHORT_CONTACT_THRESHOLD = 240     # contact_time < 240 ms (and > 0)

# =============================================================================
# Motion type (flight ratio thresholds, percentage)
# =============================================================================
MOTION_GROUNDED_MAX = 18.0   # flight_ratio < 18% → grounded
MOTION_BALANCED_MAX = 30.0   # 18–30% → balanced; > 30% → bouncy

# =============================================================================
# Legacy strike pattern (knee-angle based, kept for backward compat)
# =============================================================================
LEGACY_STRIKE_FOREFOOT_KNEE = 155.0    # knee_mean < 155° AND ct < 240
LEGACY_STRIKE_FOREFOOT_CT = 240        # contact_time < 240 ms
LEGACY_STRIKE_MIDFOOT_KNEE_MIN = 155.0
LEGACY_STRIKE_MIDFOOT_KNEE_MAX = 165.0

# =============================================================================
# Rear-view pipeline (RearMetricConfig defaults)
# =============================================================================
REAR_MIN_VISIBILITY = 0.35        # body landmark confidence gate
REAR_MIN_VISIBILITY_FOOT = 0.45   # foot landmark confidence gate
REAR_MIN_BASELINE_PX = 40.0       # minimum shoulder/hip width to proceed
REAR_TRIM_RATIO = 0.1             # trimmed mean outlier fraction


# =============================================================================
# Running Score — side penalty coefficients
# =============================================================================
# Used in _compute_side_score() (metrics.py)
SCORE_SIDE_OSC_PENALTY_PER_CM = 4.5       # pts per cm above osc threshold
SCORE_SIDE_GCT_PENALTY_PER_MS = 0.12      # pts per ms above GCT threshold
SCORE_SIDE_CADENCE_PENALTY_PER_SPM = 0.6  # pts per spm below cadence threshold
SCORE_SIDE_SYM_PENALTY_PER_PCT = 1.3      # pts per % below 90% symmetry
SCORE_SIDE_SYM_THRESHOLD = 90.0           # symmetry below this triggers penalty

# Side base thresholds (before profile adjustments)
SCORE_SIDE_OSC_BASE = 9.0                 # cm — base oscillation threshold
SCORE_SIDE_GCT_BASE = 280.0              # ms — base ground contact threshold
SCORE_SIDE_CADENCE_BASE = 160.0          # spm — base cadence threshold

# Side profile adjustment increments
SCORE_SIDE_HEIGHT_REF_CM = 170.0          # reference height for osc adjust
SCORE_SIDE_HEIGHT_OSC_PER_10CM = 0.5      # +cm osc tolerance per 10cm above ref
SCORE_SIDE_WEIGHT_REF_KG = 75.0           # reference weight for GCT adjust
SCORE_SIDE_WEIGHT_GCT_PER_10KG = 5.0      # +ms GCT tolerance per 10kg above ref

# Side penalty scale by level
SCORE_SIDE_PENALTY_SCALE_BEGINNER = 0.75
SCORE_SIDE_PENALTY_SCALE_ADVANCED = 1.1
SCORE_SIDE_PENALTY_SCALE_DEFAULT = 1.0


# =============================================================================
# Running Score — rear penalty coefficients
# =============================================================================
# Used in _compute_rear_score() (metrics.py)
# Validated by biomechanician (April 2026)

# Point 3: Drift — increased threshold (camera alignment tolerance), reduced rate
SCORE_REAR_DRIFT_SCALE = 1000.0           # penalty multiplier for drift_norm
SCORE_REAR_DRIFT_THRESHOLD = 0.06         # 6% of hip width (was 3%, increased for camera tolerance)

# Point 4: Offset — same camera tolerance logic as drift
SCORE_REAR_OFFSET_SCALE = 1100.0          # penalty multiplier for ankle_offset_norm
SCORE_REAR_OFFSET_THRESHOLD = 0.05        # 5% of hip width (was 2%)

# Point 2: Symmetry — option C (literature-based): 80% threshold, 0.4 pts/%
SCORE_REAR_SYM_PENALTY_PER_PCT = 0.4      # pts per % below symmetry threshold
SCORE_REAR_SYM_THRESHOLD = 80.0           # literature-based threshold
SCORE_REAR_SYM_CLAMP_MIN = 15.0           # clamp raw symmetry score floor
SCORE_REAR_SYM_FLOOR = 20.0              # minimum score after symmetry penalty

# Point 5: BoS — same penalty rate for narrow and wide (no height adjustment)
SCORE_REAR_BOS_NARROW_THRESHOLD = 0.35    # base_of_support below this = narrow
SCORE_REAR_BOS_NARROW_SCALE = 100.0       # unified penalty rate
SCORE_REAR_BOS_WIDE_THRESHOLD = 0.80      # base_of_support above this = wide
SCORE_REAR_BOS_WIDE_SCALE = 100.0         # unified penalty rate (was 90 narrow/120 wide)

# Point 6: Pelvic drop — fixed threshold, no height/age adjustments
SCORE_REAR_PELVIC_THRESHOLD = 10.0        # degrees — fixed
SCORE_REAR_PELVIC_PENALTY_PER_DEG = 3.0   # pts per degree over threshold

# Point 7: Eversion — fixed 10° threshold, no age adjustment
SCORE_REAR_EVERSION_THRESHOLD = 10.0      # degrees — fixed
SCORE_REAR_EVERSION_PENALTY_PER_DEG = 1.5 # pts per degree over threshold

# Point 8: Valgus — no weight adjustment, no beginner bonus, gender only
SCORE_REAR_VALGUS_MALE_THRESHOLD = 0.05   # valgus threshold for male
SCORE_REAR_VALGUS_FEMALE_THRESHOLD = 0.06 # valgus threshold for female (wider Q-angle)
SCORE_REAR_VALGUS_SCALE = 200.0           # penalty multiplier per unit above threshold

# Point 1: BMI-based penalty damping — no age adjustment
# High BMI increases penalty harshness; normal BMI has no effect.
SCORE_REAR_BMI_NORMAL_UPPER = 25.0         # BMI at or below this = no adjustment
SCORE_REAR_BMI_PENALTY_PER_UNIT = 0.02     # +2% penalty harshness per BMI unit above 25
SCORE_REAR_BMI_OVERWEIGHT_BASE = 1.0       # penalty_scale starts at 1.0 for normal BMI
SCORE_REAR_BMI_MAX_SCALE = 1.20            # cap: penalties can be at most 20% harsher
