# app/services/analysis/report_pdf.py
"""Generate a branded PDF version of the biomechanical analysis report (no video)."""
from __future__ import annotations

from pathlib import Path
from io import BytesIO
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.schemas import AnalysisResult

_NA = "—"
_ASSETS_DIR = Path(__file__).resolve().parent / "assets"
_LOGO_PATH = _ASSETS_DIR / "logo.png"

# --- StrideMatch brand tokens (mirrors lab-frontend globals.css / tailwind.config.js) ---
_BRAND = colors.HexColor("#6F41E8")        # --sm-primary
_BRAND_DARK = colors.HexColor("#3B1EC5")   # --sm-primary-dark
_INK = colors.HexColor("#211D31")          # near-black heading ink
_PANEL_DARK = colors.HexColor("#28243D")   # --sm-fill (dark card bg)
_LAVENDER_TEXT = colors.HexColor("#E8E6F1")  # --sm-text (on dark)
_LAVENDER_MUTED = colors.HexColor("#B9B4C6")  # --sm-text-muted (on dark)
_MUTED = colors.HexColor("#6B7280")
_FAINT = colors.HexColor("#9CA3AF")
_TINT_BG = colors.HexColor("#F8F7FC")
_TINT_BORDER = colors.HexColor("#E5E1F5")

_SEVERITY_STYLES = {
    "info": ("INFO", colors.HexColor("#3B82F6")),
    "focus": ("FOCUS", colors.HexColor("#A78BFA")),
    "warning": ("WARNING", colors.HexColor("#F59E0B")),
    "critical": ("CRITICAL", colors.HexColor("#EF4444")),
}

PAGE_MARGIN = 18 * mm
CONTENT_WIDTH = A4[0] - 2 * PAGE_MARGIN


def _fmt(value: Optional[Any], suffix: str = "") -> str:
    if value is None:
        return _NA
    if isinstance(value, float):
        return f"{value:.1f}{suffix}"
    return f"{value}{suffix}"


def _esc(value: Optional[str]) -> str:
    return escape(value) if value else ""


def _rear_metric(rear_metrics: Optional[Dict[str, Any]], keys: List[str]) -> Optional[float]:
    if not rear_metrics:
        return None
    for key in keys:
        value = rear_metrics.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def _draw_footer(canvas, doc) -> None:
    canvas.saveState()
    canvas.setStrokeColor(_TINT_BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(PAGE_MARGIN, 14 * mm, A4[0] - PAGE_MARGIN, 14 * mm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(_FAINT)
    canvas.drawString(PAGE_MARGIN, 9 * mm, "StrideMatch — Biomechanical Analysis Report")
    canvas.drawRightString(A4[0] - PAGE_MARGIN, 9 * mm, f"Page {doc.page}")
    canvas.restoreState()


def _section_heading(text: str, style: ParagraphStyle) -> Table:
    """A heading with a short brand-purple accent bar to its left."""
    bar = Table([[""]], colWidths=[3 * mm], rowHeights=[6 * mm])
    bar.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _BRAND),
        ("ROUNDEDCORNERS", [2, 2, 2, 2]),
    ]))
    heading = Table(
        [[bar, Paragraph(text, style)]],
        colWidths=[5 * mm, None],
    )
    heading.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return heading


def _make_table(rows: List[List[str]]) -> Table:
    table = Table(rows, colWidths=[70 * mm, CONTENT_WIDTH - 70 * mm])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), _BRAND_DARK),
        ("TEXTCOLOR", (1, 0), (1, -1), _INK),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, _TINT_BG]),
        ("BOX", (0, 0), (-1, -1), 0.75, _TINT_BORDER),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, _TINT_BORDER),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    return table


def _quick_fact(label: str, value: str) -> Paragraph:
    style = ParagraphStyle(
        "QuickFact", fontName="Helvetica", fontSize=10, leading=14,
        textColor=_LAVENDER_TEXT, alignment=TA_RIGHT,
    )
    return Paragraph(
        f'<font color="#B9B4C6" size="8">{escape(label.upper())}</font><br/>'
        f'<b>{escape(value)}</b>',
        style,
    )


def _score_panel(result: AnalysisResult, quick_facts: List[tuple[str, str]]) -> Table:
    label_style = ParagraphStyle(
        "ScoreLabel", fontName="Helvetica", fontSize=11, leading=14, textColor=_LAVENDER_MUTED,
    )
    value_style = ParagraphStyle(
        "ScoreValue", fontName="Helvetica-Bold", fontSize=34, leading=40, textColor=colors.white,
    )
    score_value = _fmt(result.energy_score)
    score_cell = [
        Paragraph("YOUR RUNNING SCORE", label_style),
        Spacer(1, 4),
        Paragraph(
            f'{escape(score_value)}<font color="#CBD5E1" size="16">/100</font>',
            value_style,
        ),
    ]
    facts_cell = [_quick_fact(label, value) for label, value in quick_facts if value]
    panel = Table(
        [[score_cell, facts_cell]],
        colWidths=[100 * mm, CONTENT_WIDTH - 100 * mm],
    )
    panel.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), _PANEL_DARK),
        ("ROUNDEDCORNERS", [14, 14, 14, 14]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (0, 0), 16),
        ("RIGHTPADDING", (1, 0), (1, 0), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 16),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ]))
    return panel


