#
#  File: side_metrics_consumer.py
#  Project: StrideMatchLab
#

from __future__ import annotations

from typing import List, Dict, Any, Optional

from app.services.analysis.pipeline_types import SideFrameData, SideMetricsPayload
from app.visualization_config import MAX_FRAMES
from .side_metrics import (
    extract_side_frame,
    aggregate_side_metrics,
)


class SideMetricsConsumer:
    """
    Collects side-view gait metrics across frames.

    Notes:
    - Frame-level extraction is stored in `self.frames`.
    - Optionally mirrors *latest* frame metrics into `buffers["side_frame_latest"]`
      for annotation/debug (non-breaking if buffers isn't used).
    """

    # ---- Intent declaration (pipeline contracts) ----
    requires_pose: bool = True
    frame_order_dependent: bool = True
    produces_metrics: bool = True
    mutates_buffers: bool = True
    # -----------------------------------------------

    def __init__(self, *, store_latest_in_buffers: bool = True):
        self.frames: List[SideFrameData] = []
        self.store_latest_in_buffers = bool(store_latest_in_buffers)

    def consume(
        self,
        frame_idx: int,
        image,
        pose_result,
        *,
        scale: Any = None,
        offset: Any = None,
        buffers: Optional[Dict[str, Any]] = None,
        **kwargs,
    ) -> None:
        """
        Consume a single frame's pose output.

        We accept `image/scale/offset` for pipeline compatibility, even if we don't
        use them yet. We also accept `buffers` so we can optionally expose some
        live data to the annotator.
        """
        if not pose_result or not getattr(pose_result, "pose_landmarks", None):
            return

        lm = pose_result.pose_landmarks.landmark
        frame_data = extract_side_frame(lm, scale=scale, offset=offset)

        # IMPORTANT: don't append None (prevents later crashes)
        if frame_data is None:
            return

        # Store frame features
        self.frames.append(frame_data)
        if len(self.frames) > MAX_FRAMES:
            del self.frames[:-MAX_FRAMES]

        # Optional: expose last extracted frame to buffers for overlays/debug
        if self.store_latest_in_buffers and isinstance(buffers, dict):
            buffers["side_frame_latest"] = frame_data

    def aggregate(
        self,
        *,
        buffers: Optional[Dict[str, Any]] = None,
        fps: float,
        runner_height_cm: float = 170.0,
    ) -> SideMetricsPayload:
        """
        Final aggregated side-view metrics.

        If `buffers` is provided, store aggregated result into:
          - buffers["side_metrics"]
          - buffers.setdefault("metrics", {})["side"]
        """
        if not self.frames:
            # Let caller convert this to a 422 if you want
            raise RuntimeError("Side analysis produced no metrics (no valid pose frames).")

        result = aggregate_side_metrics(
            frames=self.frames,
            fps=fps,
            runner_height_cm=runner_height_cm,
        )

        if isinstance(buffers, dict) and isinstance(result, dict):
            buffers["side_metrics"] = result
            buffers.setdefault("metrics", {})["side"] = result

        return result

    def result(self) -> SideFrameData:
        """
        RearMetricsConsumer has `.result()`. Adding this keeps things consistent.
        For side, it's typically the same as aggregate output, but we don't have fps here.
        So this returns the last frame-level payload if available.
        """
        return self.frames[-1] if self.frames else {}

    def remarks(self) -> list[str]:
        return []