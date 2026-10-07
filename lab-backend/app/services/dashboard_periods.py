#
#  File: services/dashboard_periods.py
#  Project: StrideMatchLab
#

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import List, Literal, Optional

Granularity = Literal["day", "week", "month"]

_RANGE_DAYS = {"week": 7, "month": 30, "year": 365}


@dataclass
class PeriodBucket:
    start: date
    end: date
    label: str


@dataclass
class ResolvedPeriod:
    window_start: datetime
    window_end: datetime
    prev_window_start: datetime
    prev_window_end: datetime
    granularity: Granularity
    buckets: List[PeriodBucket]

    def bucket_for(self, d: date) -> Optional[PeriodBucket]:
        for b in self.buckets:
            if b.start <= d <= b.end:
                return b
        return None


def _build_buckets(start: date, end: date, granularity: Granularity) -> List[PeriodBucket]:
    buckets: List[PeriodBucket] = []

    if granularity == "day":
        d = start
        while d <= end:
            buckets.append(PeriodBucket(start=d, end=d, label=d.strftime("%a")))
            d += timedelta(days=1)
        return buckets

    if granularity == "week":
        d = start
        while d <= end:
            week_end = min(d + timedelta(days=6), end)
            buckets.append(PeriodBucket(start=d, end=week_end, label=d.strftime("%d %b")))
            d = week_end + timedelta(days=1)
        return buckets

    # month
    d = date(start.year, start.month, 1)
    while d <= end:
        next_month = date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)
        month_end = min(next_month - timedelta(days=1), end)
        buckets.append(PeriodBucket(start=d, end=month_end, label=d.strftime("%b")))
        d = next_month
    return buckets


def resolve_period(
    range_preset: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> ResolvedPeriod:
    """
    Resolve a requested dashboard period into a concrete UTC window, its
    equal-length "previous period" (for %-change comparisons), and a
    bucket granularity chosen so charts stay readable regardless of span:
    <=31 days -> daily buckets, <=120 days -> weekly buckets, else monthly.
    """
    now = datetime.now(timezone.utc)

    if start_date and end_date:
        window_start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        window_end = datetime.combine(end_date, time.max, tzinfo=timezone.utc)
        span_days = max(1, (window_end - window_start).days)
        if span_days <= 31:
            granularity: Granularity = "day"
        elif span_days <= 120:
            granularity = "week"
        else:
            granularity = "month"
    else:
        preset = range_preset or "week"
        days = _RANGE_DAYS.get(preset, 7)
        today = now.date()
        # Anchor to whole calendar days so a "week" preset yields exactly 7
        # buckets (not 8) - using `now - timedelta(days=days)` directly would
        # span one extra calendar day once both endpoints are date-floored.
        window_start = datetime.combine(today - timedelta(days=days - 1), time.min, tzinfo=timezone.utc)
        window_end = now
        granularity = {"week": "day", "month": "week", "year": "month"}.get(preset, "day")

    span = window_end - window_start
    prev_window_end = window_start
    prev_window_start = window_start - span

    buckets = _build_buckets(window_start.date(), window_end.date(), granularity)

    return ResolvedPeriod(
        window_start=window_start,
        window_end=window_end,
        prev_window_start=prev_window_start,
        prev_window_end=prev_window_end,
        granularity=granularity,
        buckets=buckets,
    )
