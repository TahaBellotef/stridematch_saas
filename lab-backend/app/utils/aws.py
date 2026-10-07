from __future__ import annotations

import os
import re
from typing import Any

from fastapi import HTTPException

try:
    import boto3 as _boto3
except ModuleNotFoundError:
    _boto3 = None

try:
    from botocore.exceptions import ClientError  # type: ignore
except ModuleNotFoundError:
    class ClientError(Exception):
        """Fallback when botocore is unavailable."""


def boto3_or_raise() -> Any:
    if _boto3 is None:
        raise RuntimeError(
            "Missing optional dependency 'boto3'. Install backend dependencies with "
            "'pip install -r backend/requirements.txt'."
        )
    return _boto3


# ---------------------------------------------------------------------------
# Shared S3 helpers (used by analysis, foot_scan, and upload routers)
# ---------------------------------------------------------------------------

_S3_KEY_PATTERN = re.compile(r"^[a-zA-Z0-9/_.\-]+$")


def validate_s3_key(s3_key: str) -> None:
    """Reject s3_key values that don't match expected patterns."""
    if not s3_key or len(s3_key) > 512 or not _S3_KEY_PATTERN.match(s3_key):
        raise HTTPException(status_code=400, detail="Invalid upload key format")


def s3_object_exists(s3_key: str) -> bool:
    """Check if an object exists in the upload S3 bucket."""
    bucket = os.environ.get("STRIDEMATCH_UPLOAD_BUCKET")
    if not bucket:
        raise RuntimeError("STRIDEMATCH_UPLOAD_BUCKET is not configured")

    s3 = boto3_or_raise().client("s3")
    try:
        s3.head_object(Bucket=bucket, Key=s3_key)
        return True
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code")
        if code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise

