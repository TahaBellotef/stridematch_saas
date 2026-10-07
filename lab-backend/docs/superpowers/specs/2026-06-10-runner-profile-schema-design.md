# Runner Profile Schema & Database Integration — Design

**Date:** 2026-06-10
**For:** StrideMatch B2C mobile app (iOS + Android)
**Status:** Approved design — ready for implementation plan.
**Source spec:** `Runner_Profile_Schema_Specification.pdf` (client).

---

## 1. Overview

The B2C mobile app needs each authenticated end-user to own a **complete runner
profile** — personal data, body measurements, running habits, shoe info, injuries,
preferences, and performance tests — not just the output of the gait analysis. This
design adds a dedicated `runner_profiles` table, Pydantic request/response schemas,
CRUD routes, an analysis-linkage hook, and a mapping layer that feeds the existing
shoe recommender.

This is **backend work**. The iOS/Android apps are separate clients that integrate
against the routes defined here; a mobile integration contract doc is a deliverable.

---

## 2. Key decisions (resolved during brainstorming)

1. **Separate table (Option A).** New `runner_profiles` table owned by the
   authenticated B2C user (keyed by Cognito `sub`). The existing B2B, org-scoped
   `customer_profiles` table is left untouched. Rationale: the two profiles share
   *fields* but differ in *ownership, auth scope, lifecycle, and uniqueness* — and the
   difference sits on a security boundary (org-owned vs user-owned), so they must stay
   isolated.
2. **Both "me" and `:id` routes.** `/api/runners/profile` operates on the caller's own
   profile (from JWT). `/api/runners/profile/{id}` is ownership-or-admin guarded for
   staff/admin use.
3. **Store app-vocabulary codes + map to the recommender.** Persist stable snake_case
   codes (the app's full-fidelity vocabulary), not display text. A single mapping module
   translates to the recommender's enums only when scoring. Rationale: lossless storage
   (needed for §20 AI/history), i18n-ready, rename-safe, forward-compatible.
4. **Pronation = analysis output values** (`neutral`/`pronation`/`supination`), not the
   spec's `Neutral/Pronator/Suprapronator` (which omits supination, a real analysis
   output). **Client-writable, but the analysis-completion hook overwrites it** with the
   authoritative analysis value (analysis wins; client may seed it before any scan).
5. **No Alembic.** New table is auto-created by `Base.metadata.create_all`; new columns
   are auto-added by the existing `_migrate_missing_columns()` boot step.

---

## 3. Data model — `runner_profiles`

New ORM model `RunnerProfileModel` in `app/models/runner_profile.py`, registered in
`app/db/models.py`. **Hybrid storage:** flat single-value fields are real columns
(queryable for recommendations/AI/history); list/nested groups are JSON columns with
Pydantic structure.

### Identity / ownership
| Column | Type | Notes |
|---|---|---|
| `id` | String (uuid hex) | PK |
| `cognito_sub` | String | **unique, indexed** — one profile per user |
| `email` | String, nullable | |
| `created_at` / `updated_at` | DateTime(tz) | auto-set, `onupdate` |

### Personal information
| Column | Type |
|---|---|
| `full_name` | String, nullable |
| `phone` | String, nullable |
| `sex` | String, nullable — `male` / `female` |

(`email` already on the identity block.)

### Body measurements
| Column | Type |
|---|---|
| `age` | Integer, nullable (validated 18–100) |
| `height_cm` | Float, nullable |
| `weight_kg` | Float, nullable |

### Running experience
| Column | Type |
|---|---|
| `level` | String, nullable — `beginner` / `intermediate` / `advanced` |

### Analysis result (server-updated)
| Column | Type | Notes |
|---|---|---|
| `pronation` | String, nullable — `neutral` / `pronation` / `supination` | client may seed; analysis hook overwrites |
| `latest_analysis_job_id` | String, nullable | references `analysis_results.job_id` |

### Shoe information
| Column | Type | Notes |
|---|---|---|
| `shoe_size` | JSON, nullable | `{ "eur": number, "uk": number, "us": number }` |
| `current_shoes` | JSON, nullable | `[ shoeId ]` — references DynamoDB catalog item ids |

### Injury information
| Column | Type | Notes |
|---|---|---|
| `has_pain` | Boolean, nullable | |
| `pain_areas` | JSON, nullable | list of codes: `achilles_tendonitis`, `plantar_fasciitis`, `shin_splints`, `runners_knee`, `it_band_syndrome`, `ankle_sprain`, `hamstring_strain`, `calf_strain`, `stress_fracture` |

### Running habits
| Column | Type | Codes |
|---|---|---|
| `surface` | String, nullable | `road` / `trail` / `treadmill` / `mixed` |
| `weekly_distance` | String, nullable | `dist_0_10` / `dist_10_20` / `dist_20_40` / `dist_40_60` / `dist_gt_60` |
| `pace` | String, nullable | `pace_3_4` / `pace_4_5` / `pace_5_6` / `pace_6_7` / `pace_7_8` / `pace_gt_8` |

### Shoe preferences
| Column | Type | Codes |
|---|---|---|
| `desired_type` | String, nullable | `cushioning_support` / `performance_speed` / `stability_support` / `versatility` |
| `features` | JSON, nullable | list: `cushioning`, `support`, `stability`, `speed`, `lightweight`, `durability` |
| `price_range` | String, nullable | `eur_50_100` / `eur_100_150` / `eur_150_300` / `eur_gt_300` |

