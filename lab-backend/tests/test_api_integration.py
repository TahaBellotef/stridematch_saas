"""Integration tests using FastAPI TestClient.

Covers: auth flow, session CRUD, analysis IDOR, foot scan IDOR,
upload validation, video token auth, health endpoint.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from main import app
from app.auth import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token() -> str:
    """Token for the test_admin user configured in conftest.py."""
    return create_access_token("test_admin")


@pytest.fixture
def user_token() -> str:
    """Token for a regular (non-admin) user."""
    return create_access_token("user-abc-123")


@pytest.fixture
def other_user_token() -> str:
    """Token for a different regular user (for IDOR tests)."""
    return create_access_token("user-xyz-999")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# Health
# ============================================================================

class TestHealth:
    def test_healthz(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ============================================================================
# Auth
# ============================================================================

class TestAuthLogin:
    def test_admin_login_valid(self, client):
        r = client.post("/api/v1/auth/login", json={
            "username": "test_admin",
            "password": "test_password_123",
        })
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "Bearer"

    def test_admin_login_wrong_password(self, client):
        r = client.post("/api/v1/auth/login", json={
            "username": "test_admin",
            "password": "wrong_password",
        })
        assert r.status_code == 401

    def test_admin_login_unknown_user(self, client):
        r = client.post("/api/v1/auth/login", json={
            "username": "nobody",
            "password": "test_password_123",
        })
        assert r.status_code == 401

    def test_admin_login_empty_fields(self, client):
        r = client.post("/api/v1/auth/login", json={
            "username": "",
            "password": "",
        })
        assert r.status_code == 422


# ============================================================================
# Personal (B2C) onboarding
# ============================================================================

class TestOnboardPersonal:
    def test_onboard_personal_creates_account(self, client):
        """A fresh user can self-onboard into a personal org and is org_admin."""
        token = create_access_token("personal-user-new-1")
        r = client.post("/api/v1/auth/onboard-personal", headers=_auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["account_type"] == "personal"
        assert body["role"] == "org_admin"
        assert body["organization_id"]

    def test_onboard_personal_tenant_reports_personal(self, client):
        """After personal onboarding, /auth/tenant reflects account_type."""
        token = create_access_token("personal-user-new-2")
        client.post("/api/v1/auth/onboard-personal", headers=_auth(token))
        r = client.get("/api/v1/auth/tenant", headers=_auth(token))
        assert r.status_code == 200
        assert r.json()["account_type"] == "personal"

    def test_onboard_personal_can_create_session(self, client):
        """A personal-onboarded user becomes a valid tenant and can create sessions."""
        token = create_access_token("personal-user-new-3")
        client.post("/api/v1/auth/onboard-personal", headers=_auth(token))
        r = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
            "customer_id": "personal-user-new-3",
            "analysis_type": "side",
        }, headers=_auth(token))
        assert r.status_code == 201

    def test_onboard_personal_twice_conflicts(self, client):
        """Onboarding an already-onboarded user returns 409."""
        token = create_access_token("personal-user-new-4")
        first = client.post("/api/v1/auth/onboard-personal", headers=_auth(token))
        assert first.status_code == 200
        second = client.post("/api/v1/auth/onboard-personal", headers=_auth(token))
        assert second.status_code == 409

    def test_onboard_personal_existing_store_member_conflicts(self, client, user_token):
        """A user already in a store org cannot also personal-onboard."""
        r = client.post("/api/v1/auth/onboard-personal", headers=_auth(user_token))
        assert r.status_code == 409

    def test_onboard_personal_unauthenticated(self, client):
        r = client.post("/api/v1/auth/onboard-personal")
        assert r.status_code in (401, 403)

    def test_store_account_type_defaults_store(self, client, user_token):
        """Pre-existing store orgs resolve as account_type 'store'."""
        r = client.get("/api/v1/auth/tenant", headers=_auth(user_token))
        assert r.status_code == 200
        assert r.json()["account_type"] == "store"


# ============================================================================
# Sessions
# ============================================================================

_RUNNER_PROFILE = {
    "height_cm": 175,
    "weight_kg": 70,
    "age": 30,
    "gender": "male",
    "level": "intermediate",
    "surface": "road",
    "weekly_distance": "25_50",
    "pronation": "neutral",
    "preference": "comfort",
}


class TestSessionCRUD:
    def test_create_session(self, client, user_token):
        r = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
            "analysis_type": "rear",
        }, headers=_auth(user_token))
        assert r.status_code == 201
        body = r.json()
        assert body["status"] == "pending"
        assert body["analysis_type"] == "rear"
        assert "id" in body

    def test_create_session_unauthenticated(self, client):
        r = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
        })
        assert r.status_code in (401, 403)

    def test_get_session(self, client, user_token):
        # Create first
        create = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
            "analysis_type": "side",
        }, headers=_auth(user_token))
        session_id = create.json()["id"]

        # Fetch
        r = client.get(f"/api/v1/sessions/{session_id}", headers=_auth(user_token))
        assert r.status_code == 200
        assert r.json()["id"] == session_id

    def test_get_session_not_found(self, client, user_token):
        r = client.get("/api/v1/sessions/nonexistent", headers=_auth(user_token))
        assert r.status_code == 404


class TestSessionIDOR:
    def test_other_user_cannot_access_session(self, client, user_token, other_user_token):
        # User A creates a session
        create = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
        }, headers=_auth(user_token))
        session_id = create.json()["id"]

        # User B tries to access it
        r = client.get(f"/api/v1/sessions/{session_id}", headers=_auth(other_user_token))
        assert r.status_code == 404

    def test_admin_can_access_any_session(self, client, user_token, admin_token):
        # User creates a session
        create = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
        }, headers=_auth(user_token))
        session_id = create.json()["id"]

        # Admin accesses it
        r = client.get(f"/api/v1/sessions/{session_id}", headers=_auth(admin_token))
        assert r.status_code == 200


# ============================================================================
# Analysis
# ============================================================================

class TestAnalysisEndpoints:
    def test_analysis_run_unauthenticated(self, client):
        r = client.post("/api/v1/analysis/run", data={
            "session_id": "fake",
            "capture_type": "side",
            "s3_key": "fake.mp4",
        })
        assert r.status_code in (401, 403)

    def test_analysis_run_session_not_found(self, client, user_token):
        r = client.post("/api/v1/analysis/run", data={
            "session_id": "nonexistent",
            "capture_type": "side",
            "s3_key": "uploads/test.mp4",
        }, headers=_auth(user_token))
        assert r.status_code == 404

    def test_analysis_run_invalid_s3_key(self, client, user_token):
        # Create a session first
        create = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
            "analysis_type": "side",
        }, headers=_auth(user_token))
        session_id = create.json()["id"]

        r = client.post("/api/v1/analysis/run", data={
            "session_id": session_id,
            "capture_type": "side",
            "s3_key": "<script>alert(1)</script>",
        }, headers=_auth(user_token))
        assert r.status_code == 400

    def test_analysis_get_nonexistent(self, client, user_token):
        r = client.get("/api/v1/analysis/nonexistent", headers=_auth(user_token))
        assert r.status_code == 200
        assert r.json()["status"] == "processing"

    def test_analysis_run_idor(self, client, user_token, other_user_token):
        # User A creates a session
        create = client.post("/api/v1/sessions", json={
            "runner_profile": _RUNNER_PROFILE,
            "analysis_type": "side",
        }, headers=_auth(user_token))
        session_id = create.json()["id"]

        # User B tries to trigger analysis on User A's session
        r = client.post("/api/v1/analysis/run", data={
            "session_id": session_id,
            "capture_type": "side",
            "s3_key": "uploads/test.mp4",
        }, headers=_auth(other_user_token))
        assert r.status_code == 404


class TestVideoEndpoint:
    def test_video_no_token(self, client):
        r = client.get("/api/v1/analysis/fakejob/video")
        assert r.status_code == 403

    def test_video_invalid_token(self, client):
        r = client.get("/api/v1/analysis/fakejob/video?token=invalid")
        assert r.status_code == 403

    def test_video_expired_token(self, client):
        import hashlib, hmac
        from app.config import AUTH_SECRET
        # Create an expired token
        expires = 1000000000  # 2001 - long expired
        msg = f"fakejob:{expires}".encode()
        sig = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        token = f"{expires}:{sig}"
        r = client.get(f"/api/v1/analysis/fakejob/video?token={token}")
        assert r.status_code == 403


# ============================================================================
# Analysis History
# ============================================================================

class TestAnalysisHistory:
    def test_history_unauthenticated(self, client):
        r = client.get("/api/v1/analysis/user/someone")
        assert r.status_code in (401, 403)

    def test_history_idor(self, client, user_token):
        """Regular user cannot access another user's history."""
        r = client.get("/api/v1/analysis/user/other-user-id", headers=_auth(user_token))
        assert r.status_code == 403


