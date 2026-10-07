#
#  File: models/customer_profile.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint

from app.db.base import Base


class CustomerProfileModel(Base):
    __tablename__ = "customer_profiles"
    __table_args__ = (
        UniqueConstraint("organization_id", "email", name="uq_customer_org_email"),
    )

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    email = Column(String, nullable=False, index=True)
    customer_id = Column(String, nullable=True, index=True)
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)

    given_name = Column(String, nullable=True)
    family_name = Column(String, nullable=True)
    full_name = Column(String, nullable=True)

    sex = Column(String, nullable=True)
    age = Column(Integer, nullable=True)
    weight = Column(Float, nullable=True)
    height = Column(Float, nullable=True)
    weekly_distance = Column(String, nullable=True)

    preferred_surfaces = Column(JSON, nullable=True)
    running_duration = Column(String, nullable=True)
    runs_per_week = Column(String, nullable=True)
    distance_per_week = Column(String, nullable=True)

    shoe_preferences = Column(JSON, nullable=True)
    shoe_size = Column(String, nullable=True)
    shoe_size_unit = Column(String, nullable=True)

    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
