# core/pose/keypoint_index.py
# Aioka Development Team © 2025 All rights reserved.
# Author: @macitch (https://www.github.com/macitch)

"""
Keypoint indices and remapping utilities.

Design:
- The *entire* pipeline (annotations, metrics, smoothing) should use ONE stable
  canonical keypoint ordering.
- Each model's native keypoint ordering should be remapped to that canonical
  ordering in the inference layer (e.g., rtmpose_engine.py).

Canonical ordering in Aioka: HALPE-26 (26 keypoints).

If your model outputs 26 keypoints in a different order (e.g. RTMLib BodyWithFeet),
you must provide a mapping from model indices -> canonical indices.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Dict, Iterable, List, Optional, Sequence, Tuple


# ============================================================
# Canonical HALPE-26 keypoints
# ============================================================

CANONICAL_KPT_COUNT: int = 26

CANONICAL_NAMES: Dict[int, str] = {
    0: "nose",
    1: "left_eye",
    2: "right_eye",
    3: "left_ear",
    4: "right_ear",
    5: "left_shoulder",
    6: "right_shoulder",
    7: "left_elbow",
    8: "right_elbow",
    9: "left_wrist",
    10: "right_wrist",
    11: "left_hip",
    12: "right_hip",
    13: "left_knee",
    14: "right_knee",
    15: "left_ankle",
    16: "right_ankle",
    17: "head_top",
    18: "neck",
    19: "hip_center",
    20: "left_big_toe",
    21: "right_big_toe",
    22: "left_small_toe",
    23: "right_small_toe",
    24: "left_heel",
    25: "right_heel",
}


class KeypointIndex(IntEnum):
    # Face / head
    NOSE = 0
    LEFT_EYE = 1
    RIGHT_EYE = 2
    LEFT_EAR = 3
    RIGHT_EAR = 4
    HEAD_TOP = 17
    NECK = 18

    # Upper body
    LEFT_SHOULDER = 5
    RIGHT_SHOULDER = 6
    LEFT_ELBOW = 7
    RIGHT_ELBOW = 8
    LEFT_WRIST = 9
    RIGHT_WRIST = 10

    # Lower body
    LEFT_HIP = 11
    RIGHT_HIP = 12
    HIP_CENTER = 19
    LEFT_KNEE = 13
    RIGHT_KNEE = 14
    LEFT_ANKLE = 15
    RIGHT_ANKLE = 16

    # Feet
    LEFT_BIG_TOE = 20
    RIGHT_BIG_TOE = 21
    LEFT_SMALL_TOE = 22
    RIGHT_SMALL_TOE = 23
    LEFT_HEEL = 24
    RIGHT_HEEL = 25


# ============================================================
# Model layouts (native model index spaces)
# ============================================================

class BodyWithFeetIndex(IntEnum):
    """
    Native index layout for RTMLib BodyWithFeet.

    IMPORTANT:
    This enum must match the *actual* ordering of your installed rtmlib BodyWithFeet.
    Different forks/versions may differ.

    Fill this once confirmed.
    """
    # Placeholder - DO NOT TRUST until you confirm ordering.
    NOSE = 0
    LEFT_EYE = 1
    RIGHT_EYE = 2
    LEFT_EAR = 3
    RIGHT_EAR = 4
    LEFT_SHOULDER = 5
    RIGHT_SHOULDER = 6
    LEFT_ELBOW = 7
    RIGHT_ELBOW = 8
    LEFT_WRIST = 9
    RIGHT_WRIST = 10
    LEFT_HIP = 11
    RIGHT_HIP = 12
    LEFT_KNEE = 13
    RIGHT_KNEE = 14
    LEFT_ANKLE = 15
    RIGHT_ANKLE = 16

    # The remaining indices (17..25) MUST be validated.
    # Common possibilities:
    # - head_top, neck, hip_center, toes, heels
    # - or feet in different order
    KP17 = 17
    KP18 = 18
    KP19 = 19
    KP20 = 20
    KP21 = 21
    KP22 = 22
    KP23 = 23
    KP24 = 24
    KP25 = 25


# ============================================================
# Mapping: model index -> canonical index
# ============================================================

# Once you confirm BodyWithFeet ordering, set this mapping explicitly.
# Keys = native model indices, values = canonical KeypointIndex (0..25).
BODYWITHFEET_TO_CANONICAL: Dict[int, int] = {
    # The first 17 are *often* COCO-like; these are usually safe:
    int(BodyWithFeetIndex.NOSE): int(KeypointIndex.NOSE),
    int(BodyWithFeetIndex.LEFT_EYE): int(KeypointIndex.LEFT_EYE),
    int(BodyWithFeetIndex.RIGHT_EYE): int(KeypointIndex.RIGHT_EYE),
    int(BodyWithFeetIndex.LEFT_EAR): int(KeypointIndex.LEFT_EAR),
    int(BodyWithFeetIndex.RIGHT_EAR): int(KeypointIndex.RIGHT_EAR),
    int(BodyWithFeetIndex.LEFT_SHOULDER): int(KeypointIndex.LEFT_SHOULDER),
    int(BodyWithFeetIndex.RIGHT_SHOULDER): int(KeypointIndex.RIGHT_SHOULDER),
    int(BodyWithFeetIndex.LEFT_ELBOW): int(KeypointIndex.LEFT_ELBOW),
    int(BodyWithFeetIndex.RIGHT_ELBOW): int(KeypointIndex.RIGHT_ELBOW),
    int(BodyWithFeetIndex.LEFT_WRIST): int(KeypointIndex.LEFT_WRIST),
    int(BodyWithFeetIndex.RIGHT_WRIST): int(KeypointIndex.RIGHT_WRIST),
    int(BodyWithFeetIndex.LEFT_HIP): int(KeypointIndex.LEFT_HIP),
    int(BodyWithFeetIndex.RIGHT_HIP): int(KeypointIndex.RIGHT_HIP),
    int(BodyWithFeetIndex.LEFT_KNEE): int(KeypointIndex.LEFT_KNEE),
    int(BodyWithFeetIndex.RIGHT_KNEE): int(KeypointIndex.RIGHT_KNEE),
    int(BodyWithFeetIndex.LEFT_ANKLE): int(KeypointIndex.LEFT_ANKLE),
    int(BodyWithFeetIndex.RIGHT_ANKLE): int(KeypointIndex.RIGHT_ANKLE),

    # TODO: Fill 17..25 once confirmed (head_top/neck/hip_center + toes/heels).
    # Example (NOT CONFIRMED):
    # 17: HEAD_TOP, 18: NECK, 19: HIP_CENTER,
    # 20: LEFT_BIG_TOE, 21: RIGHT_BIG_TOE, 22: LEFT_SMALL_TOE, 23: RIGHT_SMALL_TOE,
    # 24: LEFT_HEEL, 25: RIGHT_HEEL,
}


# ============================================================
# Utilities
# ============================================================

def get_keypoint_name(index: int) -> str:
    return CANONICAL_NAMES.get(int(index), f"keypoint_{int(index)}")


def is_valid_canonical_index(index: int) -> bool:
    return 0 <= int(index) < CANONICAL_KPT_COUNT


def validate_mapping(mapping: Dict[int, int], *, expected_src_count: int = 26) -> None:
    """
    Validate mapping looks sane.
    - src indices are within [0..expected_src_count-1]
    - dst indices are within [0..25]
    """
    for src, dst in mapping.items():
        s = int(src)
        d = int(dst)
        if not (0 <= s < expected_src_count):
            raise ValueError(f"Invalid mapping source index: {s}")
        if not is_valid_canonical_index(d):
            raise ValueError(f"Invalid mapping target index: {d}")


def remap_landmarks(
    xy: Sequence[Sequence[float]],
    vis: Optional[Sequence[float]],
    mapping: Dict[int, int],
    *,
    dst_count: int = CANONICAL_KPT_COUNT,
) -> Tuple[List[Tuple[float, float]], List[float]]:
    """
    Remap (x,y) keypoints from model space -> canonical space.

    xy: list/array shape (src_kpts, 2)
    vis: list/array shape (src_kpts,) or None

    Returns:
      - dst_xy: length dst_count list of (x,y)
      - dst_vis: length dst_count list of visibility
    """
    dst_xy: List[Tuple[float, float]] = [(0.0, 0.0)] * int(dst_count)
    dst_vis: List[float] = [0.0] * int(dst_count)

    for src_idx, dst_idx in mapping.items():
        s = int(src_idx)
        d = int(dst_idx)
        if s < 0 or s >= len(xy):
            continue
        pt = xy[s]
        if pt is None or len(pt) < 2:
            continue
        x = float(pt[0])
        y = float(pt[1])
        dst_xy[d] = (x, y)
        if vis is not None and s < len(vis):
            dst_vis[d] = float(vis[s])

    return dst_xy, dst_vis