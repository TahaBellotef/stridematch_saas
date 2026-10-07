from __future__ import annotations

import os
from pathlib import Path


_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_LOCAL_UPLOAD_ROOT = _BACKEND_ROOT / "backend_storage" / "uploads"


def get_upload_mode() -> str:
    mode = os.environ.get("STRIDEMATCH_UPLOAD_MODE", "").strip().lower()
    if mode:
        return mode
    if os.environ.get("STRIDEMATCH_UPLOAD_BUCKET"):
        return "s3"
    return "local"


def get_local_upload_root() -> Path:
    configured = os.environ.get("STRIDEMATCH_LOCAL_UPLOAD_ROOT")
    if configured:
        return Path(configured).expanduser()
    return _DEFAULT_LOCAL_UPLOAD_ROOT


def ensure_local_upload_root() -> Path:
    root = get_local_upload_root()
    root.mkdir(parents=True, exist_ok=True)
    return root


def build_local_upload_path(upload_key: str) -> Path:
    root = ensure_local_upload_root().resolve()
    target = (root / upload_key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("Invalid upload key") from exc
    return target
