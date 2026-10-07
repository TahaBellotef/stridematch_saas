from __future__ import annotations

import logging
from importlib import import_module

from fastapi import APIRouter

logger = logging.getLogger("stridematch.routers")


def _load_router(module_name: str, router_name: str) -> APIRouter:
    try:
        module = import_module(module_name, package=__name__)
        return getattr(module, router_name)
    except ModuleNotFoundError as exc:
        missing = exc.name or ""
        # Skip routers only when a third-party dependency is missing.
        if missing.startswith(("app", "backend", "core", "data")):
            raise
        logger.warning(
            "Skipping router '%s' due to missing dependency '%s'.",
            module_name,
            missing or "unknown",
        )
        return APIRouter()


admin_router = _load_router(".admin", "router")
analysis_router = _load_router(".analysis", "router")
auth_router = _load_router(".auth", "router")
catalog_router = _load_router(".catalog", "router")
foot_scan_router = _load_router(".foot_scan", "router")
public_router = _load_router(".public", "router")
session_router = _load_router(".session", "router")
uploads_router = _load_router(".uploads", "router")
runner_profile_router = _load_router(".runner_profile", "router")

__all__ = [
    "admin_router",
    "analysis_router",
    "auth_router",
    "catalog_router",
    "foot_scan_router",
    "public_router",
    "runner_profile_router",
    "session_router",
    "uploads_router",
]
