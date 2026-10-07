# app/services/foot_scan/__init__.py
"""Foot scan measurement services."""

from .calibration import detect_a4_paper, A4DetectionResult
from .segmentation import segment_foot, clean_foot_mask
from .measurement import measure_foot, FootMeasurementResult
from .sizing import convert_to_shoe_sizes, ShoeSizeResult
from .runner import run_foot_scan_analysis
from .persistence import (
    create_session,
    get_session,
    create_job,
    get_job,
    update_job_result,
    get_session_results,
    get_customer_history,
)

__all__ = [
    # Calibration
    "detect_a4_paper",
    "A4DetectionResult",
    # Segmentation
    "segment_foot",
    "clean_foot_mask",
    # Measurement
    "measure_foot",
    "FootMeasurementResult",
    # Sizing
    "convert_to_shoe_sizes",
    "ShoeSizeResult",
    # Runner
    "run_foot_scan_analysis",
    # Persistence
    "create_session",
    "get_session",
    "create_job",
    "get_job",
    "update_job_result",
    "get_session_results",
    "get_customer_history",
]
