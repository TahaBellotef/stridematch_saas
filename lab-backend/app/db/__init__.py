import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import text

from .engine import engine, SessionLocal
from .base import Base

logger = logging.getLogger(__name__)

BOOTSTRAP_ORG_SLUG = "default"
BOOTSTRAP_ADMIN_EMAIL = "pv@stridematch.io"


def _bootstrap_tenant() -> None:
    """
    Create the default organization and superadmin membership on first run.
    Skips silently if they already exist.
    """
    with SessionLocal() as db:
        from app.config import ADMIN_CREDENTIALS, LOCAL_DEFAULT_ORGANIZATION_ID
        from app.models.tenant import OrganizationModel, UserOrgMembershipModel

        # --- Default organization ---
        org = db.query(OrganizationModel).filter(OrganizationModel.slug == BOOTSTRAP_ORG_SLUG).one_or_none()
        if org is None:
            org = OrganizationModel(
                id=uuid.uuid4().hex,
                name="StrideMatch",
                slug=BOOTSTRAP_ORG_SLUG,
                is_active=True,
            )
            db.add(org)
            db.commit()
            db.refresh(org)
            logger.info("Bootstrap: created default organization (id=%s)", org.id)

        # --- Superadmin membership for pv@stridematch.io ---
        # Look up Cognito sub by email via the admin endpoint is not possible at
        # boot time, so we use the email as a placeholder cognito_sub.
        # On first login, the actual sub will be in the JWT — update it then,
        # or set the real sub here once you know it.
        existing = (
            db.query(UserOrgMembershipModel)
            .filter(UserOrgMembershipModel.role == "superadmin")
            .first()
        )
        if existing is None:
            membership = UserOrgMembershipModel(
                id=uuid.uuid4().hex,
                cognito_sub=BOOTSTRAP_ADMIN_EMAIL,  # placeholder until first login
                organization_id=org.id,
                store_id=None,
                role="superadmin",
            )
            db.add(membership)
            db.commit()
            logger.info("Bootstrap: created superadmin membership for %s (org=%s)", BOOTSTRAP_ADMIN_EMAIL, org.id)

        default_org_id = LOCAL_DEFAULT_ORGANIZATION_ID or org.id
        for admin_username in ADMIN_CREDENTIALS:
            linked = (
                db.query(UserOrgMembershipModel)
                .filter(UserOrgMembershipModel.cognito_sub == admin_username)
                .one_or_none()
            )
            if linked is None:
                db.add(
                    UserOrgMembershipModel(
                        id=uuid.uuid4().hex,
                        cognito_sub=admin_username,
                        organization_id=default_org_id,
                        store_id=None,
                        role="org_admin",
                    )
                )
        db.commit()


def _migrate_missing_columns() -> None:
    """Add columns that exist in models but not yet in the DB."""
    from sqlalchemy import inspect, text as sa_text
    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            col_type = col.type.compile(engine.dialect)
            stmt = f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {col_type}'
            logger.info("auto-migrate: %s", stmt)
            with engine.begin() as conn:
                conn.execute(sa_text(stmt))


def _ensure_analysis_results_table() -> None:
    """Create the analysis_results table if it doesn't exist (raw SQL, not ORM)."""
    from app.config import ANALYSIS_RESULTS_TABLE
    from sqlalchemy import text as sa_text
    with engine.begin() as conn:
        conn.execute(sa_text(f"""
            CREATE TABLE IF NOT EXISTS {ANALYSIS_RESULTS_TABLE} (
                job_id          TEXT PRIMARY KEY,
                user_id         TEXT,
                created_at      TIMESTAMP,
                gait_type       TEXT,
                bio_json        TEXT,
                remarks_json    TEXT,
                video_url       TEXT,
                analysis_type   TEXT,
                rear_json       TEXT,
                pronation       TEXT,
                rear_quality    TEXT,
                rear_video_url  TEXT,
                side_video_url  TEXT,
                result_json     TEXT,
                organization_id TEXT
            )
        """))


# Columns added after initial deployments — ALTER TABLE when missing.
_ANALYSIS_RESULTS_MIGRATION_COLUMNS = {
    "analysis_type": "TEXT",
    "rear_json": "TEXT",
    "pronation": "TEXT",
    "rear_quality": "TEXT",
    "rear_video_url": "TEXT",
    "side_video_url": "TEXT",
    "result_json": "TEXT",
    "organization_id": "TEXT",
}


def ensure_analysis_results_schema(db_engine=None) -> None:
    """Ensure analysis_results exists and has all expected columns."""
    from sqlalchemy import inspect
    from app.config import ANALYSIS_RESULTS_TABLE

    db_engine = db_engine or engine
    _ensure_analysis_results_table_on(db_engine, ANALYSIS_RESULTS_TABLE)

    insp = inspect(db_engine)
    if not insp.has_table(ANALYSIS_RESULTS_TABLE):
        return

    existing = {c["name"] for c in insp.get_columns(ANALYSIS_RESULTS_TABLE)}
    for col, col_type in _ANALYSIS_RESULTS_MIGRATION_COLUMNS.items():
        if col in existing:
            continue
        stmt = f"ALTER TABLE {ANALYSIS_RESULTS_TABLE} ADD COLUMN {col} {col_type}"
        logger.info("auto-migrate analysis_results: %s", stmt)
        with db_engine.begin() as conn:
            conn.execute(text(stmt))


def _ensure_analysis_results_table_on(db_engine, table_name: str) -> None:
    from sqlalchemy import text as sa_text
    with db_engine.begin() as conn:
        conn.execute(sa_text(f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                job_id          TEXT PRIMARY KEY,
                user_id         TEXT,
                created_at      TIMESTAMP,
                gait_type       TEXT,
                bio_json        TEXT,
                remarks_json    TEXT,
                video_url       TEXT,
                analysis_type   TEXT,
                rear_json       TEXT,
                pronation       TEXT,
                rear_quality    TEXT,
                rear_video_url  TEXT,
                side_video_url  TEXT,
                result_json     TEXT,
                organization_id TEXT
            )
        """))


def _ensure_analysis_results_table() -> None:
    ensure_analysis_results_schema(engine)


def init_db() -> None:
    from app.db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _ensure_analysis_results_table()
    _migrate_missing_columns()
    _bootstrap_tenant()