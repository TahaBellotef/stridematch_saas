# app/services/analysis/persistence.py

from __future__ import annotations

import json
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any, Union

from sqlalchemy import text

from app.config import (
    ANALYSIS_RESULTS_DATABASE_URL,
    ANALYSIS_RESULTS_TABLE,
    DATABASE_URL,
)
from app.db.engine import engine as _main_engine
from app.schemas import AnalysisResult, SideBioMetrics, RearBioMetrics
from app.utils.aws import boto3_or_raise
from .classifiers import infer_motion_type, infer_strike_pattern
from .metrics import compute_energy_score, compute_flight_ratio

BioLike = Union[SideBioMetrics, RearBioMetrics]

logger = logging.getLogger(__name__)


# =============================================================================
# Storage (Lambda-safe)
# =============================================================================
# Lambda filesystem is read-only except /tmp
LOCAL_STORAGE_ROOT = Path("/tmp/backend_storage")
LOCAL_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _results_bucket() -> Optional[str]:
    """
    Bucket for annotated output videos.

    Recommended:
      STRIDEMATCH_RESULTS_BUCKET=stridematch-user-video   (reuse same bucket)
      or STRIDEMATCH_RESULTS_BUCKET=stridematch-results   (separate bucket)
    """
    return os.environ.get("STRIDEMATCH_RESULTS_BUCKET") or None


def _s3_client():
    # boto3 will automatically pick region/credentials from Lambda environment
    return boto3_or_raise().client("s3")


def persist_video(src_path: Path, job_id: str) -> Path:
    """
    Persist annotated video output.

    If STRIDEMATCH_RESULTS_BUCKET is set -> upload to S3.
    Otherwise -> store locally in /tmp (only for local dev; not durable on Lambda).
    Returns a Path-like handle (for local) OR a dummy /tmp path (for S3).
    """
    bucket = _results_bucket()

    if bucket:
        key = f"results/{job_id}.mp4"
        s3 = _s3_client()
        s3.upload_file(str(src_path), bucket, key)

        # Clean up local temp artifact after upload
        try:
            src_path.unlink(missing_ok=True)
        except Exception:
            pass

        # Return a "virtual" local path representation for consistency
        # (download happens in get_video_path)
        return LOCAL_STORAGE_ROOT / f"{job_id}.mp4"

    # Local fallback
    target = LOCAL_STORAGE_ROOT / f"{job_id}.mp4"
    shutil.move(str(src_path), target)
    return target


def get_video_path(job_id: str) -> Optional[Path]:
    """
    Return a local path to the annotated video.

    - If stored locally -> return it
    - If stored in S3 -> download to /tmp and return the downloaded path
    """
    local_path = LOCAL_STORAGE_ROOT / f"{job_id}.mp4"
    if local_path.exists():
        return local_path

    bucket = _results_bucket()
    if not bucket:
        return None

    key = f"results/{job_id}.mp4"
    s3 = _s3_client()

    tmp_path = local_path.with_suffix(local_path.suffix + ".part")
    try:
        # Download to a .part file then atomically rename to avoid partial reads.
        tmp_path.unlink(missing_ok=True)
        s3.download_file(bucket, key, str(tmp_path))
        if local_path.exists():
            tmp_path.unlink(missing_ok=True)
            return local_path
        tmp_path.replace(local_path)
        return local_path
    except Exception:
        logger.exception("get_video_path: S3 download failed for job_id=%s key=%s", job_id, key)
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass
        return None


# =============================================================================
# Database (history)
# =============================================================================

_engine = None


def _get_engine():
    global _engine
    if _engine is not None:
        return _engine

    if not ANALYSIS_RESULTS_DATABASE_URL:
        return None

    # Reuse the main app engine when the results DB URL matches DATABASE_URL
    # to avoid duplicating connection pools for the same database.
    if ANALYSIS_RESULTS_DATABASE_URL == DATABASE_URL:
        _engine = _main_engine
    else:
        from sqlalchemy import create_engine
        _engine = create_engine(
            ANALYSIS_RESULTS_DATABASE_URL,
            pool_pre_ping=True,
            future=True,
        )

    from app.db import ensure_analysis_results_schema
    ensure_analysis_results_schema(_engine)
    return _engine


