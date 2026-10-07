export type BackendInsightItem = {
  id: string;
  category: string;
  title: string;
  summary: string;
  measured?: string | null;
  severity: "info" | "focus" | "warning";
  confidence?: number | null;
  source?: string;
  recommendations: string[];
};

export type AnalysisResult = {
  job_id: string;
  user_id?: string | null;
  created_at: string;
  video_url: string;
  rear_video_url?: string | null;
  side_video_url?: string | null;
  snapshot_image?: string | null;
  remarks: string[];
  gait_type: string;

  analysis_type?: "rear" | "side" | "both";
  rear_metrics?: Record<string, number | string | Record<string, unknown> | null>;
  rear_quality?: "low" | "medium" | "high";
  pronation?: "neutral" | "overpronation" | "underpronation";

  rear_capture_used: boolean;

  bio: {
    knee_mean?: number;
    knee_left_mean?: number;
    knee_right_mean?: number;
    cadence?: number;
    osc?: number;
    sym?: number;
    contact_time?: number;

    pronation?: "neutral" | "overpronation" | "underpronation";
    rear_quality?: "low" | "medium" | "high";
  };

  energy_score?: number;
  motion_type?: string;
  strike_pattern?: string;
  contact_time_left?: number;
  contact_time_right?: number;
  flight_ratio?: number;
  trunk_lean?: number;
  trunk_stability?: number;
  arm_swing?: number;
  hip_mobility?: number;

  insights?: BackendInsightItem[];
  improvement_tips?: string[];

  // --- Pronation / ankle eversion ---
  left_ankle_eversion_deg?: number | null;
  right_ankle_eversion_deg?: number | null;
  pronation_label?: "Supination" | "Neutral" | "Pronation" | null;
  left_pronation_label?: string | null;
  right_pronation_label?: string | null;

  // --- Pelvic drop ---
  pelvic_drop_deg?: number | null;
  pelvic_drop_label?: "stable" | "unstable_drop" | null;

  // --- Knee valgus ---
  left_knee_valgus_norm?: number | null;
  right_knee_valgus_norm?: number | null;
  left_knee_valgus_label?: string | null;
  right_knee_valgus_label?: string | null;

  // --- Knee flexion ---
  knee_flexion_at_impact_left?: number | null;
  knee_flexion_at_impact_right?: number | null;
  knee_flexion_at_impact_label?: string | null;
  knee_flexion_at_toe_off_left?: number | null;
  knee_flexion_at_toe_off_right?: number | null;
  knee_flexion_stance_left?: number | null;
  knee_flexion_stance_right?: number | null;
  knee_flexion_aerial_left?: number | null;
  knee_flexion_aerial_right?: number | null;

  // --- Foot strike ---
  foot_strike_angle_deg?: number | null;
  foot_strike_label?: string | null;
  foot_strike_angle_left_deg?: number | null;
  foot_strike_label_left?: string | null;
  foot_strike_angle_right_deg?: number | null;
  foot_strike_label_right?: string | null;

  // --- Ground contact time / cadence labels ---
  gct_label?: "dynamic" | "standard" | "long" | null;
  cadence_label?: "low" | "efficient" | "high" | null;
  gct_asymmetry_pct?: number | null;
  gct_asymmetry_label?: "symmetrical" | "asymmetric" | null;

  // --- Foot progression angle ---
  left_foot_progression_deg?: number | null;
  right_foot_progression_deg?: number | null;
  left_foot_progression_label?: string | null;
  right_foot_progression_label?: string | null;

  // --- Trunk inclination ---
  trunk_inclination_label?: string | null;
  trunk_inclination_left_deg?: number | null;
  trunk_inclination_left_label?: string | null;
  trunk_inclination_right_deg?: number | null;
  trunk_inclination_right_label?: string | null;

  // --- Balance score ---
  balance_score_pct?: number | null;
  balance_score_label?: string | null;

  // --- Rear-derived metrics ---
  pronation_velocity_left_deg_s?: number | null;
  pronation_velocity_right_deg_s?: number | null;
  foot_stability_pct?: number | null;
  foot_asymmetry_pct?: number | null;
  arch_collapse_pct?: number | null;

  verdict?: AnalysisVerdict;
};

  
export type AnalysisVerdict = {
  title: string;
  summary: string;
  risk_level: "low" | "medium" | "high";
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
};
