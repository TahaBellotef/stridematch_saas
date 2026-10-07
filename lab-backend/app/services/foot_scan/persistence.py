# app/services/foot_scan/persistence.py
"""Database operations for foot scan results."""
from __future__ import annotations

import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from sqlalchemy.orm import Session

from app.models.foot_scan import FootScanSessionModel, FootScanResultModel
from app.utils.aws import boto3_or_raise
from app.schemas.foot_scan import (
    FootScanSession,
    FootScanResult,
    FootScanSessionResult,
    FootScanHistoryItem,
    FootScanHistoryResponse,
    CalibrationInfo,
    FootMeasurement,
    ShoeSizes,
    ConfidenceBreakdown,
    SizeRecommendation,
)


# Storage root for local files
LOCAL_STORAGE_ROOT = Path("/tmp/backend_storage/foot_scan")
LOCAL_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)


def _results_bucket() -> Optional[str]:
    """Get S3 bucket for storing debug images."""
    return os.environ.get("STRIDEMATCH_RESULTS_BUCKET") or None


def _s3_client():
    return boto3_or_raise().client("s3")


# =============================================================================
# Session Operations
# =============================================================================

def create_session(
    db: Session,
    customer_id: Optional[str] = None,
    created_by: Optional[str] = None,
    organization_id: Optional[str] = None,
    store_id: Optional[str] = None,
) -> FootScanSession:
    """Create a new foot scan session."""
    session_model = FootScanSessionModel(
        id=uuid.uuid4().hex,
        customer_id=customer_id,
        status="pending",
        created_at=datetime.now(timezone.utc),
        created_by=created_by,
        organization_id=organization_id,
        store_id=store_id,
    )
    db.add(session_model)
    db.commit()
    db.refresh(session_model)

    return FootScanSession(
        session_id=session_model.id,
        customer_id=session_model.customer_id,
        created_at=session_model.created_at,
        status=session_model.status,
        left_job_id=session_model.left_job_id,
        right_job_id=session_model.right_job_id,
    )


def get_session(
    db: Session,
    session_id: str,
) -> Optional[FootScanSession]:
    """Get a foot scan session by ID."""
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        return None

    return FootScanSession(
        session_id=session_model.id,
        customer_id=session_model.customer_id,
        created_at=session_model.created_at,
        status=session_model.status,
        left_job_id=session_model.left_job_id,
        right_job_id=session_model.right_job_id,
    )


def update_session_job(
    db: Session,
    session_id: str,
    foot: str,
    job_id: str,
) -> None:
    """Update session with job ID for a foot."""
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        return

    if foot == "left":
        session_model.left_job_id = job_id
    else:
        session_model.right_job_id = job_id

    session_model.status = "processing"
    db.commit()


def update_session_completion(
    db: Session,
    session_id: str,
    recommendation: Optional[dict] = None,
    overall_confidence: Optional[float] = None,
) -> None:
    """Update session when all scans are complete."""
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        return

    session_model.status = "completed"
    session_model.completed_at = datetime.now(timezone.utc)

    if recommendation:
        session_model.recommendation = recommendation
    if overall_confidence is not None:
        session_model.overall_confidence = overall_confidence

    db.commit()


def delete_session_and_results(db: Session, session_id: str) -> None:
    """
    Delete a foot scan session along with its left/right result rows.

    There's no ORM relationship() between FootScanSessionModel and
    FootScanResultModel (only a plain job_id column), so the result rows
    have to be deleted explicitly before the session row, mirroring
    delete_results_for_session()/delete_session() for analysis sessions.
    """
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        return

    for job_id in (session_model.left_job_id, session_model.right_job_id):
        if not job_id:
            continue
        result_model = db.get(FootScanResultModel, job_id)
        if result_model:
            db.delete(result_model)

    db.delete(session_model)


# =============================================================================
# Job/Result Operations
# =============================================================================

def create_job(
    db: Session,
    session_id: str,
    foot: str,
    s3_key: str,
    device_info: Optional[str] = None,
) -> str:
    """Create a new foot scan job."""
    job_id = uuid.uuid4().hex

    result_model = FootScanResultModel(
        job_id=job_id,
        session_id=session_id,
        foot=foot,
        s3_key=s3_key,
        device_info=device_info,
        status="pending",
        created_at=datetime.now(timezone.utc),
    )
    db.add(result_model)
    db.commit()

    # Update session with this job
    update_session_job(db, session_id, foot, job_id)

    return job_id


