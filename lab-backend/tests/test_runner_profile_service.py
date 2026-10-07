import pytest
from pydantic import ValidationError

from app.schemas.runner_profile_api import (
    RunnerProfileCreate,
    RunnerProfileUpdate,
)


def test_create_parses_camelcase_aliases_and_nested():
    body = RunnerProfileCreate.model_validate({
        "fullName": "Mary Smith",
        "weightKg": 60.0,
        "heightCm": 170.0,
        "weeklyDistance": "dist_20_40",
        "shoeSize": {"eur": 42, "uk": 8, "us": 9},
        "currentShoes": ["shoe-1"],
        "hasPain": True,
        "painAreas": ["plantar_fasciitis"],
        "desiredType": "cushioning_support",
        "performanceTests": {"ligamentState": "stable", "kneePerformance": "no_change"},
    })
    assert body.full_name == "Mary Smith"
    assert body.weight_kg == 60.0
    assert body.weekly_distance == "dist_20_40"
    assert body.shoe_size.eur == 42
    assert body.performance_tests.knee_performance == "no_change"


def test_bad_enum_code_rejected():
    with pytest.raises(ValidationError):
        RunnerProfileCreate.model_validate({"surface": "highway"})


def test_update_is_all_optional_and_excludes_unset():
    body = RunnerProfileUpdate.model_validate({"age": 41})
    dumped = body.model_dump(exclude_unset=True, by_alias=False)
    assert dumped == {"age": 41}


def test_age_bounds_enforced():
    with pytest.raises(ValidationError):
        RunnerProfileCreate.model_validate({"age": 12})


from app.db.engine import engine, SessionLocal
from app.db.base import Base
from app.models.runner_profile import RunnerProfileModel  # noqa: F401
from app.services import runner_profile as svc


def _db():
    Base.metadata.create_all(bind=engine)
    return SessionLocal()


def test_upsert_creates_then_updates_same_row():
    with _db() as db:
        a = svc.upsert_for_sub(db, "sub-svc-1", RunnerProfileCreate.model_validate({"age": 30}))
        first_id = a.id
        b = svc.upsert_for_sub(db, "sub-svc-1", RunnerProfileCreate.model_validate({"age": 31, "sex": "male"}))
        assert b.id == first_id          # same row (one per user)
        assert b.age == 31
        assert b.sex == "male"


def test_update_for_sub_partial_only_touches_sent_fields():
    with _db() as db:
        svc.upsert_for_sub(db, "sub-svc-2", RunnerProfileCreate.model_validate({"age": 30, "level": "beginner"}))
        updated = svc.update_for_sub(db, "sub-svc-2", RunnerProfileUpdate.model_validate({"level": "advanced"}))
        assert updated.age == 30          # untouched
        assert updated.level == "advanced"


def test_update_for_sub_returns_none_when_absent():
    with _db() as db:
        assert svc.update_for_sub(db, "sub-missing", RunnerProfileUpdate.model_validate({"age": 40})) is None


def test_update_analysis_overwrites_pronation_and_sets_job():
    with _db() as db:
        svc.upsert_for_sub(db, "sub-svc-3", RunnerProfileCreate.model_validate({"pronation": "neutral"}))
        m = svc.update_analysis(db, "sub-svc-3", job_id="job-9", pronation="supination")
        assert m.pronation == "supination"          # analysis wins over client seed
        assert m.latest_analysis_job_id == "job-9"


def test_update_analysis_creates_profile_when_absent():
    with _db() as db:
        m = svc.update_analysis(db, "sub-svc-4", job_id="job-1", pronation="pronation")
        assert m.cognito_sub == "sub-svc-4"
        assert m.pronation == "pronation"
