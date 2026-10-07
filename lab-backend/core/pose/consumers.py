#
#  File: consumers.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class FrameConsumer(Protocol):
    """
    Contract for any pipeline stage that consumes a processed frame.

    A FrameConsumer:
      - receives the frame index
      - receives the rendered image (PIL Image)
      - receives the MediaPipe pose result (or None)
      - receives scale + offset used for landmark projection

    It may:
      - mutate shared buffers
      - annotate the image
      - emit side effects (metrics, logging, storage)
      - return a modified image or None

    The pipeline must NOT care what the consumer does.
    """

    def consume(
        self,
        frame_idx: int,
        image,
        pose_result,
        *,
        scale,
        offset,
        **kwargs,
    ):
        """
        Consume a single video frame.

        Parameters
        ----------
        frame_idx:
            Index of the current frame (starting at 0)

        image:
            PIL.Image.Image instance (letterboxed, RGB)

        pose_result:
            Result returned by MediaPipe Pose.process()
            May be None or missing landmarks

        scale:
            (sx, sy) scaling factors from normalized pose space → image space

        offset:
            (ox, oy) letterbox offsets in pixels

        Returns
        -------
        image or None:
            If an image is returned, it will be passed to the next consumer
            and eventually encoded into the output video.
        """
        ...