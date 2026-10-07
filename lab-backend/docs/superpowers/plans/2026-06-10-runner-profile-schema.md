# Runner Profile Schema & DB Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated, user-owned `runner_profiles` table with CRUD routes and a recommender-mapping layer so the B2C mobile app can store each user's complete runner profile.

**Architecture:** New SQLAlchemy model (auto-created by the existing `create_all` + `_migrate_missing_columns` boot path, no Alembic) owned by the authenticated Cognito user (`cognito_sub`, unique). Pydantic v2 schemas with camelCase aliases. A thin service layer does all DB work; a FastAPI router exposes "me" routes (`/api/v1/runners/profile`) plus ownership/admin-guarded `:id` routes. A pure mapping function translates stored app-codes to the existing recommender enums.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy ORM, pytest (SQLite in-memory).

**Source spec:** `docs/superpowers/specs/2026-06-10-runner-profile-schema-design.md`

---

## Conventions you must follow (read before starting)

- **Routes mount under `/api/v1`.** The spec's `/api/runners/profile` is illustrative; the real path is **`/api/v1/runners/profile`** (every existing router uses `/api/v1`). The router declares `prefix="/runners/profile"`; `main.py` mounts it with `prefix="/api/v1"`.
- **Auth:** `from app.auth import require_user, is_admin`. `require_user` is an async dependency returning a claims dict `{"sub": ..., "provider": ...}`. `is_admin(claims) -> bool`.
- **DB session:** `from app.db.deps import get_db` (FastAPI dependency yielding a `Session`).
- **No Claude attribution** in any commit message.
- **Mapping module** lives at `app/services/runner_profile_mapping.py` (there is no `app/services/recommendation/` package; do not create one).
- **Tests** mirror `tests/test_lower_body_endpoint.py`: `from main import app`, `TestClient(app)`, `from app.auth import create_access_token`, header helper `_auth(t) = {"Authorization": f"Bearer {t}"}`. In tests Cognito is disabled (local JWT mode); `create_access_token("test_admin")` yields an **admin** token (admin username is `test_admin` per `tests/conftest.py`); any other subject is a normal user.
- **Run tests** with the suite's env already set by `tests/conftest.py`. Command: `python -m pytest tests/<file> -v`.

---

## File Structure

| File | Responsibility |
|---|---|
| `app/models/runner_profile.py` (create) | `RunnerProfileModel` ORM table `runner_profiles` |
| `app/db/models.py` (modify) | import the new model so it's registered for `create_all`/auto-migrate |
| `app/schemas/runner_profile_api.py` (create) | Pydantic request/response schemas (camelCase aliases) |
| `app/services/runner_profile.py` (create) | DB operations: get/upsert/update/update_analysis |
| `app/services/runner_profile_mapping.py` (create) | `to_recommender_profile()` code→enum mapping |
| `app/routers/runner_profile.py` (create) | FastAPI router (me + `:id` routes) |
| `app/routers/__init__.py` (modify) | register `runner_profile_router` |
| `main.py` (modify) | import + `include_router(..., prefix="/api/v1")` |
| `tests/test_runner_profile_model.py` (create) | model persistence + JSON round-trip |
| `tests/test_runner_profile_service.py` (create) | service upsert/update/update_analysis |
| `tests/test_runner_profile_mapping.py` (create) | mapping codes + incomplete-profile error |
| `tests/test_runner_profile_routes.py` (create) | route auth matrix + CRUD |
| `documents/Runner_Profile_Mobile_Integration_Contract.md` (create) | mobile dev contract |

---

## Task 1: ORM model `RunnerProfileModel`

**Files:**
- Create: `app/models/runner_profile.py`
- Modify: `app/db/models.py`
- Test: `tests/test_runner_profile_model.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_runner_profile_model.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_runner_profile_model.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.runner_profile'`

- [ ] **Step 3: Create the model**

Create `app/models/runner_profile.py`:

