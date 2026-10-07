#
#  File: catalog.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT - Copyright (C) 2025. macitch.
#


from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import pandas as pd
from dotenv import load_dotenv

from app.utils.dynamo import from_dynamo
from app.utils.aws import boto3_or_raise

load_dotenv()

logger = logging.getLogger(__name__)
logger.debug("AWS credentials loaded.")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class CatalogSourceConfig:
    """Configuration holder (kept for API compatibility)."""
    def __init__(self, table_name: Optional[str] = None):
        self.table_name = table_name or os.getenv("DYNAMODB_SHOES_TABLE")


def load_catalog(cfg: Optional[CatalogSourceConfig] = None) -> pd.DataFrame:
    """
    Load catalog data from AWS DynamoDB and normalize to a DataFrame.
    Environment:
      - DYNAMODB_SHOES_TABLE  (required)
      - AWS_REGION            (default: us-east-1)
      - AWS_ACCESS_KEY_ID     (optional if using local creds/role)
      - AWS_SECRET_ACCESS_KEY (optional if using local creds/role)
    """
    table_name = (cfg.table_name if cfg else None) or os.getenv("DYNAMODB_SHOES_TABLE")
    if not table_name:
        raise RuntimeError("Missing DYNAMODB_SHOES_TABLE in environment variables")

    dynamodb = boto3_or_raise().resource(
        "dynamodb",
        aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
        region_name=os.getenv("AWS_REGION", "us-east-1"),
    )
    table = dynamodb.Table(table_name)

    items: List[Dict[str, Any]] = []
    try:
        resp = table.scan()
        items.extend(resp.get("Items", []))

        while "LastEvaluatedKey" in resp:
            resp = table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
            items.extend(resp.get("Items", []))

        logger.info("✅ Loaded %d items from DynamoDB table '%s'", len(items), table_name)

    except Exception as exc:
        logger.exception("Failed to load data from DynamoDB")
        raise RuntimeError(f"Failed to load catalog from DynamoDB: {exc}") from exc

    if not items:
        logger.warning("⚠️ No items found in DynamoDB table '%s'", table_name)
        return pd.DataFrame([])

    normalized = [from_dynamo(it) for it in items]
    df = pd.DataFrame(normalized)
    df.columns = [c.strip().lower() for c in df.columns]
    return df


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def _get_float(row: Dict[str, Any], *keys: str) -> Optional[float]:
    """Extract a float from row across alternative keys, stripping units."""
    for key in keys:
        val = row.get(key)
        if val is not None and str(val).strip() != "":
            break
    else:
        return None

    if isinstance(val, (int, float)):
        return float(val)

    s = str(val).lower().strip()
    for junk in ("g", "mm", "cm", "usd", "eur", "$", "€"):
        s = s.replace(junk, "")
    s = s.replace(",", ".")

    try:
        return float(s)
    except Exception:
        return None


