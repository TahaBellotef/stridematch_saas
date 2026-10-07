# app/services/analysis/insights.py
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Literal

from app.schemas import InsightItem
from app.utils.normalize import safe_float

AnalysisType = Literal["rear", "side"]
Lang = Literal["fr", "en"]

DEFAULT_LANG: Lang = "fr"


# -----------------------------
# Localized strings
# -----------------------------
# Each insight keys into STRINGS[lang][key]. Adding a language: copy one of
# the inner dicts and translate values.

STRINGS: Dict[str, Dict[str, str]] = {
    "fr": {
        # Pronation
        "pronation_title": "Pronation du pied",
        "pronation_measured_neutral": "Neutre",
        "pronation_measured_pronation": "Pronation",
        "pronation_measured_supination": "Supination",
        "pronation_summary_neutral": "Votre alignement en vue arrière suggère un schéma de roulement neutre.",
        "pronation_summary_pronation": (
            "Votre alignement en vue arrière suggère que le pied/cheville roule plus vers l'intérieur que la moyenne. "
            "Cela peut être normal pour certains coureurs, mais peut augmenter la charge sur certaines structures."
        ),
        "pronation_summary_supination": (
            "Votre alignement en vue arrière suggère que le pied roule vers l'extérieur (supination). "
            "Certains coureurs s'en sortent très bien ainsi, mais la gestion des impacts est importante."
        ),
        "pronation_rec_neutral_1": "Continuez à renforcer progressivement — une mécanique neutre bénéficie quand même du travail des mollets et des pieds.",
        "pronation_rec_pronation_1": "Ajoutez 2×/semaine des élévations de mollets et du travail du tibial (lent, contrôlé).",
        "pronation_rec_pronation_2": "Essayez de courts exercices d'équilibre pieds nus (30–45s/côté) pour améliorer le contrôle du pied.",
        "pronation_rec_supination_1": "Ajoutez de la mobilité douce des chevilles/mollets après les courses (60–90s/côté).",
        "pronation_rec_supination_2": "Augmentez le volume progressivement et soyez attentif aux signaux de fatigue du bas de la jambe.",
        # Drift
        "drift_title": "Dérive d'alignement (vue arrière)",
        "drift_summary_inward": "Vos hanches passent légèrement à l'intérieur des chevilles — cela peut corréler avec un effondrement vers l'intérieur.",
        "drift_summary_outward": "Vos hanches passent légèrement à l'extérieur des chevilles — cela peut modifier les schémas de charge.",
        "drift_summary_centered": "Vos hanches et chevilles sont assez bien centrées en vue arrière.",
        "drift_rec_inward_1": "Ajoutez du renforcement unilatéral (step-downs, squats fendus) 2×/semaine.",
        "drift_rec_outward_1": "Ajoutez du travail de stabilité latérale (band walks, planches latérales) 2×/semaine.",
        "drift_rec_centered_1": "Continuez à construire la régularité — un bon alignement progresse avec le renforcement et la tolérance au volume.",
        # Knee vs ankle
        "knee_ankle_title": "Suivi genoux vs chevilles",
        "knee_ankle_summary_inward": "Les genoux semblent suivre légèrement à l'intérieur par rapport à la largeur des chevilles (tendance possible au valgus).",
        "knee_ankle_summary_wide": "Les genoux suivent relativement larges par rapport aux chevilles — souvent stable, mais le contexte compte.",
        "knee_ankle_summary_balanced": "Le suivi genou/cheville semble assez équilibré en vue arrière.",
        "knee_ankle_rec_inward_1": "Essayez les step-downs et le travail du moyen fessier (band walks) 2×/semaine.",
        "knee_ankle_rec_wide_1": "Maintenez un renforcement équilibré (fessiers + mollets) pour conserver le contrôle.",
        "knee_ankle_rec_balanced_1": "Maintenez la régularité avec du renforcement de base et une progression d'entraînement graduelle.",
        # Trunk stability
        "trunk_stability_title": "Stabilité du tronc",
        "trunk_stability_summary": "À quel point votre haut du corps reste constant pendant la course. Une stabilité plus faible peut gaspiller de l'énergie et augmenter la fatigue.",
        "trunk_stability_rec_1": "Essayez une courte routine de gainage 2 à 3×/semaine (dead bug, planche latérale).",
        "trunk_stability_rec_2": "Sur les courses faciles, pensez « épaules calmes » et mains détendues.",
        # Arm swing
        "arm_swing_title": "Coordination du balancement des bras",
        "arm_swing_summary": "À quel point votre rythme de bras est équilibré gauche/droite, contribuant à la stabilité et à l'allure.",
        "arm_swing_rec_1": "Courez grand et laissez les bras se balancer vers l'arrière (pas en travers du corps).",
        "arm_swing_rec_2": "Ajoutez 4×20s de strides relâchés en vous concentrant sur la symétrie.",
        # Hip mobility
        "hip_mobility_title": "Mobilité de la hanche",
        "hip_mobility_summary": "Un indicateur de la liberté d'extension de vos hanches durant la foulée.",
        "hip_mobility_rec_1": "Ajoutez de la mobilité des fléchisseurs de hanche après la course (60–90s par côté).",
        "hip_mobility_rec_2": "Essayez une activation des fessiers (ponts, band walks) avant de courir.",
        # Trunk lean
        "trunk_lean_title": "Inclinaison du tronc",
        "trunk_lean_summary": "Inclinaison vers l'avant du torse pendant la course.",
        "trunk_lean_rec_1": "Une légère inclinaison vers l'avant depuis les chevilles est souvent fluide et efficace.",
        # Oscillation
        "oscillation_title": "Oscillation verticale",
        "oscillation_summary": "À quel point votre corps monte et descend par foulée (rebond).",
        "oscillation_rec_1": "Moins de rebond signifie généralement une meilleure efficacité (le contexte compte : vitesse, fatigue, terrain).",
    },
    "en": {
        "pronation_title": "Foot pronation",
        "pronation_measured_neutral": "Neutral",
        "pronation_measured_pronation": "Pronation",
        "pronation_measured_supination": "Supination",
        "pronation_summary_neutral": "Your rear-view alignment suggests a neutral foot roll pattern.",
        "pronation_summary_pronation": (
            "Your rear-view alignment suggests the foot/ankle rolls inward more than average. "
            "This can be normal for some runners, but it may increase load on certain structures."
        ),
        "pronation_summary_supination": (
            "Your rear-view alignment suggests the foot rolls outward (supination). "
            "Some runners do great here, but impact management matters."
        ),
        "pronation_rec_neutral_1": "Keep building strength gradually—neutral mechanics still benefit from calf + foot strength work.",
        "pronation_rec_pronation_1": "Add 2×/week calf raises + tibialis work (slow, controlled).",
        "pronation_rec_pronation_2": "Try short barefoot balance drills (30–45s/side) to improve foot control.",
        "pronation_rec_supination_1": "Add gentle mobility for ankles/calves after runs (60–90s/side).",
        "pronation_rec_supination_2": "Progress volume gradually and pay attention to lower-leg soreness signals.",
        "drift_title": "Rear-view alignment drift",
        "drift_summary_inward": "Your hips track slightly inside relative to the ankles—this can correlate with inward collapse.",
        "drift_summary_outward": "Your hips track slightly outside relative to the ankles—this can change loading patterns.",
        "drift_summary_centered": "Your hips and ankles track fairly centered in the rear view.",
        "drift_rec_inward_1": "Add single-leg strength (step-downs, split squats) 2×/week.",
        "drift_rec_outward_1": "Add lateral stability work (band walks, side planks) 2×/week.",
        "drift_rec_centered_1": "Keep building consistency—good alignment tends to improve with strength + mileage tolerance.",
        "knee_ankle_title": "Knee vs ankle tracking",
        "knee_ankle_summary_inward": "Knees appear to track slightly inside relative to ankle width (possible valgus tendency).",
        "knee_ankle_summary_wide": "Knees track relatively wide vs ankles—often stable, but context matters.",
        "knee_ankle_summary_balanced": "Knee/ankle tracking looks fairly balanced from the rear.",
        "knee_ankle_rec_inward_1": "Try step-downs + glute med work (band walks) 2×/week.",
        "knee_ankle_rec_wide_1": "Keep strength balanced (glutes + calves) to maintain control.",
        "knee_ankle_rec_balanced_1": "Maintain consistency with basic strength and gradual training progressions.",
        "trunk_stability_title": "Trunk stability",
        "trunk_stability_summary": "How consistent your upper body stays while you run. Lower stability can waste energy and increase fatigue.",
        "trunk_stability_rec_1": "Try a short core routine 2–3×/week (dead bug, side plank).",
        "trunk_stability_rec_2": "On easy runs, think “quiet shoulders” and relaxed hands.",
        "arm_swing_title": "Arm swing coordination",
        "arm_swing_summary": "How balanced your arm rhythm is left vs right, supporting stability and pacing.",
        "arm_swing_rec_1": "Run tall and let arms swing back (not across the body).",
        "arm_swing_rec_2": "Add 4×20s relaxed strides focusing on symmetry.",
        "hip_mobility_title": "Hip mobility",
        "hip_mobility_summary": "A proxy for how freely your hips extend during the stride.",
        "hip_mobility_rec_1": "Add hip flexor mobility after runs (60–90s per side).",
        "hip_mobility_rec_2": "Try glute activation (bridges, band walks) before running.",
        "trunk_lean_title": "Trunk lean",
        "trunk_lean_summary": "Forward inclination of the torso while running.",
        "trunk_lean_rec_1": "A small forward lean from the ankles often feels smooth and efficient.",
        "oscillation_title": "Vertical oscillation",
        "oscillation_summary": "How much your body moves up/down per stride (bounce).",
        "oscillation_rec_1": "Less bounce usually means better efficiency (context matters: speed, fatigue, terrain).",
    },
}


