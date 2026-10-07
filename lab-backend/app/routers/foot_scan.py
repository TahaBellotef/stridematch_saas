# app/routers/foot_scan.py
"""API endpoints for foot scan measurement feature."""
from __future__ import annotations

import asyncio
import os
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import (
    APIRouter,
    Form,
    HTTPException,
    Query,
    Request,
    status,
    Depends,
)
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.auth import require_user, is_admin
from app.db.deps import get_db
from app.db.engine import DATABASE_URL
from app.db.tenant import TenantContext, get_current_tenant
from app.schemas.foot_scan import (
    FootScanSession,
    FootScanSessionCreate,
    FootScanRequest,
    FootScanJobStatus,
    FootScanResult,
    FootScanSessionResult,
    FootScanHistoryResponse,
)
from app.models.foot_scan import FootScanSessionModel, FootScanResultModel
from app.services.foot_scan.persistence import (
    create_session,
    get_session,
    create_job,
    get_job,
    get_session_results,
    get_customer_history,
    get_debug_image_path,
)
from app.services.foot_scan.runner import run_analysis_job
from app.services.upload_storage import (
    build_local_upload_path,
    get_upload_mode,
)
from app.utils.aws import ClientError, boto3_or_raise, validate_s3_key, s3_object_exists


# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
LOG_LEVEL = os.environ.get("LOG_LEVEL", "info").upper()
logger = logging.getLogger("foot_scan")
logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))


router = APIRouter(prefix="/foot-scan", tags=["Foot Scan"])
limiter = Limiter(key_func=get_remote_address)

_FOOT_SCAN_POOL = ThreadPoolExecutor(max_workers=int(os.environ.get("FOOT_SCAN_MAX_WORKERS", "2")))


# ============================================================================
# Upload helpers
# ============================================================================

def _validate_image_exists(s3_key: str) -> None:
    """Validate that the uploaded image exists."""
    if get_upload_mode() == "local":
        if not build_local_upload_path(s3_key).exists():
            raise HTTPException(status_code=404, detail="Uploaded image not found")
    else:
        if not s3_object_exists(s3_key):
            raise HTTPException(status_code=404, detail="Uploaded image not found")


# ============================================================================
# API: Session Management
# ============================================================================

