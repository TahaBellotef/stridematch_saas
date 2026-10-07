"""
Typed data structures for the analysis pipeline.

Replaces generic Dict[str, float] / Dict[str, Any] with TypedDicts
so that field names are documented, autocomplete works, and typos
are caught by static analysis (mypy / pyright).
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


# =============================================================================
# Side pipeline
# =============================================================================

class SideFrameData(TypedDict):
    """Per-frame side-view landmark positions (canvas pixels)."""

    L_sh: tuple[float, float]
    R_sh: tuple[float, float]
    L_hip: tuple[float, float]
    R_hip: tuple[float, float]
    L_knee: tuple[float, float]
    R_knee: tuple[float, float]
    L_ankle: tuple[float, float]
    R_ankle: tuple[float, float]
    L_heel: tuple[float, float]
    R_heel: tuple[float, float]
    L_toe: tuple[float, float]
    R_toe: tuple[float, float]
    L_wrist: tuple[float, float]
    R_wrist: tuple[float, float]
    mid_shoulder: tuple[float, float]
    mid_hip: tuple[float, float]


class _SideMetricsRequired(TypedDict):
    """Fields always present in aggregate_side_metrics output."""

    knee_mean: float
    knee_left_mean: float
    knee_right_mean: float
    cadence: int
    osc: float
    sym: float
    contact_time: int
    contact_time_left: int
    contact_time_right: int
    flight_ratio: float


class SideMetricsPayload(_SideMetricsRequired, total=False):
    """
    Full output of aggregate_side_metrics().

    Required fields are always present; optional fields come from
    spec-dependent computations (knee flexion phases, foot strike angles,
    advanced metrics) that may not be available for every video.
    """

    # Heuristic strike (may be None)
    strike_pattern: Optional[str]

    # Spec: knee flexion at impact (param 4)
    knee_flexion_at_impact_left: float
    knee_flexion_at_impact_right: float

    # Spec: knee flexion at toe off (param 5)
    knee_flexion_at_toe_off_left: float
    knee_flexion_at_toe_off_right: float

    # Spec: phase knee flexion (params 6-9)
    knee_flexion_stance_left: float
    knee_flexion_stance_right: float
    knee_flexion_aerial_left: float
    knee_flexion_aerial_right: float

    # Spec: foot strike angle (params 14-15)
    foot_strike_angle_deg: Optional[float]
    foot_strike_angle_left_deg: Optional[float]
    foot_strike_angle_right_deg: Optional[float]

    # GCT asymmetry (spec param 12)
    gct_asymmetry_pct: float

    # Advanced metrics (from compute_advanced_side_metrics)
    trunk_lean: float
    trunk_lean_left: Optional[float]
    trunk_lean_right: Optional[float]
    trunk_stability: float
    arm_swing: Optional[float]
    hip_mobility: Optional[float]


# =============================================================================
# Rear pipeline
# =============================================================================

class RearFrameData(TypedDict):
    """Per-frame rear-view metrics (all float, no geometry)."""

    knee_width_norm: float
    ankle_width_norm: float
    ankle_knee_drift_norm: float
    drift_norm: float
    left_ankle_offset_norm: float
    right_ankle_offset_norm: float
    ankle_alignment_norm: float
    left_knee_offset_norm: float
    right_knee_offset_norm: float
    knee_alignment_norm: float
    base_of_support_norm: float
    knee_window_norm: float
    pelvic_drop_deg: float
    ankle_offset_norm: float
    left_heel_offset_norm: float
    right_heel_offset_norm: float
    left_foot_progression_deg: float
    right_foot_progression_deg: float
    baseline_px: float
    left_ankle_y: float
    right_ankle_y: float
    pelvis_dx_norm: float
    foot_L_tripod_area_norm: float
    foot_R_tripod_area_norm: float
    foot_L_yaw_deg: float
    foot_R_yaw_deg: float
    left_ankle_eversion_deg: float
    right_ankle_eversion_deg: float
    left_knee_valgus_norm: float
    right_knee_valgus_norm: float


class _RearSessionRequired(TypedDict):
    """Fields always present in aggregate_rear_metrics output."""

    knee_width_norm: float
    ankle_width_norm: float
    ankle_knee_drift_norm: float
    drift_norm: float
    left_ankle_offset_norm: float
    right_ankle_offset_norm: float
    ankle_alignment_norm: float
    left_knee_offset_norm: float
    right_knee_offset_norm: float
    knee_alignment_norm: float
    ankle_offset_norm: float
    base_of_support_norm: float
    knee_window_norm: float
    pelvic_drop_deg: float
    left_foot_progression_deg: float
    right_foot_progression_deg: float
    left_heel_whip_deg: float
    right_heel_whip_deg: float
    left_heel_offset_norm: float
    right_heel_offset_norm: float
    rear_symmetry_score: float
    pelvis_dx_norm: float
    foot_L_tripod_area_norm: float
    foot_R_tripod_area_norm: float
    foot_L_yaw_deg: float
    foot_R_yaw_deg: float
    left_ankle_eversion_deg: float
    right_ankle_eversion_deg: float
    left_knee_valgus_norm: float
    right_knee_valgus_norm: float


class RearSessionMetrics(_RearSessionRequired, total=False):
    """
    Output of aggregate_rear_metrics().

    Optional fields are computed only when fps > 0 and enough
    ankle Y data is available for cadence/GCT estimation.
    """

    # GCT from rear ankle Y (optional — requires fps)
    contact_time_left: float
    contact_time_right: float
    contact_time: float
    gct_asymmetry_pct: float


class RearQualityInfo(TypedDict):
    """Quality/confidence metadata from RearMetricsConsumer."""

    accepted_frames: int
    valid_frames: int
    rejected_low_conf: int
    rejected_bad_map: int
    pose_seen: bool


class _RearConsumerResultRequired(TypedDict):
    """Fields always present in RearMetricsConsumer.result()."""

    hint: str


class RearConsumerResult(_RearConsumerResultRequired, total=False):
    """
    Full output of RearMetricsConsumer.result().

    Extends the aggregated session metrics with quality info,
    optional cadence, transform metadata, and geometry.
    """

    # All keys from RearSessionMetrics are present when not fallback
    knee_width_norm: float
    ankle_width_norm: float
    drift_norm: float
    pelvic_drop_deg: float
    rear_symmetry_score: float
    left_ankle_eversion_deg: float
    right_ankle_eversion_deg: float
    left_knee_valgus_norm: float
    right_knee_valgus_norm: float
    # ... (all other RearSessionMetrics keys are also present)

    quality: RearQualityInfo
    cadence: int
    transform: Dict[str, Any]

    # Stable geometry (median-aggregated)
    midline_x_px: float
    pelvis_center_px: List[float]
    foot_L_tripod_px: Dict[str, List[float]]
    foot_R_tripod_px: Dict[str, List[float]]

    # GCT from rear ankle Y
    contact_time_left: float
    contact_time_right: float
    contact_time: float
    gct_asymmetry_pct: float
