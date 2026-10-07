#
#  File: auth.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT - Copyright (C) 2025. macitch.
#


from __future__ import annotations

import json
import secrets
import logging
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Optional, List

import httpx

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError
from jwt.algorithms import RSAAlgorithm

from app.config import (
    ADMIN_CREDENTIALS,
    AUTH_SECRET,
    AUTH_TOKEN_EXPIRES_MINUTES,
    COGNITO_CLIENT_ID,
    COGNITO_DOMAIN,
    COGNITO_ISSUER,
    COGNITO_REGION,
    COGNITO_USER_POOL_ID,
    COGNITO_JWKS_PATH,
    COGNITO_JWKS_JSON,
    JWT_AUDIENCE,
)

# Tolerance for clock skew between this server and AWS Cognito when checking
# exp/iat/nbf - small skew (seconds, even a minute or two) is normal between
# independent machines and should not fail real, freshly-issued tokens.
CLOCK_SKEW_LEEWAY_SECONDS = 60

# -----------------------------------------------------------------------------
# Exceptions
# -----------------------------------------------------------------------------

class AuthError(HTTPException):
    """Custom HTTP exception for authentication failures."""
    def __init__(self, detail: str = "Not authenticated"):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )

logger = logging.getLogger(__name__)

# Retry transport for async JWKS fetch
_HTTPX_TRANSPORT = httpx.AsyncHTTPTransport(retries=3)

# -----------------------------------------------------------------------------
# Settings & helpers
# -----------------------------------------------------------------------------

security = HTTPBearer(auto_error=False)

def _normalize_domain(domain: Optional[str]) -> str:
    """Ensure the Cognito domain has scheme and no trailing slash."""
    if not domain:
        return ""
    d = domain.strip()
    if not re.match(r"^https?://", d, flags=re.IGNORECASE):
        d = f"https://{d}"
    return d.rstrip("/")

COGNITO_ENABLED: bool = bool(COGNITO_REGION and COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID)
_OAUTH_BASE = _normalize_domain(COGNITO_DOMAIN) if COGNITO_ENABLED else ""
TOKEN_URL = f"{_OAUTH_BASE}/oauth2/token" if _OAUTH_BASE else None

DEFAULT_ISSUER = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
    if COGNITO_ENABLED else ""
)
ISSUER = (COGNITO_ISSUER or DEFAULT_ISSUER).rstrip("/") if COGNITO_ENABLED else ""

DEFAULT_JWKS_URL = f"{ISSUER}/.well-known/jwks.json" if ISSUER else ""
JWKS_URL = DEFAULT_JWKS_URL

JWKS_CACHE_TTL = 300  # seconds
_JWKS_CACHE: Dict[str, Any] = {"keys": None, "expires_at": 0.0}


def _load_jwks_from_config_source() -> Optional[List[Dict[str, Any]]]:
    """Read JWKS payload from JSON env var or local file when network is unavailable."""
    raw_json = COGNITO_JWKS_JSON.strip() if COGNITO_JWKS_JSON else ""
    if raw_json:
        try:
            payload = json.loads(raw_json)
            keys = payload.get("keys") if isinstance(payload, dict) else payload
            if isinstance(keys, list) and keys:
                logger.info("Loaded Cognito JWKS from COGNITO_JWKS_JSON")
                return keys
            logger.warning("COGNITO_JWKS_JSON is missing 'keys' or is empty.")
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse COGNITO_JWKS_JSON: %s", exc)

    if COGNITO_JWKS_PATH:
        path = Path(COGNITO_JWKS_PATH).expanduser()
        if not path.exists():
            logger.warning("COGNITO_JWKS_PATH=%s not found.", path)
        else:
            try:
                payload = json.loads(path.read_text())
                keys = payload.get("keys") if isinstance(payload, dict) else payload
                if isinstance(keys, list) and keys:
                    logger.info("Loaded Cognito JWKS from %s", path)
                    return keys
                logger.warning("JWKS file at %s missing 'keys' or empty.", path)
            except json.JSONDecodeError as exc:
                logger.error("Failed to parse JWKS file at %s: %s", path, exc)
    return None

