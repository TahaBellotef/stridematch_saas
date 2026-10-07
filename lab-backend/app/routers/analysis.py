from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import re
import tempfile
import time
import uuid
import logging
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Literal, Dict, Any

from pydantic import BaseModel, EmailStr
from fastapi import (
    APIRouter,
    Form,
    HTTPException,
    Query,
    Request,
    status,
    Depends,
)
from fastapi.responses import FileResponse, Response
from fastapi.concurrency import run_in_threadpool
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.config import AUTH_SECRET
from app.db.deps import get_db
from app.db.engine import SessionLocal
from app.db.tenant import TenantContext, get_current_tenant
from app.models.session import AnalysisSessionModel
from app.auth import require_user, is_admin
from app.schemas import (
    AnalysisHistoryItem,
    AnalysisHistoryResponse,
    AnalysisResult,
    RunnerProfile,
)
from app.services.analysis.runner import run_analysis
from app.services.analysis.persistence import (
    get_video_path,
    get_user_history,
    get_result_by_job_id,
    persist_record,
)
from app.services.upload_storage import (
    build_local_upload_path,
    get_upload_mode,
)
from app.services.analysis.metrics import compute_energy_score
from app.services.analysis.insights import regenerate_insights_for_result
from app.services.analysis.report_pdf import build_report_pdf
from app.services.analysis.report_storage import (
    find_report_for_job,
    report_filename_for_job,
    save_report_pdf,
)
from app.services.customers import find_customer_profile, customer_display_name
from app.services.email import (
    EmailNotConfiguredError,
    EmailSendError,
    send_email_with_attachment,
)
from app.services.analysis.classifiers import infer_motion_type
from app.utils.aws import ClientError, boto3_or_raise, validate_s3_key, s3_object_exists
from app.utils.normalize import parse_bool, parse_rotate
from app.logging_config import job_id_var, user_id_var

logger = logging.getLogger("stridematch")

router = APIRouter(prefix="/analysis", tags=["Analysis"])
limiter = Limiter(key_func=get_remote_address)

# Bounded pool for CPU-bound analysis jobs (prevents overwhelming Lambda/small instances)
_ANALYSIS_POOL = ThreadPoolExecutor(max_workers=int(os.environ.get("ANALYSIS_MAX_WORKERS", "2")))

_VIDEO_TOKEN_TTL = 3600  # 1 hour


def _sign_video_token(job_id: str) -> str:
    """Create an HMAC-signed time-limited token for video access."""
    expires = int(time.time()) + _VIDEO_TOKEN_TTL
    msg = f"{job_id}:{expires}".encode()
    sig = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return f"{expires}:{sig}"


def _verify_video_token(job_id: str, token: str) -> bool:
    """Verify an HMAC-signed video access token."""
    try:
        parts = token.split(":", 1)
        if len(parts) != 2:
            return False
        expires_str, sig = parts
        expires = int(expires_str)
        if time.time() > expires:
            return False
        msg = f"{job_id}:{expires}".encode()
        expected = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False

# ============================================================================
# Schemas
# ============================================================================

class AnalysisJobStatus(BaseModel):
    status: Literal["processing", "succeeded", "failed"]
    job_id: Optional[str] = None
    session_id: Optional[str] = None
    capture_type: Optional[Literal["side", "rear", "lower_body"]] = None
    analysis_type: Optional[Literal["rear", "side", "lower_body"]] = None
    result: Optional[AnalysisResult] = None
    error: Optional[str] = None
    video_token: Optional[str] = None
    customer_email: Optional[str] = None
    customer_name: Optional[str] = None

# ============================================================================
# Upload helpers
# ============================================================================

def _download_video_from_s3(s3_key: str) -> Path:
    bucket = os.environ.get("STRIDEMATCH_UPLOAD_BUCKET")
    if not bucket:
        raise RuntimeError("STRIDEMATCH_UPLOAD_BUCKET is not configured")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    boto3_or_raise().client("s3").download_file(bucket, s3_key, tmp.name)
    return Path(tmp.name)