```python
#
#  File: models/runner_profile.py
#  Project: StrideMatchLab
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String

from app.db.base import Base


class RunnerProfileModel(Base):
    """B2C runner profile, owned by the authenticated end-user (Cognito sub)."""

    __tablename__ = "runner_profiles"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    cognito_sub = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=True)

    # Personal information
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    sex = Column(String, nullable=True)  # male | female

    # Body measurements
    age = Column(Integer, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)

    # Running experience
    level = Column(String, nullable=True)  # beginner | intermediate | advanced

    # Analysis result (server-updated; client may seed)
    pronation = Column(String, nullable=True)  # neutral | pronation | supination
    latest_analysis_job_id = Column(String, nullable=True)

    # Shoe information
    shoe_size = Column(JSON, nullable=True)      # {"eur": n, "uk": n, "us": n}
    current_shoes = Column(JSON, nullable=True)  # ["shoeId", ...]

    # Injury information
    has_pain = Column(Boolean, nullable=True)
    pain_areas = Column(JSON, nullable=True)     # ["achilles_tendonitis", ...]

    # Running habits
    surface = Column(String, nullable=True)          # road | trail | treadmill | mixed
    weekly_distance = Column(String, nullable=True)  # dist_0_10 ... dist_gt_60
    pace = Column(String, nullable=True)             # pace_3_4 ... pace_gt_8

    # Shoe preferences
    desired_type = Column(String, nullable=True)  # cushioning_support ... versatility
    features = Column(JSON, nullable=True)        # ["cushioning", ...]
    price_range = Column(String, nullable=True)   # eur_50_100 ... eur_gt_300

    # Performance tests
    performance_tests = Column(JSON, nullable=True)  # {"ligament_state":..,"knee_performance":..}

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
```

- [ ] **Step 4: Register the model for auto-migrate**

In `app/db/models.py`, add the import alongside the others:

```python
from app.models.runner_profile import RunnerProfileModel
```

- [ ] **Step 5: Run test to verify it passes**

Run: `python -m pytest tests/test_runner_profile_model.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/models/runner_profile.py app/db/models.py tests/test_runner_profile_model.py
git commit -m "feat(runner-profile): add runner_profiles ORM model"
```

---

## Task 2: Pydantic API schemas

**Files:**
- Create: `app/schemas/runner_profile_api.py`
- Test: `tests/test_runner_profile_service.py` (schema-parsing tests added here; service tests appended in Task 3)

- [ ] **Step 1: Write the failing test**

Create `tests/test_runner_profile_service.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_runner_profile_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.runner_profile_api'`

- [ ] **Step 3: Create the schemas**

Create `app/schemas/runner_profile_api.py`:

```python
from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

Sex = Literal["male", "female"]
Level = Literal["beginner", "intermediate", "advanced"]
Pronation = Literal["neutral", "pronation", "supination"]
Surface = Literal["road", "trail", "treadmill", "mixed"]
WeeklyDistance = Literal[
    "dist_0_10", "dist_10_20", "dist_20_40", "dist_40_60", "dist_gt_60"
]
Pace = Literal[
    "pace_3_4", "pace_4_5", "pace_5_6", "pace_6_7", "pace_7_8", "pace_gt_8"
]
DesiredType = Literal[
    "cushioning_support", "performance_speed", "stability_support", "versatility"
]
Feature = Literal[
    "cushioning", "support", "stability", "speed", "lightweight", "durability"
]
PriceRange = Literal["eur_50_100", "eur_100_150", "eur_150_300", "eur_gt_300"]
PainArea = Literal[
    "achilles_tendonitis", "plantar_fasciitis", "shin_splints", "runners_knee",
    "it_band_syndrome", "ankle_sprain", "hamstring_strain", "calf_strain",
    "stress_fracture",
]
LigamentState = Literal["stable", "slightly_unstable"]
KneePerformance = Literal["increases", "decreases", "no_change"]


class ShoeSize(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eur: Optional[float] = None
    uk: Optional[float] = None
    us: Optional[float] = None


class PerformanceTests(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    ligament_state: Optional[LigamentState] = Field(default=None, alias="ligamentState")
    knee_performance: Optional[KneePerformance] = Field(default=None, alias="kneePerformance")


class RunnerProfileBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    full_name: Optional[str] = Field(default=None, alias="fullName")
    email: Optional[str] = None
    phone: Optional[str] = None
    sex: Optional[Sex] = None

    age: Optional[int] = Field(default=None, ge=18, le=100)
    height_cm: Optional[float] = Field(default=None, alias="heightCm")
    weight_kg: Optional[float] = Field(default=None, alias="weightKg")

    level: Optional[Level] = None

    pronation: Optional[Pronation] = None

    shoe_size: Optional[ShoeSize] = Field(default=None, alias="shoeSize")
    current_shoes: Optional[List[str]] = Field(default=None, alias="currentShoes")

    has_pain: Optional[bool] = Field(default=None, alias="hasPain")
    pain_areas: Optional[List[PainArea]] = Field(default=None, alias="painAreas")

    surface: Optional[Surface] = None
    weekly_distance: Optional[WeeklyDistance] = Field(default=None, alias="weeklyDistance")
    pace: Optional[Pace] = None

    desired_type: Optional[DesiredType] = Field(default=None, alias="desiredType")
    features: Optional[List[Feature]] = None
    price_range: Optional[PriceRange] = Field(default=None, alias="priceRange")

    performance_tests: Optional[PerformanceTests] = Field(default=None, alias="performanceTests")


class RunnerProfileCreate(RunnerProfileBase):
    pass


class RunnerProfileUpdate(RunnerProfileBase):
    pass


class RunnerProfileResponse(RunnerProfileBase):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, extra="ignore")

    id: str
    latest_analysis_job_id: Optional[str] = Field(default=None, alias="latestAnalysisJobId")
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    updated_at: Optional[datetime] = Field(default=None, alias="updatedAt")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest tests/test_runner_profile_service.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/schemas/runner_profile_api.py tests/test_runner_profile_service.py
git commit -m "feat(runner-profile): add Pydantic request/response schemas"
```

