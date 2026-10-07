import pytest

from app.models.runner_profile import RunnerProfileModel
from app.services.runner_profile_mapping import (
    to_recommender_profile,
    IncompleteProfileError,
)


def _complete(**over) -> RunnerProfileModel:
    base = dict(
        cognito_sub="sub-map",
        sex="female", age=30, weight_kg=60.0, height_cm=170.0,
        level="intermediate", surface="road", weekly_distance="dist_20_40",
        pronation="pronation", desired_type="cushioning_support",
    )
    base.update(over)
    return RunnerProfileModel(**base)


def test_maps_codes_to_recommender_enums():
    out = to_recommender_profile(_complete())
    assert out.gender == "female"
    assert out.weekly_distance == "25_50"        # dist_20_40 -> 25_50
    assert out.preference == "comfort"           # cushioning_support -> comfort
    assert out.pronation == "pronation"


def test_pronation_and_preference_fall_back_to_unknown():
    out = to_recommender_profile(_complete(pronation=None, desired_type=None))
    assert out.pronation == "unknown"
    assert out.preference == "unknown"


def test_distance_buckets_collapse_40_60_into_25_50():
    assert to_recommender_profile(_complete(weekly_distance="dist_40_60")).weekly_distance == "25_50"
    assert to_recommender_profile(_complete(weekly_distance="dist_gt_60")).weekly_distance == "gt_50"


def test_missing_required_field_raises():
    with pytest.raises(IncompleteProfileError) as exc:
        to_recommender_profile(_complete(age=None, surface=None))
    msg = str(exc.value)
    assert "age" in msg and "surface" in msg
