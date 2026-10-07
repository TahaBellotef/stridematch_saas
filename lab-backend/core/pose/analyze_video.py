#
#  File: analyze_video.py
#  Project: StrideMatchLab
#

from __future__ import annotations
from typing import Dict, Any, Literal

from .pipeline import run_pipeline
from .consumer_group import ConsumerGroup

from .annotation_side import SideAnnotationConsumer
from .annotation_rear import RearAnnotationConsumer

from .side_metrics_consumer import SideMetricsConsumer
from .rear_metrics_consumer import RearMetricsConsumer
from .rear_metrics import RearMetricConfig

CaptureType = Literal["side", "rear"]


def analyze_video(
    video_path: str,
    *,
    capture_type: CaptureType,
    runner_height_cm: float = 170.0,
) -> Dict[str, Any]:
    """
    Orchestrates pose analysis + annotation.

    Key rule:
    - Metrics consumers run BEFORE annotation consumers, so annotation can read
      same-frame metrics from `buffers` (rear especially).
    """

    # ---------------------------------------------------------
    # Shared snapshot
    # ---------------------------------------------------------
    snapshot: Dict[str, Any] = {"img": None}

    # ---------------------------------------------------------
    # Consumer selection + buffers (view-specific)
    # ---------------------------------------------------------
    if capture_type == "rear":
        buffers: Dict[str, Any] = {
            # used only if STORE_DEBUG_SERIES is enabled in annotation_rear.py
            "rear_frame_series": [],
        }

        # ✅ IMPORTANT: RearMetricsConsumer must receive buffers so it can publish
        # rear geom/metrics for annotation_rear.py to read during drawing.
        metrics = RearMetricsConsumer(
            config=RearMetricConfig(),
            buffers=buffers,
        )
        annotation = RearAnnotationConsumer(buffers=buffers, snapshot=snapshot)

    else:
        buffers = {
            "knee_angles": [],
            "left_knee": [],
            "right_knee": [],
            "left_ankle_y": [],
            "right_ankle_y": [],
            "frame_series": [],
        }

        metrics = SideMetricsConsumer()
        annotation = SideAnnotationConsumer(buffers=buffers, snapshot=snapshot)

    # ✅ Metrics first, annotation last
    frame_consumer = ConsumerGroup(metrics, annotation)

    # ---------------------------------------------------------
    # Run pipeline
    # ---------------------------------------------------------
    video_out_path, fps = run_pipeline(
        video_path,
        frame_consumer=frame_consumer,
    )

    # ---------------------------------------------------------
    # REAR VIEW OUTPUT
    # ---------------------------------------------------------
    if capture_type == "rear":
        rear_metrics = metrics.result()

        # Optional: publish for downstream callers (and helps debug)
        if isinstance(rear_metrics, dict):
            buffers["rear_metrics"] = rear_metrics

        result: Dict[str, Any] = {
            "video_path": video_out_path,
            "rear_metrics": rear_metrics,
        }
        if snapshot.get("img") is not None:
            result["snapshot"] = snapshot["img"]
        return result

    # ---------------------------------------------------------
    # SIDE VIEW OUTPUT
    # ---------------------------------------------------------
    bio = metrics.aggregate(buffers=buffers, fps=fps, runner_height_cm=runner_height_cm)

    result: Dict[str, Any] = {
        "video_path": video_out_path,
        "bio": bio,
        "remarks": metrics.remarks(),
    }

    if snapshot.get("img") is not None:
        result["snapshot"] = snapshot["img"]

    return result