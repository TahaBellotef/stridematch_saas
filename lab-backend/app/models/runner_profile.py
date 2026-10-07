#
#  File: models/runner_profile.py
#  Project: StrideMatchLab
#

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, JSON, String

from app.db.base import Base


class RunnerProfileModel(Base):
    """B2C runner profile, owned by the authenticated end-user (Cognito sub)."""

    __tablename__ = "runner_profiles"

    id = Column(String, primary_key=True, default=lambda: uuid.uuid4().hex)
    cognito_sub = Column(String, nullable=False, unique=True, index=True)
    email = Column(String, nullable=True)

    # Personal information
    full_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    sex = Column(String, nullable=True)  # male | female

    # Body measurements
    age = Column(Integer, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)

    # Running experience
    level = Column(String, nullable=True)  # beginner | intermediate | advanced

    # Analysis result (server-updated; client may seed)
    pronation = Column(String, nullable=True)  # neutral | pronation | supination
    latest_analysis_job_id = Column(String, nullable=True)

    # Shoe information
    shoe_size = Column(JSON, nullable=True)      # {"eur": n, "uk": n, "us": n}
    current_shoes = Column(JSON, nullable=True)  # ["shoeId", ...]

    # Injury information
    has_pain = Column(Boolean, nullable=True)
    pain_areas = Column(JSON, nullable=True)     # ["achilles_tendonitis", ...]

    # Running habits
    surface = Column(String, nullable=True)          # road | trail | treadmill | mixed
    weekly_distance = Column(String, nullable=True)  # dist_0_10 ... dist_gt_60
    pace = Column(String, nullable=True)             # pace_3_4 ... pace_gt_8

    # Shoe preferences
    desired_type = Column(String, nullable=True)  # cushioning_support ... versatility
    features = Column(JSON, nullable=True)        # ["cushioning", ...]
    price_range = Column(String, nullable=True)   # eur_50_100 ... eur_gt_300

    # Performance tests
    performance_tests = Column(JSON, nullable=True)  # {"ligament_state":..,"knee_performance":..}

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
