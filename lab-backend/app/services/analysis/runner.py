# services/analysis/runner.py

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Union, Literal

from app.schemas import AnalysisResult, SideBioMetrics, RearBioMetrics
from app.utils.normalize import safe_float as _safe_float

from .loader import load_bio, extract_advanced_metrics
from .metrics import compute_energy_score, compute_flight_ratio
from .classifiers import (
    classify_gait,
    infer_motion_type,
    infer_strike_pattern,
    infer_pronation_from_rear,
    classify_pronation_angle,
    classify_pelvic_drop,
    classify_knee_valgus,
    classify_knee_flexion_at_impact,
    classify_foot_strike,
    classify_foot_progression,
    classify_gct,
    classify_cadence,
    classify_gct_asymmetry,
    classify_trunk_inclination,
    classify_balance_score,
    compute_balance_score,
)
from .persistence import persist_video, persist_record
from .insights import generate_insights

logger = logging.getLogger(__name__)


# =========================================================
# Lambda-safe environment
# =========================================================
def _ensure_lambda_safe_env() -> None:
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib")
    os.environ.setdefault("HOME", "/tmp")
    os.makedirs(os.environ["MPLCONFIGDIR"], exist_ok=True)


# =========================================================
# Helpers
# =========================================================
def _round_int(value: Optional[float], default: int = 0) -> int:
    return int(round(value)) if value is not None else default


def _opt_float(v: Any) -> Optional[float]:
    """Extract optional float: returns safe_float if present, None otherwise."""
    return _safe_float(v) if v is not None else None


def _coerce_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"1", "true", "yes", "y", "on"}:
            return True
        if v in {"0", "false", "no", "n", "off"}:
            return False
    return None


def _side_asymmetry_pct(
    gct_asym_pct: Optional[float],
    balance_score_pct: Optional[float],
) -> Optional[float]:
    """
    Side-flow proxy for the Métriques foot-asymmetry card.
    Mirrors the rear computation's 0–100 scale (lower = more symmetric):
      - GCT asymmetry % capped at 50
      - (100 - balance_score_pct) capped at 50  (high balance score = low asym)
    Returns None if neither input is available.
    """
    parts: list[float] = []
    if gct_asym_pct is not None:
        parts.append(min(float(gct_asym_pct), 50.0))
    if balance_score_pct is not None:
        parts.append(min(max(0.0, 100.0 - float(balance_score_pct)), 50.0))
    if not parts:
        return None
    return round(sum(parts) / len(parts), 1)


def _coerce_rotate_cw(value: Any) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        rotation = int(value) % 360
    except Exception:
        return None
    return rotation if rotation in {0, 90, 180, 270} else None


