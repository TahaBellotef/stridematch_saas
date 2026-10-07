from __future__ import annotations

from datetime import datetime
from typing import Annotated, List, Optional, Literal

from pydantic import BaseModel, ConfigDict, Field

Sex = Literal["male", "female"]
Level = Literal["beginner", "intermediate", "advanced"]
Pronation = Literal["neutral", "pronation", "supination"]
Surface = Literal["road", "trail", "treadmill", "mixed"]
WeeklyDistance = Literal[
    "dist_0_10", "dist_10_20", "dist_20_40", "dist_40_60", "dist_gt_60"
]
Pace = Literal[
    "pace_3_4", "pace_4_5", "pace_5_6", "pace_6_7", "pace_7_8", "pace_gt_8"
]
DesiredType = Literal[
    "cushioning_support", "performance_speed", "stability_support", "versatility"
]
Feature = Literal[
    "cushioning", "support", "stability", "speed", "lightweight", "durability"
]
PriceRange = Literal["eur_50_100", "eur_100_150", "eur_150_300", "eur_gt_300"]
PainArea = Literal[
    "achilles_tendonitis", "plantar_fasciitis", "shin_splints", "runners_knee",
    "it_band_syndrome", "ankle_sprain", "hamstring_strain", "calf_strain",
    "stress_fracture",
]
LigamentState = Literal["stable", "slightly_unstable"]
KneePerformance = Literal["increases", "decreases", "no_change"]


class ShoeSize(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eur: Optional[float] = None
    uk: Optional[float] = None
    us: Optional[float] = None


class PerformanceTests(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    ligament_state: Annotated[Optional[LigamentState], Field(alias="ligamentState")] = None
    knee_performance: Annotated[Optional[KneePerformance], Field(alias="kneePerformance")] = None


class RunnerProfileBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    full_name: Annotated[Optional[str], Field(alias="fullName")] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    sex: Optional[Sex] = None

    age: Annotated[Optional[int], Field(ge=18, le=100)] = None
    height_cm: Annotated[Optional[float], Field(alias="heightCm")] = None
    weight_kg: Annotated[Optional[float], Field(alias="weightKg")] = None

    level: Optional[Level] = None

    pronation: Optional[Pronation] = None

    shoe_size: Annotated[Optional[ShoeSize], Field(alias="shoeSize")] = None
    current_shoes: Annotated[Optional[List[str]], Field(alias="currentShoes")] = None

    has_pain: Annotated[Optional[bool], Field(alias="hasPain")] = None
    pain_areas: Annotated[Optional[List[PainArea]], Field(alias="painAreas")] = None

    surface: Optional[Surface] = None
    weekly_distance: Annotated[Optional[WeeklyDistance], Field(alias="weeklyDistance")] = None
    pace: Optional[Pace] = None

    desired_type: Annotated[Optional[DesiredType], Field(alias="desiredType")] = None
    features: Optional[List[Feature]] = None
    price_range: Annotated[Optional[PriceRange], Field(alias="priceRange")] = None

    performance_tests: Annotated[Optional[PerformanceTests], Field(alias="performanceTests")] = None


class RunnerProfileCreate(RunnerProfileBase):
    pass


class RunnerProfileUpdate(RunnerProfileBase):
    pass


class RunnerProfileResponse(RunnerProfileBase):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True, extra="ignore")

    id: str
    latest_analysis_job_id: Annotated[Optional[str], Field(alias="latestAnalysisJobId")] = None
    created_at: Annotated[Optional[datetime], Field(alias="createdAt")] = None
    updated_at: Annotated[Optional[datetime], Field(alias="updatedAt")] = None
