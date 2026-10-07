"""Tests for analysis persistence (in-memory SQLite)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.schemas import SideBioMetrics, RearBioMetrics, AnalysisResult
from app.services.analysis.persistence import (
    persist_record,
    get_user_history,
    get_result_by_job_id,
)


def _patch_engine(mem_engine):
    """Context manager to monkey-patch the persistence engine."""
    return patch("app.services.analysis.persistence._get_engine", return_value=mem_engine)


class TestPersistAndRetrieve:
    def test_persist_and_get_by_job_id(self, mem_engine, side_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            persist_record(
                job_id="job-001",
                user_id="user-abc",
                created_at=now,
                bio=side_bio,
                gait_type="efficient",
                remarks=["good form"],
                video_url="/video/001.mp4",
                analysis_type="side",
            )

            result = get_result_by_job_id("job-001")
            assert result is not None
            assert result.job_id == "job-001"
            assert result.gait_type == "efficient"
            assert isinstance(result.bio, SideBioMetrics)

    def test_get_nonexistent_job(self, mem_engine):
        with _patch_engine(mem_engine):
            result = get_result_by_job_id("nonexistent")
            assert result is None

    def test_persist_rear_and_retrieve(self, mem_engine, rear_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            persist_record(
                job_id="job-rear-001",
                user_id="user-xyz",
                created_at=now,
                bio=rear_bio,
                gait_type="rear_alignment_only",
                remarks=[],
                video_url="/video/rear.mp4",
                analysis_type="rear",
                rear_quality="high",
            )

            result = get_result_by_job_id("job-rear-001")
            assert result is not None
            assert result.analysis_type == "rear"
            assert isinstance(result.bio, RearBioMetrics)

    def test_user_history(self, mem_engine, side_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            for i in range(3):
                persist_record(
                    job_id=f"job-hist-{i}",
                    user_id="user-hist",
                    created_at=now,
                    bio=side_bio,
                    gait_type="efficient",
                    remarks=[],
                    video_url=f"/video/{i}.mp4",
                    analysis_type="side",
                )

            history = get_user_history("user-hist")
            assert len(history) == 3

    def test_user_history_empty(self, mem_engine):
        with _patch_engine(mem_engine):
            history = get_user_history("nobody")
            assert history == []

    def test_upsert(self, mem_engine, side_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            persist_record(
                job_id="job-upsert",
                user_id="user-u",
                created_at=now,
                bio=side_bio,
                gait_type="efficient",
                remarks=[],
                video_url="/video/old.mp4",
                analysis_type="side",
            )
            persist_record(
                job_id="job-upsert",
                user_id="user-u",
                created_at=now,
                bio=side_bio,
                gait_type="stiff_runner",
                remarks=["updated"],
                video_url="/video/new.mp4",
                analysis_type="side",
            )

            result = get_result_by_job_id("job-upsert")
            assert result is not None
            assert result.gait_type == "stiff_runner"

    def test_persist_with_result_json(self, mem_engine, side_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            full_result = AnalysisResult(
                job_id="job-full",
                user_id="user-full",
                created_at=now,
                analysis_type="side",
                gait_type="efficient",
                bio=side_bio,
                remarks=["test"],
                video_url="/video/full.mp4",
                energy_score=85,
                cadence_label="efficient",
            )
            persist_record(
                job_id="job-full",
                user_id="user-full",
                created_at=now,
                bio=side_bio,
                gait_type="efficient",
                remarks=["test"],
                video_url="/video/full.mp4",
                analysis_type="side",
                result_json=full_result.model_dump(mode="json"),
            )

            result = get_result_by_job_id("job-full")
            assert result is not None
            assert result.energy_score == 85
            assert result.cadence_label == "efficient"

    def test_skip_no_user_id(self, mem_engine, side_bio):
        with _patch_engine(mem_engine):
            now = datetime.now(timezone.utc)
            persist_record(
                job_id="job-nouser",
                user_id=None,
                created_at=now,
                bio=side_bio,
                gait_type="efficient",
                remarks=[],
                video_url="/v.mp4",
                analysis_type="side",
            )
            result = get_result_by_job_id("job-nouser")
            assert result is None
