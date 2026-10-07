#
#  File: models/tenant.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String

from app.db.base import Base


class OrganizationModel(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    # "store" = B2B retail tenant (staff scan customers);
    # "personal" = B2C single-person tenant (the authenticated user is the subject).
    # server_default keeps the auto-migrate path safe for existing rows.
    account_type = Column(
        String, nullable=False, server_default="store", default="store", index=True
    )
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class StoreModel(Base):
    __tablename__ = "stores"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    address = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class UserOrgMembershipModel(Base):
    __tablename__ = "user_org_memberships"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    cognito_sub = Column(String, nullable=False, unique=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=False, index=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=True, index=True)
    role = Column(String, nullable=False, default="staff")  # staff | org_admin | superadmin
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