@router.post("/session", response_model=FootScanSession, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
async def create_foot_scan_session(
    request: Request,
    payload: FootScanSessionCreate,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Create a new foot scan session.

    A session links left and right foot scans for a customer.
    The customer_id is optional but recommended for tracking history.
    """
    session = create_session(
        db,
        customer_id=payload.customer_id,
        created_by=claims.get("sub"),
        organization_id=tenant.organization_id,
        store_id=tenant.store_id,
    )
    return session


@router.get("/session/{session_id}", response_model=FootScanSessionResult)
@limiter.limit("60/minute")
async def get_foot_scan_session(
    request: Request,
    session_id: str,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Get foot scan session with results.

    Returns the session along with left and right foot results if available.
    If both feet are scanned, includes a size recommendation.
    """
    # IDOR check: verify ownership
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")
    # Tenant isolation
    if not tenant.is_superadmin and session_model.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")
    caller_id = claims.get("sub", "")
    if session_model.created_by and session_model.created_by != caller_id and not is_admin(claims):
        raise HTTPException(status_code=404, detail="Session not found")

    result = get_session_results(db, session_id)
    if not result:
        raise HTTPException(status_code=404, detail="Session not found")
    return result


# ============================================================================
# API: Submit Foot Scan
# ============================================================================

@router.post("/analyze", response_model=FootScanJobStatus, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
async def analyze_foot_image(
    request: Request,
    session_id: str = Form(...),
    s3_key: str = Form(...),
    foot: str = Form(..., pattern="^(left|right)$"),
    device_info: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Submit a foot image for analysis.

    The image should be a photo of the foot placed on A4 paper.
    Analysis runs in the background - poll the job status endpoint for results.

    Args:
        session_id: Session ID from create_foot_scan_session
        s3_key: S3 key or local path to the uploaded image
        foot: Which foot - "left" or "right"
        device_info: Optional device/camera information
    """
    # Validate session exists
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    # Tenant isolation
    if not tenant.is_superadmin and session_model.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # IDOR check: verify ownership
    caller_id = claims.get("sub", "")
    if session_model.created_by and session_model.created_by != caller_id and not is_admin(claims):
        raise HTTPException(status_code=404, detail="Session not found")

    session = get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Check session is not completed
    if session.status == "completed":
        raise HTTPException(status_code=409, detail="Session already completed")

    # A foot can be retried on the same session if its previous attempt
    # failed - only block resubmission once that foot has a job that
    # succeeded or is still in flight.
    existing_job_id = session.left_job_id if foot == "left" else session.right_job_id
    if existing_job_id:
        existing_job = get_job(db, existing_job_id)
        if not existing_job or existing_job.status != "failed":
            raise HTTPException(status_code=409, detail=f"{foot.capitalize()} foot already scanned")

    # Validate S3 key format and image existence
    validate_s3_key(s3_key)
    _validate_image_exists(s3_key)

    # Create job
    job_id = create_job(db, session_id, foot, s3_key, device_info)

    # Dispatch analysis to bounded thread pool (matches analysis router pattern)
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(
        _FOOT_SCAN_POOL,
        lambda: run_analysis_job(
            session_id=session_id,
            job_id=job_id,
            s3_key=s3_key,
            foot=foot,
            db_url=DATABASE_URL,
        ),
    )

    def _on_done(fut: asyncio.Future) -> None:
        exc = fut.exception()
        if exc is not None:
            logger.error("foot_scan.executor.unhandled_error job_id=%s: %s", job_id, exc)

    future.add_done_callback(_on_done)

    return FootScanJobStatus(
        job_id=job_id,
        session_id=session_id,
        foot=foot,
        status="processing",
        created_at=session.created_at,
    )


# ============================================================================
# API: Job Status & Results
# ============================================================================

@router.get("/{job_id}", response_model=FootScanResult)
@limiter.limit("60/minute")
async def get_foot_scan_result(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Get the result of a foot scan analysis.

    Poll this endpoint until status changes from "processing" to
    "completed" or "failed".
    """
    # IDOR check: verify ownership via session
    result_model = db.get(FootScanResultModel, job_id)
    if not result_model:
        raise HTTPException(status_code=404, detail="Job not found")

    caller_id = claims.get("sub", "")
    if not is_admin(claims):
        session_model = db.get(FootScanSessionModel, result_model.session_id)
        # Tenant isolation
        if session_model and not tenant.is_superadmin and session_model.organization_id != tenant.organization_id:
            raise HTTPException(status_code=404, detail="Job not found")
        if session_model and session_model.created_by and session_model.created_by != caller_id:
            raise HTTPException(status_code=404, detail="Job not found")

    result = get_job(db, job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")
    return result


@router.get("/{job_id}/debug", response_class=FileResponse)
async def get_debug_image(
    job_id: str,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Get the debug visualization image for a completed scan.

    The debug image shows:
    - Detected A4 paper corners
    - Foot segmentation mask
    - Measurement axis and dimensions
    """
    # IDOR check: verify ownership via session
    result_model = db.get(FootScanResultModel, job_id)
    if not result_model:
        raise HTTPException(status_code=404, detail="Job not found")

    caller_id = claims.get("sub", "")
    if not is_admin(claims):
        session_model = db.get(FootScanSessionModel, result_model.session_id)
        # Tenant isolation
        if session_model and not tenant.is_superadmin and session_model.organization_id != tenant.organization_id:
            raise HTTPException(status_code=404, detail="Job not found")
        if session_model and session_model.created_by and session_model.created_by != caller_id:
            raise HTTPException(status_code=404, detail="Job not found")

    result = get_job(db, job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Job not found")

    if result.status != "completed":
        raise HTTPException(status_code=400, detail="Analysis not yet complete")

    # Get debug image path
    path = await run_in_threadpool(get_debug_image_path, job_id)
    if not path or not path.exists():
        raise HTTPException(status_code=404, detail="Debug image not found")

    return FileResponse(path, media_type="image/jpeg")


# ============================================================================
# API: Customer History
# ============================================================================

@router.get("/customer/{customer_id}", response_model=FootScanHistoryResponse)
@limiter.limit("30/minute")
async def get_customer_scan_history(
    request: Request,
    customer_id: str,
    limit: Optional[int] = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Get foot scan history for a customer.

    Returns a list of past scan sessions with their recommendations.
    """
    # IDOR check: caller must match customer_id or be admin
    caller_id = claims.get("sub", "")
    if caller_id != customer_id and not is_admin(claims):
        raise HTTPException(status_code=403, detail="Forbidden")

    org_id = None if tenant.is_superadmin else tenant.organization_id
    history = get_customer_history(db, customer_id, limit=limit, organization_id=org_id)
    return history


@router.get("/customer/{customer_id}/latest", response_model=FootScanSessionResult)
@limiter.limit("30/minute")
async def get_latest_customer_scan(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Get the most recent foot scan session (with full left/right results) for
    a customer, without needing to know the session_id up front.
    """
    caller_id = claims.get("sub", "")
    if caller_id != customer_id and not is_admin(claims):
        raise HTTPException(status_code=403, detail="Forbidden")

    org_id = None if tenant.is_superadmin else tenant.organization_id
    history = get_customer_history(db, customer_id, limit=1, organization_id=org_id)
    if not history.items:
        raise HTTPException(status_code=404, detail="No foot scan sessions found for this customer")

    result = get_session_results(db, history.items[0].session_id)
    if not result:
        raise HTTPException(status_code=404, detail="No foot scan sessions found for this customer")
    return result
