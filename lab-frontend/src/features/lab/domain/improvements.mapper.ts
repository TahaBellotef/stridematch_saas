// src/features/analysis/domain/improvements.mapper.ts

import { AnalysisResult } from "./analysis.types";
import { Improvement } from "./improvements.types";
import { Insight } from "./insights.types";

export function buildImprovements(
  analysis: AnalysisResult,
  insights: Insight[]
): Improvement[] {
  const improvements: Improvement[] = [];

  const bio = analysis.bio ?? {};

  /* --------------------------------------------------
   * Vertical oscillation
   * -------------------------------------------------- */
  if (typeof bio.osc === "number" && bio.osc > 9) {
    improvements.push({
      title: "Reduce vertical oscillation",
      rationale:
        "Excessive vertical movement increases impact forces and wastes energy with each stride.",
      first_step:
        "Focus on maintaining a slightly quicker cadence while keeping your head level.",
      priority: "high",
      source: "rule",
    });
  }

  /* --------------------------------------------------
   * Ground contact time
   * -------------------------------------------------- */
  if (typeof bio.contact_time === "number" && bio.contact_time > 290) {
    improvements.push({
      title: "Shorten ground contact time",
      rationale:
        "Long contact time often indicates braking forces and reduced running efficiency.",
      first_step:
        "Practice light, quick foot contacts and avoid overstriding in front of your body.",
      priority: "medium",
      source: "rule",
    });
  }

  /* --------------------------------------------------
   * Symmetry
   * -------------------------------------------------- */
  if (typeof bio.sym === "number" && bio.sym < 90) {
    improvements.push({
      title: "Improve left-right symmetry",
      rationale:
        "Asymmetrical loading can increase injury risk and reduce performance over time.",
      first_step:
        "Add unilateral strength exercises such as single-leg squats or lunges.",
      priority: "high",
      source: "rule",
    });
  }

  /* --------------------------------------------------
   * Trunk stability
   * -------------------------------------------------- */
  if (
    typeof analysis.trunk_stability === "number" &&
    analysis.trunk_stability < 60
  ) {
    improvements.push({
      title: "Increase trunk stability",
      rationale:
        "Upper-body instability can disrupt balance and increase energy cost during running.",
      first_step:
        "Incorporate core stabilization exercises like planks or dead bugs 2–3 times per week.",
      priority: "medium",
      source: "rule",
    });
  }

  /* --------------------------------------------------
   * Limit to top 3 (UX rule)
   * -------------------------------------------------- */
  return improvements
    .sort((a, b) =>
      a.priority === b.priority
        ? 0
        : a.priority === "high"
        ? -1
        : 1
    )
    .slice(0, 3);
}
