# app/schemas/foot_scan.py
"""Pydantic schemas for foot scan measurement feature."""
from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


FootSide = Literal["left", "right"]
ScanStatus = Literal["pending", "processing", "completed", "failed"]


# =========================================================
# Calibration & Measurement Data
# =========================================================

class CalibrationInfo(BaseModel):
    """Information about the calibration reference detected in the image."""
    method: Literal["a4_paper"] = "a4_paper"
    detected: bool
    orientation: Optional[Literal["portrait", "landscape"]] = None
    px_per_mm: Optional[float] = None
    confidence: float = Field(ge=0.0, le=1.0)
    corners: Optional[List[List[float]]] = None  # 4 corners [[x,y], ...]

    model_config = ConfigDict(frozen=True)


class FootMeasurement(BaseModel):
    """Raw foot measurements in both pixels and real-world units."""
    length_px: float
    width_px: float
    length_mm: float
    width_mm: float
    length_cm: float
    width_cm: float
    # PCA principal axis direction [x, y]
    axis: Optional[List[float]] = None

    model_config = ConfigDict(frozen=True)


class ShoeSizes(BaseModel):
    """Shoe sizes in various regional standards."""
    eu: float  # EU/Paris point
    us_men: float  # US Men (Brannock)
    us_women: float  # US Women (Brannock)
    uk: float  # UK sizing
    jp: float  # JP/Mondopoint (cm)

    model_config = ConfigDict(frozen=True)


class ConfidenceBreakdown(BaseModel):
    """Detailed confidence scoring breakdown."""
    overall: float = Field(ge=0.0, le=1.0)
    calibration: float = Field(ge=0.0, le=1.0)
    segmentation: float = Field(ge=0.0, le=1.0)
    measurement: float = Field(ge=0.0, le=1.0)
    warnings: List[str] = Field(default_factory=list)

    model_config = ConfigDict(frozen=True)


# =========================================================
# Session Management
# =========================================================

class FootScanSessionCreate(BaseModel):
    """Request to create a new foot scan session."""
    customer_id: Optional[str] = None


class FootScanSession(BaseModel):
    """A foot scan session that links left and right foot scans."""
    session_id: str
    customer_id: Optional[str] = None
    created_at: datetime
    status: ScanStatus = "pending"
    left_job_id: Optional[str] = None
    right_job_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# Scan Request & Job Status
# =========================================================

class FootScanRequest(BaseModel):
    """Request to analyze a foot image."""
    session_id: str
    s3_key: str
    foot: FootSide
    # Optional metadata
    device_info: Optional[str] = None


class FootScanJobStatus(BaseModel):
    """Status of a foot scan analysis job."""
    job_id: str
    session_id: str
    foot: FootSide
    status: ScanStatus
    progress: Optional[int] = Field(default=None, ge=0, le=100)
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# Scan Result
# =========================================================

class FootScanResult(BaseModel):
    """Complete result of a single foot scan analysis."""
    job_id: str
    session_id: str
    foot: FootSide
    status: ScanStatus

    # Processing results
    calibration: Optional[CalibrationInfo] = None
    measurement: Optional[FootMeasurement] = None
    sizes: Optional[ShoeSizes] = None
    confidence: Optional[ConfidenceBreakdown] = None

    # Debug/visualization URLs
    debug_image_url: Optional[str] = None
    original_image_url: Optional[str] = None

    # Timestamps
    created_at: datetime
    completed_at: Optional[datetime] = None

    # Error info if failed
    error_message: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# Combined Session Result
# =========================================================

class SizeRecommendation(BaseModel):
    """Final size recommendation based on both feet."""
    eu: float
    us_men: float
    us_women: float
    uk: float
    jp: float
    # Which foot was larger (used for recommendation)
    larger_foot: FootSide
    length_difference_mm: float

    model_config = ConfigDict(frozen=True)


class FootScanSessionResult(BaseModel):
    """Complete session result with both feet measurements and recommendations."""
    session_id: str
    customer_id: Optional[str] = None
    status: ScanStatus
    created_at: datetime
    completed_at: Optional[datetime] = None

    # Individual foot results
    left_result: Optional[FootScanResult] = None
    right_result: Optional[FootScanResult] = None

    # Combined recommendation (only if both feet scanned)
    recommendation: Optional[SizeRecommendation] = None

    # Overall confidence
    overall_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# Customer History
# =========================================================

class FootScanHistoryItem(BaseModel):
    """Summary item for customer scan history."""
    session_id: str
    created_at: datetime
    status: ScanStatus
    recommendation: Optional[SizeRecommendation] = None
    overall_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)

    model_config = ConfigDict(frozen=True)


class FootScanHistoryResponse(BaseModel):
    """Customer scan history response."""
    customer_id: str
    total: int
    items: List[FootScanHistoryItem]

    model_config = ConfigDict(frozen=True)
