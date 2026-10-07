# Lower-Body Analysis Type (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `lower_body` as a third analysis type that runs the **rear** pipeline with the shoulders excluded from the visibility gate, on the current in-process backend (no queue dependency).

**Architecture:** `lower_body` is a distinct type at the API/session surface. Internally it routes to the existing rear path (`_run_rear_analysis`) with a new `RearMetricConfig(gate_shoulders=False)` flag, and is mapped to `rear` for the downstream metric classifiers (which stay `Literal["rear","side"]`). No biomechanics duplication; `rear`/`side` behaviour unchanged.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, pytest.

**Spec:** `docs/superpowers/specs/2026-06-09-lower-body-type-design.md`. **Branch:** `feat/lab/lower-body-type` (off `main`). Frontend URL→type wiring is a separate follow-up plan. Note: `app/services/jobs/` does NOT exist on `main` (queue branch only) — do not touch it.

---

## File Structure

- `core/pose/rear_metrics.py` — add `gate_shoulders` to `RearMetricConfig`; extract a testable body-gate helper that conditionally includes the shoulders.
- `app/services/analysis/runner.py` — `_run_rear_analysis` gains a `gate_shoulders` param; `run_analysis` routes `capture_type == "lower_body"` to the rear path with `gate_shoulders=False` and an effective `rear` type for metadata.
- `app/routers/analysis.py` — add `"lower_body"` to the API literals; handle `lower_body` in `_run_motion_analysis_job`'s capture bookkeeping.
- `app/schemas/session.py` — extend the session `AnalysisType` alias.
- `tests/…` — unit + integration tests per task.

---

## Task 1: `gate_shoulders` config + testable body-gate helper

**Files:**
- Modify: `core/pose/rear_metrics.py`
- Test: `tests/test_rear_gate_shoulders.py`

- [ ] **Step 1: Write the failing test** — create `tests/test_rear_gate_shoulders.py`:

```python
"""The rear body-visibility gate must be able to exclude the shoulders, so
lower-body-only captures (shoulders out of frame) are not rejected."""
from __future__ import annotations


class _LM:
    def __init__(self, v: float):
        self.visibility = v
        self.x = 0.5
        self.y = 0.5


def _landmarks(shoulder_vis: float, body_vis: float = 0.8):
    arr = [_LM(body_vis) for _ in range(26)]  # HALPE-26
    arr[5] = _LM(shoulder_vis)   # L_SHOULDER
    arr[6] = _LM(shoulder_vis)   # R_SHOULDER
    return arr


def test_body_gate_includes_shoulders_by_default():
    from core.pose.rear_metrics import _body_gate_visibility

    lm = _landmarks(shoulder_vis=0.2, body_vis=0.8)
    assert _body_gate_visibility(lm, gate_shoulders=True) == 0.2


def test_body_gate_excludes_shoulders_when_disabled():
    from core.pose.rear_metrics import _body_gate_visibility

    lm = _landmarks(shoulder_vis=0.2, body_vis=0.8)
    assert _body_gate_visibility(lm, gate_shoulders=False) == 0.8


def test_config_has_gate_shoulders_default_true():
    from core.pose.rear_metrics import RearMetricConfig

    assert RearMetricConfig().gate_shoulders is True
    assert RearMetricConfig(gate_shoulders=False).gate_shoulders is False
```

- [ ] **Step 2: Run to verify it fails** — `source .venv/bin/activate && python -m pytest tests/test_rear_gate_shoulders.py -q`
Expected: FAIL (`cannot import name '_body_gate_visibility'` / unexpected `gate_shoulders`).

- [ ] **Step 3: Add the config field.** In `core/pose/rear_metrics.py`, in the `RearMetricConfig` dataclass (after `min_baseline_px: float = REAR_MIN_BASELINE_PX`), add:

```python
    gate_shoulders: bool = True  # include shoulders in the body-visibility gate
```

- [ ] **Step 4: Add the helper.** In `core/pose/rear_metrics.py`, immediately above `def extract_rear_frame_metrics(`, add:

```python
def _body_gate_visibility(lm, *, gate_shoulders: bool) -> float:
    """Minimum visibility across the gating landmarks. Shoulders are included
    only when gate_shoulders is True (lower-body captures pass them out of frame)."""
    vals = [
        _lm_vis(lm, L_HIP), _lm_vis(lm, R_HIP),
        _lm_vis(lm, L_KNEE), _lm_vis(lm, R_KNEE),
        _lm_vis(lm, L_ANKLE), _lm_vis(lm, R_ANKLE),
    ]
    if gate_shoulders:
        vals.append(_lm_vis(lm, L_SHOULDER))
        vals.append(_lm_vis(lm, R_SHOULDER))
    return min(vals)
```

- [ ] **Step 5: Use the helper in the gate.** In `extract_rear_frame_metrics`, replace this exact block:

```python
    key_body_vis = min(
        _lm_vis(lm, L_HIP), _lm_vis(lm, R_HIP),
        _lm_vis(lm, L_KNEE), _lm_vis(lm, R_KNEE),
        _lm_vis(lm, L_ANKLE), _lm_vis(lm, R_ANKLE),
        _lm_vis(lm, L_SHOULDER), _lm_vis(lm, R_SHOULDER),
    )
```

