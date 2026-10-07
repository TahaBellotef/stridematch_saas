# Lower-Body Analysis Type — Design Spec

**Date:** 2026-06-09
**Status:** Approved (brainstorm), ready for implementation plan.
**Repos:** `lab-backend` (this repo) + `lab-frontend`.

## Goal

Add **`lower_body`** as a third, independently-selectable analysis type alongside
`rear` and `side` — requested by Terre de Running. It analyses a **rear-view video
framed on the lower body** (hips → feet; shoulders out of frame). It has its own
selection, its own result view, and the `/lower-body` URL.

## Hard constraints

- **Runs on the current, non-split backend.** `lower_body` goes through the existing
  `/analysis/run` in-process thread-pool path (the same one `rear`/`side` use today),
  with `MOTION_ANALYSIS_USE_QUEUE` **off** (current default). It has **no dependency**
  on the parked queue/worker/SQS split.
- **No biomechanics duplication.** `lower_body` reuses the rear pipeline; the only
  behavioural difference is excluding the shoulders from the visibility gate.
- **`rear` and `side` behaviour unchanged.** The new config flag defaults to current
  behaviour; existing flows are untouched.

## Background (why this works)

Investigation (2026-06-09) on a real rear lower-body clip
(`videos/8fde2c28-ca99-4798-b27b-4abb8f47c2c8.MP4`, 1080×1920, 367 frames) found:
the rear pipeline accepted only **16/367 frames**. Instrumenting the gate showed the
**sole cause**: `extract_rear_frame_metrics` (`core/pose/rear_metrics.py:320-329`)
includes the **shoulders** in the body-visibility `min()`. The shoulders are out of
frame (median visibility 0.26 < 0.35 gate), but the lower-body keypoints are
high-confidence (hips/knees/ankles 0.79, heels 0.66, toes 0.59). Excluding the
shoulders from the gate → **362/367 (99%)** frames usable. The baseline already falls
back to hip width (`rear_metrics.py:358-362`), so shoulders are not otherwise needed.

## Architecture

`lower_body` is a **distinct type at the product surface** (selection, result, URL)
implemented by **reusing the rear pipeline with a config flag**:

```
client selects "lower body" (or visits /lower-body)
   → session created with analysis_type = "lower_body", required_captures = ["lower_body"]
   → POST /analysis/run (capture_type = "lower_body")  [in-process thread pool, current backend]
   → runner routes "lower_body" to the REAR pipeline with RearMetricConfig(gate_shoulders=False)
   → rear metrics computed from hip→foot keypoints (shoulders ignored)
   → result rendered with the existing REAR result view
```

## Components & changes

### Backend (`lab-backend`)

1. **Type enumeration — add `"lower_body"`:**
   - `app/routers/analysis.py` — `AnalysisJobStatus.capture_type` / `analysis_type`
     Literals; the `/run` Form params `capture_type` and `analysis_type`.
   - `app/services/jobs/messages.py` — `MotionAnalysisJobMessage.capture_type` /
     `analysis_type` Literals. (Used only on the queue path, but kept consistent so
     the type is valid everywhere; the queue path stays off.)
   - `app/routers/session.py` + `app/schemas/*` — `AnalysisSessionCreate.analysis_type`
     accepts `"lower_body"`; session-create maps it to `required_captures = ["lower_body"]`.
     (The DB column is a free `String`, no migration needed.)

2. **The one behavioural change — `core/pose/rear_metrics.py`:**
   - Add `gate_shoulders: bool = True` to `RearMetricConfig`.
   - In `extract_rear_frame_metrics`, compute `key_body_vis` from hips/knees/ankles,
     and include the shoulder terms in the `min()` **only when `gate_shoulders` is True**.
   - Nothing else changes — the baseline already prefers shoulders but falls back to hips.

3. **Routing — `core/pose/analyze_video.py` + `app/services/analysis/runner.py`:**
   - Extend `CaptureType` to include `"lower_body"`.
   - `capture_type == "lower_body"` runs the **rear** consumer/path with
     `RearMetricConfig(gate_shoulders=False)`; output shape identical to `rear`.
   - The job entry point (`_run_motion_analysis_job` in `app/routers/analysis.py`)
     passes `capture_type` through unchanged — it already forwards to `run_analysis`.

### Frontend (`lab-frontend`)

4. **URL drives the type (v1):** visiting `/lower-body` (route already added on
   `feat/lab/lower-body-route`) creates its session with `analysis_type = "lower_body"`.
   This is the primary entry — no new picker UI required for v1. A unified
   rear/side/lower-body selector is a later nicety, not part of this slice.
5. **Result view:** reuse the existing **rear** result rendering as-is (curate cards later).
6. **Capture copy:** instruct rear-view framing, hips→feet.

## Error handling / degradation

- With shoulders excluded, frames are accepted on lower-body keypoint confidence; the
  existing foot gate (`REAR_MIN_VISIBILITY_FOOT`) still protects foot metrics.
- If the lower body itself is poorly visible, the existing gates reject frames as today
  (no new failure mode).
- `rear`/`side` unaffected (`gate_shoulders` defaults True).

## Testing

- **Unit (`core/pose/rear_metrics.py`):** a synthetic frame with low shoulder visibility
  but good hip/knee/ankle/heel visibility is **rejected** under `gate_shoulders=True`
  and **accepted** under `gate_shoulders=False`. (Inverse of the diagnostic.)
- **Integration:** `POST /api/v1/sessions` with `analysis_type="lower_body"` →
  `required_captures=["lower_body"]`; `POST /api/v1/analysis/run` accepts
  `capture_type="lower_body"` and returns `202` on the in-process path.
- **Real-clip validation:** run `videos/8fde2c28-…MP4` as `lower_body` → expect
  **~362/367 frames accepted** (vs 16) and stabilized foot metrics.
- **Regression:** full backend suite stays green; `rear`/`side` outputs unchanged.

## Reused vs. new

- **Reused:** rear biomechanics + result view, the analysis/upload flow, `/lower-body` route.
- **New:** `"lower_body"` in type literals + session mapping; `RearMetricConfig.gate_shoulders`
  + the gate change; `lower_body` routing to the rear pipeline; frontend URL→type wiring
  + type selection.

## Out of scope / follow-ups

- Curated lower-body result cards (ship rear's card set first; refine on TDR feedback).
- Folding `lower_body` into `rear` later (made cheap by the shared pipeline).
- Queue/worker path for `lower_body` (parked with the rest of the split; the
  `MotionAnalysisJobMessage` literal is extended so it's ready, but the path stays off).
- The side-view trunk shoulder guard is separate work (branch
  `feat/lab/lower-body-shoulder-guard`).

## Branching

- Backend: `feat/lab/lower-body-type` (off `main`), independent of the parked queue work.
- Frontend: extends `feat/lab/lower-body-route`.
