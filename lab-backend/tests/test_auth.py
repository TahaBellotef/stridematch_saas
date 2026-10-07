"""Tests for local JWT auth (HS256 dev tokens)."""

from __future__ import annotations

import pytest

from app.auth import (
    create_access_token,
    verify_access_token,
    authenticate_admin,
    AuthError,
    _verify_password,
)


class TestLocalJWT:
    def test_roundtrip(self):
        token = create_access_token("user-123")
        subject = verify_access_token(token)
        assert subject == "user-123"

    def test_invalid_token(self):
        with pytest.raises(AuthError, match="Invalid"):
            verify_access_token("not.a.valid.token")

    def test_empty_token(self):
        with pytest.raises(AuthError):
            verify_access_token("")


class TestAuthenticateAdmin:
    def test_valid(self):
        result = authenticate_admin("test_admin", "test_password_123")
        assert result == "test_admin"

    def test_wrong_password(self):
        result = authenticate_admin("test_admin", "wrong")
        assert result is None

    def test_unknown_user(self):
        result = authenticate_admin("unknown", "test_password_123")
        assert result is None


class TestVerifyPassword:
    def test_plaintext_match_debug_mode(self):
        """Plaintext passwords are allowed when APP_DEBUG=true."""
        assert _verify_password("secret", "secret") is True

    def test_plaintext_mismatch_debug_mode(self):
        assert _verify_password("secret", "wrong") is False

    def test_plaintext_blocked_in_production(self, monkeypatch):
        """Plaintext passwords must be rejected when not in debug mode."""
        monkeypatch.setenv("APP_DEBUG", "false")
        assert _verify_password("secret", "secret") is False

    def test_sha256_match(self):
        import hashlib
        digest = hashlib.sha256(b"mypassword").hexdigest()
        stored = f"sha256:{digest}"
        assert _verify_password(stored, "mypassword") is True

    def test_sha256_mismatch(self):
        assert _verify_password("sha256:abcdef", "mypassword") is False
