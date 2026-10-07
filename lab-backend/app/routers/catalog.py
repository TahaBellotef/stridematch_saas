#
#  File: routers/catalog.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT
#

from __future__ import annotations

import logging

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from ..schemas import CatalogProfile, CatalogResponse
from ..services.catalog import build_recommendations

logger = logging.getLogger("stridematch.catalog")

router = APIRouter(prefix="/catalog", tags=["Catalog"])


@router.post("/recommendations", response_model=CatalogResponse)
async def get_recommendations(
    profile: CatalogProfile,
    claims: Dict[str, Any] = Depends(require_user),
) -> CatalogResponse:
    """
    Generate shoe recommendations based on questionnaire inputs
    + (optional) gait biometrics.
    """
    try:
        return build_recommendations(profile)
    except Exception:
        # Log full traceback to CloudWatch, but return a safe message to the client
        logger.exception("Catalog recommendation failed")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate recommendations",
        )