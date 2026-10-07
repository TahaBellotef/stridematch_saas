#
#  File: services/catalog.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT © 2025 macitch
#


from __future__ import annotations

import asyncio
import os
from functools import lru_cache
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from data.catalog import CatalogSourceConfig, load_catalog, normalize_score_pct, score_row
from app.utils.normalize import clean_str, to_float, parse_price, sanitize_field
from app.utils.dynamo import from_dynamo
from app.utils.aws import boto3_or_raise

from ..schemas import (
    CatalogInventoryItem,
    CatalogInventoryResponse,
    CatalogInventoryUpdateRequest,
    CatalogItem,
    CatalogProfile,
    CatalogResponse,
)
from ..schemas.catalog import CatalogGenderSegment, CatalogOverviewResponse, CatalogTopBrand

from app.schemas.analysis import SideBioMetrics


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _default_catalog_config() -> CatalogSourceConfig:
    return CatalogSourceConfig(
        table_name=os.getenv("DYNAMODB_SHOES_TABLE", "sml_shoes")
    )


NUMERIC_FIELDS = {"drop_mm", "weight_g", "stack_mm", "price"}


# ---------------------------------------------------------------------------
# Dynamo Helpers
# ---------------------------------------------------------------------------

def _dynamodb_table():
    table_name = os.getenv("DYNAMODB_SHOES_TABLE")
    if not table_name:
        raise RuntimeError("DYNAMODB_SHOES_TABLE not configured")

    session_kwargs = {
        "region_name": os.getenv("DYNAMODB_REGION", os.getenv("AWS_REGION", "us-east-1")),
    }

    ak = os.getenv("AWS_ACCESS_KEY_ID")
    sk = os.getenv("AWS_SECRET_ACCESS_KEY")
    if ak and sk:
        session_kwargs["aws_access_key_id"] = ak
        session_kwargs["aws_secret_access_key"] = sk

    dynamodb = boto3_or_raise().resource("dynamodb", **session_kwargs)
    return dynamodb.Table(table_name)


# ---------------------------------------------------------------------------
# Inventory serialization
# ---------------------------------------------------------------------------

def _safe_str(value: Any) -> Optional[str]:
    """Coerce a catalog field to a clean string, treating NaN/blank as missing."""
    if value is None:
        return None
    if isinstance(value, float) and np.isnan(value):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return str(value)


def _row_to_inventory_item(row: Dict[str, Any]) -> CatalogInventoryItem:
    metadata = {
        k: v for k, v in row.items()
        if k not in {
            "id", "brand", "model", "terrain",
            "stability", "cushioning", "drop_mm",
            "drop_mm_total", "weight_g", "stack_mm",
            "stack_mm_total", "price", "price_usd",
            "shoe_image_url", "image_url", "image",
        }
    }

    raw_image = (
        row.get("main_image_source_url")
        or row.get("shoe_image_url")
        or row.get("image_url")
        or row.get("image")
    )
    if raw_image is None:
        image_url = None
    elif isinstance(raw_image, float) and (np.isnan(raw_image) or np.isinf(raw_image)):
        image_url = None
    elif isinstance(raw_image, str) and not raw_image.strip():
        image_url = None
    else:
        image_url = str(raw_image)

    return CatalogInventoryItem(
        id=str(row.get("id")) if row.get("id") is not None else None,
        brand=_safe_str(row.get("brand")) or _safe_str(row.get("brand_name")),
        model=_safe_str(row.get("model")) or _safe_str(row.get("model_name")),
        shoe_image_url=image_url,
        terrain=_safe_str(row.get("terrain")),
        stability=_safe_str(row.get("stability")),
        cushioning=_safe_str(row.get("cushioning")),
        drop_mm=to_float(row.get("drop_mm") or row.get("drop_mm_total")),
        weight_g=to_float(row.get("weight_g")),
        stack_mm=to_float(row.get("stack_mm") or row.get("stack_mm_total")),
        price=parse_price(row.get("price") or row.get("price_usd")),
        metadata=metadata or None,
    )


def _resolve_image_url(row: Dict[str, Any]) -> Optional[str]:
    raw_image = (
        row.get("main_image_source_url")
        or row.get("shoe_image_url")
        or row.get("image_url")
        or row.get("image")
    )
    if raw_image is None:
        return None
    if isinstance(raw_image, float) and (np.isnan(raw_image) or np.isinf(raw_image)):
        return None
    if isinstance(raw_image, str) and not raw_image.strip():
        return None
    return str(raw_image)