def persist_record(
    *,
    job_id: str,
    user_id: Optional[str],
    created_at: datetime,
    bio: BioLike,
    gait_type: str,
    remarks: List[str],
    video_url: str,
    analysis_type: Optional[str] = None,
    rear_metrics: Optional[Dict[str, Any]] = None,
    pronation: Optional[str] = None,
    rear_quality: Optional[str] = None,
    rear_video_url: Optional[str] = None,
    side_video_url: Optional[str] = None,
    result_json: Optional[Dict[str, Any]] = None,
    organization_id: Optional[str] = None,
) -> None:
    """
    Persist analysis history record. If DB is not configured, this becomes a no-op.
    """
    if not user_id:
        logger.warning("persist_record skipped: no user_id (job_id=%s)", job_id)
        return

    engine = _get_engine()
    if engine is None:
        logger.warning(
            "persist_record skipped: no database configured "
            "(ANALYSIS_RESULTS_DATABASE_URL is empty, job_id=%s)",
            job_id,
        )
        return

    payload = {
        "job_id": job_id,
        "user_id": user_id,
        "created_at": created_at,
        "gait_type": gait_type,
        "bio_json": json.dumps(bio.model_dump()),
        "remarks_json": json.dumps(remarks),
        "video_url": video_url,
        "analysis_type": analysis_type,
        "rear_json": json.dumps(rear_metrics) if rear_metrics is not None else None,
        "pronation": pronation,
        "rear_quality": rear_quality,
        "rear_video_url": rear_video_url,
        "side_video_url": side_video_url,
        "result_json": json.dumps(result_json) if result_json is not None else None,
        "organization_id": organization_id,
    }

    with engine.begin() as conn:
        conn.execute(
            text(f"""
                INSERT INTO {ANALYSIS_RESULTS_TABLE}
                (job_id, user_id, created_at, gait_type,
                bio_json, remarks_json, video_url,
                analysis_type, rear_json, pronation,
                rear_quality, rear_video_url, side_video_url, result_json,
                organization_id)
                VALUES (:job_id, :user_id, :created_at, :gait_type,
                        :bio_json, :remarks_json, :video_url,
                        :analysis_type, :rear_json, :pronation,
                        :rear_quality, :rear_video_url, :side_video_url, :result_json,
                        :organization_id)
                ON CONFLICT (job_id)
                DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    created_at = EXCLUDED.created_at,
                    gait_type = EXCLUDED.gait_type,
                    bio_json = EXCLUDED.bio_json,
                    remarks_json = EXCLUDED.remarks_json,
                    video_url = EXCLUDED.video_url,
                    analysis_type = EXCLUDED.analysis_type,
                    rear_json = EXCLUDED.rear_json,
                    pronation = EXCLUDED.pronation,
                    rear_quality = EXCLUDED.rear_quality,
                    rear_video_url = EXCLUDED.rear_video_url,
                    side_video_url = EXCLUDED.side_video_url,
                    result_json = EXCLUDED.result_json,
                    organization_id = EXCLUDED.organization_id
            """),
            payload,
        )


def _parse_bio(row) -> BioLike:
    """
    Decode bio_json into the correct model.

    Strategy:
      - Prefer row.analysis_type if present.
      - Else infer using presence of side fields.
    """
    try:
        raw = json.loads(row.bio_json) if row.bio_json else {}
    except Exception:
        raw = {}

    at = (row.analysis_type or "").strip().lower()

    if at == "rear":
        return RearBioMetrics.model_validate(raw)

    if at == "side":
        return SideBioMetrics.model_validate(raw)

    # Heuristic fallback: does it look like side bio?
    if isinstance(raw, dict) and any(k in raw for k in ("cadence", "contact_time", "knee_mean")):
        return SideBioMetrics.model_validate(raw)

    return RearBioMetrics.model_validate(raw)


def _build_result_from_row(row, bio: BioLike) -> AnalysisResult:
    """
    Build a minimal AnalysisResult from a DB row + parsed bio.
    Handles both side and rear bio types.
    """
    remarks = json.loads(row.remarks_json) if row.remarks_json else []
    rear_metrics_parsed = json.loads(row.rear_json) if row.rear_json else None

    if isinstance(bio, SideBioMetrics):
        at = row.analysis_type or "side"
        flight_ratio = compute_flight_ratio(bio)
        energy_score = compute_energy_score(
            bio,
            analysis_type=at,
            rear_metrics=rear_metrics_parsed,
            rear_quality=row.rear_quality,
        )
        return AnalysisResult(
            job_id=row.job_id,
            user_id=row.user_id,
            created_at=row.created_at,
            gait_type=row.gait_type,
            bio=bio,
            remarks=remarks,
            video_url=row.video_url,
            snapshot_image=None,
            rear_capture_used=False,
            energy_score=int(energy_score) if energy_score is not None else None,
            motion_type=infer_motion_type(flight_ratio),
            strike_pattern=infer_strike_pattern(bio),
            contact_time_left=None,
            contact_time_right=None,
            flight_ratio=flight_ratio,
            analysis_type=at,
            pronation=row.pronation or bio.pronation,
            rear_quality=row.rear_quality,
            rear_video_url=row.rear_video_url,
            side_video_url=row.side_video_url,
            rear_metrics=rear_metrics_parsed,
            insights=[],
            improvement_tips=[],
        )

    # RearBioMetrics case
    at = row.analysis_type or "rear"
    energy_score = compute_energy_score(
        bio,
        analysis_type=at,
        rear_metrics=rear_metrics_parsed,
        rear_quality=row.rear_quality,
    )
    return AnalysisResult(
        job_id=row.job_id,
        user_id=row.user_id,
        created_at=row.created_at,
        gait_type=row.gait_type,
        bio=bio,
        remarks=remarks,
        video_url=row.video_url,
        snapshot_image=None,
        rear_capture_used=True,
        energy_score=int(energy_score) if energy_score is not None else None,
        motion_type=None,
        strike_pattern=None,
        contact_time_left=None,
        contact_time_right=None,
        flight_ratio=None,
        analysis_type=at,
        pronation=row.pronation or bio.pronation,
        rear_quality=row.rear_quality or bio.rear_quality,
        rear_video_url=row.rear_video_url,
        side_video_url=row.side_video_url,
        rear_metrics=rear_metrics_parsed,
        insights=[],
        improvement_tips=[],
    )