---

## Task 3: Service layer

**Files:**
- Create: `app/services/runner_profile.py`
- Test: `tests/test_runner_profile_service.py` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/test_runner_profile_service.py`)

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_runner_profile_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.runner_profile'`

- [ ] **Step 3: Implement the service**

Create `app/services/runner_profile.py`:

```python
from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.runner_profile import RunnerProfileModel
from app.schemas.runner_profile_api import RunnerProfileCreate, RunnerProfileUpdate


def get_by_sub(db: Session, sub: str) -> Optional[RunnerProfileModel]:
    return (
        db.query(RunnerProfileModel)
        .filter(RunnerProfileModel.cognito_sub == sub)
        .one_or_none()
    )


def get_by_id(db: Session, profile_id: str) -> Optional[RunnerProfileModel]:
    return db.get(RunnerProfileModel, profile_id)


def _apply(model: RunnerProfileModel, payload: dict) -> None:
    for key, value in payload.items():
        setattr(model, key, value)


def upsert_for_sub(db: Session, sub: str, data: RunnerProfileCreate) -> RunnerProfileModel:
    payload = data.model_dump(exclude_unset=True, by_alias=False)
    model = get_by_sub(db, sub)
    if model is None:
        model = RunnerProfileModel(cognito_sub=sub)
        db.add(model)
    _apply(model, payload)
    db.commit()
    db.refresh(model)
    return model


def update_for_sub(db: Session, sub: str, data: RunnerProfileUpdate) -> Optional[RunnerProfileModel]:
    model = get_by_sub(db, sub)
    if model is None:
        return None
    _apply(model, data.model_dump(exclude_unset=True, by_alias=False))
    db.commit()
    db.refresh(model)
    return model


def update_analysis(
    db: Session, sub: str, job_id: Optional[str], pronation: Optional[str]
) -> RunnerProfileModel:
    """Called by the analysis-completion path. Analysis value wins over client seed."""
    model = get_by_sub(db, sub)
    if model is None:
        model = RunnerProfileModel(cognito_sub=sub)
        db.add(model)
    model.pronation = pronation
    model.latest_analysis_job_id = job_id
    db.commit()
    db.refresh(model)
    return model
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_runner_profile_service.py -v`
Expected: PASS (all tests: schema + service)

- [ ] **Step 5: Commit**

```bash
git add app/services/runner_profile.py tests/test_runner_profile_service.py
git commit -m "feat(runner-profile): add service layer (upsert/update/update_analysis)"
```

> **Scope note:** `update_analysis` is implemented and tested so the analysis pipeline can call it, but **wiring it into the live analysis-completion path is out of scope for this plan** — that belongs with the B2C analysis flow (not part of the source PDF). Leaving it un-wired here keeps this subsystem self-contained.

---

## Task 4: Recommender mapping

**Files:**
- Create: `app/services/runner_profile_mapping.py`
- Test: `tests/test_runner_profile_mapping.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_runner_profile_mapping.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_runner_profile_mapping.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.runner_profile_mapping'`

