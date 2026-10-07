#
#  File: services/users.py
#  Project: StrideMatchLab
#  Author: @macitch (https://github.com/macitch)
#  Company: StrideMatch (https://github.com/StrideMatch)
#  License: MIT - Copyright (C) 2025. macitch.
#


from __future__ import annotations

from typing import Any, Dict, List, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.config import DATABASE_URL, DATABASE_USERS_QUERY, DATABASE_USERS_TABLE
from ..schemas import UserListResponse, UserRecord


# --- Engine builder ---

def _build_engine():
    """Create a SQLAlchemy engine with connection pre-ping."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    return create_engine(DATABASE_URL, pool_pre_ping=True, future=True)


# --- Query helpers ---

def _default_query() -> str:
    """Fallback query if DATABASE_USERS_QUERY is not defined."""
    table = DATABASE_USERS_TABLE or "public.smlab_users_database"
    return f"SELECT * FROM {table} ORDER BY created_at DESC LIMIT :limit"


# --- Row conversion ---

def _row_to_user(row: Dict[str, Any]) -> UserRecord:
    """Convert raw DB row to UserRecord schema."""
    first = row.get("first_name") or row.get("firstname")
    last = row.get("last_name") or row.get("lastname")

    known_keys = {
        "id", "email", "first_name", "last_name", "firstname", "lastname",
        "created_at", "last_login_at",
    }
    metadata = {k: v for k, v in row.items() if k not in known_keys}

    return UserRecord(
        id=str(row.get("id")) if row.get("id") is not None else None,
        email=row.get("email"),
        first_name=first,
        last_name=last,
        created_at=row.get("created_at"),
        last_login_at=row.get("last_login_at"),
        metadata=metadata or None,
    )


# --- Public services ---

def fetch_users(limit: int = 100) -> UserListResponse:
    """
    Retrieve recent users from the configured database.
    Uses DATABASE_USERS_QUERY or a default fallback query.
    """
    if not DATABASE_URL:
        return UserListResponse(total=0, users=[])

    query = DATABASE_USERS_QUERY or _default_query()
    engine = None
    rows: List[Dict[str, Any]] = []

    try:
        engine = _build_engine()
        with engine.connect() as conn:
            stmt = text(query)
            params = {"limit": limit} if ":limit" in query else {}
            result = conn.execute(stmt, params)
            rows = [dict(row) for row in result.mappings()]
    except SQLAlchemyError as exc:
        # Defensive logging if needed later
        print(f"[UserService] fetch_users failed: {exc}")
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass

    users = [_row_to_user(row) for row in rows]
    return UserListResponse(total=len(users), users=users)
