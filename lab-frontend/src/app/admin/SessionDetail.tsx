"use client";

import { API_BASE } from "@/shared/api/client";
import {
  formatDateTime,
  formatText,
  shortId,
  statusClass,
  statusLabel,
  weeklyDistanceLabel,
} from "./lib/utils";

export default function SessionDetail({ detail, loadingDetail }: any) {

  if (loadingDetail) {
    return <p className="mt-4 text-sm text-slate-300">Loading session...</p>;
  }

  if (!detail) {
    return <p className="mt-4 text-sm text-slate-300">Select a session to inspect.</p>;
  }

  const latestResult = detail.analysis_results?.[0] ?? null;

  return (
    <section className="space-y-6">
      <div className="admin-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Session details</h2>
            <p className="text-xs text-slate-300">{detail.id}</p>
          </div>
          <span
            className={[
              "rounded-full border px-3 py-1 text-xs font-semibold",
              statusClass(detail.status),
            ].join(" ")}
          >
            {statusLabel(detail.status)}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Created</p>
              <p className="text-sm font-medium text-slate-100">
                {formatDateTime(detail.created_at)}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Captures</p>
              <p className="text-sm text-slate-300">
                Required: {detail.required_captures?.join(", ") || "-"}
              </p>
              <p className="text-sm text-slate-300">
                Completed: {detail.completed_captures?.join(", ") || "-"}
              </p>
              <p className="text-sm text-slate-300">
                Inferred pronation: {formatText(detail.inferred_pronation)}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Jobs</p>
              <p className="text-sm text-slate-300">
                Active job: {shortId(detail.active_analysis_job_id)}
              </p>
              <p className="text-sm text-slate-300">
                Rear job: {shortId(detail.rear_analysis_job_id)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Runner profile</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-slate-300">
              <div>
                <p className="text-xs text-slate-400">Gender</p>
                <p className="font-medium text-slate-100">{formatText(detail.runner_profile.gender)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Age</p>
                <p className="font-medium text-slate-100">{detail.runner_profile.age} years</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Weight</p>
                <p className="font-medium text-slate-100">{detail.runner_profile.weightKg} kg</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Height</p>
                <p className="font-medium text-slate-100">{detail.runner_profile.heightCm} cm</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Level</p>
                <p className="font-medium text-slate-100">{formatText(detail.runner_profile.level)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Surface</p>
                <p className="font-medium text-slate-100">{formatText(detail.runner_profile.surface)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Weekly distance</p>
                <p className="font-medium text-slate-100">
                  {weeklyDistanceLabel(detail.runner_profile.weeklyDistance)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Preference</p>
                <p className="font-medium text-slate-100">{formatText(detail.runner_profile.preference)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Pronation</p>
                <p className="font-medium text-slate-100">{formatText(detail.runner_profile.pronation)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h2 className="text-lg font-semibold text-white">Latest results</h2>

        {!latestResult && (
          <p className="mt-3 text-sm text-slate-300">
            No analysis results are stored for this session yet.
          </p>
        )}

        {latestResult && (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Gait type</p>
                <p className="text-sm font-medium text-slate-100">{formatText(latestResult.gait_type)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Energy score</p>
                <p className="text-sm font-medium text-slate-100">{latestResult.energy_score ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Motion type</p>
                <p className="text-sm font-medium text-slate-100">{formatText(latestResult.motion_type)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Strike pattern</p>
                <p className="text-sm font-medium text-slate-100">{formatText(latestResult.strike_pattern)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Cadence</p>
                <p className="text-sm font-medium text-slate-100">{latestResult.bio?.cadence ?? "-"} spm</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Contact time</p>
                <p className="text-sm font-medium text-slate-100">{latestResult.bio?.contact_time ?? "-"} ms</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Symmetry</p>
                <p className="text-sm font-medium text-slate-100">{latestResult.bio?.sym?.toFixed?.(1) ?? "-"} %</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-400">Video</p>
                <a
                  href={latestResult.video_url?.startsWith("http") ? latestResult.video_url : `${API_BASE}${latestResult.video_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-indigo-300 hover:text-indigo-200 transition-colors"
                >
                  Open annotated video
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
