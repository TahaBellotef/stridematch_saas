#
#  File: routes/admin.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, NamedTuple, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.auth import require_admin, require_user
from app.config import (
    AWS_REGION,
    COGNITO_USER_POOL_ID,
    CUSTOMER_GROUP_NAME,
)
from app.db.deps import get_db
from app.db.tenant import TenantContext, get_current_tenant, require_superadmin, require_org_admin
from app.models.customer_profile import CustomerProfileModel
from app.models.foot_scan import FootScanResultModel, FootScanSessionModel
from app.models.session import AnalysisSessionModel
from app.models.tenant import OrganizationModel, StoreModel, UserOrgMembershipModel
from app.schemas import (
    AdminSessionDetail,
    AdminSessionListResponse,
    AdminSessionSummary,
    AnalysisResult,
    CatalogInventoryItem,
    CatalogInventoryResponse,
    CatalogInventoryUpdateRequest,
    CatalogProfile,
    CatalogResponse,
    GaitProfile,
)
from app.schemas.catalog import CatalogOverviewResponse
from app.schemas.tenant import (
    OrganizationCreate,
    OrganizationUpdate,
    OrganizationResponse,
    StoreCreate,
    StoreResponse,
    MemberCreate,
    MemberResponse,
)
from app.schemas.dashboard import (
    BiomechanicsSegment,
    DashboardAcquisitionPoint,
    DashboardActivityItem,
    DashboardAnalysisStackPoint,
    DashboardBiomechanicsResponse,
    DashboardCustomersResponse,
    DashboardInsightsResponse,
    DashboardMetric,
    DashboardOverviewResponse,
    DashboardSegment,
    DashboardSeriesPoint,
    DashboardStatusPoint,
    MatchingCustomersResponse,
)
from app.services.analysis import get_user_history
from app.services.analysis.persistence import (
    delete_results_for_session,
    get_latest_pronation_for_sessions,
    get_result_by_job_id,
)
from app.services.analysis.report_storage import (
    delete_reports_for_job,
    list_reports_for_customer,
    load_report_pdf,
)
from app.services.foot_scan.persistence import delete_session_and_results as delete_foot_scan_session
from app.services.catalog import (
    build_recommendations,
    get_catalog_overview,
    list_catalog_inventory,
    update_catalog_item,
)
from app.services.dashboard_periods import ResolvedPeriod, resolve_period
from app.services.dashboard_export import (
    build_customers_workbook,
    build_insights_workbook,
    build_overview_pdf,
)
from app.utils.aws import ClientError, boto3_or_raise

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger("stridematch.admin")

router = APIRouter(
    prefix="/admin",
    tags=["Admin"],
)
limiter = Limiter(key_func=get_remote_address)

# Cognito filter expressions accept only alphanumeric, hyphens, dots, @ and underscores.
# Reject anything else to prevent filter expression injection.
_COGNITO_ID_PATTERN = re.compile(r"^[a-zA-Z0-9@._\-]+$")
_REPORT_FILENAME_PATTERN = re.compile(r"^[a-zA-Z0-9_\-]+\.pdf$")


def _validate_cognito_id(value: str) -> str:
    """Sanitize a customer_id before use in Cognito filter expressions."""
    if not value or len(value) > 256 or not _COGNITO_ID_PATTERN.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid customer identifier format",
        )
    return value


class CreateCustomerRequest(BaseModel):
    email: str
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "customer@example.com",
                    "given_name": "Ada",
                    "family_name": "Lovelace",
                }
            ]
        }
    }


class CreateCustomerResponse(BaseModel):
    ok: bool
    username: str
    model_config = {
        "json_schema_extra": {"examples": [{"ok": True, "username": "customer@example.com"}]}
    }


class CustomerInfo(BaseModel):
    id: str
    email: str
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    name: str
    created_at: Optional[str] = None
    status: str


class CustomerListResponse(BaseModel):
    ok: bool
    customers: List[CustomerInfo]
    total: int


class CustomerProfileInfo(BaseModel):
    id: str
    customer_id: Optional[str] = None
    email: str
    organization_id: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    full_name: Optional[str] = None
    name: str
    sex: Optional[str] = None
    age: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    weekly_distance: Optional[str] = None
    preferred_surfaces: Optional[List[str]] = None
    running_duration: Optional[str] = None
    runs_per_week: Optional[str] = None
    distance_per_week: Optional[str] = None
    shoe_preferences: Optional[List[str]] = None
    shoe_size: Optional[str] = None
    shoe_size_unit: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    status: str = "CONFIRMED"

    # Aggregated from analysis sessions — only populated by the single-customer
    # detail endpoint (get_customer), not the list endpoint.
    pronation: Optional[str] = None
    scan_count: int = 0
    last_scan_at: Optional[str] = None


class CustomerProfileListResponse(BaseModel):
    ok: bool
    customers: List[CustomerProfileInfo]
    total: int