# -------------------------------------------------------------------------
# Shared query columns (used by both get_user_history and get_result_by_job_id)
# -------------------------------------------------------------------------
_RESULT_COLUMNS = """
    job_id,
    user_id,
    created_at,
    gait_type,
    bio_json,
    remarks_json,
    video_url,
    analysis_type,
    rear_json,
    pronation,
    rear_quality,
    rear_video_url,
    side_video_url,
    result_json,
    organization_id
"""


def _try_from_result_json(row) -> Optional[AnalysisResult]:
    """Try to deserialize from stored result_json (best fidelity)."""
    if not row.result_json:
        return None
    try:
        payload = json.loads(row.result_json)
        return AnalysisResult.model_validate(payload)
    except Exception:
        return None


def get_user_history(
    user_id: str,
    *,
    limit: int = 200,
    organization_id: Optional[str] = None,
) -> List[AnalysisResult]:
    """
    Fetch analysis results for a given user, capped at `limit` rows.
    Optionally scoped to an organization.
    """
    engine = _get_engine()
    if engine is None:
        logger.warning("get_user_history: no database configured, returning empty list")
        return []

    limit = max(1, min(limit, 500))

    where_clause = "WHERE user_id = :user_id"
    params: Dict[str, Any] = {"user_id": user_id, "row_limit": limit}
    if organization_id:
        where_clause += " AND organization_id = :org_id"
        params["org_id"] = organization_id

    query = text(f"""
        SELECT {_RESULT_COLUMNS}
        FROM {ANALYSIS_RESULTS_TABLE}
        {where_clause}
        ORDER BY created_at DESC
        LIMIT :row_limit
    """)

    results: List[AnalysisResult] = []

    with engine.begin() as conn:
        rows = conn.execute(query, params).fetchall()

        for row in rows:
            result = _try_from_result_json(row)
            if result is not None:
                results.append(result)
                continue

            bio = _parse_bio(row)
            results.append(_build_result_from_row(row, bio))

    return results


def get_result_by_job_id(job_id: str) -> Optional[AnalysisResult]:
    """
    Fetch a single analysis result by job_id (if stored).
    """
    engine = _get_engine()
    if engine is None:
        logger.warning("get_result_by_job_id: no database configured (job_id=%s)", job_id)
        return None

    query = text(f"""
        SELECT {_RESULT_COLUMNS}
        FROM {ANALYSIS_RESULTS_TABLE}
        WHERE job_id = :job_id
        LIMIT 1
    """)

    with engine.begin() as conn:
        row = conn.execute(query, {"job_id": job_id}).fetchone()
        if not row:
            return None

        result = _try_from_result_json(row)
        if result is not None:
            return result

        bio = _parse_bio(row)
        return _build_result_from_row(row, bio)


def get_latest_pronation_for_sessions(session_ids: List[str]) -> Optional[str]:
    """
    Most recent non-null `pronation` across any analysis result (rear or
    side) belonging to the given session ids. Used to show a customer's
    latest pronation regardless of which capture type produced it - the
    `analysis_sessions.inferred_pronation` column is only set for rear/
    lower_body captures, so it misses side-only sessions.
    """
    if not session_ids:
        return None

    engine = _get_engine()
    if engine is None:
        return None

    query = text(f"""
        SELECT pronation
        FROM {ANALYSIS_RESULTS_TABLE}
        WHERE user_id = ANY(:session_ids) AND pronation IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1
    """)

    with engine.begin() as conn:
        row = conn.execute(query, {"session_ids": session_ids}).fetchone()
        return row[0] if row else None


def delete_results_for_session(session_id: str) -> int:
    """
    Delete all analysis_results rows produced by a session (there's no FK
    enforcing this - user_id is a plain text column - so it has to be done
    explicitly before deleting the owning AnalysisSessionModel row).
    """
    engine = _get_engine()
    if engine is None:
        return 0

    query = text(f"DELETE FROM {ANALYSIS_RESULTS_TABLE} WHERE user_id = :session_id")

    with engine.begin() as conn:
        result = conn.execute(query, {"session_id": session_id})
        return result.rowcount
