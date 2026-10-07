import { Insight } from "../lab/domain/insights.types";

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {insights.map((insight) => {
        const tone =
          insight.level === "good"
            ? "bg-emerald-50 border-emerald-200"
            : insight.level === "warning"
            ? "bg-amber-50 border-amber-200"
            : "bg-red-50 border-red-200";

        const badge =
          insight.level === "good"
            ? "Good"
            : insight.level === "warning"
            ? "Warning"
            : "Critical";

        return (
          <div
            key={insight.id}
            className={`rounded-xl border ${tone} p-5 flex flex-col justify-between`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {insight.title}
                </h3>

                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  {badge}
                </span>
              </div>

              <p className="text-sm text-slate-700">
                {insight.message}
              </p>
            </div>

            {insight.value != null && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                  Metric
                </p>
                <p className="text-sm font-medium text-slate-900">
                  {insight.metric ?? "Value"}: {insight.value}
                  {insight.unit}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
