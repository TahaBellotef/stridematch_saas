"use client";

import { Improvement } from "../../features/lab/domain/improvements.types";
import { Insight } from "../lab/domain/insights.types";

type Props = {
  improvements: Improvement[];
  insights?: Insight[];
};

export function ImprovementsPanel({ improvements, insights = [] }: Props) {
  const hasImprovements = improvements.length > 0;
  const hasInsights = insights.length > 0;
  const limitedImprovements = improvements.slice(0, 2);

  if (!hasImprovements && !hasInsights) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Remarks and Improvement tips
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          No major improvement areas detected. Keep up the good work.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold text-slate-900">
          Remarks and Improvement tips
        </h2>
        <p className="text-sm text-slate-600 max-w-2xl">
          Review these movement insights and tips to improve efficiency,
          stability, and long-term durability.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {hasInsights ? (
          <MovementInsightsCard insights={insights} />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Movement insights
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              No movement insights available yet.
            </p>
          </div>
        )}

        {hasImprovements ? (
          limitedImprovements.map((item, idx) => (
            <ImprovementCard key={idx} improvement={item} />
          ))
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Improvement tips
            </h3>
            <p className="text-sm text-slate-700 mt-2">
              No major improvement areas detected. Keep up the good work.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/* ===================================================== */
/* Card */
/* ===================================================== */

function ImprovementCard({ improvement }: { improvement: Improvement }) {
  const tone =
    improvement.priority === "high"
      ? "border-red-200 bg-red-50"
      : improvement.priority === "medium"
      ? "border-yellow-200 bg-yellow-50"
      : "border-emerald-200 bg-emerald-50";

  const badge =
    improvement.priority === "high"
      ? "High priority"
      : improvement.priority === "medium"
      ? "Recommended"
      : "Optional";

  return (
    <div
      className={`rounded-xl border ${tone} p-5 flex flex-col justify-between`}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            {improvement.title}
          </h3>

          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            {badge}
          </span>
        </div>

        <p className="text-sm text-slate-700">
          {improvement.rationale}
        </p>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
          First step
        </p>
        <p className="text-sm font-medium text-slate-900">
          {improvement.first_step}
        </p>
      </div>
    </div>
  );
}

function MovementInsightsCard({ insights }: { insights: Insight[] }) {
  const tone = insights.some((insight) => insight.level === "critical")
    ? "border-red-200 bg-red-50"
    : insights.some((insight) => insight.level === "warning")
    ? "border-yellow-200 bg-yellow-50"
    : "border-emerald-200 bg-emerald-50";
  const metricLines = insights
    .filter((insight) => insight.value != null)
    .map(
      (insight) =>
        `${insight.metric ?? "Value"}: ${insight.value}${insight.unit ?? ""}`
    );

  return (
    <div className={`rounded-xl border ${tone} p-5 flex flex-col justify-between`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Movement insights
          </h3>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Insights
          </span>
        </div>

        <ul className="space-y-2">
          {insights.map((insight) => (
            <li key={insight.id} className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                {insight.title}
              </p>
              <p className="text-sm text-slate-700">
                {insight.message}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {metricLines.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Key metrics
          </p>
          <div className="space-y-1 text-sm font-medium text-slate-900">
            {metricLines.map((line) => (
              <p key={line}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
