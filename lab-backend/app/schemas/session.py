# app/schemas/session.py

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .analysis import AnalysisResult
from .runner_profile import RunnerProfile

# Captures are the concrete uploads we actually collect.
CaptureType = Literal["side", "rear", "lower_body"]

# Analysis type is what the product offers the user.
AnalysisType = Literal["rear", "side", "lower_body"]


class AnalysisSessionCreate(BaseModel):
    runner_profile: RunnerProfile
    customer_id: Optional[str] = None
    # Keep "side" for backward-compatibility even if UI stops exposing it.
    analysis_type: Optional[AnalysisType] = None
    store_id: Optional[str] = None
    staff_id: Optional[str] = None
    # Sales-side customer identity captured on the runner profile form.
    customer_first_name: Optional[str] = Field(default=None, max_length=80)
    customer_last_name: Optional[str] = Field(default=None, max_length=80)
    customer_email: Optional[EmailStr] = None
    # Free-text label for the configuration scanned (shoe model, "Socks", ...).
    scan_label: Optional[str] = Field(default=None, max_length=120)


class AnalysisSession(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    runner_profile: RunnerProfile
    customer_id: Optional[str] = None

    customer_first_name: Optional[str] = None
    customer_last_name: Optional[str] = None
    customer_email: Optional[str] = None
    scan_label: Optional[str] = None

    # Don't default to "rear" — reflect what's actually stored.
    analysis_type: Optional[AnalysisType] = None

    status: str
    required_captures: List[CaptureType]
    completed_captures: List[CaptureType] = []
    active_analysis_job_id: Optional[str] = None


class CustomerInfoUpdate(BaseModel):
    """Sales-side customer identity captured mid-processing."""
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    # Optional free-text label for the configuration scanned.
    scan_label: Optional[str] = Field(default=None, max_length=120)


class AdminSessionDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    status: str
    runner_profile: RunnerProfile
    customer_id: Optional[str] = None

    customer_first_name: Optional[str] = None
    customer_last_name: Optional[str] = None
    customer_email: Optional[str] = None
    scan_label: Optional[str] = None

    # Don't default to "rear" — reflect what's actually stored.
    analysis_type: Optional[AnalysisType] = None

    required_captures: List[CaptureType]
    completed_captures: List[CaptureType] = []
    inferred_pronation: Optional[str] = None
    active_analysis_job_id: Optional[str] = None
    rear_analysis_job_id: Optional[str] = None
    rear_video_url: Optional[str] = None
    client_session_key: Optional[str] = None
    analysis_results: List[AnalysisResult] = Field(default_factory=list)

class AdminSessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    status: str
    customer_id: Optional[str] = None
    customer_first_name: Optional[str] = None
    customer_last_name: Optional[str] = None
    customer_email: Optional[str] = None
    organization_id: Optional[str] = None
    active_analysis_job_id: Optional[str] = None


class AdminSessionListResponse(BaseModel):
    total: int
    sessions: List[AdminSessionSummary]