# ---------------------------------------------------------------------------
# Catalog Loading
# ---------------------------------------------------------------------------

def _load_catalog_sync(cfg: CatalogSourceConfig) -> pd.DataFrame:
    if asyncio.iscoroutinefunction(load_catalog):
        return asyncio.run(load_catalog(cfg))
    return load_catalog(cfg)


# The live catalog source uses "category" (neutral/stability) and
# "cushioning_level" (low/medium/high/maximum) - score_row() (and the admin
# inventory view) read "stability"/"cushioning" instead, so without this
# remap every single row looked identical to the scorer (blank stability,
# blank cushioning) regardless of analysis type, terrain aside.
_CUSHIONING_VALUE_ALIASES = {
    "maximum": "max",
    "low": "responsive",
}


@lru_cache(maxsize=4)
def fetch_catalog(cfg: Optional[CatalogSourceConfig] = None) -> pd.DataFrame:
    df = _load_catalog_sync(cfg or _default_catalog_config())
    if not df.empty:
        df.columns = [clean_str(c) for c in df.columns]

        if "stability" not in df.columns and "category" in df.columns:
            df["stability"] = df["category"]

        if "cushioning" not in df.columns and "cushioning_level" in df.columns:
            df["cushioning"] = df["cushioning_level"].apply(
                lambda v: _CUSHIONING_VALUE_ALIASES.get(v.lower(), v.lower()) if isinstance(v, str) else v
            )
    return df


# ---------------------------------------------------------------------------
# Bio Resolver
# ---------------------------------------------------------------------------

def resolve_biometrics(profile: CatalogProfile) -> Optional[SideBioMetrics]:
    if profile.gait and profile.gait.bio:
        return profile.gait.bio

    required = [
        profile.cadence,
        profile.osc,
        profile.contact_time,
        profile.knee_mean,
        profile.sym,
    ]

    if any(v is None for v in required):
        return None

    return SideBioMetrics(
        knee_mean=profile.knee_mean,
        knee_left_mean=profile.knee_mean,
        knee_right_mean=profile.knee_mean,
        cadence=profile.cadence,
        osc=profile.osc,
        sym=profile.sym,
        contact_time=profile.contact_time,
    )


