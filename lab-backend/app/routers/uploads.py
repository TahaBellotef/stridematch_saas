#
#  File: routers/uploads.py
#  Project: StrideMatchLab
#  Author: @macitch
#  License: MIT © 2025
#

from __future__ import annotations

import hashlib
import hmac
import os
import time
import uuid
from typing import Dict, Optional

try:
    from botocore.config import Config
except ModuleNotFoundError:
    Config = None
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.auth import require_user
from app.config import AUTH_SECRET
from app.services.upload_storage import (
    build_local_upload_path,
    get_upload_mode,
)
from app.utils.aws import boto3_or_raise


# =========================================================
# Configuration
# =========================================================

S3_BUCKET = os.environ.get("STRIDEMATCH_UPLOAD_BUCKET")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")


# =========================================================
# Allowed video formats (MUST match frontend)
# =========================================================

ALLOWED_VIDEO_TYPES: Dict[str, str] = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
}

# =========================================================
# Allowed image formats (for foot scan)
# =========================================================

ALLOWED_IMAGE_TYPES: Dict[str, str] = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}

# Combined allowed types
ALLOWED_MEDIA_TYPES: Dict[str, str] = {**ALLOWED_VIDEO_TYPES, **ALLOWED_IMAGE_TYPES}


# =========================================================
# Router
# =========================================================

router = APIRouter(prefix="/uploads", tags=["Uploads"])
limiter = Limiter(key_func=get_remote_address)


# =========================================================
# Helpers
# =========================================================

_UPLOAD_TOKEN_TTL = 900  # 15 minutes, matches presign expiry


def _sign_upload_token(upload_key: str) -> str:
    """Create an HMAC-signed time-limited token for local upload auth."""
    expires = int(time.time()) + _UPLOAD_TOKEN_TTL
    msg = f"upload:{upload_key}:{expires}".encode()
    sig = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return f"{expires}:{sig}"


def _verify_upload_token(upload_key: str, token: str) -> bool:
    """Verify an HMAC-signed local upload token."""
    try:
        parts = token.split(":", 1)
        if len(parts) != 2:
            return False
        expires_str, sig = parts
        expires = int(expires_str)
        if time.time() > expires:
            return False
        msg = f"upload:{upload_key}:{expires}".encode()
        expected = hmac.new(AUTH_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False


def _local_upload_url(request: Request, upload_key: str) -> str:
    # Respect X-Forwarded-Proto from reverse proxy (Caddy/ALB)
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost"))
    base = f"{proto}://{host}"
    token = _sign_upload_token(upload_key)
    return f"{base}/api/v1/uploads/local/{upload_key}?token={token}"


def _build_s3_client():
    if not S3_BUCKET:
        raise RuntimeError("STRIDEMATCH_UPLOAD_BUCKET env var is not set")
    if Config is None:
        raise RuntimeError(
            "Missing optional dependency 'botocore'. Install backend dependencies with "
            "'pip install -r backend/requirements.txt'."
        )

    return boto3_or_raise().client(
        "s3",
        region_name=AWS_REGION,
        endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
        ),
    )


def _validate_content_type(content_type: str, allow_images: bool = False) -> str:
    normalized = content_type.split(";")[0].strip().lower()
    allowed_types = ALLOWED_MEDIA_TYPES if allow_images else ALLOWED_VIDEO_TYPES

    if normalized not in allowed_types:
        if allow_images:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported format. Allowed: MP4, MOV, WEBM, JPG, PNG, WEBP.",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported video format. Allowed: MP4, MOV, WEBM.",
            )
    return normalized


# =========================================================
# Schemas
# =========================================================

class PresignUploadRequest(BaseModel):
    content_type: str = Field(
        ...,
        examples=["video/mp4", "video/quicktime", "video/webm", "image/jpeg", "image/png"],
        description="MIME type of the uploaded file (video or image)",
    )
    allow_images: bool = Field(
        default=False,
        description="Set to true to allow image uploads (for foot scan)",
    )


class PresignUploadResponse(BaseModel):
    upload_url: str
    s3_key: str
    expires_in: int


# =========================================================
# Endpoints
# =========================================================

@router.post(
    "/presign",
    response_model=PresignUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate a presigned S3 upload URL",
)
@limiter.limit("30/minute")
def presign_upload(
    payload: PresignUploadRequest,
    request: Request,
    claims=Depends(require_user),
) -> PresignUploadResponse:
    """
    Generate a presigned URL allowing the client to upload a video
    directly to S3 using HTTP PUT.

    The backend NEVER receives the video bytes.
    """

    # -----------------------------------------------------
    # Validate MIME type (security)
    # -----------------------------------------------------
    content_type = _validate_content_type(payload.content_type, allow_images=payload.allow_images)
    extension = ALLOWED_MEDIA_TYPES[content_type]

    # -----------------------------------------------------
    # Generate unique S3 object key
    # -----------------------------------------------------
    object_id = uuid.uuid4().hex
    s3_key = f"user-uploads/{object_id}.{extension}"

    if get_upload_mode() == "local":
        upload_url = _local_upload_url(request, s3_key)
        return PresignUploadResponse(
            upload_url=upload_url,
            s3_key=s3_key,
            expires_in=900,
        )

    # -----------------------------------------------------
    # Generate presigned PUT URL
    #
    # ⚠️ CRITICAL:
    # - DO NOT sign Content-Type
    # - Browser will send its own headers
    # -----------------------------------------------------
    try:
        upload_url = _build_s3_client().generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": s3_key,
            },
            ExpiresIn=900,  # 15 minutes
        )
    except Exception as exc:
        import logging
        logging.getLogger("stridematch").exception("Failed to generate presigned upload URL")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate presigned upload URL",
        ) from exc

    return PresignUploadResponse(
        upload_url=upload_url,
        s3_key=s3_key,
        expires_in=900,
    )


@router.put(
    "/local/{upload_key:path}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Upload a file directly to local storage",
)
async def upload_local(
    upload_key: str,
    request: Request,
    token: Optional[str] = Query(None),
) -> Response:
    """Local upload uses HMAC-signed tokens (issued by presign) instead of
    Bearer auth, mirroring how S3 presigned URLs work."""
    if get_upload_mode() != "local":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if not token or not _verify_upload_token(upload_key, token):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired upload token")

    content_type = request.headers.get("content-type", "")
    # Allow images for local uploads (foot scan feature)
    normalized = _validate_content_type(content_type, allow_images=True)
    expected_ext = ALLOWED_MEDIA_TYPES[normalized]

    if not upload_key.endswith(f".{expected_ext}"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload key does not match content type.",
        )

    try:
        target_path = build_local_upload_path(upload_key)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    target_path.parent.mkdir(parents=True, exist_ok=True)

    max_bytes = 500 * 1024 * 1024  # 500 MB
    bytes_written = 0
    with target_path.open("wb") as handle:
        async for chunk in request.stream():
            if chunk:
                bytes_written += len(chunk)
                if bytes_written > max_bytes:
                    target_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Upload exceeds maximum size (500 MB).",
                    )
                handle.write(chunk)

    return Response(status_code=status.HTTP_204_NO_CONTENT)