# -----------------------------------------------------------------------------
# Cognito configuration detection
# -----------------------------------------------------------------------------

def cognito_active() -> bool:
    """True when Cognito configuration is present."""
    return COGNITO_ENABLED and bool(_OAUTH_BASE and ISSUER and JWKS_URL)

# -----------------------------------------------------------------------------
# JWKS retrieval & token validation
# -----------------------------------------------------------------------------

async def _fetch_cognito_jwks(force: bool = False) -> List[Dict[str, Any]]:
    """Download and cache AWS Cognito JWKS keys (async)."""
    if not cognito_active():
        raise AuthError("Cognito is not configured")

    now = time.time()
    cached = _JWKS_CACHE.get("keys")
    if not force and cached and now < _JWKS_CACHE.get("expires_at", 0.0):
        return cached  # type: ignore[return-value]

    config_keys = _load_jwks_from_config_source()
    if config_keys:
        _JWKS_CACHE["keys"] = config_keys
        _JWKS_CACHE["expires_at"] = now + JWKS_CACHE_TTL
        return config_keys

    try:
        async with httpx.AsyncClient(transport=_HTTPX_TRANSPORT, timeout=6) as client:
            resp = await client.get(JWKS_URL)
            resp.raise_for_status()
        payload = resp.json()
        keys = payload.get("keys")
        if not keys:
            raise ValueError("JWKS payload missing 'keys'")
        _JWKS_CACHE["keys"] = keys
        _JWKS_CACHE["expires_at"] = now + JWKS_CACHE_TTL
        return keys
    except Exception as exc:
        logger.error("Failed to fetch Cognito JWKS: %s", exc)
        raise AuthError("Authentication service temporarily unavailable") from exc

# -----------------------------------------------------------------------------
# Decode Cognito token using PyJWT
# -----------------------------------------------------------------------------

async def decode_cognito_token(token: str) -> Dict[str, Any]:
    """Validate a Cognito-issued Bearer token (id/access) and return its payload."""
    if not token:
        raise AuthError("Missing token")
    if not cognito_active():
        raise AuthError("Cognito authentication not configured")

    try:
        # Header -> kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        if not kid:
            raise AuthError("Token missing 'kid' header")

        # Find matching JWK
        jwks = await _fetch_cognito_jwks()
        key = next((k for k in jwks if k.get("kid") == kid), None)
        if not key:
            jwks = await _fetch_cognito_jwks(force=True)
            key = next((k for k in jwks if k.get("kid") == kid), None)
        if not key:
            raise AuthError("Cognito token key id mismatch")

        public_key = RSAAlgorithm.from_jwk(json.dumps(key))

        # Peek claims (no signature verification) to decide validation rules
        unverified_claims = jwt.decode(token, options={"verify_signature": False})
        token_use = unverified_claims.get("token_use")  # "id" or "access"

        expected_client_id = JWT_AUDIENCE or COGNITO_CLIENT_ID

        if token_use == "id":
            # ID token includes aud
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                audience=expected_client_id,
                issuer=ISSUER,
                leeway=CLOCK_SKEW_LEEWAY_SECONDS,
            )

        elif token_use == "access":
            # Access token often has NO aud. It uses client_id instead.
            payload = jwt.decode(
                token,
                public_key,
                algorithms=["RS256"],
                issuer=ISSUER,
                options={"verify_aud": False},
                leeway=CLOCK_SKEW_LEEWAY_SECONDS,
            )

            token_client_id = payload.get("client_id")
            if expected_client_id and token_client_id != expected_client_id:
                raise AuthError("Invalid token: client_id mismatch")

        else:
            raise AuthError("Invalid token: unknown token_use")

        payload["provider"] = "cognito"
        return payload

    except ExpiredSignatureError:
        raise AuthError("Token has expired")
    except InvalidTokenError as exc:
        raise AuthError(f"Invalid token: {exc}")

# -----------------------------------------------------------------------------
# Local admin fallback (for dev use)
# -----------------------------------------------------------------------------

