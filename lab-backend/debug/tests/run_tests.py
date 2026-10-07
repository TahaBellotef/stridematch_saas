"""
Runs the full foot-scan pipeline (A4 detection -> rectify -> segment ->
measure) against every image in debug/tests/samples/, writes a 10-stage
debug dump per image under debug/tests/output/<name>/, and writes a
summary to debug/tests/report.md.

Usage (from lab-backend/):
    .venv/Scripts/python.exe debug/tests/run_tests.py
"""
import sys
from pathlib import Path

import cv2

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from app.services.foot_scan.calibration import detect_a4_paper
from core.foot.homography import rectify_to_a4
from app.services.foot_scan.segmentation import segment_foot
from app.services.foot_scan.measurement import measure_foot
from app.services.foot_scan.sizing import convert_to_shoe_sizes

SAMPLES_DIR = Path(__file__).resolve().parent / "samples"
OUTPUT_DIR = Path(__file__).resolve().parent / "output"
REPORT_PATH = Path(__file__).resolve().parent / "report.md"


def run_one(image_path: Path) -> dict:
    name = image_path.stem
    out_dir = OUTPUT_DIR / name
    row = {"name": name, "success": False, "reason": ""}

    image = cv2.imread(str(image_path))
    if image is None:
        row["reason"] = "Could not read image file"
        return row

    a4_result, _ = detect_a4_paper(image, debug=False)
    if not a4_result.detected:
        row["reason"] = "A4 paper not detected"
        return row

    rectified, _H, px_per_mm, paper_rect_px, valid_mask = rectify_to_a4(
        image, a4_result.corners, a4_result.orientation, scale=1.0,
    )

    seg_result = segment_foot(rectified, paper_rect=paper_rect_px, valid_mask=valid_mask)
    if not seg_result.success:
        row["reason"] = "Segmentation failed: " + "; ".join(seg_result.warnings)
        return row

    result = measure_foot(
        seg_result.mask, px_per_mm,
        valid_mask=valid_mask, image=rectified, debug_dir=out_dir,
    )

    row["length_mm"] = round(result.length_mm, 1)
    row["width_mm"] = round(result.width_mm, 1)
    row["confidence"] = round(result.confidence, 2)
    row["warnings"] = "; ".join(result.warnings)

    if not result.success:
        row["reason"] = result.warnings[-1] if result.warnings else "Measurement failed"
        return row

    sizes = convert_to_shoe_sizes(result.length_cm, result.width_cm)
    row["eu"] = sizes.eu
    row["success"] = True
    return row


def main() -> None:
    images = sorted(
        p for p in SAMPLES_DIR.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )
    if not images:
        print(f"No sample images found in {SAMPLES_DIR}")
        return

    rows = []
    for image_path in images:
        print(f"--- {image_path.name} ---")
        row = run_one(image_path)
        rows.append(row)
        for key, value in row.items():
            if key != "name":
                print(f"  {key}: {value}")

    lines = ["# Foot measurement test report", ""]
    lines.append("| image | success | length_mm | width_mm | EU | confidence | reason/warnings |")
    lines.append("|---|---|---|---|---|---|---|")
    for row in rows:
        lines.append(
            "| {name} | {success} | {length_mm} | {width_mm} | {eu} | {confidence} | {reason} |".format(
                name=row.get("name", ""),
                success=row.get("success", False),
                length_mm=row.get("length_mm", "-"),
                width_mm=row.get("width_mm", "-"),
                eu=row.get("eu", "-"),
                confidence=row.get("confidence", "-"),
                reason=row.get("reason", "") or row.get("warnings", ""),
            )
        )
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nReport written to {REPORT_PATH}")


if __name__ == "__main__":
    main()