def _t(lang: Optional[str], key: str) -> str:
    """Return a localized string. Falls back to default lang then to the key."""
    table = STRINGS.get(str(lang or DEFAULT_LANG)) or STRINGS[DEFAULT_LANG]
    value = table.get(key)
    if value is None:
        value = STRINGS[DEFAULT_LANG].get(key, key)
    return value


# -----------------------------
# Helpers
# -----------------------------

def _safe_num(v: Optional[float | int]) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) else None


def _severity_from_score(score: float) -> str:
    # score is 0–100
    if score >= 80:
        return "info"
    if score >= 55:
        return "focus"
    return "warning"


def _pick_top3(items: List[Tuple[int, InsightItem]]) -> List[InsightItem]:
    items.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in items[:3]]


def _safe_float_any(v: Any, default: Optional[float] = None) -> Optional[float]:
    if v is None:
        return default
    return safe_float(v, default=0.0)


def _has_side(analysis_type: Optional[str]) -> bool:
    return str(analysis_type or "").lower() == "side"


def _has_rear(analysis_type: Optional[str]) -> bool:
    return str(analysis_type or "").lower() == "rear"


# -----------------------------
# Main builder
# -----------------------------

def generate_insights(
    *,
    analysis_type: Optional[AnalysisType] = None,
    lang: Lang = DEFAULT_LANG,

    trunk_stability: Optional[int] = None,
    arm_swing: Optional[int] = None,
    hip_mobility: Optional[int] = None,
    trunk_lean: Optional[float] = None,
    osc: Optional[float] = None,

    pronation: Optional[str] = None,
    rear_metrics: Optional[Dict[str, Any]] = None,
) -> tuple[list[InsightItem], list[str]]:
    """
    Build up to 3 consumer-friendly insights + 3 improvement tips.

    Strings are localized via STRINGS[lang]. Pass lang="fr" or lang="en".
    """
    items: List[Tuple[int, InsightItem]] = []

    want_side = _has_side(analysis_type)
    want_rear = _has_rear(analysis_type)

    trunk_stability_f = _safe_num(trunk_stability)
    arm_swing_f = _safe_num(arm_swing)
    hip_mobility_f = _safe_num(hip_mobility)
    trunk_lean_f = _safe_num(trunk_lean)
    osc_f = _safe_num(osc)

    rear_metrics = rear_metrics or {}

    # -----------------------------
    # Rear insights
    # -----------------------------

    if want_rear:
        # 1) Pronation insight
        if pronation in {"neutral", "pronation", "supination"}:
            if pronation == "neutral":
                sev, priority = "info", 0
                measured_key, summary_key = "pronation_measured_neutral", "pronation_summary_neutral"
                rec_keys = ["pronation_rec_neutral_1"]
            elif pronation == "pronation":
                sev, priority = "focus", 1
                measured_key, summary_key = "pronation_measured_pronation", "pronation_summary_pronation"
                rec_keys = ["pronation_rec_pronation_1", "pronation_rec_pronation_2"]
            else:  # supination
                sev, priority = "focus", 1
                measured_key, summary_key = "pronation_measured_supination", "pronation_summary_supination"
                rec_keys = ["pronation_rec_supination_1", "pronation_rec_supination_2"]

            items.append(
                (
                    priority,
                    InsightItem(
                        id="rear_pronation",
                        category="feet",
                        title=_t(lang, "pronation_title"),
                        summary=_t(lang, summary_key),
                        measured=_t(lang, measured_key),
                        severity=sev,
                        confidence=0.70,
                        recommendations=[_t(lang, k) for k in rec_keys],
                    ),
                )
            )

        # 2) Drift
        drift_norm = _safe_float_any(
            rear_metrics.get("drift_norm", rear_metrics.get("ankle_knee_drift_norm")),
            None,
        )
        if drift_norm is not None:
            if drift_norm > 0.06:
                sev, priority = "focus", 1
                summary_key = "drift_summary_inward"
                rec_keys = ["drift_rec_inward_1"]
            elif drift_norm < -0.04:
                sev, priority = "focus", 1
                summary_key = "drift_summary_outward"
                rec_keys = ["drift_rec_outward_1"]
            else:
                sev, priority = "info", 0
                summary_key = "drift_summary_centered"
                rec_keys = ["drift_rec_centered_1"]

            items.append(
                (
                    priority,
                    InsightItem(
                        id="rear_drift",
                        category="alignment",
                        title=_t(lang, "drift_title"),
                        summary=_t(lang, summary_key),
                        measured=f"{drift_norm:+.2f}",
                        severity=sev,
                        confidence=0.65,
                        recommendations=[_t(lang, k) for k in rec_keys],
                    ),
                )
            )

        # 3) Knee vs ankle ratio
        knee_w = _safe_float_any(rear_metrics.get("knee_width_norm"), None)
        ankle_w = _safe_float_any(rear_metrics.get("ankle_width_norm"), None)
        if knee_w is not None and ankle_w is not None and ankle_w > 1e-6:
            ratio = knee_w / ankle_w
            if ratio < 0.92:
                sev, priority = "focus", 1
                summary_key = "knee_ankle_summary_inward"
                rec_keys = ["knee_ankle_rec_inward_1"]
            elif ratio > 1.10:
                sev, priority = "info", 0
                summary_key = "knee_ankle_summary_wide"
                rec_keys = ["knee_ankle_rec_wide_1"]
            else:
                sev, priority = "info", 0
                summary_key = "knee_ankle_summary_balanced"
                rec_keys = ["knee_ankle_rec_balanced_1"]

            items.append(
                (
                    priority,
                    InsightItem(
                        id="rear_knee_ankle_ratio",
                        category="alignment",
                        title=_t(lang, "knee_ankle_title"),
                        summary=_t(lang, summary_key),
                        measured=f"{ratio:.2f}×",
                        severity=sev,
                        confidence=0.60,
                        recommendations=[_t(lang, k) for k in rec_keys],
                    ),
                )
            )

    # -----------------------------
    # Side insights
    # -----------------------------

    if want_side:
        if trunk_stability_f is not None:
            sev = _severity_from_score(trunk_stability_f)
            priority = 2 if sev == "warning" else 1 if sev == "focus" else 0
            items.append(
                (
                    priority,
                    InsightItem(
                        id="body_trunk_stability",
                        category="body",
                        title=_t(lang, "trunk_stability_title"),
                        summary=_t(lang, "trunk_stability_summary"),
                        measured=f"{round(trunk_stability_f)} / 100",
                        severity=sev,
                        confidence=0.70,
                        recommendations=[
                            _t(lang, "trunk_stability_rec_1"),
                            _t(lang, "trunk_stability_rec_2"),
                        ],
                    ),
                )
            )

        if arm_swing_f is not None:
            sev = _severity_from_score(arm_swing_f)
            priority = 2 if sev == "warning" else 1 if sev == "focus" else 0
            items.append(
                (
                    priority,
                    InsightItem(
                        id="body_arm_swing",
                        category="body",
                        title=_t(lang, "arm_swing_title"),
                        summary=_t(lang, "arm_swing_summary"),
                        measured=f"{round(arm_swing_f)} / 100",
                        severity=sev,
                        confidence=0.65,
                        recommendations=[
                            _t(lang, "arm_swing_rec_1"),
                            _t(lang, "arm_swing_rec_2"),
                        ],
                    ),
                )
            )

        if hip_mobility_f is not None:
            sev = _severity_from_score(hip_mobility_f)
            priority = 2 if sev == "warning" else 1 if sev == "focus" else 0
            items.append(
                (
                    priority,
                    InsightItem(
                        id="body_hip_mobility",
                        category="body",
                        title=_t(lang, "hip_mobility_title"),
                        summary=_t(lang, "hip_mobility_summary"),
                        measured=f"{round(hip_mobility_f)} / 100",
                        severity=sev,
                        confidence=0.60,
                        recommendations=[
                            _t(lang, "hip_mobility_rec_1"),
                            _t(lang, "hip_mobility_rec_2"),
                        ],
                    ),
                )
            )

        if trunk_lean_f is not None:
            items.append(
                (
                    0,
                    InsightItem(
                        id="body_trunk_lean",
                        category="body",
                        title=_t(lang, "trunk_lean_title"),
                        summary=_t(lang, "trunk_lean_summary"),
                        measured=f"{trunk_lean_f:.1f}°",
                        severity="info",
                        confidence=0.75,
                        recommendations=[_t(lang, "trunk_lean_rec_1")],
                    ),
                )
            )

        if osc_f is not None:
            items.append(
                (
                    0,
                    InsightItem(
                        id="body_oscillation",
                        category="body",
                        title=_t(lang, "oscillation_title"),
                        summary=_t(lang, "oscillation_summary"),
                        measured=f"{osc_f:.1f} cm",
                        severity="info",
                        confidence=0.75,
                        recommendations=[_t(lang, "oscillation_rec_1")],
                    ),
                )
            )

    # -----------------------------
    # Pick top 3 + tips
    # -----------------------------

    top3 = _pick_top3(items)

    improvement_tips: List[str] = []
    for it in top3:
        if it.recommendations:
            improvement_tips.append(it.recommendations[0])

    improvement_tips = improvement_tips[:3]
    return top3, improvement_tips


def regenerate_insights_for_result(result: Any, lang: Lang) -> Tuple[List[InsightItem], List[str]]:
    """
    Recompute insights + improvement tips for an already-stored AnalysisResult
    in a different language. Only needs fields already persisted on the
    result (no video/re-analysis required), so this works retroactively on
    any past job, not just newly-submitted ones.
    """
    if result.analysis_type == "rear":
        return generate_insights(
            analysis_type="rear",
            lang=lang,
            pronation=result.pronation,
            rear_metrics=result.rear_metrics,
        )

    bio = result.bio
    return generate_insights(
        analysis_type="side",
        lang=lang,
        trunk_lean=result.trunk_lean,
        trunk_stability=result.trunk_stability,
        arm_swing=result.arm_swing,
        hip_mobility=result.hip_mobility,
        osc=getattr(bio, "osc", None),
        pronation=result.pronation,
    )
