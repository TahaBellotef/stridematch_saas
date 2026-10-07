from app.db.engine import engine, SessionLocal
from app.db.base import Base
from app.models.runner_profile import RunnerProfileModel


def _setup():
    Base.metadata.create_all(bind=engine)


def test_create_and_read_runner_profile_with_json_fields():
    _setup()
    with SessionLocal() as db:
        p = RunnerProfileModel(
            cognito_sub="sub-model-1",
            email="a@b.com",
            full_name="Mary Smith",
            sex="female",
            age=30,
            height_cm=170.0,
            weight_kg=60.0,
            level="intermediate",
            pronation="pronation",
            shoe_size={"eur": 42, "uk": 8, "us": 9},
            current_shoes=["shoe-123", "shoe-456"],
            has_pain=True,
            pain_areas=["plantar_fasciitis", "shin_splints"],
            surface="road",
            weekly_distance="dist_20_40",
            pace="pace_5_6",
            desired_type="cushioning_support",
            features=["cushioning", "support"],
            price_range="eur_100_150",
            performance_tests={"ligament_state": "stable", "knee_performance": "no_change"},
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        pid = p.id

    with SessionLocal() as db:
        got = db.get(RunnerProfileModel, pid)
        assert got.cognito_sub == "sub-model-1"
        assert got.shoe_size == {"eur": 42, "uk": 8, "us": 9}
        assert got.current_shoes == ["shoe-123", "shoe-456"]
        assert got.pain_areas == ["plantar_fasciitis", "shin_splints"]
        assert got.performance_tests["knee_performance"] == "no_change"
        assert got.created_at is not None
