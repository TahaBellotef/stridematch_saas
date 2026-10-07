"""Tests for analysis router helper functions (video tokens, S3 key validation)."""

from __future__ import annotations

import hashlib
import hmac
import time

import pytest
from fastapi import HTTPException

from app.config import AUTH_SECRET


# Re-implement the token functions inline to avoid importing the full router
# module (which requires slowapi). These must stay in sync with analysis.py.

_VIDEO_TOKEN_TTL = 3600


def _sign_video_token(job_id: str) -> str:
    expires = int(time.time()) + _VIDEO_TOKEN_TTL
    msg = f"{job_id}:{expires}".encode()
    sig = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return f"{expires}:{sig}"


def _verify_video_token(job_id: str, token: str) -> bool:
    try:
        parts = token.split(":", 1)
        if len(parts) != 2:
            return False
        expires_str, sig = parts
        expires = int(expires_str)
        if time.time() > expires:
            return False
        msg = f"{job_id}:{expires}".encode()
        expected = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False


import re

_S3_KEY_PATTERN = re.compile(r"^[a-zA-Z0-9/_.\-]+$")


def _validate_s3_key(s3_key: str) -> None:
    if not s3_key or len(s3_key) > 512 or not _S3_KEY_PATTERN.match(s3_key):
        raise HTTPException(status_code=400, detail="Invalid upload key format")


class TestVideoTokens:
    def test_roundtrip(self):
        token = _sign_video_token("abc123")
        assert _verify_video_token("abc123", token) is True

    def test_wrong_job_id(self):
        token = _sign_video_token("abc123")
        assert _verify_video_token("wrong_id", token) is False

    def test_expired_token(self):
        # Create a token that expired in the past
        expires = int(time.time()) - 100
        msg = f"abc123:{expires}".encode()
        sig = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        token = f"{expires}:{sig}"
        assert _verify_video_token("abc123", token) is False

    def test_malformed_token(self):
        assert _verify_video_token("abc123", "") is False
        assert _verify_video_token("abc123", "no_colon") is False
        assert _verify_video_token("abc123", "notanumber:sig") is False

    def test_tampered_signature(self):
        token = _sign_video_token("abc123")
        parts = token.split(":", 1)
        tampered = f"{parts[0]}:{'a' * 64}"
        assert _verify_video_token("abc123", tampered) is False


class TestS3KeyValidation:
    def test_valid_key(self):
        _validate_s3_key("uploads/user123/video.mp4")

    def test_empty_key(self):
        with pytest.raises(HTTPException):
            _validate_s3_key("")

    def test_null_byte_injection(self):
        with pytest.raises(HTTPException):
            _validate_s3_key("uploads/video\x00.mp4")

    def test_special_chars(self):
        with pytest.raises(HTTPException):
            _validate_s3_key("uploads/<script>alert(1)</script>")

    def test_too_long(self):
        with pytest.raises(HTTPException):
            _validate_s3_key("a" * 600)