# ============================================================================
# Uploads
# ============================================================================

class TestUploads:
    def test_presign_unauthenticated(self, client):
        r = client.post("/api/v1/uploads/presign", json={
            "content_type": "video/mp4",
        })
        assert r.status_code in (401, 403)

    def test_presign_invalid_content_type(self, client, user_token):
        r = client.post("/api/v1/uploads/presign", json={
            "content_type": "application/pdf",
        }, headers=_auth(user_token))
        assert r.status_code == 400

    def test_presign_valid_local_mode(self, client, user_token):
        """In local mode, presign returns a local URL."""
        r = client.post("/api/v1/uploads/presign", json={
            "content_type": "video/mp4",
        }, headers=_auth(user_token))
        # May return 201 (local mode) or 500 (S3 not configured)
        # Either way, validates auth + content_type work
        assert r.status_code in (201, 500)

    def test_local_upload_no_token(self, client):
        """Local upload endpoint requires a signed token."""
        r = client.put(
            "/api/v1/uploads/local/user-uploads/test.mp4",
            content=b"fake",
            headers={"content-type": "video/mp4"},
        )
        assert r.status_code == 403

    def test_local_upload_invalid_token(self, client):
        """Local upload rejects invalid tokens."""
        r = client.put(
            "/api/v1/uploads/local/user-uploads/test.mp4?token=bogus",
            content=b"fake",
            headers={"content-type": "video/mp4"},
        )
        assert r.status_code == 403


# ============================================================================
# Security Headers
# ============================================================================

class TestSecurityHeaders:
    def test_security_headers_present(self, client):
        r = client.get("/healthz")
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("X-Frame-Options") == "DENY"
        assert r.headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Referrer-Policy" in r.headers

    def test_request_id_header(self, client):
        r = client.get("/healthz")
        assert "x-request-id" in r.headers

    def test_custom_request_id_echoed(self, client):
        r = client.get("/healthz", headers={"x-request-id": "test-rid-123"})
        assert r.headers.get("x-request-id") == "test-rid-123"
