# app/services/analysis/loaders.py
from __future__ import annotations

from typing import Dict, Any, Optional

from app.schemas.analysis import SideBioMetrics, PronationType


def load_bio(raw: Dict[str, Any]) -> SideBioMetrics:
    """Strict loader for SIDE metrics only."""
    pronation: Optional[PronationType] = raw.get("pronation")
    if pronation not in {"neutral", "pronation", "supination"}:
        pronation = None

    knee_mean = float(raw.get("knee_mean", 0.0))

    return SideBioMetrics(
        knee_mean=knee_mean,
        knee_left_mean=float(raw.get("knee_left_mean", knee_mean)),
        knee_right_mean=float(raw.get("knee_right_mean", knee_mean)),
        cadence=int(raw.get("cadence", 0)),
        osc=float(raw.get("osc", 0.0)),
        sym=float(raw.get("sym", 0.0)),
        contact_time=int(raw.get("contact_time", 0)),
        pronation=pronation,
    )


def extract_advanced_metrics(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Optional extras produced by pipelines (side)."""
    return {
        "trunk_lean": raw.get("trunk_lean"),
        "trunk_stability": raw.get("trunk_stability"),
        "arm_swing": raw.get("arm_swing"),
        "hip_mobility": raw.get("hip_mobility"),
        "flight_ratio": raw.get("flight_ratio"),
        "contact_time_left": raw.get("contact_time_left"),
        "contact_time_right": raw.get("contact_time_right"),
    }