# app/schemas/analysis.py
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field

PronationType = Literal["neutral", "pronation", "supination"]
AnalysisType = Literal["rear", "side"]


# =========================================================
# Side biomechanics (needs side pipeline)
# =========================================================

class SideBioMetrics(BaseModel):
    """Primary biomechanical metrics extracted from SIDE motion analysis."""
    knee_mean: float
    knee_left_mean: float
    knee_right_mean: float
    cadence: int
    osc: float
    sym: float
    contact_time: int
    pronation: Optional[PronationType] = None

    model_config = ConfigDict(frozen=True)


# =========================================================
# Rear biomechanics (rear-only, minimal & honest)
# =========================================================

class RearBioMetrics(BaseModel):
    """Rear capture provides limited metrics (cadence is optional)."""
    cadence: Optional[int] = None
    pronation: Optional[PronationType] = None

    # Optional: add a stable rear-only summary if you want
    rear_quality: Optional[Literal["low", "medium", "high"]] = None

    model_config = ConfigDict(frozen=True)


# =========================================================
# Advanced gait (optional)
# =========================================================

class AdvancedGaitMetrics(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)

    strike_left_mode: Optional[str] = None
    strike_right_mode: Optional[str] = None

    strike_left_heel_ratio: Optional[float] = None
    strike_left_midfoot_ratio: Optional[float] = None
    strike_left_forefoot_ratio: Optional[float] = None

    strike_right_heel_ratio: Optional[float] = None
    strike_right_midfoot_ratio: Optional[float] = None
    strike_right_forefoot_ratio: Optional[float] = None

    tibial_inclination_left_deg: Optional[float] = None
    tibial_inclination_right_deg: Optional[float] = None

    trunk_lean_deg: Optional[float] = None

    overstride_index: Optional[float] = None
    hip_drop_deg: Optional[float] = None

    arm_swing_imbalance_pct: Optional[float] = None


class GaitProfile(BaseModel):
    bio: Union[SideBioMetrics, RearBioMetrics]
    advanced: Optional[AdvancedGaitMetrics] = None


# =========================================================
# Input metadata
# =========================================================

class AnalysisRequestMetadata(BaseModel):
    surface: Optional[str] = None
    pronation: Optional[PronationType] = None
    preference: Optional[str] = None
    objective: Optional[str] = None
    weekly_distance: Optional[str] = None
    weekly_sessions: Optional[str] = None

    rotate_cw: Optional[Literal[0, 90, 180, 270]] = Field(default=None)
    flip_x: Optional[bool] = Field(default=None)
    flip_y: Optional[bool] = Field(default=None)
    force_mirror: Optional[bool] = Field(default=None)


# =========================================================
# Insights
# =========================================================

class InsightItem(BaseModel):
    id: str
    category: Literal["video", "gait", "knee", "contact", "body", "general", "rear", "feet", "alignment"]
    title: str
    summary: str
    measured: Optional[str] = None
    severity: Literal["info", "focus", "warning"] = "info"
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    source: Literal["rule", "ml", "hybrid"] = "rule"
    recommendations: List[str] = Field(default_factory=list)

    model_config = ConfigDict(frozen=True)


# =========================================================
# Output: result of a single analysis
# =========================================================

