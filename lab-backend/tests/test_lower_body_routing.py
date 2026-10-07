"""run_analysis routes lower_body to the rear pipeline with shoulders disabled,
and rear with shoulders enabled. side still goes to the side pipeline."""
from __future__ import annotations

import tempfile
from pathlib import Path

import app.services.analysis.runner as runner


def _tmp_video() -> Path:
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".mp4")
    f.write(b"\x00")
    f.close()
    return Path(f.name)


def test_lower_body_routes_to_rear_without_shoulder_gate(monkeypatch):
    seen = {}

    def fake_rear(**kwargs):
        seen.update(kwargs)
        return "REAR_RESULT"

    monkeypatch.setattr(runner, "_run_rear_analysis", fake_rear)
    out = runner.run_analysis(
        video_path=_tmp_video(),
        metadata={"capture_type": "lower_body", "runner_profile": {}},
    )
    assert out == "REAR_RESULT"
    assert seen["gate_shoulders"] is False


def test_rear_routes_to_rear_with_shoulder_gate(monkeypatch):
    seen = {}
    monkeypatch.setattr(runner, "_run_rear_analysis", lambda **kw: seen.update(kw) or "R")
    runner.run_analysis(
        video_path=_tmp_video(),
        metadata={"capture_type": "rear", "runner_profile": {}},
    )
    assert seen["gate_shoulders"] is True


def test_side_still_routes_to_side(monkeypatch):
    called = {"side": False}
    monkeypatch.setattr(runner, "_run_side_analysis", lambda **kw: called.__setitem__("side", True) or "S")
    out = runner.run_analysis(
        video_path=_tmp_video(),
        metadata={"capture_type": "side", "runner_profile": {}},
    )
    assert called["side"] is True
