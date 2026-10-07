#
#  File: models/foot_scan.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, String, DateTime, JSON, Float, Text
from sqlalchemy.ext.mutable import MutableDict

from app.db.base import Base


class FootScanSessionModel(Base):
    """Session linking left and right foot scans for a customer."""
    __tablename__ = "foot_scan_sessions"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(String, nullable=False, default="pending", index=True)
    customer_id = Column(String, nullable=True, index=True)

    # Job IDs for left and right foot scans
    left_job_id = Column(String, nullable=True, index=True)
    right_job_id = Column(String, nullable=True, index=True)

    # Final recommendation (populated when both feet are scanned)
    recommendation = Column(MutableDict.as_mutable(JSON), nullable=True)
    overall_confidence = Column(Float, nullable=True)

    # Multi-tenant scoping
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=True, index=True)

    # Owner tracking for IDOR prevention
    created_by = Column(String, nullable=True, index=True)


class FootScanResultModel(Base):
    """Individual foot scan result with measurements and sizes."""
    __tablename__ = "foot_scan_results"

    job_id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    session_id = Column(String, ForeignKey("foot_scan_sessions.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(String, nullable=False, default="pending", index=True)
    foot = Column(String, nullable=False, index=True)  # "left" | "right"

    # Input image reference
    s3_key = Column(String, nullable=True)
    original_image_url = Column(String, nullable=True)
    debug_image_url = Column(String, nullable=True)

    # Calibration info (JSON)
    calibration = Column(MutableDict.as_mutable(JSON), nullable=True)

    # Measurements (JSON)
    measurement = Column(MutableDict.as_mutable(JSON), nullable=True)

    # Shoe sizes (JSON)
    sizes = Column(MutableDict.as_mutable(JSON), nullable=True)

    # Confidence breakdown (JSON)
    confidence = Column(MutableDict.as_mutable(JSON), nullable=True)

    # Error message if failed
    error_message = Column(Text, nullable=True)

    # Device/metadata
    device_info = Column(String, nullable=True)