# =========================================================
# Rear analysis pipeline
# =========================================================
def _run_rear_analysis(
    *,
    video_path: Path,
    metadata: Dict[str, Any],
    user_id: Optional[str],
    forced_job_id: Optional[str],
    force_mirror: Optional[bool],
    runner_profile: Optional[Dict[str, Any]] = None,
    gate_shoulders: bool = True,
) -> AnalysisResult:
    from core.pose.pipeline import run_pipeline
    from core.pose.consumer_group import ConsumerGroup
    from core.pose.annotation_rear import RearAnnotationConsumer
    from core.pose.rear_metrics_consumer import RearMetricsConsumer
    from core.pose.rear_metrics import RearMetricConfig

    buffers: Dict[str, Any] = {}
    snapshot: Dict[str, Any] = {"img": None}

    metrics_consumer = RearMetricsConsumer(
        config=RearMetricConfig(gate_shoulders=gate_shoulders),
        buffers=buffers,
    )

    frame_consumer = ConsumerGroup(
    metrics_consumer,
    RearAnnotationConsumer(buffers=buffers, snapshot=snapshot, draw_upper_body=gate_shoulders),
    )

     # --------------------------------------------------------

    rotate_cw = _coerce_rotate_cw(metadata.get("rotate_cw"))
    flip_x = _coerce_bool(metadata.get("flip_x"))
    flip_y = _coerce_bool(metadata.get("flip_y"))

    video_out_path, fps = run_pipeline(
        str(video_path),
        frame_consumer=frame_consumer,
        force_mirror=force_mirror,
        rotate_cw=rotate_cw,
        flip_x=flip_x,
        flip_y=flip_y,
    )

    logger.info("Rear pipeline output: %s (fps=%.2f)", video_out_path, fps)
    metrics_consumer.set_fps(fps)

    output_size = 0
    try:
        output_size = os.path.getsize(video_out_path)
    except Exception:
        output_size = 0

    logger.info("Rear output file size: %s bytes", output_size)
    logger.info("Rear frames accepted: %s", metrics_consumer.accepted_frames)

    rear_metrics = metrics_consumer.result()

    # Publish rear metrics for annotation_rear.py (and any downstream consumers)
    if isinstance(rear_metrics, dict):
        buffers["rear_metrics"] = rear_metrics

    required_keys = {"knee_width_norm", "ankle_width_norm", "drift_norm"}
    if (
        rear_metrics is None
        or not isinstance(rear_metrics, dict)
        or not required_keys.issubset(rear_metrics.keys())
    ):
        raise RuntimeError(
            "Rear metrics invalid: "
            f"accepted_frames={metrics_consumer.accepted_frames} "
            f"fallback_used={metrics_consumer.fallback_used} "
            f"pose_seen={metrics_consumer.pose_seen} "
            f"output_size={output_size} "
            f"keys={list(rear_metrics.keys()) if isinstance(rear_metrics, dict) else None}"
        )

    annotated = Path(video_out_path)
    if not annotated.exists():
        raise RuntimeError("Rear annotated video missing")

    rear_job_id = forced_job_id or uuid.uuid4().hex
    persist_video(annotated, rear_job_id)

    rear_video_url = f"/api/v1/analysis/{rear_job_id}/video"
    logger.info("Rear video persisted URL: %s", rear_video_url)

    pronation = infer_pronation_from_rear(rear_metrics)

    # Per-leg pronation (spec IDs 1 right, 2 left)
    left_ev = rear_metrics.get("left_ankle_eversion_deg")
    right_ev = rear_metrics.get("right_ankle_eversion_deg")
    left_pronation_label = classify_pronation_angle(_safe_float(left_ev)) if left_ev is not None else None  # per-leg classifier needs explicit guard
    right_pronation_label = classify_pronation_angle(_safe_float(right_ev)) if right_ev is not None else None

    # Spec classifications (rear)
    pelvic_drop_val = _safe_float(rear_metrics.get("pelvic_drop_deg", 0))
    pelvic_drop_label = classify_pelvic_drop(pelvic_drop_val)
    left_valgus_label, right_valgus_label = classify_knee_valgus(rear_metrics)

    # Foot angle progression (spec param 2)
    left_fpa = rear_metrics.get("left_foot_progression_deg")
    right_fpa = rear_metrics.get("right_foot_progression_deg")
    left_fpa_label, right_fpa_label = (None, None)
    if left_fpa is not None and right_fpa is not None:
        left_fpa_label, right_fpa_label = classify_foot_progression(
            _safe_float(left_fpa), _safe_float(right_fpa)
        )

    # Balance score (spec param 15) — rear bilateral params
    rear_balance_params = {
        "left_ankle_eversion_deg": rear_metrics.get("left_ankle_eversion_deg"),
        "right_ankle_eversion_deg": rear_metrics.get("right_ankle_eversion_deg"),
        "left_knee_valgus_norm": rear_metrics.get("left_knee_valgus_norm"),
        "right_knee_valgus_norm": rear_metrics.get("right_knee_valgus_norm"),
        "left_foot_progression_deg": left_fpa,
        "right_foot_progression_deg": right_fpa,
    }
    rear_balance_pct = compute_balance_score(rear_balance_params)
    rear_balance_label = classify_balance_score(rear_balance_pct) if rear_balance_pct is not None else None

    remarks: list[str] = []
    if metrics_consumer.fallback_used:
        remarks.append("Rear metrics low confidence")

    # -------------------------------------------------
    # Rear analysis quality / confidence (UX signal)
    # -------------------------------------------------
    if metrics_consumer.fallback_used:
        rear_quality: Literal["low", "medium", "high"] = "low"
    elif metrics_consumer.accepted_frames < 30:
        rear_quality = "medium"
    else:
        rear_quality = "high"

    logger.info("Rear metrics fallback used: %s", metrics_consumer.fallback_used)

    cadence = None
    if isinstance(rear_metrics, dict):
        cadence_value = rear_metrics.get("cadence")
        if isinstance(cadence_value, (int, float)):
            cadence = int(cadence_value)

    # Rear capture should NOT fabricate side bio values.
    rear_bio = RearBioMetrics(
        pronation=pronation,
        rear_quality=rear_quality,
        cadence=cadence,
    )

    # Rear-only score (alignment proxy)
    rear_energy_score = compute_energy_score(
        rear_bio,
        analysis_type="rear",
        rear_metrics=rear_metrics,
        rear_quality=rear_quality,
        runner_profile=runner_profile,
    )

    rear_lang = str(metadata.get("lang") or "fr")
    rear_insights, rear_improvement_tips = generate_insights(
        analysis_type="rear",
        lang=rear_lang,
        pronation=pronation,
        rear_metrics=rear_metrics,
    )

    rear_result = AnalysisResult(
        job_id=rear_job_id,
        user_id=user_id,
        created_at=datetime.now(timezone.utc),
        analysis_type="rear",
        gait_type="rear",
        bio=rear_bio,
        remarks=remarks,
        pronation=pronation,
        rear_quality=rear_quality,
        rear_metrics=rear_metrics,
        video_url=rear_video_url,
        rear_video_url=rear_video_url,
        side_video_url=None,
        snapshot_image=None,
        rear_capture_used=True,
        energy_score=rear_energy_score,
        motion_type=None,
        strike_pattern=None,
        contact_time_left=int(rear_metrics["contact_time_left"]) if isinstance(rear_metrics.get("contact_time_left"), (int, float)) else None,
        contact_time_right=int(rear_metrics["contact_time_right"]) if isinstance(rear_metrics.get("contact_time_right"), (int, float)) else None,
        flight_ratio=None,
        trunk_lean=None,
        trunk_stability=None,
        arm_swing=None,
        hip_mobility=None,
        insights=rear_insights,
        improvement_tips=rear_improvement_tips,
        # Spec fields (rear)
        left_ankle_eversion_deg=rear_metrics.get("left_ankle_eversion_deg"),
        right_ankle_eversion_deg=rear_metrics.get("right_ankle_eversion_deg"),
        pronation_label=pronation.capitalize() if pronation else None,
        left_pronation_label=left_pronation_label,
        right_pronation_label=right_pronation_label,
        pelvic_drop_deg=pelvic_drop_val,
        pelvic_drop_label=pelvic_drop_label,
        left_knee_valgus_norm=rear_metrics.get("left_knee_valgus_norm"),
        right_knee_valgus_norm=rear_metrics.get("right_knee_valgus_norm"),
        left_knee_valgus_label=left_valgus_label,
        right_knee_valgus_label=right_valgus_label,
        # Foot angle progression (spec param 2)
        left_foot_progression_deg=_opt_float(left_fpa),
        right_foot_progression_deg=_opt_float(right_fpa),
        left_foot_progression_label=left_fpa_label,
        right_foot_progression_label=right_fpa_label,
        # Balance score (spec param 15)
        balance_score_pct=rear_balance_pct,
        balance_score_label=rear_balance_label,
        # Métriques tab — rear-view-differentiators-proposal.pdf.
        pronation_velocity_left_deg_s=_opt_float(rear_metrics.get("pronation_velocity_left_deg_s")),
        pronation_velocity_right_deg_s=_opt_float(rear_metrics.get("pronation_velocity_right_deg_s")),
        foot_stability_pct=_opt_float(rear_metrics.get("foot_stability_pct")),
        foot_asymmetry_pct=_opt_float(rear_metrics.get("foot_asymmetry_pct")),
        arch_collapse_pct=_opt_float(rear_metrics.get("arch_collapse_pct")),
    )

    # Persist full payload
    persist_record(
        job_id=rear_job_id,
        user_id=user_id,
        created_at=rear_result.created_at,
        bio=rear_result.bio,
        gait_type=rear_result.gait_type,
        remarks=rear_result.remarks,
        video_url=rear_result.video_url,
        analysis_type="rear",
        rear_metrics=rear_metrics,
        pronation=pronation,
        rear_quality=rear_quality,
        rear_video_url=rear_video_url,
        side_video_url=None,
        result_json=rear_result.model_dump(mode="json"),
        organization_id=metadata.get("organization_id"),
    )

    return rear_result


