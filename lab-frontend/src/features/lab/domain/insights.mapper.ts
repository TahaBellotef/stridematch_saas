import { AnalysisResult } from "./analysis.types";
import { Insight } from "./insights.types";

export function buildInsights(result: AnalysisResult): Insight[] {
  const insights: Insight[] = [];

  const bio = result.bio ?? {};
  const { cadence, contact_time, sym } = bio;

  if (typeof cadence === "number" && cadence < 150) {
    insights.push({
      id: "cadence-low",
      title: "Low cadence",
      message:
        "Your cadence is on the lower side. Increasing it slightly may reduce impact forces.",
      level: "warning",
      metric: "Cadence",
      value: cadence,
      unit: "spm",
    });
  } else if (typeof cadence === "number") {
    insights.push({
      id: "cadence-ok",
      title: "Cadence in healthy range",
      message: "Your cadence falls within a commonly observed healthy range.",
      level: "good",
      metric: "Cadence",
      value: cadence,
      unit: "spm",
    });
  }

  if (typeof sym === "number" && sym < 0.9) {
    insights.push({
      id: "symmetry",
      title: "Stride asymmetry detected",
      message:
        "Your left/right symmetry shows noticeable imbalance. This may increase injury risk over time.",
      level: "warning",
      metric: "Symmetry",
      value: Math.round(sym * 100),
      unit: "%",
    });
  }

  return insights;
}
