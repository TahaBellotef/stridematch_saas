# app/services/foot_scan/runner.py
"""Main orchestrator for foot scan analysis pipeline."""
from __future__ import annotations

import io
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Tuple

import cv2
import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from app.services.upload_storage import get_upload_mode, build_local_upload_path
from app.utils.aws import boto3_or_raise
from app.schemas.foot_scan import (
    FootScanResult,
    CalibrationInfo,
    FootMeasurement,
    ShoeSizes,
    ConfidenceBreakdown,
    SizeRecommendation,
)
from app.models.foot_scan import FootScanSessionModel
from app.models.customer_profile import CustomerProfileModel

from .calibration import detect_a4_paper, A4DetectionResult
from .segmentation import segment_foot, SegmentationResult
from .measurement import measure_foot, FootMeasurementResult, draw_measurement_debug
from .sizing import convert_to_shoe_sizes, ShoeSizeResult
from .persistence import (
    update_job_status,
    update_job_result,
    save_debug_image,
    get_session_results,
)
from core.foot.homography import rectify_to_a4


logger = logging.getLogger(__name__)


# Configuration
GENERATE_DEBUG_IMAGES = os.environ.get("FOOT_SCAN_DEBUG_IMAGES", "true").lower() == "true"
MIN_CONFIDENCE = float(os.environ.get("FOOT_SCAN_MIN_CONFIDENCE", "0.5"))


def run_foot_scan_analysis(
    db: Session,
    job_id: str,
    s3_key: str,
    foot: str,
) -> FootScanResult:
    """
    Run the complete foot scan analysis pipeline.

    Pipeline:
    1. Load image from S3 or local storage
    2. Detect A4 paper for calibration
    3. Rectify image (perspective correction)
    4. Segment foot from background
    5. Measure foot length and width using PCA
    6. Convert to shoe sizes
    7. Calculate confidence score
    8. Save results and debug image

    Args:
        db: Database session
        job_id: Job ID for this scan
        s3_key: S3 key or local path to input image
        foot: "left" or "right"

    Returns:
        FootScanResult with measurements and sizes
    """
    try:
        # Update status to processing
        update_job_status(db, job_id, "processing")

        # Step 1: Load image
        logger.info(f"[{job_id}] Loading image: {s3_key}")
        image = _load_image(s3_key)
        if image is None:
            raise ValueError(f"Failed to load image: {s3_key}")

        # Step 2: Detect A4 paper
        logger.info(f"[{job_id}] Detecting A4 paper...")
        a4_result, _ = detect_a4_paper(image, debug=False)

        if not a4_result.detected:
            raise ValueError("Could not detect A4 paper in image. Please ensure the paper is fully visible.")

        logger.info(f"[{job_id}] A4 detected: {a4_result.orientation}, px/mm: {a4_result.px_per_mm:.2f}")

        # Step 3: Rectify image (keeps a floor margin around the paper so a
        # foot placed beside it - not on top of it - isn't cropped away)
        logger.info(f"[{job_id}] Rectifying image...")
        rectified, H, px_per_mm, paper_rect_px, valid_mask = rectify_to_a4(
            image,
            a4_result.corners,
            a4_result.orientation,
            scale=1.0,
        )

        # Step 4: Segment foot (floor area beside the paper, excluding the
        # paper interior and any synthetic border-fill outside the photo)
        logger.info(f"[{job_id}] Segmenting foot...")
        seg_result = segment_foot(rectified, paper_rect=paper_rect_px, valid_mask=valid_mask)

        if not seg_result.success:
            raise ValueError("Could not segment foot from image. Please ensure your foot is clearly visible beside the A4 paper.")

        logger.info(f"[{job_id}] Foot segmented: {seg_result.area:.0f} pixels")

        # Step 5: Measure foot
        logger.info(f"[{job_id}] Measuring foot...")
        meas_result = measure_foot(seg_result.mask, px_per_mm, valid_mask=valid_mask)

        if not meas_result.success:
            detail = meas_result.warnings[-1] if meas_result.warnings else "Could not measure foot dimensions."
            raise ValueError(detail)

        logger.info(f"[{job_id}] Measurements: {meas_result.length_cm:.1f}cm x {meas_result.width_cm:.1f}cm")

        # Step 6: Convert to shoe sizes
        logger.info(f"[{job_id}] Converting to shoe sizes...")
        sizes = convert_to_shoe_sizes(meas_result.length_cm, meas_result.width_cm)

        logger.info(f"[{job_id}] Sizes: EU {sizes.eu}, US Men {sizes.us_men}")

        # Step 7: Calculate overall confidence
        confidence = _compute_overall_confidence(a4_result, seg_result, meas_result)

        # Step 8: Generate and save debug image
        debug_url = None
        if GENERATE_DEBUG_IMAGES:
            logger.info(f"[{job_id}] Generating debug image...")
            debug_img = draw_measurement_debug(rectified, meas_result, seg_result.mask)
            debug_bytes = _encode_image(debug_img)
            debug_url = save_debug_image(debug_bytes, job_id)

        # Build result objects
        calibration_info = CalibrationInfo(
            method="a4_paper",
            detected=True,
            orientation=a4_result.orientation,
            px_per_mm=px_per_mm,
            confidence=a4_result.confidence,
            corners=a4_result.corners.tolist() if a4_result.corners is not None else None,
        )

        measurement_info = FootMeasurement(
            length_px=meas_result.length_px,
            width_px=meas_result.width_px,
            length_mm=meas_result.length_mm,
            width_mm=meas_result.width_mm,
            length_cm=meas_result.length_cm,
            width_cm=meas_result.width_cm,
            axis=list(meas_result.axis) if meas_result.axis else None,
        )

        sizes_info = ShoeSizes(
            eu=sizes.eu,
            us_men=sizes.us_men,
            us_women=sizes.us_women,
            uk=sizes.uk,
            jp=sizes.jp,
        )

        # Combine all warnings
        all_warnings = (
            a4_result.warnings +
            seg_result.warnings +
            meas_result.warnings
        )

        confidence_info = ConfidenceBreakdown(
            overall=confidence,
            calibration=a4_result.confidence,
            segmentation=seg_result.confidence,
            measurement=meas_result.confidence,
            warnings=all_warnings,
        )

        # Save to database
        update_job_result(
            db,
            job_id,
            calibration=calibration_info.model_dump(),
            measurement=measurement_info.model_dump(),
            sizes=sizes_info.model_dump(),
            confidence=confidence_info.model_dump(),
            debug_image_url=debug_url,
        )

        logger.info(f"[{job_id}] Analysis complete. Confidence: {confidence:.2f}")

        # Return result
        return FootScanResult(
            job_id=job_id,
            session_id="",  # Will be filled by caller
            foot=foot,
            status="completed",
            calibration=calibration_info,
            measurement=measurement_info,
            sizes=sizes_info,
            confidence=confidence_info,
            debug_image_url=debug_url,
            created_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc),
        )

    except Exception as e:
        logger.error(f"[{job_id}] Analysis failed: {e}")

        # Update job as failed
        update_job_status(db, job_id, "failed", error_message=str(e))

        return FootScanResult(
            job_id=job_id,
            session_id="",
            foot=foot,
            status="failed",
            error_message=str(e),
            created_at=datetime.now(timezone.utc),
        )