# =========================================================
# Side analysis pipeline
# =========================================================
def _run_side_analysis(
    *,
    video_path: Path,
    capture_type: str,
    user_id: Optional[str],
    forced_job_id: Optional[str],
    runner_height_cm: float = 170.0,
    runner_profile: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> AnalysisResult:
    from core.pose.analyze_video import analyze_video

    output = analyze_video(
        str(video_path),
        capture_type=capture_type,
        runner_height_cm=runner_height_cm,
    )

    job_id = forced_job_id or uuid.uuid4().hex
    created_at = datetime.now(timezone.utc)

    annotated_path = output.get("video_path")
    if not annotated_path:
        raise RuntimeError("Side annotated video missing")

    annotated = Path(annotated_path)
    persist_video(annotated, job_id)

    bio_payload = output.get("bio", {}) or {}
    bio: SideBioMetrics = load_bio(bio_payload)
    advanced = extract_advanced_metrics(bio_payload)

    # ------------------------------
    # Prefer pipeline values
    # ------------------------------
    flight_ratio_raw = bio_payload.get("flight_ratio")
    strike_pattern_raw = bio_payload.get("strike_pattern")

    contact_left_raw = bio_payload.get("contact_time_left")
    contact_right_raw = bio_payload.get("contact_time_right")

    flight_ratio = (
        _safe_float(flight_ratio_raw)
        if isinstance(flight_ratio_raw, (int, float))
        else _safe_float(compute_flight_ratio(bio))  # fallback heuristic
    )

    strike_pattern = (
        strike_pattern_raw.strip()
        if isinstance(strike_pattern_raw, str) and strike_pattern_raw.strip()
        else None
    )

    contact_time_left = (
        _round_int(contact_left_raw, default=bio.contact_time)
        if isinstance(contact_left_raw, (int, float))
        else bio.contact_time
    )

    contact_time_right = (
        _round_int(contact_right_raw, default=bio.contact_time)
        if isinstance(contact_right_raw, (int, float))
        else bio.contact_time
    )

    # Side-only energy score (rear blended later in analysis router)
    energy_score = _round_int(
        compute_energy_score(
            bio,
            analysis_type="side",
            rear_metrics=None,
            rear_quality=None,
            runner_profile=runner_profile,
        )
    )

    gait_type = classify_gait(bio, analysis_type="side")
    motion_type = infer_motion_type(flight_ratio) or "unknown"

    remarks = [str(r) for r in output.get("remarks", [])]
    video_url = f"/api/v1/analysis/{job_id}/video"

    _raw_trunk = advanced.get("trunk_lean")
    trunk_lean = float(_raw_trunk) if _raw_trunk is not None else None
    trunk_stability = _round_int(advanced.get("trunk_stability"))
    arm_swing = _round_int(advanced.get("arm_swing"))
    hip_mobility = _round_int(advanced.get("hip_mobility"))

    # Per-side trunk inclination (spec IDs 22,23)
    trunk_lean_left_raw = bio_payload.get("trunk_lean_left")
    trunk_lean_right_raw = bio_payload.get("trunk_lean_right")
    trunk_inclination_left_deg = _opt_float(trunk_lean_left_raw)
    trunk_inclination_right_deg = _opt_float(trunk_lean_right_raw)
    trunk_inclination_left_label = classify_trunk_inclination(trunk_inclination_left_deg) if trunk_inclination_left_deg is not None else None
    trunk_inclination_right_label = classify_trunk_inclination(trunk_inclination_right_deg) if trunk_inclination_right_deg is not None else None

    # --- Spec classifications (side) ---
    cadence_label = classify_cadence(bio.cadence) if bio.cadence else None
    gct_label = classify_gct(bio.contact_time) if bio.contact_time else None
    trunk_inclination_label = classify_trunk_inclination(trunk_lean) if trunk_lean is not None else None

    # Per-leg foot strike (spec IDs 14,15)
    foot_strike_angle_raw = bio_payload.get("foot_strike_angle_deg")
    foot_strike_angle_deg = _opt_float(foot_strike_angle_raw)
    foot_strike_label = classify_foot_strike(foot_strike_angle_deg) if foot_strike_angle_deg is not None else None

    fs_left_raw = bio_payload.get("foot_strike_angle_left_deg")
    fs_right_raw = bio_payload.get("foot_strike_angle_right_deg")
    foot_strike_angle_left_deg = _opt_float(fs_left_raw)
    foot_strike_angle_right_deg = _opt_float(fs_right_raw)
    foot_strike_label_left = classify_foot_strike(foot_strike_angle_left_deg) if foot_strike_angle_left_deg is not None else None
    foot_strike_label_right = classify_foot_strike(foot_strike_angle_right_deg) if foot_strike_angle_right_deg is not None else None

    # If angle-based strike is available, use it as the primary strike_pattern
    if foot_strike_label:
        strike_pattern = foot_strike_label

    kf_impact_left = bio_payload.get("knee_flexion_at_impact_left")
    kf_impact_right = bio_payload.get("knee_flexion_at_impact_right")

    kf_impact_avg = None
    if kf_impact_left is not None and kf_impact_right is not None:
        kf_impact_avg = (_safe_float(kf_impact_left) + _safe_float(kf_impact_right)) / 2
    elif kf_impact_left is not None:
        kf_impact_avg = _safe_float(kf_impact_left)
    elif kf_impact_right is not None:
        kf_impact_avg = _safe_float(kf_impact_right)

    knee_flexion_at_impact_label = classify_knee_flexion_at_impact(kf_impact_avg) if kf_impact_avg is not None else None

    kf_toe_off_left = bio_payload.get("knee_flexion_at_toe_off_left")
    kf_toe_off_right = bio_payload.get("knee_flexion_at_toe_off_right")

    gct_asymmetry_raw = bio_payload.get("gct_asymmetry_pct")
    gct_asymmetry_pct = _opt_float(gct_asymmetry_raw)
    gct_asymmetry_label = classify_gct_asymmetry(gct_asymmetry_pct) if gct_asymmetry_pct is not None else None

    # Balance score (spec param 15) — side bilateral params
    side_balance_params = {
        "knee_flexion_at_impact_left": kf_impact_left,
        "knee_flexion_at_impact_right": kf_impact_right,
        "knee_flexion_at_toe_off_left": kf_toe_off_left,
        "knee_flexion_at_toe_off_right": kf_toe_off_right,
        "knee_flexion_stance_left": bio_payload.get("knee_flexion_stance_left"),
        "knee_flexion_stance_right": bio_payload.get("knee_flexion_stance_right"),
        "knee_flexion_aerial_left": bio_payload.get("knee_flexion_aerial_left"),
        "knee_flexion_aerial_right": bio_payload.get("knee_flexion_aerial_right"),
        "contact_time_left": contact_time_left,
        "contact_time_right": contact_time_right,
    }
    side_balance_pct = compute_balance_score(side_balance_params)
    side_balance_label = classify_balance_score(side_balance_pct) if side_balance_pct is not None else None

    side_lang = str((metadata or {}).get("lang") or "fr")
    insights, improvement_tips = generate_insights(
        analysis_type="side",
        lang=side_lang,
        trunk_lean=trunk_lean,
        trunk_stability=trunk_stability,
        arm_swing=arm_swing,
        hip_mobility=hip_mobility,
        osc=bio.osc,
    )

    analysis_result = AnalysisResult(
        job_id=job_id,
        user_id=user_id,
        created_at=created_at,
        analysis_type="side",
        bio=bio,
        gait_type=gait_type,
        remarks=remarks,
        pronation=bio.pronation,
        rear_quality=None,
        rear_metrics=None,
        video_url=video_url,
        rear_video_url=None,
        side_video_url=video_url,
        snapshot_image=None,
        rear_capture_used=False,
        energy_score=energy_score,
        motion_type=motion_type,
        strike_pattern=strike_pattern,
        contact_time_left=contact_time_left,
        contact_time_right=contact_time_right,
        flight_ratio=flight_ratio,
        trunk_lean=trunk_lean,
        trunk_stability=trunk_stability,
        arm_swing=arm_swing,
        hip_mobility=hip_mobility,
        insights=insights,
        improvement_tips=improvement_tips,
        # Spec fields (side)
        knee_flexion_at_impact_left=_opt_float(kf_impact_left),
        knee_flexion_at_impact_right=_opt_float(kf_impact_right),
        knee_flexion_at_impact_label=knee_flexion_at_impact_label,
        knee_flexion_at_toe_off_left=_opt_float(kf_toe_off_left),
        knee_flexion_at_toe_off_right=_opt_float(kf_toe_off_right),
        knee_flexion_stance_left=_opt_float(bio_payload.get("knee_flexion_stance_left")),
        knee_flexion_stance_right=_opt_float(bio_payload.get("knee_flexion_stance_right")),
        knee_flexion_aerial_left=_opt_float(bio_payload.get("knee_flexion_aerial_left")),
        knee_flexion_aerial_right=_opt_float(bio_payload.get("knee_flexion_aerial_right")),
        foot_strike_angle_deg=foot_strike_angle_deg,
        foot_strike_label=foot_strike_label,
        foot_strike_angle_left_deg=foot_strike_angle_left_deg,
        foot_strike_label_left=foot_strike_label_left,
        foot_strike_angle_right_deg=foot_strike_angle_right_deg,
        foot_strike_label_right=foot_strike_label_right,
        gct_label=gct_label,
        cadence_label=cadence_label,
        gct_asymmetry_pct=gct_asymmetry_pct,
        gct_asymmetry_label=gct_asymmetry_label,
        trunk_inclination_label=trunk_inclination_label,
        trunk_inclination_left_deg=trunk_inclination_left_deg,
        trunk_inclination_left_label=trunk_inclination_left_label,
        trunk_inclination_right_deg=trunk_inclination_right_deg,
        trunk_inclination_right_label=trunk_inclination_right_label,
        # Balance score (spec param 15)
        balance_score_pct=side_balance_pct,
        balance_score_label=side_balance_label,
        # Métriques tab — side proxies (pronation_velocity stays rear-only).
        # foot_stability_pct ≈ bio.sym (already a 0-100 symmetry score).
        # foot_asymmetry_pct from a blend of GCT asymmetry and (100 - balance_score_pct).
        foot_stability_pct=_opt_float(bio.sym),
        foot_asymmetry_pct=_side_asymmetry_pct(gct_asymmetry_pct, side_balance_pct),
    )

    persist_record(
        job_id=job_id,
        user_id=user_id,
        created_at=created_at,
        bio=bio,
        gait_type=gait_type,
        remarks=remarks,
        video_url=video_url,
        analysis_type=analysis_result.analysis_type,
        result_json=analysis_result.model_dump(mode="json"),
        organization_id=(metadata or {}).get("organization_id"),
    )

    return analysis_result


# =========================================================
# Main entrypoint (S3 / TMP BASED)
# =========================================================
def run_analysis(
    *,
    video_path: Path,
    metadata: Optional[Dict[str, Any]] = None,
    user_id: Optional[str] = None,
) -> Union[AnalysisResult, Dict[str, Any]]:
    _ensure_lambda_safe_env()

    try:
        import matplotlib

        matplotlib.use("Agg")
    except Exception:
        pass

    metadata = metadata or {}
    capture_type = metadata.get("capture_type", "side")
    force_mirror = _coerce_bool(metadata.get("force_mirror"))
    forced_job_id = metadata.get("job_id")
    if not isinstance(forced_job_id, str) or not forced_job_id.strip():
        forced_job_id = None

    if not video_path.exists():
        raise RuntimeError(f"Input video does not exist: {video_path}")

    # Extract runner profile from metadata (set by the analysis router)
    runner_profile = metadata.get("runner_profile") or {}
    runner_height_cm = float(runner_profile.get("height_cm") or runner_profile.get("heightCm") or 170.0)

    if capture_type in ("rear", "lower_body"):
        return _run_rear_analysis(
            video_path=video_path,
            metadata=metadata,
            user_id=user_id,
            forced_job_id=forced_job_id,
            force_mirror=force_mirror,
            runner_profile=runner_profile,
            gate_shoulders=(capture_type != "lower_body"),
        )

    return _run_side_analysis(
        video_path=video_path,
        capture_type=capture_type,
        user_id=user_id,
        forced_job_id=forced_job_id,
        runner_height_cm=runner_height_cm,
        runner_profile=runner_profile,
        metadata=metadata,
    )
