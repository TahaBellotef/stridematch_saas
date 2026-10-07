from __future__ import annotations

from app.models.runner_profile import RunnerProfileModel
from app.schemas.runner_profile import RunnerProfile  # the recommender schema

_DISTANCE = {
    "dist_0_10": "lt_10",
    "dist_10_20": "10_25",
    "dist_20_40": "25_50",
    "dist_40_60": "25_50",
    "dist_gt_60": "gt_50",
}

_PREFERENCE = {
    "cushioning_support": "comfort",
    "performance_speed": "responsiveness",
    "stability_support": "stability",
    "versatility": "versatility",
}

# Fields the recommender requires with no "unknown" fallback.
_REQUIRED = ("sex", "age", "weight_kg", "height_cm", "level", "surface", "weekly_distance")


class IncompleteProfileError(ValueError):
    """Raised when a profile lacks fields the recommender requires."""


def to_recommender_profile(p: RunnerProfileModel) -> RunnerProfile:
    missing = [name for name in _REQUIRED if getattr(p, name) is None]
    if missing:
        raise IncompleteProfileError("missing required fields: " + ", ".join(missing))

    return RunnerProfile(
        gender=p.sex,
        age=p.age,
        weight_kg=p.weight_kg,
        height_cm=p.height_cm,
        level=p.level,
        surface=p.surface,
        weekly_distance=_DISTANCE[p.weekly_distance],
        pronation=p.pronation or "unknown",
        preference=_PREFERENCE.get(p.desired_type, "unknown"),
    )
