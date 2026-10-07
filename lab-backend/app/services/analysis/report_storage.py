# app/services/analysis/report_storage.py
"""Persist generated PDF reports to the 'rapports' folder (local or S3)."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, NamedTuple, Optional

from app.utils.aws import boto3_or_raise

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
LOCAL_RAPPORTS_ROOT = _BACKEND_ROOT / "backend_storage" / "rapports"


class ReportInfo(NamedTuple):
    filename: str
    created_at: str


def _results_bucket() -> Optional[str]:
    return os.environ.get("STRIDEMATCH_RESULTS_BUCKET") or None


def _safe_id(value: Optional[str]) -> str:
    if not value:
        return "unknown"
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in value)


def build_report_filename(customer_id: Optional[str]) -> str:
    return f"{_safe_id(customer_id)}_{uuid.uuid4().hex}.pdf"


def report_filename_for_job(customer_id: Optional[str], job_id: str, lang: Optional[str] = None) -> str:
    """
    Deterministic filename for a given (job_id, lang) pair, so a report
    generated once can be looked up and re-served on later requests instead
    of being rebuilt from scratch every time.
    """
    suffix = _safe_id(job_id)
    if lang and lang != "fr":
        suffix = f"{suffix}_{lang}"
    return f"{_safe_id(customer_id)}_{suffix}.pdf"


def find_report_for_job(
    customer_id: Optional[str], job_id: str, lang: Optional[str] = None
) -> Optional[bytes]:
    """Return previously persisted PDF bytes for this job/lang, if any."""
    return load_report_pdf(report_filename_for_job(customer_id, job_id, lang))


def save_report_pdf(
    pdf_bytes: bytes,
    customer_id: Optional[str],
    job_id: str,
    lang: Optional[str] = None,
) -> str:
    """
    Save a generated report PDF into the 'rapports' folder, named
    '{customer_id}_{job_id}[_{lang}].pdf' (deterministic, so re-saving the
    same job/lang overwrites the existing copy instead of piling up
    duplicates). Returns the filename - callers serve the bytes directly to
    the requester and keep this copy as the persisted record.
    """
    filename = report_filename_for_job(customer_id, job_id, lang)
    bucket = _results_bucket()

    if bucket:
        key = f"rapports/{filename}"
        boto3_or_raise().client("s3").put_object(
            Bucket=bucket,
            Key=key,
            Body=pdf_bytes,
            ContentType="application/pdf",
            Metadata={"job_id": job_id},
        )
        return filename

    LOCAL_RAPPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    (LOCAL_RAPPORTS_ROOT / filename).write_bytes(pdf_bytes)
    return filename


def list_reports_for_customer(customer_id: Optional[str]) -> List[ReportInfo]:
    """
    List previously generated/sent reports for a customer, newest first.
    Matches the '{customer_id}_{uuid}.pdf' naming used by save_report_pdf.
    """
    prefix = f"{_safe_id(customer_id)}_"
    bucket = _results_bucket()

    if bucket:
        response = boto3_or_raise().client("s3").list_objects_v2(
            Bucket=bucket, Prefix=f"rapports/{prefix}"
        )
        reports = [
            ReportInfo(
                filename=obj["Key"].rsplit("/", 1)[-1],
                created_at=obj["LastModified"].isoformat(),
            )
            for obj in response.get("Contents", [])
        ]
        return sorted(reports, key=lambda r: r.created_at, reverse=True)

    if not LOCAL_RAPPORTS_ROOT.exists():
        return []
    reports = [
        ReportInfo(
            filename=path.name,
            created_at=datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
        )
        for path in LOCAL_RAPPORTS_ROOT.glob(f"{prefix}*.pdf")
    ]
    return sorted(reports, key=lambda r: r.created_at, reverse=True)


def delete_reports_for_job(customer_id: Optional[str], job_id: str) -> int:
    """
    Delete any locally persisted report PDF(s) for this job (one per
    language variant), so deleting the owning analysis session doesn't leave
    an orphaned PDF that still shows up in the customer's report history -
    that mismatch is exactly what made "Number of Scans" disagree with the
    "Last Scan" list after a delete.
    """
    deleted = 0
    bucket = _results_bucket()
    s3 = boto3_or_raise().client("s3") if bucket else None

    for lang in (None, "en"):
        filename = report_filename_for_job(customer_id, job_id, lang)
        if bucket:
            try:
                s3.delete_object(Bucket=bucket, Key=f"rapports/{filename}")
                deleted += 1
            except Exception:
                pass
        else:
            path = LOCAL_RAPPORTS_ROOT / filename
            if path.exists():
                path.unlink()
                deleted += 1

    return deleted


def load_report_pdf(filename: str) -> Optional[bytes]:
    """Load a previously saved report's bytes by its exact filename."""
    bucket = _results_bucket()
    if bucket:
        try:
            obj = boto3_or_raise().client("s3").get_object(Bucket=bucket, Key=f"rapports/{filename}")
            return obj["Body"].read()
        except boto3_or_raise().client("s3").exceptions.NoSuchKey:
            return None

    path = LOCAL_RAPPORTS_ROOT / filename
    if not path.exists():
        return None
    return path.read_bytes()
