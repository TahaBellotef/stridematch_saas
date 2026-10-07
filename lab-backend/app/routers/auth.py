#
#  File: routers/auth.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Body, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import (
    AUTH_TOKEN_EXPIRES_MINUTES,
    COGNITO_CLIENT_ID,
    COGNITO_REGION,
    COGNITO_USER_POOL_ID,
)

from ..auth import (
    authenticate_admin,
    cognito_active,
    create_access_token,
    decode_cognito_token,
    require_admin,
    require_user,
    _fetch_cognito_jwks,
)
from ..schemas import AdminLoginResponse
import re
import uuid

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import LOCAL_DEFAULT_ORGANIZATION_ID
from app.db.deps import get_db
from app.db.tenant import TenantContext, get_current_tenant
from app.models.tenant import OrganizationModel, StoreModel, UserOrgMembershipModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])
limiter = Limiter(key_func=get_remote_address)


def _extract_bearer_token(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


async def _cognito_user_password_auth(username: str, password: str) -> Dict[str, Any]:
    """
    Authenticate against Cognito using USER_PASSWORD_AUTH flow.
    Returns the Cognito AuthenticationResult dict with AccessToken, IdToken, etc.
    """
    client = boto3.client("cognito-idp", region_name=COGNITO_REGION)
    try:
        resp = client.initiate_auth(
            ClientId=COGNITO_CLIENT_ID,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
            },
        )
        result = resp.get("AuthenticationResult")
        if not result:
            challenge = resp.get("ChallengeName")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cognito challenge required: {challenge}",
            )
        return result
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        msg = exc.response["Error"]["Message"]
        logger.warning("Cognito auth failed: %s — %s", code, msg)
        if code in ("NotAuthorizedException", "UserNotFoundException"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {msg}",
        )


@router.post("/login", response_model=AdminLoginResponse, summary="Authenticate users")
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: Dict[str, Any] = Body(...),
) -> AdminLoginResponse:
    """
    Authenticate a user.

    Accepts {username, password}:
      - When Cognito is active: authenticates via Cognito USER_PASSWORD_AUTH,
        then verifies the Cognito token and mints an API token.
      - Fallback: tries local admin credentials.

    Also accepts {token} or Bearer header for direct Cognito token exchange.
    """
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""

    # --- Username/password login ---
    if username and password:
        # Try Cognito first if active
        if cognito_active():
            try:
                auth_result = await _cognito_user_password_auth(username, password)
                cognito_token = auth_result.get("AccessToken") or auth_result.get("IdToken")

                # Verify the Cognito token and mint our API token
                claims = await decode_cognito_token(cognito_token)
                subject = claims.get("sub") or claims.get("cognito:username") or username

                api_token = create_access_token(subject)
                return AdminLoginResponse(
                    access_token=api_token,
                    token_type="Bearer",
                    expires_in=AUTH_TOKEN_EXPIRES_MINUTES * 60,
                )
            except HTTPException:
                raise
            except Exception as exc:
                logger.warning("Cognito login failed, trying local: %s", exc)

        # Local admin fallback
        subject = authenticate_admin(username, password)
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials",
            )

        token = create_access_token(subject)
        return AdminLoginResponse(
            access_token=token,
            token_type="Bearer",
            expires_in=AUTH_TOKEN_EXPIRES_MINUTES * 60,
        )

    # --- Direct Cognito token exchange (Bearer header or {token} body) ---
    if cognito_active():
        token = _extract_bearer_token(request) or payload.get("token")
        if token:
            claims = await decode_cognito_token(token)
            subject = claims.get("sub") or claims.get("cognito:username")
            if not subject:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Cognito token missing subject",
                )

            api_token = create_access_token(subject)
            return AdminLoginResponse(
                access_token=api_token,
                token_type="Bearer",
                expires_in=AUTH_TOKEN_EXPIRES_MINUTES * 60,
            )

    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Provide username and password.",
    )


@router.get("/me", summary="Return current authenticated user")
async def get_me(identity: Dict[str, Any] = Depends(require_admin)):
    """Extract and return the claims from the admin's verified token."""
    return {
        "sub": identity.get("sub"),
        "email": identity.get("email"),
        "username": (
            identity.get("cognito:username")
            or identity.get("username")
            or identity.get("sub")
        ),
        "roles": identity.get("cognito:groups", []),
        "provider": identity.get("provider", "local"),
    }


@router.get("/tenant", summary="Get current user's organization info")
async def get_tenant(
    tenant: TenantContext = Depends(get_current_tenant),
):
    """Return the current user's organization context (name, logo, role)."""
    return {
        "organization_id": tenant.organization_id,
        "organization_name": tenant.organization_name,
        "logo_url": tenant.logo_url,
        "store_id": tenant.store_id,
        "role": tenant.role,
        "account_type": tenant.account_type,
    }