def get_job(
    db: Session,
    job_id: str,
) -> Optional[FootScanResult]:
    """Get a foot scan job by ID."""
    result_model = db.get(FootScanResultModel, job_id)
    if not result_model:
        return None

    return _model_to_result(result_model)


def update_job_status(
    db: Session,
    job_id: str,
    status: str,
    error_message: Optional[str] = None,
) -> None:
    """Update job status."""
    result_model = db.get(FootScanResultModel, job_id)
    if not result_model:
        return

    result_model.status = status
    if error_message:
        result_model.error_message = error_message
    if status == "processing":
        pass  # Nothing special
    elif status in ("completed", "failed"):
        result_model.completed_at = datetime.now(timezone.utc)

    db.commit()


def update_job_result(
    db: Session,
    job_id: str,
    calibration: Optional[dict] = None,
    measurement: Optional[dict] = None,
    sizes: Optional[dict] = None,
    confidence: Optional[dict] = None,
    debug_image_url: Optional[str] = None,
    original_image_url: Optional[str] = None,
    error_message: Optional[str] = None,
) -> None:
    """Update job with processing results."""
    result_model = db.get(FootScanResultModel, job_id)
    if not result_model:
        return

    if calibration:
        result_model.calibration = calibration
    if measurement:
        result_model.measurement = measurement
    if sizes:
        result_model.sizes = sizes
    if confidence:
        result_model.confidence = confidence
    if debug_image_url:
        result_model.debug_image_url = debug_image_url
    if original_image_url:
        result_model.original_image_url = original_image_url
    if error_message:
        result_model.error_message = error_message

    result_model.status = "completed" if not error_message else "failed"
    result_model.completed_at = datetime.now(timezone.utc)

    db.commit()


# =============================================================================
# Session Results
# =============================================================================

def get_session_results(
    db: Session,
    session_id: str,
) -> Optional[FootScanSessionResult]:
    """Get complete session results including both feet."""
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        return None

    left_result = None
    right_result = None

    if session_model.left_job_id:
        left_model = db.get(FootScanResultModel, session_model.left_job_id)
        if left_model:
            left_result = _model_to_result(left_model)

    if session_model.right_job_id:
        right_model = db.get(FootScanResultModel, session_model.right_job_id)
        if right_model:
            right_result = _model_to_result(right_model)

    # Build recommendation if both feet are complete
    recommendation = None
    overall_confidence = None

    if session_model.recommendation:
        recommendation = SizeRecommendation(**session_model.recommendation)
        overall_confidence = session_model.overall_confidence
    elif (left_result and right_result and
          left_result.status == "completed" and
          right_result.status == "completed"):
        recommendation, overall_confidence = _compute_recommendation(
            left_result, right_result
        )
        # Save to session
        update_session_completion(
            db, session_id,
            recommendation=recommendation.model_dump() if recommendation else None,
            overall_confidence=overall_confidence,
        )

    # Determine overall status
    status = session_model.status
    if left_result and right_result:
        if left_result.status == "completed" and right_result.status == "completed":
            status = "completed"
        elif left_result.status == "failed" or right_result.status == "failed":
            status = "failed"
        elif left_result.status == "processing" or right_result.status == "processing":
            status = "processing"

    return FootScanSessionResult(
        session_id=session_model.id,
        customer_id=session_model.customer_id,
        status=status,
        created_at=session_model.created_at,
        completed_at=session_model.completed_at,
        left_result=left_result,
        right_result=right_result,
        recommendation=recommendation,
        overall_confidence=overall_confidence,
    )


# =============================================================================
# Customer History
# =============================================================================