with:

```python
    key_body_vis = _body_gate_visibility(lm, gate_shoulders=config.gate_shoulders)
```

- [ ] **Step 6: Run to verify it passes** — `python -m pytest tests/test_rear_gate_shoulders.py -q`
Expected: PASS (3 passed).

- [ ] **Step 7: Commit**

```bash
git add core/pose/rear_metrics.py tests/test_rear_gate_shoulders.py
git commit -m "feat(rear-metrics): add gate_shoulders config to exclude shoulders from the body gate"
```

---

## Task 2: Route `lower_body` to the rear pipeline (gate_shoulders=False)

**Files:**
- Modify: `app/services/analysis/runner.py`
- Test: `tests/test_lower_body_routing.py`

- [ ] **Step 1: Write the failing test** — create `tests/test_lower_body_routing.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails** — `python -m pytest tests/test_lower_body_routing.py -q`
Expected: FAIL (`_run_rear_analysis` got an unexpected `gate_shoulders` / lower_body not routed to rear).

- [ ] **Step 3: Add `gate_shoulders` to `_run_rear_analysis`.** In `app/services/analysis/runner.py`, change the signature of `_run_rear_analysis` to add the keyword:

```python
def _run_rear_analysis(
    *,
    video_path: Path,
    metadata: Dict[str, Any],
    user_id: Optional[str],
    forced_job_id: Optional[str],
    force_mirror: Optional[bool],
    runner_profile: Optional[Dict[str, Any]] = None,
    gate_shoulders: bool = True,
) -> AnalysisResult:
```

and change the consumer construction inside it from:

```python
    metrics_consumer = RearMetricsConsumer(
        config=RearMetricConfig(),
        buffers=buffers,
    )
```

to:

```python
    metrics_consumer = RearMetricsConsumer(
        config=RearMetricConfig(gate_shoulders=gate_shoulders),
        buffers=buffers,
    )
```

- [ ] **Step 4: Route lower_body in `run_analysis`.** Find the routing block in `run_analysis`:

```python
    if capture_type == "rear":
        return _run_rear_analysis(
            video_path=video_path,
            metadata=metadata,
            user_id=user_id,
            forced_job_id=forced_job_id,
            force_mirror=force_mirror,
            runner_profile=runner_profile,
        )
```

Replace it with (route both `rear` and `lower_body` to the rear path; disable the shoulder gate for `lower_body`):

```python
    if capture_type in ("rear", "lower_body"):
        return _run_rear_analysis(
            video_path=video_path,
            metadata=metadata,
            user_id=user_id,
            forced_job_id=forced_job_id,
            force_mirror=force_mirror,
            runner_profile=runner_profile,
            gate_shoulders=(capture_type != "lower_body"),
        )
```

- [ ] **Step 5: Run to verify it passes** — `python -m pytest tests/test_lower_body_routing.py -q`
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add app/services/analysis/runner.py tests/test_lower_body_routing.py
git commit -m "feat(analysis): route lower_body to the rear pipeline with shoulders disabled"
```

---

## Task 3: API + session type plumbing for `lower_body`

**Files:**
- Modify: `app/routers/analysis.py`, `app/schemas/session.py`, `app/routers/session.py`
- Test: `tests/test_lower_body_endpoint.py`

- [ ] **Step 1: Write the failing test** — create `tests/test_lower_body_endpoint.py`:

```python
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
```

- [ ] **Step 2: Run to verify it fails** — `python -m pytest tests/test_lower_body_endpoint.py -q`
Expected: FAIL — session create rejects `"lower_body"` (not in `AnalysisType`) and/or `/run` rejects the `capture_type`.

- [ ] **Step 3: Extend the session `AnalysisType` alias.** In `app/schemas/session.py`, change line 17 from:

```python
AnalysisType = Literal["rear", "side"]
```

to:

```python
AnalysisType = Literal["rear", "side", "lower_body"]
```

- [ ] **Step 4: Map `lower_body` to required captures.** In `app/routers/session.py` `create_session`, find:

```python
    if analysis_type == "rear":
        required_captures = ["rear"]
    elif analysis_type == "side":
        required_captures = ["side"]
    else:
        required_captures = ["side"]  # default flow if unspecified
```

Replace with:

```python
    if analysis_type == "rear":
        required_captures = ["rear"]
    elif analysis_type == "side":
        required_captures = ["side"]
    elif analysis_type == "lower_body":
        required_captures = ["lower_body"]
    else:
        required_captures = ["side"]  # default flow if unspecified
```

- [ ] **Step 5: Extend the router literals.** In `app/routers/analysis.py`:
  - `AnalysisJobStatus` (line ~105-106): change `capture_type: Optional[Literal["side", "rear"]]` → `Optional[Literal["side", "rear", "lower_body"]]` and `analysis_type: Optional[Literal["rear", "side"]]` → `Optional[Literal["rear", "side", "lower_body"]]`.
  - `run_motion_analysis` Form params (line ~254-256): change `capture_type: Literal["side", "rear"] = Form(...)` → `Literal["side", "rear", "lower_body"] = Form(...)` and `analysis_type: Optional[Literal["rear", "side"]] = Form(None)` → `Optional[Literal["rear", "side", "lower_body"]] = Form(None)`.