def _load_image(s3_key: str) -> Optional[np.ndarray]:
    """Load image from S3 or local storage."""
    mode = get_upload_mode()

    if mode == "local":
        local_path = build_local_upload_path(s3_key)
        if not local_path.exists():
            return None
        image = cv2.imread(str(local_path))
        return image

    # S3 mode
    bucket = os.environ.get("STRIDEMATCH_UPLOAD_BUCKET")
    if not bucket:
        return None

    s3 = boto3_or_raise().client("s3")

    try:
        response = s3.get_object(Bucket=bucket, Key=s3_key)
        image_bytes = response["Body"].read()

        # Decode image
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return image

    except Exception as e:
        logger.error(f"Failed to load image from S3: {e}")
        return None


def _encode_image(image: np.ndarray, quality: int = 85) -> bytes:
    """Encode image to JPEG bytes."""
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    _, buffer = cv2.imencode(".jpg", image, encode_params)
    return buffer.tobytes()


def _compute_overall_confidence(
    a4_result: A4DetectionResult,
    seg_result: SegmentationResult,
    meas_result: FootMeasurementResult,
) -> float:
    """
    Compute overall confidence score from all pipeline stages.

    Weights:
    - Calibration: 30% (without good calibration, measurements are unreliable)
    - Segmentation: 30% (need good foot isolation)
    - Measurement: 40% (final measurement quality)
    """
    confidence = (
        a4_result.confidence * 0.30 +
        seg_result.confidence * 0.30 +
        meas_result.confidence * 0.40
    )

    # Apply penalties
    if seg_result.touches_edge:
        confidence *= 0.85

    # Count warnings
    total_warnings = (
        len(a4_result.warnings) +
        len(seg_result.warnings) +
        len(meas_result.warnings)
    )
    if total_warnings > 0:
        confidence *= max(0.7, 1.0 - total_warnings * 0.05)

    return min(1.0, max(0.0, confidence))


def _format_shoe_size(value: float) -> str:
    """Mirrors the frontend's half-step size formatting (e.g. 42.0 -> "42", 42.5 -> "42.5")."""
    return str(int(value)) if float(value).is_integer() else f"{value:.1f}"


def _sync_customer_shoe_size(db: Session, session_id: str, recommendation: SizeRecommendation) -> None:
    """
    Once a foot scan session completes with a customer attached, write the
    measured EU size onto their profile so it reflects a real measurement
    instead of a self-reported guess.
    """
    session_model = db.get(FootScanSessionModel, session_id)
    if not session_model or not session_model.customer_id:
        return

    customer_id = session_model.customer_id
    profile = (
        db.query(CustomerProfileModel)
        .filter(
            (CustomerProfileModel.id == customer_id)
            | (CustomerProfileModel.customer_id == customer_id)
        )
        .one_or_none()
    )
    if not profile:
        logger.warning(f"[foot-scan] No customer profile found for customer_id={customer_id}, skipping size sync")
        return

    profile.shoe_size = _format_shoe_size(recommendation.eu)
    profile.shoe_size_unit = "EU"
    db.commit()
    logger.info(f"[foot-scan] Updated customer {customer_id} shoe_size to EU {profile.shoe_size}")


def run_analysis_job(
    session_id: str,
    job_id: str,
    s3_key: str,
    foot: str,
    db_url: str,
) -> None:
    """
    Background job entry point for foot scan analysis.

    This is called from a background thread by the router.

    Args:
        session_id: Session ID
        job_id: Job ID
        s3_key: S3 key for input image
        foot: "left" or "right"
        db_url: Database URL for creating a new session
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(db_url, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)

    with SessionLocal() as db:
        result = run_foot_scan_analysis(db, job_id, s3_key, foot)

        # Check if both feet are now complete
        session_result = get_session_results(db, session_id)

        if session_result:
            # The get_session_results function automatically computes
            # and saves the recommendation when both feet are complete
            logger.info(f"[{job_id}] Session status: {session_result.status}")

            if session_result.status == "completed" and session_result.recommendation:
                _sync_customer_shoe_size(db, session_id, session_result.recommendation)