def _insight_card(title: str, summary: str, measured: Optional[str], severity: str, styles) -> Table:
    label, badge_color = _SEVERITY_STYLES.get(severity, _SEVERITY_STYLES["info"])
    badge_style = ParagraphStyle(
        "Badge", fontName="Helvetica-Bold", fontSize=8, leading=10,
        textColor=colors.white, alignment=1,
    )
    badge = Table([[Paragraph(label, badge_style)]], colWidths=[22 * mm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), badge_color),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))

    body_text = f"<b>{escape(title)}</b><br/><font color=\"#4B5563\">{escape(summary)}</font>"
    if measured:
        body_text += f'<br/><font color="#9CA3AF" size="8">{escape(measured)}</font>'
    body_style = ParagraphStyle("InsightBody", parent=styles["BodyText"], fontSize=10, leading=14)
    body = Paragraph(body_text, body_style)

    card = Table([[badge, body]], colWidths=[26 * mm, CONTENT_WIDTH - 26 * mm])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.75, _TINT_BORDER),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return card


def _tip_card(tip: str, body_style: ParagraphStyle) -> Table:
    dot = Table([[""]], colWidths=[3 * mm], rowHeights=[3 * mm])
    dot.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#11C1C4")),
        ("ROUNDEDCORNERS", [2, 2, 2, 2]),
    ]))
    card = Table([[dot, Paragraph(tip, body_style)]], colWidths=[8 * mm, CONTENT_WIDTH - 8 * mm])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F1FBFB")),
        ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#D6F3F3")),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return card


