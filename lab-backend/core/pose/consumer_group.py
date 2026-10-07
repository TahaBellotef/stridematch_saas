#
#  File: consumer_group.py
#  Project: StrideMatchLab
#

from __future__ import annotations


class ConsumerGroup:
    """
    Orchestrates a set of frame consumers.

    Important:
    - Chains image output between consumers.
    - Returns the final image so the pipeline can encode it.
    """

    def __init__(self, *consumers):
        self.consumers = [c for c in consumers if c is not None]

        # Propagate disable_external_pose_smoothing from any child consumer.
        # If ANY child manages its own smoothing, external smoothing must be skipped.
        self.disable_external_pose_smoothing = any(
            getattr(c, "disable_external_pose_smoothing", False)
            for c in self.consumers
        )

    def consume(
        self,
        frame_idx: int,
        image,
        pose_result,
        *,
        scale=None,
        offset=None,
        **kwargs,
    ):
        """
        Dispatch frame to all consumers.

        If a consumer returns an image, it becomes the new image passed
        to the next consumer.
        """
        call_kwargs = {"scale": scale, "offset": offset, **kwargs}
        for consumer in self.consumers:
            out = consumer.consume(
                frame_idx=frame_idx,
                image=image,
                pose_result=pose_result,
                **call_kwargs,
            )
            if out is not None:
                image = out

        return image

    def __call__(
        self,
        frame_idx: int,
        image,
        pose_result,
        *,
        scale=None,
        offset=None,
        **kwargs,
    ):
        return self.consume(
            frame_idx,
            image,
            pose_result,
            scale=scale,
            offset=offset,
            **kwargs,
        )