def _verify_password(stored: str, provided: str) -> bool:
    """Compare stored password hash with provided password.

    Supported formats:
      - bcrypt:$2b$...        (preferred)
      - sha256:<hex>           (legacy, timing-safe)
      - plaintext              (rejected in production)
    """
    import bcrypt as _bcrypt

    if stored.startswith("bcrypt:"):
        hashed = stored.split(":", 1)[1].encode("utf-8")
        return _bcrypt.checkpw(provided.encode("utf-8"), hashed)

    if stored.startswith("sha256:"):
        import hashlib
        digest = hashlib.sha256(provided.encode("utf-8")).hexdigest()
        return secrets.compare_digest(digest, stored.split(":", 1)[1])

    # Plaintext fallback — reject in production, allow in debug mode only.
    import os
    is_debug = os.environ.get("APP_DEBUG", "false").lower() in {"1", "true", "yes"}
    if not is_debug:
        logger.error("admin password stored in plaintext — refusing login in production mode. "
                      "Set ADMIN_PASSWORD_BCRYPT or ADMIN_PASSWORD_HASH.")
        return False
    logger.warning("admin password stored in plaintext — set ADMIN_PASSWORD_HASH for production")
    return secrets.compare_digest(stored, provided)

def authenticate_admin(username: str, password: str) -> Optional[str]:
    """Validate admin credentials and return username if authorized."""
    candidate = ADMIN_CREDENTIALS.get(username) if isinstance(ADMIN_CREDENTIALS, dict) else None
    if not candidate or not _verify_password(candidate, password):
        return None
    return username

# -----------------------------------------------------------------------------
# Local JWT (HS256) dev token generator
# -----------------------------------------------------------------------------

def create_access_token(subject: str) -> str:
    """Create a signed JWT access token for the given subject."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=AUTH_TOKEN_EXPIRES_MINUTES)
    payload = {
        "sub": subject,
        "exp": expires,
        "iat": datetime.now(timezone.utc),
        "iss": "StrideMatchLab",
    }
    return jwt.encode(payload, AUTH_SECRET, algorithm="HS256")

def verify_access_token(token: str) -> str:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, AUTH_SECRET, algorithms=["HS256"])
        subject = payload.get("sub")
        if not subject:
            raise AuthError("Invalid token payload")
        return subject
    except ExpiredSignatureError:
        raise AuthError("Token has expired")
    except InvalidTokenError:
        raise AuthError("Invalid or malformed token")

# -----------------------------------------------------------------------------
# FastAPI dependency
# -----------------------------------------------------------------------------

async def require_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    """
    Ensures the request has a valid Bearer token (any authenticated user).

    - Cognito mode: Validates RS256 token.
    - Local mode: Validates HS256 dev token.

    Returns the decoded claims dict with at least {"sub": ..., "provider": ...}.
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthError("Authorization header missing or invalid")

    token = credentials.credentials

    # When Cognito is active, ONLY accept Cognito tokens — do not fall back
    # to local auth, which would allow forged HS256 tokens to bypass Cognito.
    if cognito_active():
        try:
            payload = await decode_cognito_token(token)
            payload["provider"] = "cognito"
            return payload
        except Exception as exc:
            logger.warning("Cognito token validation failed: %s", exc)
            raise AuthError("Invalid or expired token") from exc

    subject = verify_access_token(token)
    return {"sub": subject, "provider": "local"}


def is_admin(claims: Dict[str, Any]) -> bool:
    """Check if the authenticated user has admin privileges."""
    if claims.get("provider") == "cognito":
        groups = claims.get("cognito:groups", []) or []
        return "admin" in groups
    # Local mode: check if subject is in admin credentials
    return claims.get("sub", "") in ADMIN_CREDENTIALS


async def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Dict[str, Any]:
    """
    Ensures the request has a valid Bearer token and the user has admin privileges.

    - Cognito mode:
        Validates RS256 token, requires "admin" group.
    - Local mode:
        Validates HS256 dev token.
    """
    claims = await require_user(credentials)

    if not is_admin(claims):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return claims