def get_customer_history(
    db: Session,
    customer_id: str,
    limit: int = 20,
    organization_id: Optional[str] = None,
) -> FootScanHistoryResponse:
    """Get scan history for a customer, optionally scoped to an organization."""
    query = db.query(FootScanSessionModel).filter(FootScanSessionModel.customer_id == customer_id)
    if organization_id:
        query = query.filter(FootScanSessionModel.organization_id == organization_id)
    sessions = query.order_by(FootScanSessionModel.created_at.desc()).limit(limit).all()

    items = []
    for session in sessions:
        recommendation = None
        if session.recommendation:
            recommendation = SizeRecommendation(**session.recommendation)

        items.append(FootScanHistoryItem(
            session_id=session.id,
            created_at=session.created_at,
            status=session.status,
            recommendation=recommendation,
            overall_confidence=session.overall_confidence,
        ))

    return FootScanHistoryResponse(
        customer_id=customer_id,
        total=len(items),
        items=items,
    )


# =============================================================================
# Image Storage
# =============================================================================

def save_debug_image(
    image_data: bytes,
    job_id: str,
) -> str:
    """Save debug image and return URL."""
    bucket = _results_bucket()

    if bucket:
        key = f"foot_scan/debug/{job_id}.jpg"
        s3 = _s3_client()
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=image_data,
            ContentType="image/jpeg",
        )
        return f"s3://{bucket}/{key}"

    # Local storage fallback
    local_path = LOCAL_STORAGE_ROOT / "debug" / f"{job_id}.jpg"
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(image_data)
    return f"file://{local_path}"


def get_debug_image_path(job_id: str) -> Optional[Path]:
    """Get local path to debug image, downloading from S3 if needed."""
    local_path = LOCAL_STORAGE_ROOT / "debug" / f"{job_id}.jpg"

    if local_path.exists():
        return local_path

    bucket = _results_bucket()
    if not bucket:
        return None

    key = f"foot_scan/debug/{job_id}.jpg"
    s3 = _s3_client()

    try:
        local_path.parent.mkdir(parents=True, exist_ok=True)
        s3.download_file(bucket, key, str(local_path))
        return local_path
    except Exception:
        return None


# =============================================================================
# Helpers
# =============================================================================

def _model_to_result(model: FootScanResultModel) -> FootScanResult:
    """Convert database model to schema."""
    calibration = None
    if model.calibration:
        calibration = CalibrationInfo(**model.calibration)

    measurement = None
    if model.measurement:
        measurement = FootMeasurement(**model.measurement)

    sizes = None
    if model.sizes:
        sizes = ShoeSizes(**model.sizes)

    confidence = None
    if model.confidence:
        confidence = ConfidenceBreakdown(**model.confidence)

    return FootScanResult(
        job_id=model.job_id,
        session_id=model.session_id,
        foot=model.foot,
        status=model.status,
        calibration=calibration,
        measurement=measurement,
        sizes=sizes,
        confidence=confidence,
        debug_image_url=model.debug_image_url,
        original_image_url=model.original_image_url,
        created_at=model.created_at,
        completed_at=model.completed_at,
        error_message=model.error_message,
    )


def _compute_recommendation(
    left_result: FootScanResult,
    right_result: FootScanResult,
) -> tuple:
    """Compute size recommendation from both feet."""
    if not left_result.sizes or not right_result.sizes:
        return None, None

    left_sizes = left_result.sizes
    right_sizes = right_result.sizes

    # Determine larger foot by EU size
    if left_sizes.eu >= right_sizes.eu:
        larger_foot = "left"
        recommended = left_sizes
        left_length = left_result.measurement.length_mm if left_result.measurement else 0
        right_length = right_result.measurement.length_mm if right_result.measurement else 0
    else:
        larger_foot = "right"
        recommended = right_sizes
        left_length = left_result.measurement.length_mm if left_result.measurement else 0
        right_length = right_result.measurement.length_mm if right_result.measurement else 0

    length_diff = abs(left_length - right_length)

    recommendation = SizeRecommendation(
        eu=recommended.eu,
        us_men=recommended.us_men,
        us_women=recommended.us_women,
        uk=recommended.uk,
        jp=recommended.jp,
        larger_foot=larger_foot,
        length_difference_mm=length_diff,
    )

    # Overall confidence is average of both feet
    left_conf = left_result.confidence.overall if left_result.confidence else 0.5
    right_conf = right_result.confidence.overall if right_result.confidence else 0.5
    overall_confidence = (left_conf + right_conf) / 2

    return recommendation, overall_confidence
