#
#  File: schemas/tenant.py
#  Project: StrideMatchLab
#

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Organization ──────────────────────────────────────────────

class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9\-]+$")


class OrganizationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Store ─────────────────────────────────────────────────────

class StoreCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = None


class StoreUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    address: Optional[str] = None
    is_active: Optional[bool] = None


class StoreResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    address: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Membership ────────────────────────────────────────────────

class MemberCreate(BaseModel):
    cognito_sub: str = Field(..., min_length=1)
    store_id: Optional[str] = None
    role: str = Field(default="staff", pattern=r"^(staff|org_admin|superadmin)$")


class MemberResponse(BaseModel):
    id: str
    cognito_sub: str
    organization_id: str
    store_id: Optional[str]
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
