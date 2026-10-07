#
#  File: config.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT - Copyright (C) 2025. macitch.
#

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv

# --- Load environment variables ---
BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
if ENV_PATH.exists():
    load_dotenv(ENV_PATH)


# ============================================================
# Config helpers 
# ============================================================

def _get_config_value(key: str, default: str = "") -> str:
    """
    Unified config getter (env → default).
    Supports empty strings by falling back to default.
    """
    v = os.environ.get(key)
    if v is None:
        return default
    v = str(v).strip()
    return v if v != "" else default


def _get_bool(key: str, default: bool = False) -> bool:
    v = os.environ.get(key)
    if v is None:
        return default
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_int(key: str, default: int) -> int:
    v = os.environ.get(key)
    if v is None:
        return default
    try:
        return int(str(v).strip())
    except Exception:
        return default


def _get_float(key: str, default: float) -> float:
    v = os.environ.get(key)
    if v is None:
        return default
    try:
        return float(str(v).strip())
    except Exception:
        return default



# ============================================================
# Catalog source
# ============================================================

GOOGLE_SHEET_URL = _get_config_value("GOOGLE_SHEET_URL", "")
CATALOG_SOURCE = _get_config_value("CATALOG_SOURCE", "auto").lower()

DATABASE_URL = _get_config_value("DATABASE_URL", "")
LOCAL_DEFAULT_ORGANIZATION_ID = _get_config_value("LOCAL_DEFAULT_ORGANIZATION_ID", "")
DATABASE_TABLE = _get_config_value("DATABASE_TABLE", "")
DATABASE_QUERY = _get_config_value("DATABASE_QUERY", "")

LOCAL_CATALOG_PATH = _get_config_value("LOCAL_CATALOG_PATH", "")
LOCAL_CATALOG_PATH = str(Path(LOCAL_CATALOG_PATH).expanduser()) if LOCAL_CATALOG_PATH else None

LOCAL_CATALOG_TABLE = _get_config_value("LOCAL_CATALOG_TABLE", "")


# ============================================================
# Admin credentials
# ============================================================

def _load_admin_credentials() -> Dict[str, str]:
    """
    Load admin credentials from JSON blob or plain env.
    Supported env vars:
      - ADMIN_CREDENTIALS_JSON='{"user":"pass","user2":"sha256:..."}'
      - ADMIN_USERNAME / ADMIN_PASSWORD
      - ADMIN_USERNAME / ADMIN_PASSWORD_HASH  (stored as 'sha256:<hash>')
    """
    json_blob = _get_config_value("ADMIN_CREDENTIALS_JSON", "")
    if json_blob:
        try:
            parsed = json.loads(json_blob)
            cleaned = {
                str(u).strip(): str(p).strip()
                for u, p in parsed.items()
                if str(u).strip() and str(p).strip()
            }
            if cleaned:
                return cleaned
        except json.JSONDecodeError:
            logger = __import__("logging").getLogger(__name__)
            logger.warning("Invalid ADMIN_CREDENTIALS_JSON — using fallback.")

    username = _get_config_value("ADMIN_USERNAME", "")
    if not username:
        return {}

    password_bcrypt = _get_config_value("ADMIN_PASSWORD_BCRYPT", "")
    password_hash = _get_config_value("ADMIN_PASSWORD_HASH", "")
    password_plain = _get_config_value("ADMIN_PASSWORD", "")

    if password_bcrypt:
        return {username: f"bcrypt:{password_bcrypt.strip()}"}
    if password_hash:
        return {username: f"sha256:{password_hash.strip()}"}
    if password_plain:
        return {username: password_plain.strip()}
    return {}


ADMIN_CREDENTIALS = _load_admin_credentials()


# ============================================================
# User tables
# ============================================================

DATABASE_USERS_TABLE = _get_config_value("DATABASE_USERS_TABLE", "public.smlab_users_database")
USER_CREDENTIALS_TABLE = _get_config_value("USER_CREDENTIALS_TABLE", "public.smlab_user_credentials")
DATABASE_USERS_QUERY = _get_config_value("DATABASE_USERS_QUERY", "")
CATALOG_ADMIN_LIMIT = _get_int("CATALOG_ADMIN_LIMIT", 250)


