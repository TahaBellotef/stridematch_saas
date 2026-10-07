#
#  File: db/tenant.py
#  Project: StrideMatchLab
#  Multi-tenant context dependency for FastAPI routes.
#

from __future__ import annotations

import time
import logging
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import LOCAL_DEFAULT_ORGANIZATION_ID
from app.db.deps import get_db
from app.auth import require_user
from app.models.tenant import OrganizationModel, UserOrgMembershipModel

logger = logging.getLogger(__name__)

# Bounded in-memory cache: cognito_sub -> (TenantContext, expiry_timestamp)
_TENANT_CACHE: OrderedDict[str, tuple] = OrderedDict()
_CACHE_TTL = 60  # seconds
_CACHE_MAX_SIZE = 500


@dataclass
class TenantContext:
    organization_id: str
    organization_name: str
    logo_url: Optional[str]
    store_id: Optional[str]
    role: str  # staff | org_admin | superadmin
    cognito_sub: str
    account_type: str = "store"  # store | personal

    @property
    def is_superadmin(self) -> bool:
        return self.role == "superadmin"

    @property
    def is_org_admin(self) -> bool:
        return self.role in ("org_admin", "superadmin")

    @property
    def is_personal(self) -> bool:
        return self.account_type == "personal"


def _cache_get(sub: str) -> Optional[TenantContext]:
    entry = _TENANT_CACHE.get(sub)
    if entry is None:
        return None
    ctx, expires = entry
    if time.monotonic() > expires:
        _TENANT_CACHE.pop(sub, None)
        return None
    return ctx


def _cache_set(sub: str, ctx: TenantContext) -> None:
    _TENANT_CACHE[sub] = (ctx, time.monotonic() + _CACHE_TTL)
    # Evict oldest entries if cache exceeds max size
    while len(_TENANT_CACHE) > _CACHE_MAX_SIZE:
        _TENANT_CACHE.popitem(last=False)


def _default_tenant_context(db: Session, sub: str) -> Optional[TenantContext]:
    if not LOCAL_DEFAULT_ORGANIZATION_ID:
        return None
    org = db.get(OrganizationModel, LOCAL_DEFAULT_ORGANIZATION_ID)
    if not org:
        logger.warning(
            "LOCAL_DEFAULT_ORGANIZATION_ID=%s not found",
            LOCAL_DEFAULT_ORGANIZATION_ID,
        )
        return None
    return TenantContext(
        organization_id=LOCAL_DEFAULT_ORGANIZATION_ID,
        organization_name=org.name,
        logo_url=org.logo_url,
        store_id=None,
        role="org_admin",
        cognito_sub=sub,
        account_type=getattr(org, "account_type", None) or "store",
    )


def _tenant_from_membership(
    db: Session,
    membership: UserOrgMembershipModel,
    sub: str,
) -> TenantContext:
    org = db.get(OrganizationModel, membership.organization_id)
    return TenantContext(
        organization_id=membership.organization_id,
        organization_name=org.name if org else "",
        logo_url=org.logo_url if org else None,
        store_id=membership.store_id,
        role=membership.role,
        cognito_sub=sub,
        account_type=(getattr(org, "account_type", None) or "store") if org else "store",
    )


def get_current_tenant(
    claims: Dict[str, Any] = Depends(require_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    """
    Resolve the current user's tenant (organization) from their Cognito sub.
    Raises 403 if the user is not linked to any organization.
    """
    sub = claims.get("sub", "")
    if not sub:
        raise HTTPException(status_code=403, detail="Missing user identity")

    # Check cache first
    cached = _cache_get(sub)
    if cached is not None:
        return cached

    # DB lookup by cognito sub
    membership = (
        db.query(UserOrgMembershipModel)
        .filter(UserOrgMembershipModel.cognito_sub == sub)
        .one_or_none()
    )

    # Fallback: match by email (handles bootstrap placeholder)
    if membership is None:
        email = (claims.get("email") or claims.get("username") or "").strip()
        if email:
            membership = (
                db.query(UserOrgMembershipModel)
                .filter(UserOrgMembershipModel.cognito_sub == email)
                .one_or_none()
            )
            if membership:
                # Replace email placeholder with real Cognito sub
                membership.cognito_sub = sub
                db.commit()
                logger.info("Tenant: updated membership cognito_sub from email=%s to sub=%s", email, sub)

    if membership is None:
        ctx = _default_tenant_context(db, sub)
        if ctx is not None:
            logger.info("Tenant: using default organization for sub=%s", sub)
            _cache_set(sub, ctx)
            return ctx
        raise HTTPException(
            status_code=403,
            detail="User is not linked to any organization. Contact your administrator.",
        )

    ctx = _tenant_from_membership(db, membership, sub)
    _cache_set(sub, ctx)
    return ctx


def require_superadmin(
    tenant: TenantContext = Depends(get_current_tenant),
) -> TenantContext:
    """Dependency that requires the user to be a superadmin."""
    if not tenant.is_superadmin:
        raise HTTPException(status_code=403, detail="Superadmin access required")
    return tenant


def require_org_admin(
    tenant: TenantContext = Depends(get_current_tenant),
) -> TenantContext:
    """Dependency that requires the user to be at least an org_admin."""
    if not tenant.is_org_admin:
        raise HTTPException(status_code=403, detail="Organization admin access required")
    return tenant
