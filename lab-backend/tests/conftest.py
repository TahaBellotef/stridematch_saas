"""Shared fixtures and environment setup for StrideMatchLab tests."""

from __future__ import annotations

import os

# Set required env vars BEFORE any app modules are imported.
# Use direct assignment (not setdefault) to override .env values.
os.environ["ADMIN_USERNAME"] = "test_admin"
os.environ["ADMIN_PASSWORD"] = "test_password_123"
os.environ["ADMIN_PASSWORD_BCRYPT"] = ""   # Clear so plaintext fallback is used
os.environ["ADMIN_PASSWORD_HASH"] = ""     # Clear so plaintext fallback is used
os.environ["STRIDEMATCH_AUTH_SECRET"] = "xK9mQ2vR7nB4wT8jL5pF3hD6gY0cA1eU"
os.environ["APP_DEBUG"] = "true"  # Allow plaintext passwords in tests

# Use in-memory SQLite so tests get a fresh DB with correct schema
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["ANALYSIS_RESULTS_DATABASE_URL"] = "sqlite:///:memory:"

# Disable Cognito for tests (force local JWT mode)
os.environ["COGNITO_REGION"] = ""
os.environ["COGNITO_USER_POOL_ID"] = ""
os.environ["COGNITO_CLIENT_ID"] = ""
os.environ["COGNITO_DOMAIN"] = ""

# Use local upload mode in tests (no S3 dependency)
os.environ["UPLOAD_MODE"] = "local"

import pytest
from sqlalchemy import create_engine, text

from app.schemas import SideBioMetrics, RearBioMetrics


# ---------------------------------------------------------------------------
# Ensure analysis_results table exists in shared in-memory DB
# (not managed by SQLAlchemy ORM models, normally created by Alembic)
# ---------------------------------------------------------------------------
from app.db.engine import engine as _app_engine
from app.db.base import Base
from app.db import models as _models  # noqa: F401 — register all models

# Create all ORM tables (organizations, stores, user_org_memberships, etc.)
Base.metadata.create_all(bind=_app_engine)

# Create analysis_results (raw SQL table, not in ORM)
with _app_engine.begin() as _conn:
    _conn.execute(text("""
        CREATE TABLE IF NOT EXISTS analysis_results (
            job_id       TEXT PRIMARY KEY,
            user_id      TEXT,
            created_at   TIMESTAMP,
            gait_type    TEXT,
            bio_json     TEXT,
            remarks_json TEXT,
            video_url    TEXT,
            analysis_type TEXT,
            rear_json    TEXT,
            pronation    TEXT,
            rear_quality TEXT,
            rear_video_url TEXT,
            side_video_url TEXT,
            result_json  TEXT,
            organization_id TEXT
        )
    """))

# Create a test organization + superadmin membership for integration tests
from app.db.engine import SessionLocal
from app.models.tenant import OrganizationModel, UserOrgMembershipModel

with SessionLocal() as _db:
    _test_org = OrganizationModel(id="test-org", name="Test Org", slug="test")
    _db.add(_test_org)
    _db.commit()
    # Create memberships for all test users
    for _sub, _role in [
        ("test_admin", "superadmin"),
        ("user-abc-123", "staff"),
        ("user-xyz-999", "staff"),
    ]:
        _db.add(UserOrgMembershipModel(
            cognito_sub=_sub,
            organization_id="test-org",
            role=_role,
        ))
    _db.commit()


# ---------------------------------------------------------------------------
# Bio fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def side_bio() -> SideBioMetrics:
    return SideBioMetrics(
        knee_mean=160.0,
        knee_left_mean=158.0,
        knee_right_mean=162.0,
        cadence=175,
        osc=7.5,
        sym=92.0,
        contact_time=255,
        pronation="neutral",
    )


@pytest.fixture
def rear_bio() -> RearBioMetrics:
    return RearBioMetrics(
        cadence=170,
        pronation="neutral",
        rear_quality="high",
    )


# ---------------------------------------------------------------------------
# In-memory SQLite engine for persistence tests
# ---------------------------------------------------------------------------

@pytest.fixture
def mem_engine():
    engine = create_engine("sqlite:///:memory:", future=True)
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE analysis_results (
                job_id       TEXT PRIMARY KEY,
                user_id      TEXT,
                created_at   TIMESTAMP,
                gait_type    TEXT,
                bio_json     TEXT,
                remarks_json TEXT,
                video_url    TEXT,
                analysis_type TEXT,
                rear_json    TEXT,
                pronation    TEXT,
                rear_quality TEXT,
                rear_video_url TEXT,
                side_video_url TEXT,
                result_json  TEXT,
                organization_id TEXT
            )
        """))
    yield engine
    engine.dispose()
