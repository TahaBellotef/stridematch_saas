from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from app.utils.normalize import safe_float as _safe_float


@dataclass
class Landmark:
    x: float
    y: float
    z: float = 0.0
    visibility: float = 0.0


@dataclass
class PoseLandmarks:
    landmark: List[Landmark]


@dataclass
class PoseResultCompat:
    pose_landmarks: Optional[PoseLandmarks] = None


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _lerp(a: float, b: float, t: float) -> float:
    return (1.0 - t) * a + t * b


def has_pose(p: Optional[PoseResultCompat]) -> bool:
    return bool(p and p.pose_landmarks and p.pose_landmarks.landmark)


def _lerp_pose(
    prev_pose: Optional[PoseResultCompat],
    next_pose: Optional[PoseResultCompat],
    t: float,
) -> Optional[PoseResultCompat]:
    """
    Linearly interpolate two pose results in normalized landmark space.

    - If either pose is missing -> returns the available one (or None).
    - Robust to NaNs / inf / missing fields.
    - If landmark counts differ: interpolates shared prefix, then appends remainder from next_pose.
    """
    if not has_pose(prev_pose):
        return next_pose
    if not has_pose(next_pose):
        return prev_pose

    a = prev_pose.pose_landmarks.landmark  # type: ignore[union-attr]
    b = next_pose.pose_landmarks.landmark  # type: ignore[union-attr]

    if not a or not b:
        return next_pose

    t = _clamp(_safe_float(t, 0.0), 0.0, 1.0)

    n = min(len(a), len(b))
    out: List[Landmark] = []

    for i in range(n):
        la, lb = a[i], b[i]
        xa, xb = _safe_float(getattr(la, "x", 0.0)), _safe_float(getattr(lb, "x", 0.0))
        ya, yb = _safe_float(getattr(la, "y", 0.0)), _safe_float(getattr(lb, "y", 0.0))
        za, zb = _safe_float(getattr(la, "z", 0.0)), _safe_float(getattr(lb, "z", 0.0))
        va, vb = _safe_float(getattr(la, "visibility", 0.0)), _safe_float(getattr(lb, "visibility", 0.0))

        x = _lerp(xa, xb, t)
        y = _lerp(ya, yb, t)
        z = _lerp(za, zb, t)

        # Conservative visibility: don't "invent" confidence mid-way.
        vis = min(va, vb)

        # Optional: keep within your tolerance window
        x = _clamp(x, -0.25, 1.25)
        y = _clamp(y, -0.25, 1.25)
        vis = _clamp(vis, 0.0, 1.0)

        out.append(Landmark(x=x, y=y, z=z, visibility=vis))

    # If next_pose has extra landmarks (e.g., model upgrade), keep them.
    if len(b) > n:
        for lb in b[n:]:
            out.append(
                Landmark(
                    x=_clamp(_safe_float(getattr(lb, "x", 0.0)), -0.25, 1.25),
                    y=_clamp(_safe_float(getattr(lb, "y", 0.0)), -0.25, 1.25),
                    z=_safe_float(getattr(lb, "z", 0.0)),
                    visibility=_clamp(_safe_float(getattr(lb, "visibility", 0.0)), 0.0, 1.0),
                )
            )

    return PoseResultCompat(pose_landmarks=PoseLandmarks(landmark=out))