def build_report_pdf(
    result: AnalysisResult,
    customer_id: Optional[str] = None,
    customer_name: Optional[str] = None,
    customer_email: Optional[str] = None,
) -> bytes:
    """
    Build a branded PDF report covering the same metrics shown on the results
    page (running score, key metrics, knee/ground-contact/body-mechanics or
    rear analysis, technical remarks, improvement tips) - everything except
    the video.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=PAGE_MARGIN,
        bottomMargin=PAGE_MARGIN + 6 * mm,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        title=f"StrideMatch Report {result.job_id}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=18, leading=22, textColor=_INK, alignment=TA_RIGHT, spaceAfter=0,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle", parent=styles["BodyText"], fontSize=9.5,
        textColor=_MUTED, alignment=TA_RIGHT, spaceBefore=2,
    )
    section_style = ParagraphStyle(
        "Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=12.5, leading=16, textColor=_INK,
    )
    body_style = styles["BodyText"]
    meta_style = ParagraphStyle("Meta", parent=styles["BodyText"], textColor=_MUTED, fontSize=9.5)

    elements: List[Any] = []

    # --- Branded header ---
    logo_cell: Any = ""
    if _LOGO_PATH.exists():
        logo_width = 42 * mm
        logo_height = logo_width * (398 / 1755)
        logo_cell = Image(str(_LOGO_PATH), width=logo_width, height=logo_height)

    header_text = [
        Paragraph("Biomechanical Analysis Report", title_style),
        Paragraph(result.analysis_type.upper() + " VIEW ANALYSIS" if result.analysis_type else "", subtitle_style),
    ]
    header = Table([[logo_cell, header_text]], colWidths=[60 * mm, CONTENT_WIDTH - 60 * mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(header)
    elements.append(Spacer(1, 8))

    rule = Table([[""]], colWidths=[CONTENT_WIDTH], rowHeights=[1.4])
    rule.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), _BRAND)]))
    elements.append(rule)
    elements.append(Spacer(1, 10))

    meta_bits = []
    if customer_name:
        meta_bits.append(f'<font color="#211D31"><b>{_esc(customer_name)}</b></font>')
    elif customer_id:
        meta_bits.append(f'<font color="#211D31"><b>Customer {_esc(customer_id)}</b></font>')
    if customer_email:
        meta_bits.append(_esc(customer_email))
    meta_bits.append(f"Job ID: {_esc(result.job_id)}")
    meta_bits.append(result.created_at.strftime("%d %b %Y · %H:%M"))
    elements.append(Paragraph("&nbsp;&nbsp;•&nbsp;&nbsp;".join(meta_bits), meta_style))
    elements.append(Spacer(1, 16))

    # --- Running score panel ---
    is_rear = result.analysis_type == "rear"
    if is_rear:
        quick_facts = [
            ("Rear Quality", result.rear_quality or _NA),
            ("Cadence", _fmt(getattr(result.bio, "cadence", None), " spm")),
        ]
    else:
        quick_facts = [
            ("Motion Type", result.motion_type or _NA),
            ("Strike Pattern", result.strike_pattern or _NA),
        ]
    elements.append(_score_panel(result, quick_facts))
    elements.append(Spacer(1, 18))

    if not is_rear:
        # --- Key metrics ---
        bio = result.bio
        cadence = getattr(bio, "cadence", None)
        sym = getattr(bio, "sym", None)
        elements.append(_section_heading("Key Metrics", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Cadence", _fmt(cadence, " spm")],
            ["Energy Score", _fmt(result.energy_score)],
            ["Motion Type", result.motion_type or _NA],
            ["Strike Pattern", result.strike_pattern or _NA],
            ["Symmetry", _fmt(sym, "%")],
        ]))
        elements.append(Spacer(1, 14))

        # --- Knee analysis ---
        elements.append(_section_heading("Knee Analysis", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Left Knee", _fmt(getattr(bio, "knee_left_mean", None), "°")],
            ["Right Knee", _fmt(getattr(bio, "knee_right_mean", None), "°")],
            ["Average", _fmt(getattr(bio, "knee_mean", None), "°")],
        ]))
        elements.append(Spacer(1, 14))

        # --- Ground contact ---
        elements.append(_section_heading("Ground Contact", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Left Contact", _fmt(result.contact_time_left, " ms")],
            ["Right Contact", _fmt(result.contact_time_right, " ms")],
            ["Average", _fmt(getattr(bio, "contact_time", None), " ms")],
            ["Flight Ratio", _fmt(result.flight_ratio, "%")],
        ]))
        elements.append(Spacer(1, 14))

        # --- Body mechanics ---
        elements.append(_section_heading("Body Mechanics", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Vertical Movement", _fmt(getattr(bio, "osc", None), " cm")],
            ["Trunk Lean", _fmt(result.trunk_lean, "°")],
            ["Trunk Stability", _fmt(result.trunk_stability)],
            ["Arm Coordination", _fmt(result.arm_swing)],
            ["Hip Mobility", _fmt(result.hip_mobility)],
        ]))
    else:
        rear_metrics = result.rear_metrics
        drift = _rear_metric(rear_metrics, ["drift_norm", "ankle_knee_drift_norm"])
        knee_left = _rear_metric(rear_metrics, ["left_knee_offset_norm"])
        knee_right = _rear_metric(rear_metrics, ["right_knee_offset_norm"])
        knee_avg = _rear_metric(rear_metrics, ["knee_alignment_norm", "knee_width_norm"])
        ankle_left = _rear_metric(rear_metrics, ["left_ankle_offset_norm"])
        ankle_right = _rear_metric(rear_metrics, ["right_ankle_offset_norm"])
        ankle_avg = _rear_metric(rear_metrics, ["ankle_alignment_norm", "ankle_width_norm"])

        def _pct(v: Optional[float]) -> str:
            return f"{v * 100:.1f}%" if v is not None else _NA

        elements.append(_section_heading("Rear Analysis Summary", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Rear Quality", result.rear_quality or _NA],
            ["Cadence", _fmt(getattr(result.bio, "cadence", None), " spm")],
        ]))
        elements.append(Spacer(1, 14))

        elements.append(_section_heading("Knee Analysis", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Left Knee Offset", _pct(knee_left)],
            ["Right Knee Offset", _pct(knee_right)],
            ["Average", _pct(knee_avg)],
        ]))
        elements.append(Spacer(1, 14))

        elements.append(_section_heading("Ground Contact", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Left Ankle Offset", _pct(ankle_left)],
            ["Right Ankle Offset", _pct(ankle_right)],
            ["Average", _pct(ankle_avg)],
        ]))
        elements.append(Spacer(1, 14))

        elements.append(_section_heading("Body Mechanics", section_style))
        elements.append(Spacer(1, 8))
        elements.append(_make_table([
            ["Overall Alignment", _pct(drift)],
            ["Knee Stability", _pct(knee_avg)],
            ["Ankle Stability", _pct(ankle_avg)],
            ["Arm Coordination", _fmt(result.arm_swing)],
            ["Hip Mobility", _fmt(result.hip_mobility)],
        ]))

    elements.append(Spacer(1, 16))

    # --- Technical remarks (insights) ---
    elements.append(_section_heading("Technical Remarks", section_style))
    elements.append(Spacer(1, 8))
    if result.insights:
        for insight in result.insights:
            elements.append(KeepTogether(_insight_card(
                insight.title, insight.summary, insight.measured, insight.severity, styles,
            )))
            elements.append(Spacer(1, 8))
    elif result.remarks:
        for remark in result.remarks:
            elements.append(Paragraph(f"• {_esc(remark)}", body_style))
    else:
        elements.append(Paragraph(_NA, body_style))

    elements.append(Spacer(1, 8))

    # --- Improvement tips ---
    elements.append(_section_heading("Improvement Tips", section_style))
    elements.append(Spacer(1, 8))
    tip_style = ParagraphStyle("TipBody", parent=body_style, fontSize=10, leading=14, textColor=_INK)
    if result.improvement_tips:
        for tip in result.improvement_tips:
            elements.append(_tip_card(_esc(tip), tip_style))
            elements.append(Spacer(1, 6))
    else:
        elements.append(Paragraph(_NA, body_style))

    doc.build(elements, onFirstPage=_draw_footer, onLaterPages=_draw_footer)
    return buffer.getvalue()