### Performance tests
| Column | Type | Notes |
|---|---|---|
| `performance_tests` | JSON, nullable | `{ "ligament_state": "stable"\|"slightly_unstable", "knee_performance": "increases"\|"decreases"\|"no_change" }` |

**All fields except identity are optional** so the app can fill the profile
incrementally through a wizard.

---

## 4. Pydantic schemas — `app/schemas/runner_profile_api.py`

Separate file; leaves the existing recommender schema `app/schemas/runner_profile.py`
untouched.

- `RunnerProfileCreate` / `RunnerProfileUpdate` — request bodies. camelCase aliases
  (`weightKg`, `heightCm`, `shoeSize`, `currentShoes`, `hasPain`, `painAreas`,
  `weeklyDistance`, `desiredType`, `priceRange`, `performanceTests`) via
  `populate_by_name=True`, matching the existing convention. `extra="forbid"`.
- Nested models: `ShoeSize { eur, uk, us }`, `PerformanceTests { ligament_state,
  knee_performance }`.
- Enums as `Literal[...]` of the codes above.
- `RunnerProfileUpdate` uses all-optional fields; partial updates apply with
  `model_dump(exclude_unset=True)`.
- `pronation` is **accepted** on input (client may seed) but documented as
  analysis-authoritative.
- `RunnerProfileResponse` — full profile + `id`, `createdAt`, `updatedAt`.

---

## 5. Service layer — `app/services/runner_profile.py`

Pure DB operations (testable without HTTP):
- `get_by_sub(db, sub) -> RunnerProfileModel | None`
- `get_by_id(db, id) -> RunnerProfileModel | None`
- `upsert_for_sub(db, sub, data: RunnerProfileCreate) -> RunnerProfileModel` — create if
  absent (one-per-user), else overwrite provided fields.
- `update_for_sub(db, sub, data: RunnerProfileUpdate) -> RunnerProfileModel` — partial
  update; 404 if absent.
- `update_analysis(db, sub, job_id, pronation)` — sets `pronation` +
  `latest_analysis_job_id` (creates a minimal profile if none exists). Called by the
  analysis-completion path; **analysis value takes precedence** over any client-seeded
  pronation.

---

## 6. Routes — `app/routers/runner_profile.py`

Prefix `/api/runners/profile`. Auth via the existing Cognito JWT dependency; user from
JWT `sub`.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/runners/profile` | Create-or-upsert caller's own profile (idempotent). |
| GET | `/api/runners/profile` | Return caller's own profile. 404 if none. |
| PUT | `/api/runners/profile` | Partial update of caller's own. 404 if none. |
| GET | `/api/runners/profile/{id}` | Owner or admin only, else 403. |
| PUT | `/api/runners/profile/{id}` | Owner or admin only, else 403. |

**Errors:** 401 (no/invalid token) · 403 (not owner/admin) · 404 (no profile) · 422
(validation).

Router registered in the app the same way as existing routers (`app/main.py` /
`app/routers/__init__.py`).

---

## 7. Recommender mapping — `app/services/recommendation/profile_mapping.py`

Single pure function:

```
to_recommender_profile(model: RunnerProfileModel) -> schemas.runner_profile.RunnerProfile
```

Code → recommender-enum translation (the only place the two vocabularies meet):

- `weekly_distance`: `dist_0_10→lt_10`, `dist_10_20→10_25`, `dist_20_40→25_50`,
  `dist_40_60→25_50`, `dist_gt_60→gt_50`. *(Recommender has 4 buckets; map the 5 app
  buckets onto them — see open item 9.1.)*
- `desired_type → preference`: `cushioning_support→comfort`,
  `performance_speed→responsiveness`, `stability_support→stability`,
  `versatility→versatility`.
- `pronation`: passthrough (`neutral`/`pronation`/`supination`); `None → unknown`.
- `level`, `surface`: passthrough (already aligned).
- Missing/null → recommender's `unknown` where supported.

---

## 8. Testing (pytest, SQLite in-memory)

- **Model/service:** create, one-per-user upsert, partial update, JSON round-trip
  (shoe_size, pain_areas, current_shoes, performance_tests), `update_analysis`
  precedence.
- **Routes:** 401/403/404 paths; me-vs-`:id` ownership; admin access to `:id`; partial
  PUT applies only sent fields; bad enum code → 422.
- **Mapping:** every code → recommender enum, including null/unknown fallbacks.

---

## 9. Open items

1. **Distance bucket mismatch.** App has 5 weekly-distance buckets; recommender has 4.
   `dist_20_40` and `dist_40_60` both map to `25_50` for now. If the recommender should
   distinguish, it needs a new bucket — flag to the recommender owner. Non-blocking.
2. **"Suprapronator" wording.** Confirmed: store analysis output
   (`neutral`/`pronation`/`supination`); the app displays the client's preferred wording
   via the code→label table. Confirm final display wording with the client/biomechanician.
3. **`current_shoes` validation.** MVP stores shoeIds without verifying against the
   DynamoDB catalog. Optional catalog-existence validation can be added later.

---

## 10. Deliverables

1. Backend: model, schemas, service, router, recommender mapping, analysis hook, tests.
2. This design spec (committed).
3. **Mobile integration contract** (`documents/`): routes, request/response JSON
   examples, and enum **code → label** tables (EN/FR) for the iOS/Android devs.
