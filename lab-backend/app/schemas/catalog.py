#
#  File: schemas/catalog.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch.
#

from __future__ import annotations

from typing import List, Optional, Dict, Any, Literal

from pydantic import BaseModel, Field, ConfigDict, model_validator

from .analysis import (
    GaitProfile,
    SideBioMetrics,
    RearBioMetrics,
)

# ---------------------------------------------------------------------------
# Runner Profile (Recommendation Input)
# ---------------------------------------------------------------------------


class RunnerProfile(BaseModel):
    """
    Unified runner profile used by the recommendation engine.
    Combines questionnaire fields with optional gait metrics.

    IMPORTANT CONTRACT (product-grade):
    - cadence / contact_time / knee_mean / sym are primarily SIDE-derived metrics.
    - RearBioMetrics may include cadence when rear cadence estimation is enabled,
      but other side-only fields SHOULD be None (or treated as "unknown" by scoring).
    """

    model_config = ConfigDict(extra="ignore")  # keep backward compatibility

    # Questionnaire (6 questions)
    surface: Optional[str] = None
    pronation: Optional[str] = None
    preference: Optional[str] = None
    objective: Optional[str] = None
    weekly_distance: Optional[str] = None
    weekly_sessions: Optional[str] = None
    distance: Optional[str] = Field(default=None, validation_alias="weeklyDistance")
    pace: Optional[str] = None

    # Optional profile fields (used for richer recommendations)
    gender: Optional[str] = None
    age: Optional[int] = None
    height_cm: Optional[float] = Field(default=None, validation_alias="heightCm")
    weight_kg: Optional[float] = Field(default=None, validation_alias="weightKg")
    level: Optional[str] = None

    # Optional biomechanical metrics (SIDE-derived when present)
    cadence: Optional[int] = None
    osc: Optional[float] = None
    contact_time: Optional[int] = None
    knee_mean: Optional[float] = None
    sym: Optional[float] = None
    strike_pattern: Optional[str] = None

    # Optional full gait profile
    gait: Optional[GaitProfile] = Field(
        default=None,
        description="Full gait profile from video analysis.",
    )

    # Rear analyses carry no cadence/osc/contact_time/sym, so these two are
    # the only signals that vary per rear analysis - the 0..100 alignment
    # score shown on the report, and the granular rear kinematics it's
    # computed from (knee valgus, ankle eversion, pelvic drop, ...).
    energy_score: Optional[int] = None
    rear_metrics: Optional[Dict[str, Any]] = None

    # Recommendation tuning
    limit: int = Field(7, description="Max number of results to return.", ge=1, le=50)
    min_score: Optional[float] = Field(None, description="Filter out shoes below this raw score.", ge=0.0)

    # -----------------------------
    # Optional validation helpers
    # -----------------------------
    @model_validator(mode="after")
    def _rear_contract_guard(self) -> "RunnerProfile":
        """
        Soft guardrail:
        If gait.bio is RearBioMetrics, side-only fields are not expected.
        We don't hard-fail (to keep compatibility), but we can normalize
        obvious nonsense values if you want to be strict later.
        """
        if self.gait and self.gait.bio and isinstance(self.gait.bio, RearBioMetrics):
            # We keep the values (backward compatible), but you could uncomment
            # these lines to force "clean" semantics.
            #
            # self.cadence = None
            # self.contact_time = None
            # self.knee_mean = None
            # self.sym = None
            pass
        return self

    # -----------------------------
    # Product-grade convenience:
    # a single canonical view for scoring.
    # -----------------------------
    def resolved_gait_view(self) -> "ResolvedGaitView":
        """
        Canonical gait representation used by scoring/ranking.
        Precedence:
          1) gait.bio (SideBioMetrics preferred when present)
          2) flat fields (cadence/osc/contact_time/knee_mean/sym)
        Rear-only:
          - only pronation/rear_quality are used from gait.bio (RearBioMetrics)
        """
        has_side = False
        has_rear = False

        cadence = self.cadence
        osc = self.osc
        contact_time = self.contact_time
        knee_mean = self.knee_mean
        sym = self.sym

        pronation = self.pronation
        rear_quality: Optional[Literal["low", "medium", "high"]] = None

        if self.gait and self.gait.bio:
            if isinstance(self.gait.bio, SideBioMetrics):
                has_side = True
                cadence = self.gait.bio.cadence
                osc = self.gait.bio.osc
                contact_time = self.gait.bio.contact_time
                knee_mean = self.gait.bio.knee_mean
                sym = self.gait.bio.sym
                pronation = self.gait.bio.pronation or pronation
            elif isinstance(self.gait.bio, RearBioMetrics):
                has_rear = True
                pronation = self.gait.bio.pronation or pronation
                rear_quality = self.gait.bio.rear_quality

        return ResolvedGaitView(
            has_side=has_side,
            has_rear=has_rear,
            cadence=cadence,
            osc=osc,
            contact_time=contact_time,
            knee_mean=knee_mean,
            sym=sym,
            pronation=pronation,
            rear_quality=rear_quality,
            energy_score=self.energy_score,
            rear_metrics=self.rear_metrics,
        )