def _norm(value: Optional[str]) -> str:
    # Catalog rows come from a pandas DataFrame, where a missing value is a
    # float NaN (truthy, and has no .strip()) rather than None - guard
    # against that instead of just falsy-checking.
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def score_row(
    row: Dict[str, Any],
    surface: Optional[str] = None,
    pronation: Optional[str] = None,
    preference: Optional[str] = None,
    user_profile: Optional[Dict[str, Any]] = None,
    bio_data: Optional[Dict[str, Any]] = None,
) -> float:
    """
    Compute a compatibility score for a catalog row.

    This mirrors the MotionLab scoring logic:
    - heavy emphasis on terrain + pronation + cushioning
    - adds user profile factors (pace/level/weight/height)
    - uses biomechanics (cadence/contact/osc/sym/strike)
    """
    user_profile = user_profile or {}

    user_surface = _norm(user_profile.get("surface") or surface)
    user_pronation = _norm(user_profile.get("pronation") or pronation)
    user_preference = _norm(user_profile.get("preference") or preference)
    user_pace = _norm(user_profile.get("pace") or "5:00 - 6:00 min/km")
    user_level = _norm(user_profile.get("level") or "intermediate")
    user_weight = user_profile.get("weight") or user_profile.get("weight_kg") or 75
    user_height = user_profile.get("height") or user_profile.get("height_cm") or 175
    user_gender = _norm(user_profile.get("gender") or "male")
    user_distance = _norm(user_profile.get("distance") or "20-30 km")

    terrain = _norm(row.get("terrain"))
    stability = _norm(row.get("stability"))
    cushioning = _norm(row.get("cushioning"))

    weight_g = _get_float(row, "weight_g") or 300.0
    drop_mm = _get_float(row, "drop_mm", "drop_mm_total") or 10.0
    stack_mm = _get_float(row, "stack_mm", "stack_mm_total") or 30.0

    try:
        height_m = float(user_height) / 100.0
        bmi = float(user_weight) / (height_m ** 2) if height_m > 0 else 0.0
    except Exception:
        bmi = 0.0

    strike_pattern = "midfoot"
    contact_time = 250
    cadence = 170
    osc = 8
    symmetry = 95
    if isinstance(bio_data, dict):
        strike_pattern = _norm(bio_data.get("strike_pattern") or "midfoot")
        contact_time = bio_data.get("contact_time") or contact_time
        cadence = bio_data.get("cadence") or cadence
        osc = bio_data.get("osc") or osc
        symmetry = bio_data.get("sym") or symmetry

    score = 0.0

    # 1) Terrain (40)
    if user_surface == "trail":
        if terrain == "trail":
            score += 40
        elif "trail" in terrain:
            score += 25
        elif terrain in {"mixed", "mixte"}:
            score += 15
        else:
            return 30.0
    elif user_surface == "road":
        if terrain in {"road", "route"}:
            score += 40
        elif "road" in terrain or "route" in terrain:
            score += 25
        elif terrain in {"mixed", "mixte"}:
            score += 15
        else:
            return 32.0
    elif user_surface == "mixed":
        if terrain in {"mixed", "mixte"}:
            score += 40
        elif terrain in {"road", "route", "trail"}:
            score += 25
        else:
            score += 12
    else:  # treadmill or unknown
        if terrain in {"road", "route"}:
            score += 40
        elif terrain in {"mixed", "mixte"}:
            score += 20
        else:
            score += 10

    # 2) Pronation + biomechanics (35)
    if user_pronation in ("overpronation", "pronation"):
        if "stability" in stability or "support" in stability:
            score += 35
        elif stability == "guidance":
            score += 22
        elif stability == "neutral":
            score += 8
        else:
            score += 10
    elif user_pronation == "neutral":
        if stability == "neutral":
            score += 35
        elif stability in {"light stability", "guidance"}:
            score += 22
        elif "stability" in stability:
            score += 12
        else:
            score += 20
    elif user_pronation in ("underpronation", "supination"):
        if stability == "neutral" and cushioning in {"high", "max", "soft", "plush"}:
            score += 35
        elif cushioning in {"high", "max", "soft", "plush"}:
            score += 28
        elif stability == "neutral":
            score += 22
        elif "stability" in stability:
            score += 5
        else:
            score += 15
    else:
        if stability == "neutral":
            score += 30
        elif stability in {"light stability", "guidance"}:
            score += 22
        else:
            score += 18

    if strike_pattern == "heel" or (contact_time and contact_time > 280):
        if cushioning in {"high", "max", "plush"} and drop_mm >= 8:
            score += 5
        elif drop_mm < 6:
            score -= 5
    elif strike_pattern == "forefoot" or (contact_time and contact_time < 220):
        if drop_mm <= 6:
            score += 5
        elif drop_mm > 10:
            score -= 4

    # 3) Weight & cushioning (20)
    is_heavy = (bmi > 25) or (user_gender == "male" and user_weight > 80) or (user_gender == "female" and user_weight > 70)
    if is_heavy:
        if cushioning in {"high", "max", "plush", "soft"}:
            score += 20
        elif cushioning in {"medium", "balanced"}:
            score += 12
        else:
            score += 5

        if stack_mm >= 35:
            score += 3
        elif stack_mm < 25:
            score -= 3
    else:
        if cushioning in {"responsive", "firm"}:
            score += 18
        elif cushioning in {"medium", "balanced"}:
            score += 20
        elif cushioning in {"high", "max"}:
            score += 15
        else:
            score += 12

    # 4) Pace & level (18)
    is_fast = user_pace in {"3:00 - 4:00 min/km", "4:00 - 5:00 min/km"}
    is_slow = user_pace in {"7:00 - 8:00 min/km", "> 8:00 min/km"}
    is_advanced = user_level == "advanced"

    if is_fast or is_advanced:
        if weight_g < 250:
            score += 12
        elif weight_g < 280:
            score += 8
        else:
            score += 3

        if cushioning in {"responsive", "firm"}:
            score += 6
        elif cushioning in {"medium", "balanced"}:
            score += 3
    elif is_slow or user_level == "beginner":
        if cushioning in {"high", "max", "plush", "soft"}:
            score += 12
        elif cushioning in {"medium", "balanced"}:
            score += 8
        else:
            score += 4

        if stack_mm >= 32:
            score += 6
        elif stack_mm >= 28:
            score += 3
    else:
        if cushioning in {"medium", "balanced"}:
            score += 15
        elif cushioning in {"responsive", "high"}:
            score += 10
        else:
            score += 7

        if 270 <= weight_g <= 300:
            score += 3

    # 5) Distance (10)
    high_mileage = user_distance in {"+60 km", "40-50 km"}
    if high_mileage:
        if cushioning in {"high", "max", "plush"}:
            score += 10
        elif cushioning in {"medium", "balanced"}:
            score += 7
        else:
            score += 4
    else:
        score += 7

    # 6) Preference (12)
    if user_preference == "comfort":
        if cushioning in {"high", "max", "plush", "soft"}:
            score += 12
        elif cushioning in {"medium", "balanced"}:
            score += 7
        else:
            score += 3
    elif user_preference == "stability":
        if "stability" in stability or "support" in stability:
            score += 12
        elif stability == "guidance":
            score += 8
        else:
            score += 4
    elif user_preference == "responsiveness":
        if cushioning in {"responsive", "firm"}:
            score += 12
        elif weight_g < 270:
            score += 8
        else:
            score += 4
    elif user_preference == "versatility":
        if cushioning in {"medium", "balanced"}:
            score += 12
        else:
            score += 7

    # 7) Bonus biomechanics (5) — side-derived signals only (cadence/osc/sym
    # are always at their neutral defaults for rear analyses, since
    # RearBioMetrics doesn't carry them).
    if cadence and cadence < 160 and "stability" in stability:
        score += 2
    if osc and osc > 9 and cushioning in {"high", "max", "plush"}:
        score += 2
    if symmetry and symmetry < 90 and ("stability" in stability or stability == "guidance"):
        score += 1

    # 8) Rear alignment adjustment (8) — rear/lower_body analyses have no
    # cadence/osc/contact_time/sym, so without this every rear analysis for
    # the same runner profile produced an identical score regardless of how
    # different the actual rear-view alignment was. `energy_score` (the same
    # 0..100 alignment score shown on the report) and the granular rear
    # kinematics genuinely vary per analysis, so use them here instead.
    is_rear_analysis = bool(bio_data.get("has_rear")) if isinstance(bio_data, dict) else False
    if is_rear_analysis:
        is_stability_shoe = "stability" in stability or "support" in stability or stability == "guidance"
        energy_score = bio_data.get("energy_score")

        if isinstance(energy_score, (int, float)):
            if energy_score < 60:
                # Significant alignment issues: lean harder into stability/support.
                if is_stability_shoe:
                    score += 8
                elif stability == "neutral":
                    score -= 4
            elif energy_score < 80:
                if is_stability_shoe:
                    score += 4
            else:
                # Well aligned: no correction needed — reward the runner's
                # stated preference instead of forcing stability on them.
                if user_preference == "responsiveness" and cushioning in {"responsive", "firm"}:
                    score += 3
                elif stability == "neutral":
                    score += 2

        rear_metrics = bio_data.get("rear_metrics")
        if isinstance(rear_metrics, dict):
            # Deferred import: data.catalog is imported by app.services.catalog,
            # so importing app.services.analysis.* at module level here would
            # create a circular import. Safe at call time, since by then both
            # modules are fully loaded.
            from app.services.analysis.thresholds import (
                SCORE_REAR_PELVIC_THRESHOLD,
                SCORE_REAR_EVERSION_THRESHOLD,
                SCORE_REAR_VALGUS_MALE_THRESHOLD,
                SCORE_REAR_VALGUS_FEMALE_THRESHOLD,
            )

            def _abs_metric(key: str) -> float:
                try:
                    return abs(float(rear_metrics.get(key) or 0))
                except Exception:
                    return 0.0

            valgus_threshold = (
                SCORE_REAR_VALGUS_FEMALE_THRESHOLD if user_gender == "female" else SCORE_REAR_VALGUS_MALE_THRESHOLD
            )
            valgus = max(_abs_metric("left_knee_valgus_norm"), _abs_metric("right_knee_valgus_norm"))
            eversion = max(_abs_metric("left_ankle_eversion_deg"), _abs_metric("right_ankle_eversion_deg"))
            pelvic_drop = _abs_metric("pelvic_drop_deg")

            needs_support = (
                valgus > valgus_threshold
                or eversion > SCORE_REAR_EVERSION_THRESHOLD
                or pelvic_drop > SCORE_REAR_PELVIC_THRESHOLD
            )
            if needs_support and is_stability_shoe:
                score += 3

    return round(score, 2)


def normalize_score_pct(raw_score: float) -> float:
    """
    Normalize raw score (0..145) into a 25..98% range with extra spread.
    """
    raw_pct = (raw_score / 145.0) * 100.0 if raw_score is not None else 0.0

    if raw_pct >= 80:
        final_score = 95 + ((raw_pct - 80) / 20) ** 0.5 * 3
    elif raw_pct >= 70:
        final_score = 90 + ((raw_pct - 70) / 10) ** 0.6 * 4
    elif raw_pct >= 60:
        final_score = 85 + ((raw_pct - 60) / 10) ** 0.7 * 4
    elif raw_pct >= 50:
        final_score = 80 + ((raw_pct - 50) / 10) ** 0.8 * 4
    elif raw_pct >= 40:
        final_score = 75 + ((raw_pct - 40) / 10) * 4
    else:
        final_score = raw_pct * 1.8

    return float(min(98.0, max(25.0, final_score)))