class OnboardRequest(BaseModel):
    company_name: str = Field(..., min_length=1, max_length=255)
    logo_url: str | None = None


@router.post("/onboard", summary="Join the default organization (beta onboarding)")
async def onboard_organization(
    payload: OnboardRequest,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    Called after first login to attach the user to the deployment's single
    default organization (LOCAL_DEFAULT_ORGANIZATION_ID), as a low-privilege
    `staff` member. Only works if the user has no existing membership.

    This used to create a brand-new organization per signup, which fragmented
    customers/sessions across orgs that could never see each other. Promote a
    member to `org_admin`/`superadmin` via the existing member-management
    endpoints once you've verified who they are.
    """
    sub = claims.get("sub", "")
    if not sub:
        raise HTTPException(status_code=403, detail="Missing user identity")

    # Check if already onboarded
    existing = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.cognito_sub == sub)
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already onboarded")

    # Also check email fallback (bootstrap placeholder)
    email = claims.get("email", "")
    if email:
        email_match = (
            db.query(UserOrgMembershipModel)
            .filter(UserOrgMembershipModel.cognito_sub == email)
            .one_or_none()
        )
        if email_match:
            # Update placeholder to real sub
            email_match.cognito_sub = sub
            db.commit()
            raise HTTPException(status_code=409, detail="Already onboarded")

    if not LOCAL_DEFAULT_ORGANIZATION_ID:
        raise HTTPException(status_code=503, detail="No default organization configured")

    org = db.get(OrganizationModel, LOCAL_DEFAULT_ORGANIZATION_ID)
    if not org:
        raise HTTPException(status_code=503, detail="Default organization not found")

    membership = UserOrgMembershipModel(
        id=uuid.uuid4().hex,
        cognito_sub=sub,
        organization_id=org.id,
        role="staff",
    )
    db.add(membership)
    db.commit()

    logger.info("Onboard: joined org '%s' (id=%s) as staff for user %s", org.name, org.id, sub)

    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "logo_url": org.logo_url,
        "role": "staff",
    }


@router.post("/onboard-personal", summary="Self-register a personal (B2C) account")
async def onboard_personal(
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db),
):
    """
    Onboard a consumer-app user into their own single-person organization.

    Unlike /onboard, this requires no company name: the authenticated user IS
    the subject of their scans. Creates a `personal` org and makes the user
    org_admin of it. Only works if the user has no existing membership.
    """
    sub = claims.get("sub", "")
    if not sub:
        raise HTTPException(status_code=403, detail="Missing user identity")

    # Already onboarded? (match by sub, then by email placeholder)
    existing = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.cognito_sub == sub)
        .one_or_none()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already onboarded")

    email = (claims.get("email") or "").strip()
    if email:
        email_match = (
            db.query(UserOrgMembershipModel)
            .filter(UserOrgMembershipModel.cognito_sub == email)
            .one_or_none()
        )
        if email_match:
            email_match.cognito_sub = sub
            db.commit()
            raise HTTPException(status_code=409, detail="Already onboarded")

    # Display name: Cognito username/name, else email local-part, else "Runner".
    display_name = (
        claims.get("name")
        or claims.get("cognito:username")
        or claims.get("username")
        or (email.split("@", 1)[0] if email else "")
        or "Runner"
    )

    # Unique slug derived from sub (stable, collision-free across personal users).
    slug = f"personal-{sub[:24]}".lower()
    slug = re.sub(r"[^a-z0-9-]+", "-", slug).strip("-") or "personal"
    base_slug = slug
    counter = 1
    while db.query(OrganizationModel).filter(OrganizationModel.slug == slug).one_or_none():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = OrganizationModel(
        id=uuid.uuid4().hex,
        name=display_name,
        slug=slug,
        logo_url=None,
        is_active=True,
        account_type="personal",
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    membership = UserOrgMembershipModel(
        id=uuid.uuid4().hex,
        cognito_sub=sub,
        organization_id=org.id,
        role="org_admin",
    )
    db.add(membership)
    db.commit()

    logger.info("Onboard-personal: created personal org (id=%s) for user %s", org.id, sub)

    return {
        "organization_id": org.id,
        "organization_name": org.name,
        "account_type": "personal",
        "role": "org_admin",
    }


@router.get("/health", summary="Check authentication health")
async def healthcheck():
    if cognito_active():
        try:
            await _fetch_cognito_jwks(force=True)
            return {
                "status": "ok",
                "provider": "cognito",
                "region": COGNITO_REGION,
                "user_pool": COGNITO_USER_POOL_ID,
            }
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Unable to reach Cognito JWKS: {exc}",
            ) from exc

    return {"status": "ok", "provider": "local"}