class CatalogProfile(RunnerProfile):
    """Alias used by existing recommendation endpoint for backward compatibility."""
    pass


# ---------------------------------------------------------------------------
# Canonical gait view (scoring input)
# ---------------------------------------------------------------------------


class ResolvedGaitView(BaseModel):
    """
    Canonical gait representation used by the catalog engine.
    Scoring functions should consume this, not raw unions.
    """

    has_side: bool = False
    has_rear: bool = False

    # SIDE-derived
    cadence: Optional[int] = None
    osc: Optional[float] = None
    contact_time: Optional[int] = None
    knee_mean: Optional[float] = None
    sym: Optional[float] = None

    # REAR-derived / general
    pronation: Optional[str] = None
    rear_quality: Optional[Literal["low", "medium", "high"]] = None
    energy_score: Optional[int] = None
    rear_metrics: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Recommendation Response Models
# ---------------------------------------------------------------------------


class CatalogItem(BaseModel):
    """Single recommended shoe."""
    position: int
    brand: Optional[str] = None
    model: Optional[str] = None
    image_url: Optional[str] = None
    terrain: Optional[str] = None
    stability: Optional[str] = None
    cushioning: Optional[str] = None
    gender: Optional[str] = None
    drop_mm: Optional[float] = None
    weight_g: Optional[float] = None
    stack_mm: Optional[float] = None
    price: Optional[float] = None
    product_url: Optional[str] = None
    metadata: Optional[Dict[str, str]] = None

    score: float
    score_pct: int


class CatalogResponse(BaseModel):
    """Final sorted list of recommended shoes."""
    total: int
    items: List[CatalogItem]


# ---------------------------------------------------------------------------
# Catalog Inventory (Admin)
# ---------------------------------------------------------------------------


class CatalogInventoryItem(BaseModel):
    """Full product metadata displayed in Admin UI."""
    id: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    shoe_image_url: Optional[str] = None
    terrain: Optional[str] = None
    stability: Optional[str] = None
    cushioning: Optional[str] = None
    drop_mm: Optional[float] = None
    weight_g: Optional[float] = None
    stack_mm: Optional[float] = None
    price: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


class CatalogInventoryResponse(BaseModel):
    total: int
    items: List[CatalogInventoryItem]


class CatalogGenderSegment(BaseModel):
    gender: str
    count: int


class CatalogTopBrand(BaseModel):
    brand: str
    product_count: int
    active_count: int
    inactive_count: int
    top_gender: Optional[str] = None


class CatalogOverviewResponse(BaseModel):
    total_products: int
    active_products: int
    inactive_products: int
    total_brands: int
    avg_price: Optional[float] = None
    gender_breakdown: List[CatalogGenderSegment]
    top_brands: List[CatalogTopBrand]


class CatalogInventoryUpdateRequest(BaseModel):
    """
    Update payload for modifying catalog items (admin-only).
    Only the provided fields will be updated.
    """
    model_config = ConfigDict(extra="forbid")

    brand: Optional[str] = None
    model: Optional[str] = None
    terrain: Optional[str] = None
    stability: Optional[str] = None
    cushioning: Optional[str] = None
    drop_mm: Optional[float] = None
    weight_g: Optional[float] = None
    stack_mm: Optional[float] = None
    price: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