- [ ] **Step 3: Implement the mapping**

Create `app/services/runner_profile_mapping.py`:

```python
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `python -m pytest tests/test_runner_profile_mapping.py -v`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/services/runner_profile_mapping.py tests/test_runner_profile_mapping.py
git commit -m "feat(runner-profile): map profile codes to recommender enums"
```

---

## Task 5: Router + registration

**Files:**
- Create: `app/routers/runner_profile.py`
- Modify: `app/routers/__init__.py`, `main.py`
- Test: `tests/test_runner_profile_routes.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_runner_profile_routes.py`:

```python
import pytest
from fastapi.testclient import TestClient

from main import app
from app.auth import create_access_token
from app.db.engine import engine
from app.db.base import Base
from app.models.runner_profile import RunnerProfileModel  # noqa: F401


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    return TestClient(app)


def _auth(t):
    return {"Authorization": f"Bearer {t}"}


def test_post_creates_then_get_returns_own_profile(client):
    tok = create_access_token("sub-route-user-1")
    r = client.post("/api/v1/runners/profile", json={"age": 30, "weeklyDistance": "dist_20_40"}, headers=_auth(tok))
    assert r.status_code == 200
    body = r.json()
    assert body["age"] == 30
    assert body["weeklyDistance"] == "dist_20_40"
    assert "id" in body

    r2 = client.get("/api/v1/runners/profile", headers=_auth(tok))
    assert r2.status_code == 200
    assert r2.json()["id"] == body["id"]


def test_get_without_token_is_401(client):
    assert client.get("/api/v1/runners/profile").status_code in (401, 403)


def test_get_missing_profile_is_404(client):
    tok = create_access_token("sub-route-nobody")
    assert client.get("/api/v1/runners/profile", headers=_auth(tok)).status_code == 404


def test_put_partial_update(client):
    tok = create_access_token("sub-route-user-2")
    client.post("/api/v1/runners/profile", json={"age": 25, "level": "beginner"}, headers=_auth(tok))
    r = client.put("/api/v1/runners/profile", json={"level": "advanced"}, headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["age"] == 25
    assert r.json()["level"] == "advanced"


def test_bad_enum_returns_422(client):
    tok = create_access_token("sub-route-user-3")
    r = client.post("/api/v1/runners/profile", json={"surface": "highway"}, headers=_auth(tok))
    assert r.status_code == 422


def test_id_route_forbidden_for_non_owner(client):
    owner = create_access_token("sub-route-owner")
    created = client.post("/api/v1/runners/profile", json={"age": 33}, headers=_auth(owner)).json()
    other = create_access_token("sub-route-other")
    r = client.get(f"/api/v1/runners/profile/{created['id']}", headers=_auth(other))
    assert r.status_code == 403


def test_id_route_allowed_for_admin(client):
    owner = create_access_token("sub-route-owner-2")
    created = client.post("/api/v1/runners/profile", json={"age": 44}, headers=_auth(owner)).json()
    admin = create_access_token("test_admin")  # admin username from conftest
    r = client.get(f"/api/v1/runners/profile/{created['id']}", headers=_auth(admin))
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_pronation_is_client_writable_on_create(client):
    tok = create_access_token("sub-route-pron")
    r = client.post("/api/v1/runners/profile", json={"pronation": "neutral"}, headers=_auth(tok))
    assert r.status_code == 200
    assert r.json()["pronation"] == "neutral"
```

- [ ] **Step 2: Run to verify it fails**

Run: `python -m pytest tests/test_runner_profile_routes.py -v`
Expected: FAIL — routes return 404 for all paths (router not registered yet).

- [ ] **Step 3: Create the router**

Create `app/routers/runner_profile.py`:

