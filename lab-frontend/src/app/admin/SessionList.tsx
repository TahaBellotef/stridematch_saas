"use client";

import { formatDateTime, shortId, statusClass, statusLabel } from "./lib/utils";

export default function SessionList({
  sessions,
  selectedId,
  setSelectedId,
  loadingList,
  loadSessions,
}: any) {

  return (
    <section className="admin-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">
          Sessions
        </h2>
        <button
          type="button"
          onClick={loadSessions}
          className="text-xs font-medium text-slate-300 hover:text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {loadingList && (
          <p className="text-sm text-slate-300">Loading sessions...</p>
        )}

        {!loadingList && sessions.length === 0 && (
          <p className="text-sm text-slate-300">No sessions yet.</p>
        )}

        {sessions.map((session: any) => {
          const isActive = session.id === selectedId;
          return (
            <button
              key={session.id}
              type="button"
              onClick={() => setSelectedId(session.id)}
              className={[
                "w-full rounded-2xl border px-4 py-3 text-left transition",
                isActive
                  ? "border-indigo-500/50 bg-indigo-500/10"
                  : "border-white/10 hover:border-white/20 hover:bg-white/5",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className={isActive ? "text-sm font-semibold text-indigo-300" : "text-sm font-semibold text-slate-100"}>
                  {shortId(session.id)}
                </span>
                <span
                  className={[
                    "rounded-full border px-2 py-0.5 text-xs font-semibold",
                    statusClass(session.status),
                  ].join(" ")}
                >
                  {statusLabel(session.status)}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                {formatDateTime(session.created_at)}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