def _coerce_measurement(value: Any) -> Optional[float]:
    """Parse height/weight from numbers or UI strings like '60-70 kg' or '170 cm'."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number >= 0 else None
    if isinstance(value, str):
        text = value.strip().lower()
        if not text:
            return None
        range_match = re.match(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)", text)
        if range_match:
            low = float(range_match.group(1))
            high = float(range_match.group(2))
            return (low + high) / 2
        plus_match = re.match(r"^(\d+(?:\.\d+)?)\+", text)
        if plus_match:
            return float(plus_match.group(1))
        num_match = re.search(r"(\d+(?:\.\d+)?)", text)
        if num_match:
            return float(num_match.group(1))
    return None


class CustomerProfileRequest(BaseModel):
    email: str
    customer_id: Optional[str] = None
    given_name: Optional[str] = None
    family_name: Optional[str] = None
    full_name: Optional[str] = None
    sex: Optional[str] = None
    age: Optional[int] = None
    weight: Optional[float] = None
    height: Optional[float] = None
    weekly_distance: Optional[str] = None
    preferred_surfaces: Optional[List[str]] = None
    running_duration: Optional[str] = None
    runs_per_week: Optional[str] = None
    distance_per_week: Optional[str] = None
    shoe_preferences: Optional[List[str]] = None
    shoe_size: Optional[str] = None
    shoe_size_unit: Optional[str] = None

    @field_validator("height", "weight", mode="before")
    @classmethod
    def normalize_measurements(cls, value: Any) -> Optional[float]:
        return _coerce_measurement(value)

    @field_validator("sex", mode="before")
    @classmethod
    def normalize_sex(cls, value: Any) -> Optional[str]:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered in {"male", "female", "other"}:
                return lowered
        return None

    @field_validator("age", mode="before")
    @classmethod
    def normalize_age(cls, value: Any) -> Optional[int]:
        if value is None or value == "":
            return None
        parsed = _coerce_measurement(value)
        return int(parsed) if parsed is not None else None


class CustomerProfileResponse(BaseModel):
    ok: bool
    id: str


def _extract_attr(attributes: List[Dict[str, str]], name: str) -> Optional[str]:
    for attr in attributes:
        if attr.get("Name") == name:
            return attr.get("Value")
    return None


def _map_cognito_user(user: Dict[str, Any]) -> CustomerInfo:
    attributes = user.get("Attributes") or []
    email = _extract_attr(attributes, "email") or ""
    given = _extract_attr(attributes, "given_name")
    family = _extract_attr(attributes, "family_name")
    full_name = _extract_attr(attributes, "name")
    if not full_name:
        full_name = " ".join([part for part in [given, family] if part]) or email

    user_id = _extract_attr(attributes, "sub") or user.get("Username") or email
    created_at = user.get("UserCreateDate")
    created_at_str = created_at.isoformat() if created_at else None

    return CustomerInfo(
        id=user_id,
        email=email,
        given_name=given,
        family_name=family,
        name=full_name,
        created_at=created_at_str,
        status=str(user.get("UserStatus") or ""),
    )


def _map_admin_get_user(username: str, response: Dict[str, Any]) -> CustomerInfo:
    attributes = response.get("UserAttributes") or []
    email = _extract_attr(attributes, "email") or ""
    given = _extract_attr(attributes, "given_name")
    family = _extract_attr(attributes, "family_name")
    full_name = _extract_attr(attributes, "name")
    if not full_name:
        full_name = " ".join([part for part in [given, family] if part]) or email

    user_id = _extract_attr(attributes, "sub") or username or email
    created_at = response.get("UserCreateDate")
    created_at_str = created_at.isoformat() if created_at else None

    return CustomerInfo(
        id=user_id,
        email=email,
        given_name=given,
        family_name=family,
        name=full_name,
        created_at=created_at_str,
        status=str(response.get("UserStatus") or ""),
    )

#----------------------------------local----------------------------------

LOCAL_DEFAULT_ORGANIZATION_ID = "66f4489a222741c9b917a432bc006cc3"


def get_local_org_admin(
    db: Session = Depends(get_db),
    claims: Dict[str, Any] = Depends(require_user),
) -> TenantContext:
    """Local dev: use default org when the authenticated user has no membership."""
    sub = claims.get("sub", "")
    membership = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.cognito_sub == sub)
        .one_or_none()
    )
    if membership is None:
        email = claims.get("email", "")
        if email:
            membership = (
                db.query(UserOrgMembershipModel)
                .filter(UserOrgMembershipModel.cognito_sub == email)
                .one_or_none()
            )

    if membership is not None:
        if membership.role not in ("org_admin", "superadmin"):
            raise HTTPException(status_code=403, detail="Organization admin access required")
        org = db.get(OrganizationModel, membership.organization_id)
        return TenantContext(
            organization_id=membership.organization_id,
            organization_name=org.name if org else "",
            logo_url=org.logo_url if org else None,
            store_id=membership.store_id,
            role=membership.role,
            cognito_sub=sub,
            account_type=getattr(org, "account_type", None) or "store",
        )

    org = db.get(OrganizationModel, LOCAL_DEFAULT_ORGANIZATION_ID)
    if not org:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Default organization {LOCAL_DEFAULT_ORGANIZATION_ID} not found",
        )
    return TenantContext(
        organization_id=LOCAL_DEFAULT_ORGANIZATION_ID,
        organization_name=org.name,
        logo_url=org.logo_url,
        store_id=None,
        role="org_admin",
        cognito_sub=sub,
        account_type=getattr(org, "account_type", None) or "store",
    )


def _map_customer_profile(profile: CustomerProfileModel) -> CustomerProfileInfo:
    display_name = profile.full_name
    if not display_name:
        display_name = (
            " ".join([part for part in [profile.given_name, profile.family_name] if part])
            or profile.email
        )
    return CustomerProfileInfo(
        id=profile.id,
        customer_id=profile.customer_id,
        email=profile.email,
        organization_id=profile.organization_id,
        given_name=profile.given_name,
        family_name=profile.family_name,
        full_name=profile.full_name,
        name=display_name,
        sex=profile.sex,
        age=profile.age,
        weight=profile.weight,
        height=profile.height,
        weekly_distance=profile.weekly_distance,
        preferred_surfaces=profile.preferred_surfaces,
        running_duration=profile.running_duration,
        runs_per_week=profile.runs_per_week,
        distance_per_week=profile.distance_per_week,
        shoe_preferences=profile.shoe_preferences,
        shoe_size=profile.shoe_size,
        shoe_size_unit=profile.shoe_size_unit,
        created_at=profile.created_at.isoformat() if profile.created_at else None,
        updated_at=profile.updated_at.isoformat() if profile.updated_at else None,
        status="CONFIRMED",
    )


@router.post(
    "/create-customer",
    response_model=CreateCustomerResponse,
    status_code=status.HTTP_200_OK,
    summary="Create a customer user (admin-only)",
    description="Creates a local customer profile in PostgreSQL.",
)
@limiter.limit("10/minute")
def create_customer(
    request: Request,
    payload: CreateCustomerRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CreateCustomerResponse:
    existing = (
        db.query(CustomerProfileModel)
        .filter(
            CustomerProfileModel.email == payload.email,
            CustomerProfileModel.organization_id == tenant.organization_id,
        )
        .one_or_none()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User already exists",
        )

    full_name = (
        " ".join([part for part in [payload.given_name, payload.family_name] if part]).strip()
        or None
    )
    profile = CustomerProfileModel(
        email=payload.email,
        organization_id=tenant.organization_id,
        given_name=payload.given_name,
        family_name=payload.family_name,
        full_name=full_name,
    )
    db.add(profile)
    db.flush()
    profile.customer_id = profile.id
    db.commit()

    return CreateCustomerResponse(ok=True, username=payload.email)


@router.post(
    "/customer-profile",
    response_model=CustomerProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Create or update a customer profile (admin-only)",
)
def upsert_customer_profile(
    payload: CustomerProfileRequest,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerProfileResponse:
    full_name = payload.full_name
    if not full_name:
        full_name = " ".join(
            [part for part in [payload.given_name, payload.family_name] if part]
        ).strip() or None

    # Scope by organization — same email can exist in different orgs
    profile = (
        db.query(CustomerProfileModel)
        .filter(
            CustomerProfileModel.email == payload.email,
            CustomerProfileModel.organization_id == tenant.organization_id,
        )
        .one_or_none()
    )

    if profile:
        profile.customer_id = payload.customer_id or profile.customer_id
        profile.given_name = payload.given_name or profile.given_name
        profile.family_name = payload.family_name or profile.family_name
        profile.full_name = full_name or profile.full_name
        profile.sex = payload.sex if payload.sex is not None else profile.sex
        profile.age = payload.age if payload.age is not None else profile.age
        profile.weight = payload.weight if payload.weight is not None else profile.weight
        profile.height = payload.height if payload.height is not None else profile.height
        profile.weekly_distance = payload.weekly_distance or profile.weekly_distance
        profile.preferred_surfaces = (
            payload.preferred_surfaces
            if payload.preferred_surfaces is not None
            else profile.preferred_surfaces
        )
        profile.running_duration = payload.running_duration or profile.running_duration
        profile.runs_per_week = payload.runs_per_week or profile.runs_per_week
        profile.distance_per_week = payload.distance_per_week or profile.distance_per_week
        profile.shoe_preferences = (
            payload.shoe_preferences
            if payload.shoe_preferences is not None
            else profile.shoe_preferences
        )
        profile.shoe_size = payload.shoe_size or profile.shoe_size
        profile.shoe_size_unit = payload.shoe_size_unit or profile.shoe_size_unit
    else:
        profile = CustomerProfileModel(
            email=payload.email,
            customer_id=payload.customer_id,
            organization_id=tenant.organization_id,
            given_name=payload.given_name,
            family_name=payload.family_name,
            full_name=full_name,
            sex=payload.sex,
            age=payload.age,
            weight=payload.weight,
            height=payload.height,
            weekly_distance=payload.weekly_distance,
            preferred_surfaces=payload.preferred_surfaces,
            running_duration=payload.running_duration,
            runs_per_week=payload.runs_per_week,
            distance_per_week=payload.distance_per_week,
            shoe_preferences=payload.shoe_preferences,
            shoe_size=payload.shoe_size,
            shoe_size_unit=payload.shoe_size_unit,
        )
        db.add(profile)

    db.commit()
    db.refresh(profile)

    return CustomerProfileResponse(ok=True, id=profile.id)


@router.get(
    "/customers",
    response_model=CustomerProfileListResponse,
    status_code=status.HTTP_200_OK,
    summary="List customers (admin-only)",
)
@limiter.limit("30/minute")
def list_customers(
    request: Request,
    limit: Optional[int] = Query(60, ge=1, le=60),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerProfileListResponse:
    query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        query = query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    safe_limit = min(limit or 60, 60)
    profiles = (
        query.order_by(CustomerProfileModel.created_at.desc())
        .limit(safe_limit)
        .all()
    )
    customers = [_map_customer_profile(profile) for profile in profiles]
    return CustomerProfileListResponse(ok=True, customers=customers, total=len(customers))


@router.get(
    "/customers/{customer_id}",
    response_model=CustomerProfileInfo,
    status_code=status.HTTP_200_OK,
    summary="Get customer by id/email (admin-only)",
)
@limiter.limit("30/minute")
def get_customer(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerProfileInfo:
    safe_id = _validate_cognito_id(customer_id)

    query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        query = query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    for attr in (CustomerProfileModel.id, CustomerProfileModel.customer_id, CustomerProfileModel.email):
        profile = query.filter(attr == safe_id).one_or_none()
        if profile:
            info = _map_customer_profile(profile)
            stats = _get_customer_scan_stats(db, profile)
            info.pronation = stats.pronation
            info.scan_count = stats.scan_count
            info.last_scan_at = stats.last_scan_at
            return info

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Customer not found",
    )


class CustomerReportInfo(BaseModel):
    filename: str
    created_at: str


class CustomerReportsResponse(BaseModel):
    ok: bool
    reports: List[CustomerReportInfo]


def _resolve_customer_profile(db: Session, tenant: TenantContext, customer_id: str) -> CustomerProfileModel:
    safe_id = _validate_cognito_id(customer_id)
    query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        query = query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    for attr in (CustomerProfileModel.id, CustomerProfileModel.customer_id, CustomerProfileModel.email):
        profile = query.filter(attr == safe_id).one_or_none()
        if profile:
            return profile

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")


@router.get(
    "/customers/{customer_id}/reports",
    response_model=CustomerReportsResponse,
    summary="List previously generated PDF reports for a customer (admin-only)",
)
@limiter.limit("30/minute")
def list_customer_reports(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerReportsResponse:
    profile = _resolve_customer_profile(db, tenant, customer_id)
    reports = list_reports_for_customer(profile.customer_id or profile.id)
    return CustomerReportsResponse(
        ok=True,
        reports=[CustomerReportInfo(filename=r.filename, created_at=r.created_at) for r in reports],
    )


@router.get(
    "/customers/{customer_id}/reports/{filename}",
    summary="Download a previously generated PDF report for a customer (admin-only)",
)
@limiter.limit("30/minute")
def download_customer_report(
    request: Request,
    customer_id: str,
    filename: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> Response:
    profile = _resolve_customer_profile(db, tenant, customer_id)
    prefix = f"{profile.customer_id or profile.id}_"

    if not _REPORT_FILENAME_PATTERN.match(filename) or not filename.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    pdf_bytes = load_report_pdf(filename)
    if pdf_bytes is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get(
    "/customers/{customer_id}/recommendations",
    response_model=CatalogResponse,
    summary="Shoe recommendations for a customer, based on their latest analysis (admin-only)",
)
@limiter.limit("30/minute")
def get_customer_recommendations(
    request: Request,
    customer_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CatalogResponse:
    profile = _resolve_customer_profile(db, tenant, customer_id)

    identifiers = [v for v in {profile.customer_id, profile.id, profile.email} if v]
    latest_session = (
        db.query(AnalysisSessionModel)
        .filter(AnalysisSessionModel.customer_id.in_(identifiers))
        .filter(AnalysisSessionModel.status == "completed")
        .order_by(AnalysisSessionModel.created_at.desc())
        .first()
    )
    if not latest_session or not latest_session.active_analysis_job_id:
        return CatalogResponse(items=[], total=0)

    result = get_result_by_job_id(latest_session.active_analysis_job_id)
    if not result:
        return CatalogResponse(items=[], total=0)

    bio = result.bio
    runner_profile = CatalogProfile(
        gender=profile.sex,
        age=profile.age,
        height_cm=profile.height,
        weight_kg=profile.weight,
        pronation=result.pronation,
        strike_pattern=result.strike_pattern,
        cadence=getattr(bio, "cadence", None),
        osc=getattr(bio, "osc", None),
        contact_time=getattr(bio, "contact_time", None),
        knee_mean=getattr(bio, "knee_mean", None),
        sym=getattr(bio, "sym", None),
        # Rear analyses carry no cadence/osc/contact_time/sym - these two are
        # what actually varies per rear analysis (the alignment score shown
        # on the report, and the rear kinematics it's built from). `gait`
        # also needs to be set so resolved_gait_view() can tell this apart
        # from a side analysis.
        energy_score=result.energy_score,
        rear_metrics=result.rear_metrics,
        gait=GaitProfile(bio=bio),
        limit=limit,
    )
    return build_recommendations(runner_profile)


class CustomerAnalysisResponse(BaseModel):
    status: Literal["found", "not_found"]
    result: Optional[AnalysisResult] = None


class CustomerAnalysisSummary(BaseModel):
    job_id: str
    created_at: datetime
    analysis_type: Optional[str] = None


class CustomerAnalysesListResponse(BaseModel):
    items: List[CustomerAnalysisSummary]


@router.get(
    "/customers/{customer_id}/analyses",
    response_model=CustomerAnalysesListResponse,
    summary="List a customer's completed gait analyses, most recent first (admin-only)",
)
@limiter.limit("30/minute")
def list_customer_analyses(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerAnalysesListResponse:
    profile = _resolve_customer_profile(db, tenant, customer_id)

    identifiers = [v for v in {profile.customer_id, profile.id, profile.email} if v]
    sessions = (
        db.query(AnalysisSessionModel)
        .filter(AnalysisSessionModel.customer_id.in_(identifiers))
        .filter(AnalysisSessionModel.status == "completed")
        .filter(AnalysisSessionModel.active_analysis_job_id.isnot(None))
        .order_by(AnalysisSessionModel.created_at.desc())
        .all()
    )

    items = [
        CustomerAnalysisSummary(
            job_id=session.active_analysis_job_id,
            created_at=session.created_at,
            analysis_type=session.analysis_type,
        )
        for session in sessions
    ]
    return CustomerAnalysesListResponse(items=items)


@router.get(
    "/customers/{customer_id}/analysis",
    response_model=CustomerAnalysisResponse,
    summary="Latest completed gait analysis result for a customer (admin-only)",
)
@limiter.limit("30/minute")
def get_customer_latest_analysis(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> CustomerAnalysisResponse:
    profile = _resolve_customer_profile(db, tenant, customer_id)

    identifiers = [v for v in {profile.customer_id, profile.id, profile.email} if v]
    latest_session = (
        db.query(AnalysisSessionModel)
        .filter(AnalysisSessionModel.customer_id.in_(identifiers))
        .filter(AnalysisSessionModel.status == "completed")
        .order_by(AnalysisSessionModel.created_at.desc())
        .first()
    )
    if not latest_session or not latest_session.active_analysis_job_id:
        return CustomerAnalysisResponse(status="not_found", result=None)

    result = get_result_by_job_id(latest_session.active_analysis_job_id)
    if not result:
        return CustomerAnalysisResponse(status="not_found", result=None)

    return CustomerAnalysisResponse(status="found", result=result)


class CustomerScanStats(NamedTuple):
    pronation: Optional[str]
    scan_count: int
    last_scan_at: Optional[str]


def _get_customer_scan_stats(db: Session, profile: CustomerProfileModel) -> CustomerScanStats:
    identifiers = [v for v in {profile.customer_id, profile.id, profile.email} if v]
    if not identifiers:
        return CustomerScanStats(pronation=None, scan_count=0, last_scan_at=None)

    query = db.query(AnalysisSessionModel).filter(AnalysisSessionModel.customer_id.in_(identifiers))
    scan_count = query.count()
    latest = query.order_by(AnalysisSessionModel.created_at.desc()).first()

    # `inferred_pronation` is only ever set on rear/lower_body captures, so a
    # customer whose latest (or only) session was side-only would otherwise
    # show "Unknown" even though that side analysis did compute a pronation
    # value. Look it up directly from the analysis results table instead,
    # across every session this customer has, regardless of capture type.
    session_ids = [row.id for row in query.with_entities(AnalysisSessionModel.id).all()]
    pronation = get_latest_pronation_for_sessions(session_ids)

    return CustomerScanStats(
        pronation=pronation,
        scan_count=scan_count,
        last_scan_at=latest.created_at.isoformat() if latest and latest.created_at else None,
    )


@router.delete(
    "/customers/{customer_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a customer profile (admin-only)",
)
@limiter.limit("30/minute")
def delete_customer(
    request: Request,
    customer_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> Dict[str, bool]:
    safe_id = _validate_cognito_id(customer_id)

    query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        query = query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    profile = None
    for attr in (CustomerProfileModel.id, CustomerProfileModel.customer_id, CustomerProfileModel.email):
        profile = query.filter(attr == safe_id).one_or_none()
        if profile:
            break

    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Customer not found",
        )

    # Deleting only the profile row left orphaned scans/analyses behind (no
    # FK cascade - customer_id is a plain string column on both session
    # models), which is exactly what made dashboard counts like "New vs
    # Returning Customers" disagree with "Total Users". Cascade explicitly
    # so deleting a customer actually removes everything tied to them.
    identifiers = [v for v in {profile.customer_id, profile.id, profile.email} if v]

    analysis_sessions = (
        db.query(AnalysisSessionModel).filter(AnalysisSessionModel.customer_id.in_(identifiers)).all()
    )
    for analysis_session in analysis_sessions:
        delete_results_for_session(analysis_session.id)
        for job_id in {analysis_session.active_analysis_job_id, analysis_session.rear_analysis_job_id}:
            if job_id:
                delete_reports_for_job(analysis_session.customer_id, job_id)
        db.delete(analysis_session)

    foot_scan_sessions = (
        db.query(FootScanSessionModel).filter(FootScanSessionModel.customer_id.in_(identifiers)).all()
    )
    for foot_scan_session in foot_scan_sessions:
        delete_foot_scan_session(db, foot_scan_session.id)

    db.delete(profile)
    db.commit()
    return {"ok": True}


@router.get(
    "/sessions",
    response_model=AdminSessionListResponse,
    status_code=status.HTTP_200_OK,
    summary="List analysis sessions (admin-only)",
)
def list_sessions(
    limit: Optional[int] = Query(100, ge=1, le=1000),
    status_filter: Optional[str] = Query(None, alias="status"),
    customer_id: Optional[str] = Query(None, alias="customer_id"),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> AdminSessionListResponse:
    query = db.query(AnalysisSessionModel)

    # Tenant isolation: scope to org unless superadmin
    if not tenant.is_superadmin:
        query = query.filter(AnalysisSessionModel.organization_id == tenant.organization_id)

    if status_filter:
        query = query.filter(AnalysisSessionModel.status == status_filter)
    if customer_id:
        query = query.filter(AnalysisSessionModel.customer_id == customer_id)

    # Fetch limit+1 rows to know if there are more, avoiding a separate COUNT(*) scan
    sessions = (
        query.order_by(AnalysisSessionModel.created_at.desc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(sessions) > limit
    sessions = sessions[:limit]

    items = [AdminSessionSummary.model_validate(session) for session in sessions]
    # total = exact count when within limit, otherwise signal "at least limit+1"
    total = len(items) if not has_more else limit + 1
    return AdminSessionListResponse(total=total, sessions=items)


@router.get(
    "/sessions/{session_id}",
    response_model=AdminSessionDetail,
    status_code=status.HTTP_200_OK,
    summary="Get analysis session details (admin-only)",
)
def get_session_detail(
    session_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> AdminSessionDetail:
    session = db.get(AnalysisSessionModel, session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Tenant isolation
    if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    org_id = None if tenant.is_superadmin else tenant.organization_id
    results = get_user_history(session.id, organization_id=org_id)
    detail = AdminSessionDetail.model_validate(session)
    return detail.model_copy(update={"analysis_results": results})


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an analysis session and its report (admin-only)",
)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> Dict[str, bool]:
    session = db.get(AnalysisSessionModel, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if not tenant.is_superadmin and session.organization_id != tenant.organization_id:
        raise HTTPException(status_code=404, detail="Session not found")

    delete_results_for_session(session.id)
    for job_id in {session.active_analysis_job_id, session.rear_analysis_job_id}:
        if job_id:
            delete_reports_for_job(session.customer_id, job_id)
    db.delete(session)
    db.commit()
    return {"ok": True}

#----------------------------------local----------------------------------
@router.get(
    "/catalog",
    response_model=CatalogInventoryResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve catalog inventory (admin-only)",
    dependencies=[Depends(require_admin)],
)
async def get_catalog(
    limit: Optional[int] = Query(100, ge=1, le=1000),
) -> CatalogInventoryResponse:
    """
    Retrieve the shoe catalog inventory (admin-only).
    """
    try:
        return await run_in_threadpool(list_catalog_inventory, limit)
    except Exception:
        logger.exception("Failed to fetch catalog inventory")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch catalog inventory",
        )


@router.get(
    "/catalog/overview",
    response_model=CatalogOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate stats for the Inventory Overview tab (admin-only)",
    dependencies=[Depends(require_admin)],
)
async def get_catalog_overview_endpoint() -> CatalogOverviewResponse:
    """
    Aggregate stats over the full shoe catalog (admin-only).
    """
    try:
        return await run_in_threadpool(get_catalog_overview)
    except Exception:
        logger.exception("Failed to fetch catalog overview")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch catalog overview",
        )


@router.patch(
    "/catalog/{item_id}",
    response_model=CatalogInventoryItem,
    status_code=status.HTTP_200_OK,
    summary="Update catalog entry (admin-only)",
    dependencies=[Depends(require_admin)],
)
async def patch_catalog_item(
    item_id: str,
    payload: CatalogInventoryUpdateRequest,
) -> CatalogInventoryItem:
    """
    Update editable fields on a catalog entry (admin-only).
    """
    try:
        return await run_in_threadpool(update_catalog_item, item_id, payload)

    except ValueError as exc:
        # Client error (bad input)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    except Exception:
        logger.exception("Failed to update catalog item: %s", item_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update catalog item",
        )


# ============================================================================
# Organization Management (superadmin only)
# ============================================================================

@router.post(
    "/organizations",
    response_model=OrganizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an organization (superadmin-only)",
)
def create_organization(
    payload: OrganizationCreate,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_superadmin),
) -> OrganizationResponse:
    existing = db.query(OrganizationModel).filter(OrganizationModel.slug == payload.slug).one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Organization slug already exists")

    org = OrganizationModel(name=payload.name, slug=payload.slug)
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


@router.patch(
    "/organizations/{org_id}",
    response_model=OrganizationResponse,
    status_code=status.HTTP_200_OK,
    summary="Update an organization (name, logo)",
)
def update_organization(
    org_id: str,
    payload: OrganizationUpdate,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_org_admin),
) -> OrganizationResponse:
    if not tenant.is_superadmin and tenant.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    org = db.get(OrganizationModel, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    if payload.name is not None:
        org.name = payload.name
    if payload.logo_url is not None:
        org.logo_url = payload.logo_url
    if payload.is_active is not None and tenant.is_superadmin:
        org.is_active = payload.is_active

    db.commit()
    db.refresh(org)
    return org


@router.get(
    "/organizations",
    response_model=List[OrganizationResponse],
    status_code=status.HTTP_200_OK,
    summary="List organizations (superadmin-only)",
)
def list_organizations(
    limit: Optional[int] = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_superadmin),
) -> List[OrganizationResponse]:
    orgs = db.query(OrganizationModel).order_by(OrganizationModel.created_at.desc()).limit(limit).all()
    return orgs


# ============================================================================
# Store Management
# ============================================================================

@router.post(
    "/organizations/{org_id}/stores",
    response_model=StoreResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a store for an organization",
)
def create_store(
    org_id: str,
    payload: StoreCreate,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_org_admin),
) -> StoreResponse:
    # Org admins can only create stores in their own org
    if not tenant.is_superadmin and tenant.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    org = db.get(OrganizationModel, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    store = StoreModel(
        organization_id=org_id,
        name=payload.name,
        address=payload.address,
    )
    db.add(store)
    db.commit()
    db.refresh(store)
    return store


@router.get(
    "/organizations/{org_id}/stores",
    response_model=List[StoreResponse],
    status_code=status.HTTP_200_OK,
    summary="List stores for an organization",
)
def list_stores(
    org_id: str,
    limit: Optional[int] = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_org_admin),
) -> List[StoreResponse]:
    if not tenant.is_superadmin and tenant.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    stores = (
        db.query(StoreModel)
        .filter(StoreModel.organization_id == org_id)
        .order_by(StoreModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return stores


# ============================================================================
# Member Management
# ============================================================================

@router.post(
    "/organizations/{org_id}/members",
    response_model=MemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Link a Cognito user to an organization",
)
def create_member(
    org_id: str,
    payload: MemberCreate,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_org_admin),
) -> MemberResponse:
    if not tenant.is_superadmin and tenant.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Only superadmins can create superadmin members
    if payload.role == "superadmin" and not tenant.is_superadmin:
        raise HTTPException(status_code=403, detail="Only superadmins can grant superadmin role")

    org = db.get(OrganizationModel, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    existing = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.cognito_sub == payload.cognito_sub)
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User is already linked to an organization")

    membership = UserOrgMembershipModel(
        cognito_sub=payload.cognito_sub,
        organization_id=org_id,
        store_id=payload.store_id,
        role=payload.role,
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


@router.get(
    "/organizations/{org_id}/members",
    response_model=List[MemberResponse],
    status_code=status.HTTP_200_OK,
    summary="List members of an organization",
)
def list_members(
    org_id: str,
    limit: Optional[int] = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(require_org_admin),
) -> List[MemberResponse]:
    if not tenant.is_superadmin and tenant.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Forbidden")

    members = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.organization_id == org_id)
        .order_by(UserOrgMembershipModel.created_at.desc())
        .limit(limit)
        .all()
    )
    return members


#----------------------------------dashboard----------------------------------

def _resolve_dashboard_period(
    range: Optional[str] = Query(  # noqa: A002 - matches the frontend query param name
        "week", description="week | month | year (ignored when start_date & end_date are both given)"
    ),
    start_date: Optional[date] = Query(None, description="Custom range start (inclusive)"),
    end_date: Optional[date] = Query(None, description="Custom range end (inclusive)"),
) -> ResolvedPeriod:
    return resolve_period(range_preset=range, start_date=start_date, end_date=end_date)


def _initials(name: Optional[str]) -> Optional[str]:
    if not name:
        return None
    parts = [p for p in name.strip().split() if p]
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _percent_change(current: float, previous: float) -> Optional[float]:
    if previous == 0:
        return None if current == 0 else 100.0
    return round((current - previous) / previous * 100, 1)


def _dashboard_metric(value: float, change_pct: Optional[float], is_percentage: bool = False) -> DashboardMetric:
    display = f"{value:.0f}%" if is_percentage else f"{value:.0f}"
    return DashboardMetric(value=value, display=display, change_pct=change_pct, is_percentage=is_percentage)


@router.get(
    "/dashboard/overview",
    response_model=DashboardOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate metrics for the dashboard Overview tab (admin-only)",
)
@limiter.limit("30/minute")
def get_dashboard_overview(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> DashboardOverviewResponse:
    window_start = period.window_start
    window_end = period.window_end
    prev_window_start = period.prev_window_start
    prev_window_end = period.prev_window_end

    scan_query = db.query(FootScanSessionModel)
    if not tenant.is_superadmin:
        scan_query = scan_query.filter(FootScanSessionModel.organization_id == tenant.organization_id)

    total_scans_all_time = scan_query.count()
    scans_this_window = scan_query.filter(
        FootScanSessionModel.created_at >= window_start,
        FootScanSessionModel.created_at <= window_end,
    ).all()
    scans_prev_window = scan_query.filter(
        FootScanSessionModel.created_at >= prev_window_start,
        FootScanSessionModel.created_at < prev_window_end,
    ).all()

    scans_this_count = len(scans_this_window)
    scans_prev_count = len(scans_prev_window)

    completed_this = sum(1 for s in scans_this_window if s.status == "completed")
    completed_prev = sum(1 for s in scans_prev_window if s.status == "completed")

    conversion_rate = (completed_this / scans_this_count * 100) if scans_this_count else 0.0
    conversion_rate_prev = (completed_prev / scans_prev_count * 100) if scans_prev_count else 0.0

    confidences = [s.overall_confidence for s in scans_this_window if s.overall_confidence is not None]
    avg_confidence_pct = round(sum(confidences) / len(confidences) * 100, 1) if confidences else None

    # Buckets sized to stay readable regardless of the selected range
    # (daily for a week, weekly for a month, monthly for a year).
    bucket_totals = {(b.start, b.end): {"completed": 0, "pending": 0} for b in period.buckets}
    for s in scans_this_window:
        if not s.created_at:
            continue
        bucket = period.bucket_for(s.created_at.date())
        if bucket is None:
            continue
        totals = bucket_totals[(bucket.start, bucket.end)]
        if s.status == "completed":
            totals["completed"] += 1
        else:
            totals["pending"] += 1

    daily_scans = [
        DashboardSeriesPoint(
            label=b.label,
            date=b.start.isoformat(),
            value=bucket_totals[(b.start, b.end)]["completed"] + bucket_totals[(b.start, b.end)]["pending"],
        )
        for b in period.buckets
    ]
    daily_status = [
        DashboardStatusPoint(
            label=b.label,
            date=b.start.isoformat(),
            completed=bucket_totals[(b.start, b.end)]["completed"],
            pending=bucket_totals[(b.start, b.end)]["pending"],
        )
        for b in period.buckets
    ]

    cust_query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        cust_query = cust_query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    total_customers = cust_query.count()
    new_customers_this = cust_query.filter(
        CustomerProfileModel.created_at >= window_start,
        CustomerProfileModel.created_at <= window_end,
    ).count()
    new_customers_prev = cust_query.filter(
        CustomerProfileModel.created_at >= prev_window_start,
        CustomerProfileModel.created_at < prev_window_end,
    ).count()

    segment_counts = {"men": 0, "women": 0, "youth": 0, "kids": 0}
    for sex, age in cust_query.with_entities(CustomerProfileModel.sex, CustomerProfileModel.age).all():
        if age is not None and age < 13:
            segment_counts["kids"] += 1
        elif age is not None and age < 18:
            segment_counts["youth"] += 1
        elif (sex or "").strip().lower().startswith("f"):
            segment_counts["women"] += 1
        elif (sex or "").strip().lower().startswith("m"):
            segment_counts["men"] += 1
        # customers with no sex/age on file aren't shown in the demographics
        # breakdown but are still included in total_customers.

    demographics = [
        DashboardSegment(segment=key, count=count) for key, count in segment_counts.items()
    ]

    # Activity feed: most recent foot scans + analysis sessions within the
    # selected period, merged.
    recent_scans = sorted(scans_this_window, key=lambda s: s.created_at or datetime.min, reverse=True)[:5]
    scan_customer_ids = {s.customer_id for s in recent_scans if s.customer_id}
    name_lookup: Dict[str, str] = {}
    if scan_customer_ids:
        matches = cust_query.filter(
            (CustomerProfileModel.id.in_(scan_customer_ids))
            | (CustomerProfileModel.customer_id.in_(scan_customer_ids))
            | (CustomerProfileModel.email.in_(scan_customer_ids))
        ).all()
        for m in matches:
            display = m.full_name or " ".join(
                [p for p in [m.given_name, m.family_name] if p]
            ) or m.email
            for key in (m.id, m.customer_id, m.email):
                if key:
                    name_lookup[key] = display

    analysis_query = db.query(AnalysisSessionModel)
    if not tenant.is_superadmin:
        analysis_query = analysis_query.filter(AnalysisSessionModel.organization_id == tenant.organization_id)
    recent_analyses = (
        analysis_query.filter(
            AnalysisSessionModel.created_at >= window_start,
            AnalysisSessionModel.created_at <= window_end,
        )
        .order_by(AnalysisSessionModel.created_at.desc())
        .limit(5)
        .all()
    )

    activity_items: List[DashboardActivityItem] = []
    for s in recent_scans:
        name = name_lookup.get(s.customer_id) if s.customer_id else None
        activity_items.append(
            DashboardActivityItem(
                id=s.id,
                type="foot_scan",
                title=f"Foot scan {s.status}",
                subtitle="Foot measurement scan",
                customer_name=name,
                initials=_initials(name),
                timestamp=s.created_at.isoformat() if s.created_at else "",
                status_color="blue" if s.status == "completed" else "red",
            )
        )
    for a in recent_analyses:
        full_name = " ".join(
            [p for p in [a.customer_first_name, a.customer_last_name] if p]
        ) or a.customer_email
        activity_items.append(
            DashboardActivityItem(
                id=a.id,
                type="analysis",
                title=f"Gait analysis {a.status}",
                subtitle="Running gait analysis session",
                customer_name=full_name,
                initials=_initials(full_name),
                timestamp=a.created_at.isoformat() if a.created_at else "",
                status_color="blue" if a.status == "completed" else "red",
            )
        )
    activity_items.sort(key=lambda item: item.timestamp, reverse=True)

    return DashboardOverviewResponse(
        scans_this_week=_dashboard_metric(
            scans_this_count, _percent_change(scans_this_count, scans_prev_count)
        ),
        total_scans=_dashboard_metric(total_scans_all_time, None),
        new_customers_this_week=_dashboard_metric(
            new_customers_this, _percent_change(new_customers_this, new_customers_prev)
        ),
        conversion_rate=_dashboard_metric(
            conversion_rate,
            _percent_change(conversion_rate, conversion_rate_prev),
            is_percentage=True,
        ),
        daily_scans=daily_scans,
        daily_status=daily_status,
        demographics=demographics,
        total_customers=total_customers,
        activity=activity_items[:5],
        avg_confidence_pct=avg_confidence_pct,
    )


@router.get(
    "/dashboard/overview/export",
    status_code=status.HTTP_200_OK,
    summary="Export the dashboard Overview tab as a PDF report (admin-only)",
)
@limiter.limit("10/minute")
def export_dashboard_overview(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> Response:
    data = get_dashboard_overview(request, db, tenant, period)
    period_label = f"{period.window_start.date().isoformat()} to {period.window_end.date().isoformat()}"
    pdf_bytes = build_overview_pdf(data, period_label)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=overview-report.pdf"},
    )


_PRONATION_LABELS = {
    "pronation": "Overpronation",
    "neutral": "Neutral Pronation",
    "supination": "Underpronation",
}
_PRONATION_ORDER = ["pronation", "neutral", "supination"]


@router.get(
    "/dashboard/biomechanics",
    response_model=DashboardBiomechanicsResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate pronation and scan-quality metrics for the Biomechanics section (admin-only)",
)
@limiter.limit("30/minute")
def get_dashboard_biomechanics(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> DashboardBiomechanicsResponse:
    analysis_query = db.query(AnalysisSessionModel).filter(
        AnalysisSessionModel.created_at >= period.window_start,
        AnalysisSessionModel.created_at <= period.window_end,
    )
    if not tenant.is_superadmin:
        analysis_query = analysis_query.filter(AnalysisSessionModel.organization_id == tenant.organization_id)

    pronation_counts = {key: 0 for key in _PRONATION_ORDER}
    pronation_values = (
        analysis_query.filter(AnalysisSessionModel.inferred_pronation.isnot(None))
        .with_entities(AnalysisSessionModel.inferred_pronation)
        .all()
    )
    for (value,) in pronation_values:
        if value in pronation_counts:
            pronation_counts[value] += 1
    pronation_total = sum(pronation_counts.values())
    pronation_breakdown = [
        BiomechanicsSegment(key=key, label=_PRONATION_LABELS[key], count=pronation_counts[key])
        for key in _PRONATION_ORDER
    ]

    result_query = db.query(FootScanResultModel).join(
        FootScanSessionModel, FootScanResultModel.session_id == FootScanSessionModel.id
    ).filter(
        FootScanSessionModel.created_at >= period.window_start,
        FootScanSessionModel.created_at <= period.window_end,
    )
    if not tenant.is_superadmin:
        result_query = result_query.filter(FootScanSessionModel.organization_id == tenant.organization_id)

    quality_counts = {"no_issues": 0, "unusual_length": 0, "unusual_width": 0, "unusual_ratio": 0}
    confidence_values = (
        result_query.filter(FootScanResultModel.confidence.isnot(None))
        .with_entities(FootScanResultModel.confidence)
        .all()
    )
    for (confidence,) in confidence_values:
        warnings = (confidence or {}).get("warnings") or []
        if not warnings:
            quality_counts["no_issues"] += 1
            continue
        first = warnings[0].lower()
        if "length" in first:
            quality_counts["unusual_length"] += 1
        elif "width" in first:
            quality_counts["unusual_width"] += 1
        elif "ratio" in first:
            quality_counts["unusual_ratio"] += 1

    scan_quality_total = len(confidence_values)
    scan_quality_breakdown = [
        BiomechanicsSegment(key="no_issues", label="No Issues", count=quality_counts["no_issues"]),
        BiomechanicsSegment(key="unusual_length", label="Unusual Length", count=quality_counts["unusual_length"]),
        BiomechanicsSegment(key="unusual_width", label="Unusual Width", count=quality_counts["unusual_width"]),
        BiomechanicsSegment(key="unusual_ratio", label="Unusual Ratio", count=quality_counts["unusual_ratio"]),
    ]

    return DashboardBiomechanicsResponse(
        pronation_total=pronation_total,
        pronation_breakdown=pronation_breakdown,
        scan_quality_total=scan_quality_total,
        scan_quality_breakdown=scan_quality_breakdown,
    )


_EXPERIENCE_VALUES = [
    "Less than 6 months",
    "6 months to 1 year",
    "1 year to 3 years",
    "More than 3 years",
]
_FREQUENCY_VALUES = ["One", "2 to 3", "4 to 5", "Everyday"]


@router.get(
    "/dashboard/customers",
    response_model=DashboardCustomersResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate metrics for the dashboard Customers tab (admin-only)",
)
@limiter.limit("30/minute")
def get_dashboard_customers(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> DashboardCustomersResponse:
    window_start = period.window_start
    window_end = period.window_end
    prev_window_start = period.prev_window_start

    cust_query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        cust_query = cust_query.filter(CustomerProfileModel.organization_id == tenant.organization_id)

    existing_customer_ids = {cid for (cid,) in cust_query.with_entities(CustomerProfileModel.id)}

    scan_query = db.query(FootScanSessionModel)
    if not tenant.is_superadmin:
        scan_query = scan_query.filter(FootScanSessionModel.organization_id == tenant.organization_id)

    rows = (
        scan_query.filter(FootScanSessionModel.customer_id.isnot(None))
        .with_entities(FootScanSessionModel.customer_id, FootScanSessionModel.created_at)
        .all()
    )

    # Scans whose customer_id no longer matches a CustomerProfileModel (e.g. the
    # customer was deleted but their FootScanSessionModel rows weren't) must not
    # be counted as "customers" here - otherwise New/Returning can outnumber
    # the actual customer list shown elsewhere on the dashboard.
    scans_by_customer: Dict[str, List[datetime]] = {}
    for customer_id, created_at in rows:
        if created_at is None or customer_id not in existing_customer_ids:
            continue
        scans_by_customer.setdefault(customer_id, []).append(created_at)

    first_scan: Dict[str, datetime] = {
        customer_id: min(dates) for customer_id, dates in scans_by_customer.items()
    }

    def returning_count_as_of(as_of: datetime) -> int:
        return sum(
            1
            for dates in scans_by_customer.values()
            if sum(1 for d in dates if d <= as_of) >= 2
        )

    def total_with_scans_as_of(as_of: datetime) -> int:
        return sum(1 for first in first_scan.values() if first <= as_of)

    new_customers_now = sum(1 for first in first_scan.values() if window_start <= first <= window_end)
    new_customers_prev = sum(
        1 for first in first_scan.values() if prev_window_start <= first < window_start
    )

    returning_now = returning_count_as_of(window_end)
    returning_prev = returning_count_as_of(window_start)

    total_with_scans_now = total_with_scans_as_of(window_end)
    total_with_scans_prev = total_with_scans_as_of(window_start)

    retention_now = (returning_now / total_with_scans_now * 100) if total_with_scans_now else 0.0
    retention_prev = (returning_prev / total_with_scans_prev * 100) if total_with_scans_prev else 0.0

    bucket_totals = {(b.start, b.end): {"acquisition": 0, "retention": 0} for b in period.buckets}
    for customer_id, dates in scans_by_customer.items():
        first = first_scan[customer_id]
        for d in dates:
            bucket = period.bucket_for(d.date())
            if bucket is None:
                continue
            totals = bucket_totals[(bucket.start, bucket.end)]
            if d == first:
                totals["acquisition"] += 1
            else:
                totals["retention"] += 1

    daily_acquisition_retention = [
        DashboardAcquisitionPoint(
            label=b.label,
            date=b.start.isoformat(),
            acquisition=bucket_totals[(b.start, b.end)]["acquisition"],
            retention=bucket_totals[(b.start, b.end)]["retention"],
        )
        for b in period.buckets
    ]

    total_customers = len(existing_customer_ids)

    experience_counts = {v: 0 for v in _EXPERIENCE_VALUES}
    frequency_counts = {v: 0 for v in _FREQUENCY_VALUES}
    for running_duration, runs_per_week in cust_query.with_entities(
        CustomerProfileModel.running_duration, CustomerProfileModel.runs_per_week
    ).all():
        if running_duration in experience_counts:
            experience_counts[running_duration] += 1
        if runs_per_week in frequency_counts:
            frequency_counts[runs_per_week] += 1

    experience_breakdown = [
        BiomechanicsSegment(key=v, label=v, count=experience_counts[v]) for v in _EXPERIENCE_VALUES
    ]
    run_frequency_breakdown = [
        BiomechanicsSegment(key=v, label=v, count=frequency_counts[v]) for v in _FREQUENCY_VALUES
    ]

    return DashboardCustomersResponse(
        new_customers=_dashboard_metric(
            new_customers_now, _percent_change(new_customers_now, new_customers_prev)
        ),
        returning_customers=_dashboard_metric(
            returning_now, _percent_change(returning_now, returning_prev)
        ),
        retention_rate=_dashboard_metric(
            retention_now, _percent_change(retention_now, retention_prev), is_percentage=True
        ),
        daily_acquisition_retention=daily_acquisition_retention,
        experience_breakdown=experience_breakdown,
        run_frequency_breakdown=run_frequency_breakdown,
        total_customers=total_customers,
    )


@router.get(
    "/dashboard/customers/export",
    status_code=status.HTTP_200_OK,
    summary="Export the dashboard Customers tab as an Excel workbook (admin-only)",
)
@limiter.limit("10/minute")
def export_dashboard_customers(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> Response:
    data = get_dashboard_customers(request, db, tenant, period)
    xlsx_bytes = build_customers_workbook(data)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=customers-report.xlsx"},
    )


@router.get(
    "/dashboard/customers/matching",
    response_model=MatchingCustomersResponse,
    status_code=status.HTTP_200_OK,
    summary="Live count of customers matching selected segment filters (admin-only)",
)
@limiter.limit("60/minute")
def get_matching_customers(
    request: Request,
    experience: Optional[str] = Query(None, description="Comma-separated running_duration values"),
    frequency: Optional[str] = Query(None, description="Comma-separated runs_per_week values"),
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
) -> MatchingCustomersResponse:
    query = db.query(CustomerProfileModel)
    if not tenant.is_superadmin:
        query = query.filter(CustomerProfileModel.organization_id == tenant.organization_id)
    total = query.count()

    experiences = [v.strip() for v in experience.split(",") if v.strip()] if experience else []
    frequencies = [v.strip() for v in frequency.split(",") if v.strip()] if frequency else []

    if experiences:
        query = query.filter(CustomerProfileModel.running_duration.in_(experiences))
    if frequencies:
        query = query.filter(CustomerProfileModel.runs_per_week.in_(frequencies))

    return MatchingCustomersResponse(count=query.count(), total=total)


@router.get(
    "/dashboard/insights",
    response_model=DashboardInsightsResponse,
    status_code=status.HTTP_200_OK,
    summary="Aggregate metrics for the dashboard Insights tab (admin-only)",
)
@limiter.limit("30/minute")
def get_dashboard_insights(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> DashboardInsightsResponse:
    window_start = period.window_start
    window_end = period.window_end
    prev_window_start = period.prev_window_start
    prev_window_end = period.prev_window_end

    analysis_query = db.query(AnalysisSessionModel)
    if not tenant.is_superadmin:
        analysis_query = analysis_query.filter(AnalysisSessionModel.organization_id == tenant.organization_id)

    analyses_this_window = analysis_query.filter(
        AnalysisSessionModel.created_at >= window_start,
        AnalysisSessionModel.created_at <= window_end,
    ).all()
    analyses_prev_window = (
        analysis_query.filter(
            AnalysisSessionModel.created_at >= prev_window_start,
            AnalysisSessionModel.created_at < prev_window_end,
        )
        .with_entities(AnalysisSessionModel.analysis_type)
        .all()
    )

    back_now = sum(1 for a in analyses_this_window if a.analysis_type == "rear")
    side_now = sum(1 for a in analyses_this_window if a.analysis_type == "side")
    back_prev = sum(1 for (t,) in analyses_prev_window if t == "rear")
    side_prev = sum(1 for (t,) in analyses_prev_window if t == "side")

    total_now = len(analyses_this_window)
    total_prev = len(analyses_prev_window)

    analysis_bucket_totals = {(b.start, b.end): {"rear": 0, "side": 0, "unspecified": 0} for b in period.buckets}
    for a in analyses_this_window:
        if not a.created_at:
            continue
        bucket = period.bucket_for(a.created_at.date())
        if bucket is None:
            continue
        totals = analysis_bucket_totals[(bucket.start, bucket.end)]
        if a.analysis_type == "rear":
            totals["rear"] += 1
        elif a.analysis_type == "side":
            totals["side"] += 1
        else:
            totals["unspecified"] += 1

    daily_analysis_breakdown = [
        DashboardAnalysisStackPoint(
            label=b.label,
            date=b.start.isoformat(),
            rear=analysis_bucket_totals[(b.start, b.end)]["rear"],
            side=analysis_bucket_totals[(b.start, b.end)]["side"],
            unspecified=analysis_bucket_totals[(b.start, b.end)]["unspecified"],
        )
        for b in period.buckets
    ]

    # All-time analysis type breakdown (for the "Sales Overview" donut repurpose)
    all_type_rows = analysis_query.with_entities(AnalysisSessionModel.analysis_type).all()
    type_counts = {"rear": 0, "side": 0, "unspecified": 0}
    for (t,) in all_type_rows:
        if t == "rear":
            type_counts["rear"] += 1
        elif t == "side":
            type_counts["side"] += 1
        else:
            type_counts["unspecified"] += 1
    analysis_type_breakdown = [
        BiomechanicsSegment(key="rear", label="Back View", count=type_counts["rear"]),
        BiomechanicsSegment(key="side", label="Side View", count=type_counts["side"]),
        BiomechanicsSegment(key="unspecified", label="Unspecified", count=type_counts["unspecified"]),
    ]

    # Foot scans
    scan_query = db.query(FootScanSessionModel)
    if not tenant.is_superadmin:
        scan_query = scan_query.filter(FootScanSessionModel.organization_id == tenant.organization_id)

    scans_this_window = scan_query.filter(
        FootScanSessionModel.created_at >= window_start,
        FootScanSessionModel.created_at <= window_end,
    ).all()
    total_scans = scan_query.count()

    scan_bucket_totals = {(b.start, b.end): 0 for b in period.buckets}
    recommendation_bucket_totals = {(b.start, b.end): 0 for b in period.buckets}
    total_recommendations = 0
    for s in scans_this_window:
        if not s.created_at:
            continue
        bucket = period.bucket_for(s.created_at.date())
        if bucket is not None:
            scan_bucket_totals[(bucket.start, bucket.end)] += 1
        if s.recommendation:
            total_recommendations += 1
            if bucket is not None:
                recommendation_bucket_totals[(bucket.start, bucket.end)] += 1

    daily_scan_counts = [
        DashboardSeriesPoint(label=b.label, date=b.start.isoformat(), value=scan_bucket_totals[(b.start, b.end)])
        for b in period.buckets
    ]
    daily_recommendation_counts = [
        DashboardSeriesPoint(
            label=b.label, date=b.start.isoformat(), value=recommendation_bucket_totals[(b.start, b.end)]
        )
        for b in period.buckets
    ]

    return DashboardInsightsResponse(
        total_analyses=_dashboard_metric(total_now, _percent_change(total_now, total_prev)),
        back_view_count=_dashboard_metric(back_now, _percent_change(back_now, back_prev)),
        side_view_count=_dashboard_metric(side_now, _percent_change(side_now, side_prev)),
        daily_analysis_breakdown=daily_analysis_breakdown,
        total_scans=total_scans,
        daily_scan_counts=daily_scan_counts,
        total_recommendations=total_recommendations,
        daily_recommendation_counts=daily_recommendation_counts,
        analysis_type_breakdown=analysis_type_breakdown,
    )


@router.get(
    "/dashboard/insights/export",
    status_code=status.HTTP_200_OK,
    summary="Export the dashboard Insights tab as an Excel workbook (admin-only)",
)
@limiter.limit("10/minute")
def export_dashboard_insights(
    request: Request,
    db: Session = Depends(get_db),
    tenant: TenantContext = Depends(get_local_org_admin),
    period: ResolvedPeriod = Depends(_resolve_dashboard_period),
) -> Response:
    data = get_dashboard_insights(request, db, tenant, period)
    xlsx_bytes = build_insights_workbook(data)
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=insights-report.xlsx"},
    )
