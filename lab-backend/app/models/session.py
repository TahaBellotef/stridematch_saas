#
#  File: models/session.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, ForeignKey, String, DateTime, JSON
from sqlalchemy.ext.mutable import MutableList

from app.db.base import Base

class AnalysisSessionModel(Base):
    __tablename__ = "analysis_sessions"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    status = Column(String, nullable=False, default="pending", index=True)

    runner_profile = Column(JSON, nullable=False)
    customer_id = Column(String, nullable=True, index=True)

    # Sales-captured customer identity (filled mid-processing in the Lab flow)
    customer_first_name = Column(String, nullable=True, index=True)
    customer_last_name = Column(String, nullable=True, index=True)
    customer_email = Column(String, nullable=True, index=True)

    # Free-text label describing the configuration scanned (shoe model, "Socks
    # only", "Insole A"...). Used to disambiguate scans of the same runner
    # when comparing 3 sessions to find the best shoe.
    scan_label = Column(String, nullable=True)

    # Optional, not enforced
    analysis_type = Column(String, nullable=True, index=True)  # "rear" | "side" | None

    required_captures = Column(MutableList.as_mutable(JSON), nullable=False, default=list)
    completed_captures = Column(MutableList.as_mutable(JSON), nullable=False, default=list)

    inferred_pronation = Column(String, nullable=True, index=True)

    rear_analysis_job_id = Column(String, nullable=True, index=True)
    rear_video_url = Column(String, nullable=True)

    active_analysis_job_id = Column(String, nullable=True, index=True)

    client_session_key = Column(String, nullable=True, unique=True, index=True)

    # Owner tracking for IDOR prevention
    created_by = Column(String, nullable=True, index=True)

    # Multi-tenant scoping
    organization_id = Column(String, ForeignKey("organizations.id"), nullable=True, index=True)
    store_id = Column(String, ForeignKey("stores.id"), nullable=True, index=True)

    # Error summary for user-facing feedback when analysis fails
    error_summary = Column(String, nullable=True)