def _load_video_from_local(upload_key: str) -> Path:
    path = build_local_upload_path(upload_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Uploaded video not found")
    return path

def _resolve_video_path(upload_key: str) -> Path:
    return (
        _load_video_from_local(upload_key)
        if get_upload_mode() == "local"
        else _download_video_from_s3(upload_key)
    )

# ============================================================================
# Session helpers
# ============================================================================

def _validate_capture_order(session: AnalysisSessionModel, capture_type: str) -> None:
    required = session.required_captures or []
    completed = session.completed_captures or []
    if len(completed) >= len(required):
        raise HTTPException(status_code=400, detail="All captures already completed")
    if capture_type != required[len(completed)]:
        raise HTTPException(status_code=400, detail="Invalid capture order")

def _validate_runner_profile(session: AnalysisSessionModel) -> None:
    RunnerProfile.model_validate(session.runner_profile)


def _missing_analysis_dependencies() -> list[str]:
    required = ("scipy", "av")
    return [name for name in required if importlib.util.find_spec(name) is None]

# ============================================================================
# Background analysis job
# ============================================================================

def _run_motion_analysis_job(
    session_id: str,
    capture_type: str,
    s3_key: str,
    job_id: str,
    analysis_type: Optional[str],
    rotate_cw: Optional[str],
    flip_x: Optional[str],
    flip_y: Optional[str],
    force_mirror: Optional[str],
    lang: str = "fr",
) -> None:
    # Set correlation IDs for structured logging within this job
    job_id_var.set(job_id)
    user_id_var.set(session_id)
    video_path: Optional[Path] = None

    with SessionLocal() as db:
        try:
            session = db.get(AnalysisSessionModel, session_id)
            if not session:
                logger.warning("analysis.job.session_not_found job_id=%s session_id=%s", job_id, session_id)
                return

            video_path = _resolve_video_path(s3_key)

            metadata = {
                "session_id": session_id,
                "job_id": job_id,
                "capture_type": capture_type,
                "analysis_type": analysis_type,
                "rotate_cw": parse_rotate(rotate_cw),
                "flip_x": parse_bool(flip_x),
                "flip_y": parse_bool(flip_y),
                "force_mirror": parse_bool(force_mirror),
                "runner_profile": session.runner_profile or {},
                "organization_id": session.organization_id,
                "lang": lang,
            }

            result = run_analysis(video_path=video_path, metadata=metadata, user_id=session.id)
            analysis_result = AnalysisResult.model_validate(result)

            # persist_record is already called inside runner.py — no need to duplicate here

            if capture_type in ("rear", "lower_body"):
                session.completed_captures.append(capture_type)
                session.rear_analysis_job_id = job_id
                session.rear_video_url = analysis_result.video_url
                session.inferred_pronation = analysis_result.pronation
                session.status = "completed"
            else:
                session.completed_captures.append("side")
                session.status = "completed"

            session.active_analysis_job_id = job_id
            db.add(session)
            db.commit()

        except ModuleNotFoundError as exc:
            error_msg = f"Missing dependency: {exc.name or 'unknown'}"
            logger.error(
                "analysis.job.missing_dependency job_id=%s dependency=%s",
                job_id,
                exc.name or "unknown",
            )
            session = db.get(AnalysisSessionModel, session_id)
            if session:
                session.status = "failed"
                session.error_summary = error_msg
                db.commit()

        except Exception as exc:
            error_msg = str(exc)[:500]  # Truncate to avoid DB overflow
            logger.exception("analysis.job.failed job_id=%s", job_id)
            session = db.get(AnalysisSessionModel, session_id)
            if session:
                session.status = "failed"
                session.error_summary = error_msg
                db.commit()

        finally:
            if video_path and video_path.exists():
                video_path.unlink(missing_ok=True)

# ============================================================================
# API: start analysis
# ============================================================================

@router.post("/run", response_model=AnalysisJobStatus, status_code=202)
@limiter.limit("20/minute")
async def run_motion_analysis(
    request: Request,
    session_id: str = Form(...),
    capture_type: Literal["side", "rear", "lower_body"] = Form(...),
    s3_key: str = Form(...),
    analysis_type: Optional[Literal["rear", "side", "lower_body"]] = Form(None),
    rotate_cw: Optional[str] = Form(None),
    flip_x: Optional[str] = Form(None),
    flip_y: Optional[str] = Form(None),
    force_mirror: Optional[str] = Form(None),
    lang: Literal["fr", "en"] = Form("fr"),
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    session = db.get(AnalysisSessionModel, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Tenant isolation
    if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    # IDOR check: verify ownership
    caller_id = claims.get("sub", "")
    if session.created_by and session.created_by != caller_id and not is_admin(claims):
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "completed":
        raise HTTPException(status_code=409, detail="Session already completed")

    _validate_capture_order(session, capture_type)
    _validate_runner_profile(session)
    validate_s3_key(s3_key)
    missing_deps = _missing_analysis_dependencies()
    if missing_deps:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Analysis service missing dependencies: "
                f"{', '.join(missing_deps)}. "
                "Install backend dependencies with "
                "'pip install -r backend/requirements.txt'."
            ),
        )

    if get_upload_mode() == "local":
        if not build_local_upload_path(s3_key).exists():
            raise HTTPException(status_code=404, detail="Upload missing")
    else:
        exists = await run_in_threadpool(s3_object_exists, s3_key)
        if not exists:
            raise HTTPException(status_code=404, detail="Upload missing")

    job_id = uuid.uuid4().hex
    session.status = "processing"
    session.active_analysis_job_id = job_id
    db.commit()

    # Dispatch CPU-bound analysis to a thread pool so it doesn't block the event loop.
    loop = asyncio.get_running_loop()
    future = loop.run_in_executor(
        _ANALYSIS_POOL,
        _run_motion_analysis_job,
        session_id,
        capture_type,
        s3_key,
        job_id,
        analysis_type,
        rotate_cw,
        flip_x,
        flip_y,
        force_mirror,
        lang,
    )

    # Log unhandled errors from the executor (e.g. thread pool exhaustion)
    def _on_done(fut: asyncio.Future) -> None:
        exc = fut.exception()
        if exc is not None:
            logger.error("analysis.executor.unhandled_error job_id=%s: %s", job_id, exc)

    future.add_done_callback(_on_done)

    return AnalysisJobStatus(
        status="processing",
        job_id=job_id,
        session_id=session_id,
        capture_type=capture_type,
        analysis_type=analysis_type,
    )

# ============================================================================
# History & results
# ============================================================================

@router.get("/user/{user_id}", response_model=AnalysisHistoryResponse)
async def list_user_history(
    user_id: str,
    limit: Optional[int] = Query(None, ge=1, le=200),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    # P0 IDOR fix: enforce ownership — caller must match user_id or be admin
    caller_id = claims.get("sub", "")
    if caller_id != user_id and not is_admin(claims):
        raise HTTPException(status_code=403, detail="Forbidden")

    row_limit = limit or 200
    org_id = None if tenant.is_superadmin else tenant.organization_id
    items = await run_in_threadpool(get_user_history, user_id, limit=row_limit, organization_id=org_id)
    return AnalysisHistoryResponse(
        total=len(items),
        items=[AnalysisHistoryItem(**r.__dict__) for r in items],
    )

@router.get("/{job_id}", response_model=AnalysisJobStatus)
async def get_analysis_result(
    job_id: str,
    lang: Optional[Literal["fr", "en"]] = Query(None),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    caller_id = claims.get("sub", "")

    result = await run_in_threadpool(get_result_by_job_id, job_id)
    if result:
        if lang:
            # Insights/tips only need fields already stored on the result -
            # recompute them in the requested language without re-running
            # the original (video-based) analysis.
            insights, improvement_tips = await run_in_threadpool(
                regenerate_insights_for_result, result, lang
            )
            result = result.model_copy(update={"insights": insights, "improvement_tips": improvement_tips})
        session = None
        profile = None
        if result.user_id:
            def _load_session_and_customer():
                with SessionLocal() as db:
                    session = db.get(AnalysisSessionModel, result.user_id)
                    if not session:
                        return session, None
                    profile = None
                    if session.customer_id:
                        profile = find_customer_profile(
                            db,
                            session.customer_id,
                            organization_id=session.organization_id,
                            is_superadmin=tenant.is_superadmin,
                        )
                    return session, profile
            session, profile = await run_in_threadpool(_load_session_and_customer)

            # IDOR + tenant check: verify ownership via the linked session
            if session and not is_admin(claims):
                if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
                    raise HTTPException(status_code=404, detail="Not found")
                if session.created_by and session.created_by != caller_id:
                    raise HTTPException(status_code=404, detail="Not found")

        customer_name = None
        customer_email = None
        if profile:
            customer_name = customer_display_name(profile)
            customer_email = profile.email
        elif session:
            customer_name = " ".join(
                filter(None, [session.customer_first_name, session.customer_last_name])
            ) or None
            customer_email = session.customer_email

        return {
            "status": "succeeded",
            "result": result,
            "video_token": _sign_video_token(job_id),
            "customer_email": customer_email,
            "customer_name": customer_name,
        }

    def _check_failed_session():
        with SessionLocal() as db:
            return db.query(AnalysisSessionModel).filter(
                AnalysisSessionModel.active_analysis_job_id == job_id
            ).one_or_none()

    session = await run_in_threadpool(_check_failed_session)
    if session:
        # Tenant + IDOR check
        if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
            raise HTTPException(status_code=404, detail="Not found")
        if session.created_by and session.created_by != caller_id and not is_admin(claims):
            raise HTTPException(status_code=404, detail="Not found")
        if session.status == "failed":
            error_detail = getattr(session, "error_summary", None) or (
                "Analysis job failed. Verify runtime dependencies and server logs."
            )
            return {
                "status": "failed",
                "job_id": job_id,
                "session_id": session.id,
                "error": error_detail,
            }
    return {"status": "processing"}

@router.get("/{job_id}/report")
@limiter.limit("30/minute")
async def download_report_pdf(
    request: Request,
    job_id: str,
    lang: Optional[Literal["fr", "en"]] = Query(None),
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Generate and download a PDF version of the report (all metrics, no
    video), and persist a copy in the 'rapports' folder named after the
    linked customer.
    """
    caller_id = claims.get("sub", "")

    result = await run_in_threadpool(get_result_by_job_id, job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis result not found")

    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    if result.user_id:
        def _load_session_and_customer():
            with SessionLocal() as db:
                session = db.get(AnalysisSessionModel, result.user_id)
                if not session:
                    return session, None
                profile = None
                if session.customer_id:
                    profile = find_customer_profile(
                        db,
                        session.customer_id,
                        organization_id=session.organization_id,
                        is_superadmin=tenant.is_superadmin,
                    )
                return session, profile
        session, profile = await run_in_threadpool(_load_session_and_customer)
        if session:
            if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
                raise HTTPException(status_code=404, detail="Not found")
            if session.created_by and session.created_by != caller_id and not is_admin(claims):
                raise HTTPException(status_code=404, detail="Not found")
            customer_id = session.customer_id
            if profile:
                customer_name = customer_display_name(profile)
                customer_email = profile.email
            else:
                customer_name = " ".join(
                    filter(None, [session.customer_first_name, session.customer_last_name])
                ) or None
                customer_email = session.customer_email

    # Reuse a previously generated PDF for this job/lang if we already have
    # one persisted locally, instead of rebuilding (and re-calling the
    # insights LLM) on every download click.
    cached_bytes = await run_in_threadpool(find_report_for_job, customer_id, job_id, lang)
    if cached_bytes is not None:
        filename = report_filename_for_job(customer_id, job_id, lang)
        return Response(
            content=cached_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    if lang:
        insights, improvement_tips = await run_in_threadpool(
            regenerate_insights_for_result, result, lang
        )
        result = result.model_copy(update={"insights": insights, "improvement_tips": improvement_tips})

    pdf_bytes = await run_in_threadpool(
        build_report_pdf, result, customer_id, customer_name, customer_email
    )
    filename = await run_in_threadpool(save_report_pdf, pdf_bytes, customer_id, job_id, lang)

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

class SendReportRequest(BaseModel):
    email: EmailStr
    lang: Optional[Literal["fr", "en"]] = None


_SEND_REPORT_COPY = {
    "fr": {
        "subject": "Votre rapport biomécanique StrideMatch",
        "greeting": lambda name: f"Bonjour {name},",
        "body": (
            "Veuillez trouver ci-joint votre rapport d'analyse biomécanique StrideMatch "
            "(PDF), incluant votre score, vos métriques détaillées et nos recommandations."
        ),
        "signoff": "L'équipe StrideMatch",
    },
    "en": {
        "subject": "Your StrideMatch Biomechanical Report",
        "greeting": lambda name: f"Hi {name},",
        "body": (
            "Please find attached your StrideMatch biomechanical analysis report (PDF), "
            "including your score, detailed metrics, and our recommendations."
        ),
        "signoff": "The StrideMatch Team",
    },
}


def _build_report_email_html(lang: Literal["fr", "en"], customer_name: Optional[str]) -> tuple[str, str]:
    copy = _SEND_REPORT_COPY[lang]
    greeting = copy["greeting"](customer_name or ("there" if lang == "en" else ""))
    html = f"""
    <div style="font-family: Helvetica, Arial, sans-serif; color: #211D31; line-height: 1.6;">
      <p>{greeting}</p>
      <p>{copy['body']}</p>
      <p style="margin-top: 24px; color: #6B7280; font-size: 13px;">{copy['signoff']}</p>
    </div>
    """
    return copy["subject"], html


@router.post("/{job_id}/report/send")
@limiter.limit("10/minute")
async def send_report_email(
    request: Request,
    job_id: str,
    payload: SendReportRequest,
    claims: Dict[str, Any] = Depends(require_user),
    tenant: TenantContext = Depends(get_current_tenant),
):
    """
    Generate the PDF report (same content as the download endpoint) and
    email it as an attachment to the given address, persisting a copy in
    the 'rapports' folder like the download endpoint does.
    """
    caller_id = claims.get("sub", "")

    result = await run_in_threadpool(get_result_by_job_id, job_id)
    if not result:
        raise HTTPException(status_code=404, detail="Analysis result not found")

    lang: Literal["fr", "en"] = payload.lang or "fr"

    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    if result.user_id:
        def _load_session_and_customer():
            with SessionLocal() as db:
                session = db.get(AnalysisSessionModel, result.user_id)
                if not session:
                    return session, None
                profile = None
                if session.customer_id:
                    profile = find_customer_profile(
                        db,
                        session.customer_id,
                        organization_id=session.organization_id,
                        is_superadmin=tenant.is_superadmin,
                    )
                return session, profile
        session, profile = await run_in_threadpool(_load_session_and_customer)
        if session:
            if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
                raise HTTPException(status_code=404, detail="Not found")
            if session.created_by and session.created_by != caller_id and not is_admin(claims):
                raise HTTPException(status_code=404, detail="Not found")
            customer_id = session.customer_id
            if profile:
                customer_name = customer_display_name(profile)
                customer_email = profile.email
            else:
                customer_name = " ".join(
                    filter(None, [session.customer_first_name, session.customer_last_name])
                ) or None
                customer_email = session.customer_email

    cached_bytes = await run_in_threadpool(find_report_for_job, customer_id, job_id, lang)
    if cached_bytes is not None:
        pdf_bytes = cached_bytes
        filename = report_filename_for_job(customer_id, job_id, lang)
    else:
        if payload.lang:
            insights, improvement_tips = await run_in_threadpool(
                regenerate_insights_for_result, result, payload.lang
            )
            result = result.model_copy(update={"insights": insights, "improvement_tips": improvement_tips})

        pdf_bytes = await run_in_threadpool(
            build_report_pdf, result, customer_id, customer_name, customer_email or payload.email
        )
        filename = await run_in_threadpool(save_report_pdf, pdf_bytes, customer_id, job_id, lang)

    subject, html_body = _build_report_email_html(lang, customer_name)

    try:
        await run_in_threadpool(
            send_email_with_attachment,
            to_email=payload.email,
            subject=subject,
            html_body=html_body,
            attachment_bytes=pdf_bytes,
            attachment_filename=filename,
        )
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {exc}") from exc

    return {"status": "sent", "email": payload.email}


@router.get("/{job_id}/video", response_class=FileResponse)
@limiter.limit("60/minute")
async def download_video(
    request: Request,
    job_id: str,
    token: Optional[str] = Query(None),
):
    """
    Video download endpoint.

    HTML <video> tags cannot send Authorization headers,
    so this endpoint uses HMAC-signed time-limited tokens instead.
    The token is issued when the analysis result is fetched via GET /{job_id}.
    """
    if not token or not _verify_video_token(job_id, token):
        raise HTTPException(status_code=403, detail="Invalid or expired video token")
    path = get_video_path(job_id)
    if not path or not Path(path).exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(path, media_type="video/mp4")