def _normalize_distance(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    v = clean_str(value)
    mapping = {
        "lt_10": "0-10 km",
        "10_25": "10-20 km",
        "25_50": "20-30 km",
        "gt_50": "+60 km",
    }
    return mapping.get(v, value)


def _build_user_profile(profile: CatalogProfile) -> Dict[str, Any]:
    distance = profile.distance or profile.weekly_distance
    return {
        "surface": profile.surface,
        "pronation": profile.pronation,
        "preference": profile.preference,
        "pace": profile.pace or "5:00 - 6:00 min/km",
        "level": profile.level or "intermediate",
        "weight": profile.weight_kg,
        "height": profile.height_cm,
        "gender": profile.gender,
        "distance": _normalize_distance(distance) or "20-30 km",
    }


# ---------------------------------------------------------------------------
# Scoring Logic
# ---------------------------------------------------------------------------

def _compute_scores(df: pd.DataFrame, profile: CatalogProfile) -> pd.DataFrame:
    if df.empty:
        return df

    gait_view = profile.resolved_gait_view()
    user_profile = _build_user_profile(profile)

    def compute_full(row):
        row_dict = dict(row)
        raw_score = score_row(
            row_dict,
            profile.surface,
            profile.pronation,
            profile.preference,
            user_profile=user_profile,
            bio_data={
                "cadence": gait_view.cadence,
                "osc": gait_view.osc,
                "contact_time": gait_view.contact_time,
                "sym": gait_view.sym,
                "strike_pattern": profile.strike_pattern,
                "has_rear": gait_view.has_rear,
                "energy_score": gait_view.energy_score,
                "rear_metrics": gait_view.rear_metrics,
            },
        )

        raw_score = 0 if (isinstance(raw_score, float) and np.isnan(raw_score)) else raw_score
        return raw_score

    scored = df.copy()
    scored["__raw_score"] = scored.apply(compute_full, axis=1)

    if profile.min_score is not None:
        scored = scored[scored["__raw_score"] >= profile.min_score]

    return scored.sort_values("__raw_score", ascending=False)


# ---------------------------------------------------------------------------
# Recommendation API
# ---------------------------------------------------------------------------

def _safe_num(v):
    try:
        if v is None:
            return None
        if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
            return None
        return float(v)
    except Exception:
        return None


def _row_tag_metadata(row: Dict[str, Any]) -> Optional[Dict[str, str]]:
    keys = (
        "category",
        "type",
        "gender",
        "arch_support",
        "cushioning_level",
        "width",
        "breathability_score",
        "outsole_durability",
        "summary",
        "description",
        "pros",
        "cons",
        "rating",
        "review_count",
        "reviews_count",
        "color_images",
        "colors",
        "carbon_plate",
        "partner_store",
        "partner_stores",
        "promo_code",
        "delivery_time",
        "original_price",
        "discount_pct",
        "ergonomic",
        "dynamic",
        "aggressive",
        "high_tech",
        "chaotic",
        "static",
        "flow",
        "low_tech",
        "energy_return_pct",
    )
    metadata: Dict[str, str] = {}
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        if isinstance(value, float) and np.isnan(value):
            continue
        text = str(value).strip()
        if text and text.lower() != "nan":
            metadata[key] = text

    if row.get("cushioning") and "cushioning_level" not in metadata:
        cushioning = str(row.get("cushioning")).strip()
        if cushioning and cushioning.lower() != "nan":
            metadata["cushioning_level"] = cushioning

    return metadata or None


def build_recommendations(
    profile: CatalogProfile,
    cfg: Optional[CatalogSourceConfig] = None,
) -> CatalogResponse:
    df = fetch_catalog(cfg)
    if df.empty:
        return CatalogResponse(items=[], total=0)

    scored = _compute_scores(df, profile)
    limited = scored.head(profile.limit).reset_index(drop=True)
    if limited.empty:
        return CatalogResponse(items=[], total=0)

    pct_vector = [round(normalize_score_pct(v)) for v in limited["__raw_score"].tolist()]

    if pct_vector:
        pct_vector[0] = 98
        pct_vector = [min(98, max(25, int(v))) for v in pct_vector]

    if len(pct_vector) > 7:
        top_score = pct_vector[0]
        seventh_score = pct_vector[6]
        score_range = top_score - seventh_score
        if score_range < 15 and score_range > 0:
            stretch_factor = (top_score - 75.0) / score_range
            for idx in range(7):
                current = pct_vector[idx]
                stretched = top_score - (top_score - current) * stretch_factor
                pct_vector[idx] = int(max(75.0, round(stretched)))
            pct_vector[0] = 98

    items = []
    for idx, row in limited.iterrows():
        image_url = _resolve_image_url(row)
        items.append(
            CatalogItem(
                position=idx + 1,
                brand=row.get("brand") or row.get("brand_name"),
                model=row.get("model") or row.get("model_name"),
                image_url=image_url,
                terrain=row.get("terrain"),
                stability=row.get("stability"),
                cushioning=row.get("cushioning"),
                gender=row.get("gender"),
                drop_mm=to_float(row.get("drop_mm") or row.get("drop_mm_total")),
                weight_g=to_float(row.get("weight_g")),
                stack_mm=to_float(row.get("stack_mm") or row.get("stack_mm_total")),
                price=parse_price(row.get("price") or row.get("price_usd")),
                metadata=_row_tag_metadata(row),
                score=_safe_num(row.get("__raw_score")) or 0.0,
                score_pct=pct_vector[idx],
                product_url=(row.get("product_url") or row.get("url") or "").strip() or None,
            )
        )

    return CatalogResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# Inventory API
# ---------------------------------------------------------------------------

def list_catalog_inventory(limit: Optional[int] = None) -> CatalogInventoryResponse:
    df = fetch_catalog()
    if df.empty:
        return CatalogInventoryResponse(total=0, items=[])

    trimmed = df.head(limit or 1000)
    items = [_row_to_inventory_item(r) for r in trimmed.to_dict(orient="records")]
    return CatalogInventoryResponse(total=len(items), items=items)


def get_catalog_overview() -> CatalogOverviewResponse:
    """Aggregate stats over the full shoe catalog (admin Inventory > Overview)."""
    df = fetch_catalog()
    if df.empty:
        return CatalogOverviewResponse(
            total_products=0,
            active_products=0,
            inactive_products=0,
            total_brands=0,
            avg_price=None,
            gender_breakdown=[],
            top_brands=[],
        )

    total_products = len(df)

    if "active" in df.columns:
        active_mask = df["active"].astype(str).str.lower() == "true"
    else:
        active_mask = pd.Series(True, index=df.index)
    active_products = int(active_mask.sum())
    inactive_products = total_products - active_products

    brand_col_name = "brand_name" if "brand_name" in df.columns else "brand" if "brand" in df.columns else None
    brand_series = df[brand_col_name] if brand_col_name else pd.Series([None] * total_products, index=df.index)
    has_brand = brand_series.notna() & (brand_series.astype(str).str.strip() != "")
    total_brands = int(brand_series[has_brand].nunique())

    price_col_name = "price_msrp_usd" if "price_msrp_usd" in df.columns else "price" if "price" in df.columns else None
    avg_price = None
    if price_col_name:
        numeric_prices = df[price_col_name].apply(to_float).dropna()
        if len(numeric_prices):
            avg_price = round(float(numeric_prices.mean()), 2)

    gender_breakdown: List[CatalogGenderSegment] = []
    if "gender" in df.columns:
        gender_counts = df["gender"].fillna("unspecified").astype(str).str.lower().value_counts()
        gender_breakdown = [
            CatalogGenderSegment(gender=g, count=int(c)) for g, c in gender_counts.items()
        ]

    top_brands: List[CatalogTopBrand] = []
    if brand_col_name and total_brands:
        named = df[has_brand]
        brand_counts = named[brand_col_name].value_counts().head(5)
        for brand, count in brand_counts.items():
            subset = named[named[brand_col_name] == brand]
            if "active" in subset.columns:
                brand_active = int((subset["active"].astype(str).str.lower() == "true").sum())
            else:
                brand_active = int(count)
            brand_inactive = int(count) - brand_active

            top_gender = None
            if "gender" in subset.columns:
                subset_genders = subset["gender"].dropna().astype(str).str.lower()
                if not subset_genders.empty:
                    top_gender = subset_genders.value_counts().idxmax()

            top_brands.append(
                CatalogTopBrand(
                    brand=str(brand),
                    product_count=int(count),
                    active_count=brand_active,
                    inactive_count=brand_inactive,
                    top_gender=top_gender,
                )
            )

    return CatalogOverviewResponse(
        total_products=total_products,
        active_products=active_products,
        inactive_products=inactive_products,
        total_brands=total_brands,
        avg_price=avg_price,
        gender_breakdown=gender_breakdown,
        top_brands=top_brands,
    )


def update_catalog_item(item_id: str, payload: CatalogInventoryUpdateRequest) -> CatalogInventoryItem:
    if not item_id:
        raise ValueError("Catalog item ID required")

    update_data = payload.model_dump(exclude_unset=True)
    set_fields = {}
    remove_fields = []

    for field, raw_value in update_data.items():
        normalized = sanitize_field(field, raw_value, NUMERIC_FIELDS)
        if normalized is None:
            remove_fields.append(field)
        else:
            set_fields[field] = normalized

    if not set_fields and not remove_fields:
        raise ValueError("No valid fields provided")

    table = _dynamodb_table()

    expr_parts = []
    expr_attr_names = {}
    expr_attr_values = {}
    token = 0

    if set_fields:
        set_clauses = []
        for field, val in set_fields.items():
            fname = f"#f{token}"
            fval = f":v{token}"
            expr_attr_names[fname] = field
            expr_attr_values[fval] = val
            set_clauses.append(f"{fname} = {fval}")
            token += 1
        expr_parts.append("SET " + ", ".join(set_clauses))

    if remove_fields:
        rm = []
        for field in remove_fields:
            fname = f"#f{token}"
            expr_attr_names[fname] = field
            rm.append(fname)
            token += 1
        expr_parts.append("REMOVE " + ", ".join(rm))

    update_kwargs = {
        "Key": {"id": item_id},
        "UpdateExpression": " ".join(expr_parts),
        "ExpressionAttributeNames": expr_attr_names,
        "ReturnValues": "ALL_NEW",
    }
    if expr_attr_values:
        update_kwargs["ExpressionAttributeValues"] = expr_attr_values

    response = table.update_item(**update_kwargs)
    attrs = response.get("Attributes")
    if not attrs:
        raise RuntimeError("Item not found")

    cleaned = from_dynamo(attrs)
    fetch_catalog.cache_clear()

    return _row_to_inventory_item(cleaned)
