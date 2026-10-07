from __future__ import annotations

import logging
import os
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from sqlalchemy import text

from app.db import init_db
from app.db.deps import get_db
from app.logging_config import setup_logging, new_request_id, request_id_var
from app.routers import (
    admin_router,
    analysis_router,
    auth_router,
    catalog_router,
    foot_scan_router,
    public_router,
    runner_profile_router,
    session_router,
    uploads_router,
)

# -----------------------------------------------------------------------------
# Env & Logging
# -----------------------------------------------------------------------------
load_dotenv()
setup_logging()
logger = logging.getLogger("stridematch")


# -----------------------------------------------------------------------------
# CORS helper
# -----------------------------------------------------------------------------
def _configured_origins() -> List[str]:
    raw = os.environ.get("STRIDEMATCH_CORS_ORIGINS", "")
    origins = [o.strip() for o in raw.split(",") if o.strip()]

    # MVP-friendly default (prevents silent misconfig in prod)
    if not origins:
        origins = ["https://lab.stridematch.io", "http://localhost:3000"]
        logger.warning(
            "STRIDEMATCH_CORS_ORIGINS not set; defaulting to %s",
            origins,
        )

    return origins


# -----------------------------------------------------------------------------
# App factory
# -----------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)


def create_app() -> FastAPI:
    app = FastAPI(
        title=os.getenv("APP_NAME", "SMLab API"),
        version=os.getenv("APP_VERSION", "0.2.0"),
        debug=os.getenv("APP_DEBUG", "false").lower() == "true",
    )

    # Rate limiter
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Please try again later."},
        )

    # Request ID middleware — sets a correlation ID for every request
    class RequestIdMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            rid = request.headers.get("x-request-id") or new_request_id()
            token = request_id_var.set(rid)
            try:
                response: Response = await call_next(request)
                response.headers["x-request-id"] = rid
                return response
            finally:
                request_id_var.reset(token)

    app.add_middleware(RequestIdMiddleware)

    # Security headers middleware
    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            response: Response = await call_next(request)
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["X-XSS-Protection"] = "1; mode=block"
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
            return response

    app.add_middleware(SecurityHeadersMiddleware)

    # IMPORTANT: CORS middleware should be registered before routers
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_configured_origins(),
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
        max_age=600,
    )

    # DB init (creates tables if needed)
    init_db()

    # Routers
    app.include_router(session_router, prefix="/api/v1")
    app.include_router(uploads_router, prefix="/api/v1")
    app.include_router(analysis_router, prefix="/api/v1")
    app.include_router(foot_scan_router, prefix="/api/v1")
    app.include_router(admin_router, prefix="/api/v1")
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(catalog_router, prefix="/api/v1")
    app.include_router(public_router, prefix="/api/v1")
    app.include_router(runner_profile_router, prefix="/api/v1")

    @app.get("/healthz", include_in_schema=False)
    async def healthz(db=Depends(get_db)):
        try:
            db.execute(text("SELECT 1"))
            return {"status": "ok", "db": "ok"}
        except Exception as exc:
            logger.error("healthz: database probe failed: %s", exc)
            return JSONResponse(
                status_code=503,
                content={"status": "degraded", "db": "unreachable"},
            )

    return app


# -----------------------------------------------------------------------------
# ASGI
# -----------------------------------------------------------------------------
app = create_app()