class AnalysisResult(BaseModel):
    job_id: str
    user_id: Optional[str] = None
    created_at: datetime

    analysis_type: AnalysisType  # rear | side

    gait_type: str

    # bio can be "side bio" or "rear bio"
    bio: Union[SideBioMetrics, RearBioMetrics]

    remarks: List[str] = Field(default_factory=list)

    pronation: Optional[PronationType] = None

    rear_quality: Optional[Literal["low", "medium", "high"]] = None
    rear_metrics: Optional[Dict[str, Any]] = None

    video_url: str
    rear_video_url: Optional[str] = None
    side_video_url: Optional[str] = None
    snapshot_image: Optional[str] = None

    rear_capture_used: bool = False

    energy_score: Optional[int] = None
    motion_type: Optional[str] = None
    strike_pattern: Optional[str] = None

    contact_time_left: Optional[int] = None
    contact_time_right: Optional[int] = None
    flight_ratio: Optional[float] = None

    trunk_lean: Optional[float] = None
    trunk_stability: Optional[int] = None
    arm_swing: Optional[int] = None
    hip_mobility: Optional[int] = None

    insights: List[InsightItem] = Field(default_factory=list)
    improvement_tips: List[str] = Field(default_factory=list)

    # --- Spec params 1,2: Pronation (per-leg eversion) ---
    left_ankle_eversion_deg: Optional[float] = None
    right_ankle_eversion_deg: Optional[float] = None
    pronation_label: Optional[Literal["Supination", "Neutral", "Pronation"]] = None
    left_pronation_label: Optional[str] = None   # spec ID 2: left leg
    right_pronation_label: Optional[str] = None  # spec ID 1: right leg

    # --- Spec param 2: Pelvic Drop ---
    pelvic_drop_deg: Optional[float] = None
    pelvic_drop_label: Optional[Literal["stable", "unstable_drop"]] = None

    # --- Spec param 3: Knee Valgus ---
    left_knee_valgus_norm: Optional[float] = None
    right_knee_valgus_norm: Optional[float] = None
    left_knee_valgus_label: Optional[str] = None   # "Aligned"/"Dynamic Valgus"
    right_knee_valgus_label: Optional[str] = None

    # --- Spec param 4: Knee Flexion at Impact ---
    knee_flexion_at_impact_left: Optional[float] = None
    knee_flexion_at_impact_right: Optional[float] = None
    knee_flexion_at_impact_label: Optional[str] = None  # "Steep"/"Optimal"/"Excessive"

    # --- Spec: Knee Flexion at Toe Off ---
    knee_flexion_at_toe_off_left: Optional[float] = None
    knee_flexion_at_toe_off_right: Optional[float] = None

    # --- Spec params 5-6: Phase Knee Flexion ---
    knee_flexion_stance_left: Optional[float] = None
    knee_flexion_stance_right: Optional[float] = None
    knee_flexion_aerial_left: Optional[float] = None
    knee_flexion_aerial_right: Optional[float] = None

    # --- Spec params 14,15: Foot Strike (L/R) ---
    foot_strike_angle_deg: Optional[float] = None        # combined (backward compat)
    foot_strike_label: Optional[str] = None              # combined label
    foot_strike_angle_left_deg: Optional[float] = None   # spec ID 15
    foot_strike_label_left: Optional[str] = None
    foot_strike_angle_right_deg: Optional[float] = None  # spec ID 14
    foot_strike_label_right: Optional[str] = None

    # --- Spec param 10: GCT ---
    gct_label: Optional[Literal["dynamic", "standard", "long"]] = None

    # --- Spec param 11: Cadence ---
    cadence_label: Optional[Literal["low", "efficient", "high"]] = None

    # --- Spec param 12: GCT Asymmetry ---
    gct_asymmetry_pct: Optional[float] = None
    gct_asymmetry_label: Optional[Literal["symmetrical", "asymmetric"]] = None

    # --- Spec param 2: Foot Angle Progression ---
    left_foot_progression_deg: Optional[float] = None
    right_foot_progression_deg: Optional[float] = None
    left_foot_progression_label: Optional[str] = None  # "Toe Out"/"Neutral"/"Toe In"
    right_foot_progression_label: Optional[str] = None

    # --- Spec params 22,23: Trunk Inclination (L/R per spec) ---
    trunk_inclination_label: Optional[str] = None         # combined (backward compat)
    trunk_inclination_left_deg: Optional[float] = None    # spec ID 23: L shoulder/hip
    trunk_inclination_left_label: Optional[str] = None
    trunk_inclination_right_deg: Optional[float] = None   # spec ID 22: R shoulder/hip
    trunk_inclination_right_label: Optional[str] = None

    # --- Spec param 15: Balance Score ---
    balance_score_pct: Optional[float] = None
    balance_score_label: Optional[str] = None  # "Good Symmetry"/"Asymmetry"/"Dangerous Asymmetry"

    # --- Métriques tab (rear-derived) ---
    # Mean per-leg pronation angular velocity (degrees per second).
    # Frontend buckets: <150°/s slow, 150–300°/s moderate, >300°/s fast.
    pronation_velocity_left_deg_s: Optional[float] = None
    pronation_velocity_right_deg_s: Optional[float] = None
    # Composite stability score 0–100 (higher = more stable). Frontend buckets:
    # >85% stable, 70–85% moderate, <70% unstable.
    foot_stability_pct: Optional[float] = None
    # Composite L/R asymmetry percentage 0–100. Frontend buckets:
    # <10% symmetric, 10–25% mild, >25% significant.
    foot_asymmetry_pct: Optional[float] = None
    # Tripod collapse ratio (max-min)/max as a percentage, averaged L/R.
    # Per rear-view-differentiators-proposal.pdf §Métrique 2 complementary.
    # Frontend buckets: <10% rigid, 10–25% normal, >25% significant collapse.
    arch_collapse_pct: Optional[float] = None


class AnalysisHistoryItem(BaseModel):
    job_id: str
    user_id: Optional[str] = None
    created_at: datetime

    # Optional context (store if you have it)
    surface: Optional[str] = None
    pronation: Optional[PronationType] = None
    preference: Optional[str] = None

    gait_type: Optional[str] = None

    # Store whatever bio existed for that run
    bio: Union[SideBioMetrics, RearBioMetrics]

    remarks: List[str] = Field(default_factory=list)
    video_url: str
    snapshot_image: Optional[str] = None

    model_config = ConfigDict(frozen=True)


class AnalysisHistoryResponse(BaseModel):
    total: int
    items: List[AnalysisHistoryItem]

    model_config = ConfigDict(frozen=True)
