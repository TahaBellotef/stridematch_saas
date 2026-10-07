from __future__ import annotations

from typing import Dict, Any

from .annotation_side import annotate_side_frame
from .annotation_rear import annotate_rear_frame


class AnnotationConsumer:
    """
    Annotation dispatcher.

    Chooses the correct annotation strategy based on capture_type.
    """

    # ---- Intent declaration (pipeline metadata) ----

    requires_pose: bool = True
    produces_image: bool = True
    mutates_buffers: bool = True
    frame_order_dependent: bool = True

    realtime_safe: bool = True
    supports_batching: bool = False

    # -----------------------------------------------

    def __init__(self, buffers: Dict[str, Any], snapshot: Dict[str, Any]):
        self.buffers = buffers
        self.snapshot = snapshot

    def consume(
        self,
        frame_idx: int,
        image,
        pose_result,
        *,
        scale,
        offset,
        capture_type: str,
    ):
        """
        Dispatch annotation by capture type.
        """

        if capture_type == "rear":
            return annotate_rear_frame(
                image=image,
                pose_result=pose_result,
                buffers=self.buffers,
                snapshot=self.snapshot,
                frame_idx=frame_idx,
                scale=scale,
                offset=offset,
            )

        # Default: side view
        return annotate_side_frame(
            image=image,
            pose_result=pose_result,
            buffers=self.buffers,
            snapshot=self.snapshot,
            frame_idx=frame_idx,
            scale=scale,
            offset=offset,
        )
    