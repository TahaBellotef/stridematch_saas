#
#  File: schemas/dashboard.py
#  Project: StrideMatchLab
#

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel


class DashboardMetric(BaseModel):
    value: float
    display: str
    change_pct: Optional[float] = None
    is_percentage: bool = False


class DashboardSeriesPoint(BaseModel):
    label: str
    date: str
    value: int


class DashboardStatusPoint(BaseModel):
    label: str
    date: str
    completed: int
    pending: int


class DashboardSegment(BaseModel):
    segment: Literal["men", "women", "youth", "kids"]
    count: int


class DashboardActivityItem(BaseModel):
    id: str
    type: Literal["foot_scan", "analysis"]
    title: str
    subtitle: str
    customer_name: Optional[str] = None
    initials: Optional[str] = None
    timestamp: str
    status_color: Literal["red", "blue"]


class BiomechanicsSegment(BaseModel):
    key: str
    label: str
    count: int


class DashboardBiomechanicsResponse(BaseModel):
    pronation_total: int
    pronation_breakdown: List[BiomechanicsSegment]
    scan_quality_total: int
    scan_quality_breakdown: List[BiomechanicsSegment]


class DashboardAcquisitionPoint(BaseModel):
    label: str
    date: str
    acquisition: int
    retention: int


class DashboardCustomersResponse(BaseModel):
    new_customers: DashboardMetric
    returning_customers: DashboardMetric
    retention_rate: DashboardMetric
    daily_acquisition_retention: List[DashboardAcquisitionPoint]
    experience_breakdown: List[BiomechanicsSegment]
    run_frequency_breakdown: List[BiomechanicsSegment]
    total_customers: int


class MatchingCustomersResponse(BaseModel):
    count: int
    total: int


class DashboardAnalysisStackPoint(BaseModel):
    label: str
    date: str
    rear: int
    side: int
    unspecified: int


class DashboardInsightsResponse(BaseModel):
    total_analyses: DashboardMetric
    back_view_count: DashboardMetric
    side_view_count: DashboardMetric
    daily_analysis_breakdown: List[DashboardAnalysisStackPoint]

    total_scans: int
    daily_scan_counts: List[DashboardSeriesPoint]

    total_recommendations: int
    daily_recommendation_counts: List[DashboardSeriesPoint]

    analysis_type_breakdown: List[BiomechanicsSegment]


class DashboardOverviewResponse(BaseModel):
    scans_this_week: DashboardMetric
    total_scans: DashboardMetric
    new_customers_this_week: DashboardMetric
    conversion_rate: DashboardMetric

    daily_scans: List[DashboardSeriesPoint]
    daily_status: List[DashboardStatusPoint]

    demographics: List[DashboardSegment]
    total_customers: int

    activity: List[DashboardActivityItem]

    avg_confidence_pct: Optional[float] = None