- [ ] **Step 6: Handle lower_body in the capture bookkeeping.** In `app/routers/analysis.py` `_run_motion_analysis_job`, find:

```python
            if capture_type == "rear":
                session.completed_captures.append("rear")
                session.rear_analysis_job_id = job_id
                session.rear_video_url = analysis_result.video_url
                session.inferred_pronation = analysis_result.pronation
                session.status = "completed"
            else:
                session.completed_captures.append("side")
                session.status = "completed"
```

Replace with (lower_body is a rear-view capture, so it shares the rear bookkeeping but records its own capture name):

```python
            if capture_type in ("rear", "lower_body"):
                session.completed_captures.append(capture_type)
                session.rear_analysis_job_id = job_id
                session.rear_video_url = analysis_result.video_url
                session.inferred_pronation = analysis_result.pronation
                session.status = "completed"
            else:
                session.completed_captures.append("side")
                session.status = "completed"
```

- [ ] **Step 7: Run to verify it passes** — `python -m pytest tests/test_lower_body_endpoint.py -q`
Expected: PASS (2 passed).

- [ ] **Step 8: Run the full suite (regression)** — `python -m pytest -q`
Expected: all pass; `rear`/`side` tests unchanged.

- [ ] **Step 9: Commit**

```bash
git add app/routers/analysis.py app/schemas/session.py app/routers/session.py tests/test_lower_body_endpoint.py
git commit -m "feat(analysis): accept lower_body as a session + run analysis type"
```

---

## Task 4: Real-clip validation + regression sign-off

**Files:** none (verification only).

- [ ] **Step 1: Validate frame acceptance on the real rear lower-body clip.** Run this one-off (needs the cached RTMPose models + the sample clip; not a CI test):

```bash
source .venv/bin/activate && RTMPOSE_MODE=halpe26 RTMPOSE_DEVICE=cpu python - <<'PY'
import os, sys
for k, v in dict(RTMPOSE_BACKEND="onnxruntime", UPLOAD_MODE="local",
                 STRIDEMATCH_AUTH_SECRET="xK9mQ2vR7nB4wT8jL5pF3hD6gY0cA1eU",
                 DATABASE_URL="sqlite:///:memory:").items():
    os.environ.setdefault(k, v)
sys.path.insert(0, ".")
from core.pose.pipeline import run_pipeline
from core.pose.consumer_group import ConsumerGroup
from core.pose.annotation_rear import RearAnnotationConsumer
from core.pose.rear_metrics_consumer import RearMetricsConsumer
from core.pose.rear_metrics import RearMetricConfig

buffers, snap = {}, {"img": None}
mc = RearMetricsConsumer(config=RearMetricConfig(gate_shoulders=False), buffers=buffers)
run_pipeline("../videos/8fde2c28-ca99-4798-b27b-4abb8f47c2c8.MP4",
             frame_consumer=ConsumerGroup(mc, RearAnnotationConsumer(buffers=buffers, snapshot=snap)))
print("accepted_frames =", mc.accepted_frames, "/ rejected_low_conf =", mc.rejected_low_conf)
PY
```

Expected: `accepted_frames` ≈ **350+** (vs 16 with shoulders gated). If it is still low, STOP and report — the gate change did not take effect.

- [ ] **Step 2: Full backend suite** — `python -m pytest -q`. Record the pass count; confirm no regressions.

- [ ] **Step 3: Commit a short validation note** (optional) to the spec or a NOTES file if the team tracks validation evidence. Otherwise no commit.

---

## Follow-ups (out of scope for this plan)

- **Frontend:** make `/lower-body` create sessions with `analysis_type="lower_body"` (separate plan; route already exists on `feat/lab/lower-body-route`).
- **Queue path:** when the queue branch merges, add `"lower_body"` to `MotionAnalysisJobMessage`'s literals (does not exist on `main`).
- **Result-card curation** for the lower-body view (ship rear's cards first).

---

## Self-Review

- **Spec coverage:** gate flag (Task 1), rear routing with shoulders off + lower_body→rear (Task 2), type literals + session mapping + capture bookkeeping (Task 3), real-clip validation + regression (Task 4). Frontend + queue-message + card curation explicitly deferred per spec. Non-split-backend constraint honoured (in-process path only; `app/services/jobs` untouched).
- **Placeholders:** none — every step has concrete code/commands.
- **Type/name consistency:** `gate_shoulders` (bool, default True) is used identically in `RearMetricConfig`, `_body_gate_visibility`, `_run_rear_analysis`, and `run_analysis`. `"lower_body"` is the literal everywhere (capture_type, analysis_type, required_captures, completed_captures). `_run_rear_analysis`/`_run_side_analysis`/`run_analysis` names match `app/services/analysis/runner.py`.
