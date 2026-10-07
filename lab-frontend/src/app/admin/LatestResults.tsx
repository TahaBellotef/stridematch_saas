import { API_BASE } from "@/shared/api/client";
import { AnalysisResult } from "@/features/lab/domain/analysis.types";
import { formatText } from "./lib/utils";

type LatestResultsProps = {
  latestResult: AnalysisResult | null;
};

export function LatestResults({ latestResult }: LatestResultsProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">
        Latest results
      </h2>
      {!latestResult && (
        <p className="mt-3 text-sm text-slate-500">
          No analysis results are stored for this session yet.
        </p>
      )}

      {latestResult && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Gait type
              </p>
              <p className="text-sm font-medium text-slate-900">
                {formatText(latestResult.gait_type)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Energy score
              </p>
              <p className="text-sm font-medium text-slate-900">
                {latestResult.energy_score ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Motion type
              </p>
              <p className="text-sm font-medium text-slate-900">
                {formatText(latestResult.motion_type)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Strike pattern
              </p>
              <p className="text-sm font-medium text-slate-900">
                {formatText(latestResult.strike_pattern)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Cadence
              </p>
              <p className="text-sm font-medium text-slate-900">
                {latestResult.bio?.cadence ?? "-"} spm
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Contact time
              </p>
              <p className="text-sm font-medium text-slate-900">
                {latestResult.bio?.contact_time ?? "-"} ms
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Symmetry
              </p>
              <p className="text-sm font-medium text-slate-900">
                {latestResult.bio?.sym?.toFixed?.(1) ?? "-"} %
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">
                Video
              </p>
              <a
                href={
                  latestResult.video_url?.startsWith("http")
                    ? latestResult.video_url
                    : `${API_BASE}${latestResult.video_url}`
                }
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                Open annotated video
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