# ============================================================
# Analysis results storage
# ============================================================

def _resolve_results_db_url() -> str:
    direct = _get_config_value("ANALYSIS_RESULTS_DATABASE_URL", "")
    if direct:
        return direct
    return DATABASE_URL


ANALYSIS_RESULTS_DATABASE_URL = _resolve_results_db_url()
_raw_table = _get_config_value("ANALYSIS_RESULTS_TABLE", "analysis_results")
if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", _raw_table):
    raise RuntimeError(
        f"ANALYSIS_RESULTS_TABLE contains invalid characters: {_raw_table!r}"
    )
ANALYSIS_RESULTS_TABLE = _raw_table
ANALYSIS_RESULTS_LIMIT = _get_int("ANALYSIS_RESULTS_LIMIT", 50)


# ============================================================
# Local auth / JWT
# ============================================================

AUTH_SECRET = _get_config_value("STRIDEMATCH_AUTH_SECRET", "")
_WEAK_SECRET_PATTERNS = {"change-me", "change_me", "changeme", "secret", "password"}
if (
    not AUTH_SECRET
    or len(AUTH_SECRET) < 32
    or any(p in AUTH_SECRET.lower() for p in _WEAK_SECRET_PATTERNS)
):
    raise RuntimeError(
        "STRIDEMATCH_AUTH_SECRET must be a strong random value (min 32 chars, no common words). "
        "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(48))\""
    )
AUTH_TOKEN_EXPIRES_MINUTES = _get_int("STRIDEMATCH_AUTH_EXPIRES_MINUTES", 60)


# ============================================================
# AWS Cognito (optional)
# ============================================================

COGNITO_REGION = _get_config_value("COGNITO_REGION", "")
AWS_REGION = _get_config_value("AWS_REGION", COGNITO_REGION)
COGNITO_USER_POOL_ID = _get_config_value("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = _get_config_value("COGNITO_CLIENT_ID", "")
COGNITO_USER_POOL_CLIENT_ID = _get_config_value("COGNITO_USER_POOL_CLIENT_ID", COGNITO_CLIENT_ID)
COGNITO_DOMAIN = _get_config_value("COGNITO_DOMAIN", "")
COGNITO_CLIENT_SECRET = _get_config_value("COGNITO_CLIENT_SECRET", "")
COGNITO_JWKS_PATH = _get_config_value("COGNITO_JWKS_PATH", "")
COGNITO_JWKS_JSON = _get_config_value("COGNITO_JWKS_JSON", "")

COGNITO_ISSUER = _get_config_value(
    "COGNITO_ISSUER",
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
    if COGNITO_REGION and COGNITO_USER_POOL_ID else "",
)

JWT_ALGORITHM = _get_config_value("JWT_ALGORITHM", "RS256")
JWT_AUDIENCE = _get_config_value("JWT_AUDIENCE", COGNITO_CLIENT_ID)

# ============================================================
# Cognito groups
# ============================================================

ADMIN_GROUP_NAME = _get_config_value("ADMIN_GROUP_NAME", "admin")
CUSTOMER_GROUP_NAME = _get_config_value("CUSTOMER_GROUP_NAME", "customer")

# ============================================================
# Email (SMTP) — used to send PDF reports to customers
# ============================================================

SMTP_HOST = _get_config_value("SMTP_HOST", "")
SMTP_PORT = _get_int("SMTP_PORT", 587)
SMTP_USERNAME = _get_config_value("SMTP_USERNAME", "")
SMTP_PASSWORD = _get_config_value("SMTP_PASSWORD", "")
SMTP_FROM_EMAIL = _get_config_value("SMTP_FROM_EMAIL", SMTP_USERNAME)
SMTP_FROM_NAME = _get_config_value("SMTP_FROM_NAME", "StrideMatch")
SMTP_USE_TLS = _get_bool("SMTP_USE_TLS", True)
