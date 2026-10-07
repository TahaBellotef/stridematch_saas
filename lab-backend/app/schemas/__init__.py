# app/schemas/__init__.py

from .analysis import (
    SideBioMetrics,
    RearBioMetrics,
    AdvancedGaitMetrics,
    GaitProfile,
    AnalysisRequestMetadata,
    InsightItem,
    AnalysisResult,
    AnalysisHistoryItem,
    AnalysisHistoryResponse,
)

from .runner_profile import RunnerProfile
from .session import (
    AnalysisSession,
    AnalysisSessionCreate,
    AdminSessionSummary,
    AdminSessionListResponse,
    AdminSessionDetail,
    CustomerInfoUpdate,
)
from .auth import AdminLoginRequest, AdminLoginResponse
from .catalog import (
    CatalogInventoryItem,
    CatalogInventoryResponse,
    CatalogInventoryUpdateRequest,
    CatalogItem,
    CatalogProfile,
    CatalogResponse,
)
from .users import UserListResponse, UserRecord
from .foot_scan import (
    FootSide,
    ScanStatus,
    CalibrationInfo,
    FootMeasurement,
    ShoeSizes,
    ConfidenceBreakdown,
    FootScanSessionCreate,
    FootScanSession,
    FootScanRequest,
    FootScanJobStatus,
    FootScanResult,
    SizeRecommendation,
    FootScanSessionResult,
    FootScanHistoryItem,
    FootScanHistoryResponse,
)


__all__ = [
    # Core analysis
    "SideBioMetrics",
    "RearBioMetrics",
    "AdvancedGaitMetrics",
    "GaitProfile",
    "AnalysisRequestMetadata",
    "InsightItem",
    "AnalysisResult",
    "AnalysisHistoryItem",
    "AnalysisHistoryResponse",

    # Sessions
    "AnalysisSession",
    "AnalysisSessionCreate",
    "AdminSessionSummary",
    "AdminSessionListResponse",
    "AdminSessionDetail",
    "CustomerInfoUpdate",

    # Runner
    "RunnerProfile",

    # Auth
    "AdminLoginRequest",
    "AdminLoginResponse",

    # Catalog
    "CatalogInventoryItem",
    "CatalogInventoryResponse",
    "CatalogInventoryUpdateRequest",
    "CatalogItem",
    "CatalogProfile",
    "CatalogResponse",

    # Users
    "UserListResponse",
    "UserRecord",

    # Foot Scan
    "FootSide",
    "ScanStatus",
    "CalibrationInfo",
    "FootMeasurement",
    "ShoeSizes",
    "ConfidenceBreakdown",
    "FootScanSessionCreate",
    "FootScanSession",
    "FootScanRequest",
    "FootScanJobStatus",
    "FootScanResult",
    "SizeRecommendation",
    "FootScanSessionResult",
    "FootScanHistoryItem",
    "FootScanHistoryResponse",
]