```python
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import require_user, is_admin
from app.db.deps import get_db
from app.schemas.runner_profile_api import (
    RunnerProfileCreate,
    RunnerProfileUpdate,
    RunnerProfileResponse,
)
from app.services import runner_profile as svc

router = APIRouter(prefix="/runners/profile", tags=["runner-profile"])


@router.post("", response_model=RunnerProfileResponse)
def create_profile(
    body: RunnerProfileCreate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    return svc.upsert_for_sub(db, claims["sub"], body)


@router.get("", response_model=RunnerProfileResponse)
def get_my_profile(
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_sub(db, claims["sub"])
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return model


@router.put("", response_model=RunnerProfileResponse)
def update_my_profile(
    body: RunnerProfileUpdate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.update_for_sub(db, claims["sub"], body)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    return model


@router.get("/{profile_id}", response_model=RunnerProfileResponse)
def get_profile_by_id(
    profile_id: str,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_id(db, profile_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    if model.cognito_sub != claims["sub"] and not is_admin(claims):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return model


@router.put("/{profile_id}", response_model=RunnerProfileResponse)
def update_profile_by_id(
    profile_id: str,
    body: RunnerProfileUpdate,
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
):
    model = svc.get_by_id(db, profile_id)
    if model is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "profile not found")
    if model.cognito_sub != claims["sub"] and not is_admin(claims):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    return svc.update_for_sub(db, model.cognito_sub, body)
```

- [ ] **Step 4: Register the router in `app/routers/__init__.py`**

Add after the existing `_load_router` lines:

```python
runner_profile_router = _load_router(".runner_profile", "router")
```

And add `"runner_profile_router",` to the `__all__` list.

- [ ] **Step 5: Wire it into `main.py`**

In the `from app.routers import (...)` block add `runner_profile_router,`. After the other `app.include_router(...)` lines add:

```python
    app.include_router(runner_profile_router, prefix="/api/v1")
```

- [ ] **Step 6: Run to verify it passes**

Run: `python -m pytest tests/test_runner_profile_routes.py -v`
Expected: PASS (all tests)

- [ ] **Step 7: Run the new-file suite together**

Run: `python -m pytest tests/test_runner_profile_model.py tests/test_runner_profile_service.py tests/test_runner_profile_mapping.py tests/test_runner_profile_routes.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/routers/runner_profile.py app/routers/__init__.py main.py tests/test_runner_profile_routes.py
git commit -m "feat(runner-profile): add CRUD routes (me + id, ownership/admin guarded)"
```

---

## Task 6: Mobile integration contract doc

**Files:**
- Create: `documents/Runner_Profile_Mobile_Integration_Contract.md`

- [ ] **Step 1: Write the contract doc**

Create `documents/Runner_Profile_Mobile_Integration_Contract.md` with these sections (English):

1. **Auth** — every route requires `Authorization: Bearer <Cognito JWT>`; the profile is bound to the token's `sub`.
2. **Routes** — table of the five endpoints with the real `/api/v1/runners/profile` base, request body, and status codes (200 / 401 / 403 / 404 / 422).
3. **Request/response JSON example** — a full camelCase example body (`fullName`, `weightKg`, `heightCm`, `shoeSize{eur,uk,us}`, `currentShoes[]`, `hasPain`, `painAreas[]`, `weeklyDistance`, `pace`, `desiredType`, `features[]`, `priceRange`, `performanceTests{ligamentState,kneePerformance}`) plus the response extras (`id`, `pronation`, `latestAnalysisJobId`, `createdAt`, `updatedAt`).
4. **Enum code → label tables (EN/FR)** — one table per enum (sex, level, surface, weeklyDistance, pace, desiredType, features, priceRange, painAreas, ligamentState, kneePerformance, pronation) mapping each stored code to its English and French display label, so the app renders labels client-side.
5. **Field ownership notes** — `pronation` may be sent by the app but is overwritten by analysis results; `currentShoes` holds shoe-catalog ids; all fields except identity are optional (incremental wizard).

- [ ] **Step 2: Commit**

```bash
git add documents/Runner_Profile_Mobile_Integration_Contract.md
git commit -m "docs(runner-profile): mobile integration contract for iOS/Android"
```

---

## Final verification

- [ ] Run the full new-feature suite:
  `python -m pytest tests/test_runner_profile_model.py tests/test_runner_profile_service.py tests/test_runner_profile_mapping.py tests/test_runner_profile_routes.py -v`
- [ ] Confirm the app boots (router mounts cleanly):
  `python -c "import main; print(len(main.app.routes))"` (no import errors)
- [ ] Then use **superpowers:finishing-a-development-branch** to open the PR.

> **Note on local env:** running the *entire* suite locally may show pre-existing collection errors in `tests/test_api_integration.py` / `tests/test_lower_body_endpoint.py` due to a local pydantic 2.9.2 vs pinned 2.12.5 mismatch — unrelated to this feature. Use `pip install -r requirements.txt` to match CI, or scope test runs to the new files above.
