# app/routers/session.py

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

import uuid

from app.db.deps import get_db
from app.db.tenant import TenantContext, get_current_tenant
from app.auth import require_user, is_admin
from ..schemas import AnalysisSession, AnalysisSessionCreate, CustomerInfoUpdate
from ..models.session import AnalysisSessionModel

router = APIRouter(prefix="/sessions", tags=["Sessions"])
limiter = Limiter(key_func=get_remote_address)


# ============================================================================
# Create analysis session
# ============================================================================

@router.post(
    "",
    response_model=AnalysisSession,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new analysis session",
)
@limiter.limit("30/minute")
def create_session(
    request: Request,
    payload: AnalysisSessionCreate,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    profile = payload.runner_profile
    analysis_type = payload.analysis_type  # ✅ keep None if None
    customer_id = payload.customer_id

    # REQUIRED CAPTURES must still be determined somehow.
    # This does NOT "enforce" analysis_type; it's just your workflow default.
    if analysis_type == "rear":
        required_captures = ["rear"]
    elif analysis_type == "side":
        required_captures = ["side"]
    elif analysis_type == "lower_body":
        required_captures = ["lower_body"]
    else:
        required_captures = ["side"]  # default flow if unspecified

    session = AnalysisSessionModel(
        status="pending",
        runner_profile=profile.model_dump(),
        customer_id=customer_id,
        customer_first_name=(payload.customer_first_name or "").strip() or None,
        customer_last_name=(payload.customer_last_name or "").strip() or None,
        customer_email=(str(payload.customer_email).strip().lower() if payload.customer_email else None),
        scan_label=(payload.scan_label or "").strip() or None,

        # ✅ persist it as-is (None allowed) if your DB column allows it
        analysis_type=analysis_type,

        required_captures=required_captures,
        completed_captures=[],
        inferred_pronation=None,
        active_analysis_job_id=None,
        client_session_key=uuid.uuid4().hex,
        created_by=claims.get("sub"),
        organization_id=tenant.organization_id,
        store_id=tenant.store_id,
    )

    db.add(session)
    db.commit()
    db.refresh(session)
    return session
# ============================================================================
# Get session by ID
# ============================================================================

@router.get(
    "/{session_id}",
    response_model=AnalysisSession,
    status_code=status.HTTP_200_OK,
    summary="Get analysis session details",
)
@limiter.limit("60/minute")
def get_session(
    request: Request,
    session_id: str,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    session = db.get(AnalysisSessionModel, session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found",
        )

    # Tenant isolation: verify organization
    if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # IDOR check: verify ownership within org
    caller_id = claims.get("sub", "")
    if session.created_by and session.created_by != caller_id and not is_admin(claims):
        raise HTTPException(status_code=404, detail="Session not found")

    return session


# ============================================================================
# Update sales-side customer info on a session
# ============================================================================

@router.patch(
    "/{session_id}/customer",
    response_model=AnalysisSession,
    status_code=status.HTTP_200_OK,
    summary="Update customer first/last name and email on a session",
)
@limiter.limit("60/minute")
def update_session_customer(
    request: Request,
    session_id: str,
    payload: CustomerInfoUpdate,
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    session = db.get(AnalysisSessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    caller_id = claims.get("sub", "")
    if session.created_by and session.created_by != caller_id and not is_admin(claims):
        raise HTTPException(status_code=404, detail="Session not found")

    session.customer_first_name = payload.first_name.strip()
    session.customer_last_name = payload.last_name.strip()
    session.customer_email = str(payload.email).strip().lower()
    if payload.scan_label is not None:
        session.scan_label = payload.scan_label.strip() or None

    db.commit()
    db.refresh(session)
    return session
