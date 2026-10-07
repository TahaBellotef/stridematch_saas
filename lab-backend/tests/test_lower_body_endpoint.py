"""lower_body is accepted end-to-end on the in-process backend."""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app
from app.auth import create_access_token

_RUNNER_PROFILE = {
    "height_cm": 175, "weight_kg": 70, "age": 30, "gender": "male",
    "level": "intermediate", "surface": "road", "weekly_distance": "25_50",
    "pronation": "neutral", "preference": "comfort",
}


@pytest.fixture
def client():
    return TestClient(app)


def _auth(t): return {"Authorization": f"Bearer {t}"}


@pytest.fixture
def user_token(): return create_access_token("user-abc-123")


def _tmp_video():
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    f.write(b"\x00")
    f.close()
    return Path(f.name)


def test_create_lower_body_session(client, user_token):
    r = client.post("/api/v1/sessions", json={
        "runner_profile": _RUNNER_PROFILE, "analysis_type": "lower_body",
    }, headers=_auth(user_token))
    assert r.status_code == 201, r.text
    assert r.json()["analysis_type"] == "lower_body"


def test_run_lower_body_accepted(client, user_token, monkeypatch):
    import app.routers.analysis as an
    monkeypatch.setattr(an, "_missing_analysis_dependencies", lambda: [])
    monkeypatch.setattr(an, "build_local_upload_path", lambda key: _tmp_video())
    monkeypatch.setattr(an, "_run_motion_analysis_job", lambda *a, **k: None)

    sid = client.post("/api/v1/sessions", json={
        "runner_profile": _RUNNER_PROFILE, "analysis_type": "lower_body",
    }, headers=_auth(user_token)).json()["id"]

    r = client.post("/api/v1/analysis/run", data={
        "session_id": sid, "capture_type": "lower_body",
        "s3_key": "uploads/test/run.mp4", "analysis_type": "lower_body",
    }, headers=_auth(user_token))
    assert r.status_code == 202, r.text
    assert r.json()["capture_type"] == "lower_body"
