"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetchJson } from "@/shared/api/client";
import { AuthGuard, useAuth } from "@/shared/auth";
// Layout now provides header + sidebar consistently for all admin pages
import SessionList from "./SessionList";
import SessionDetail from "./SessionDetail";
import {
  AdminSessionSummary,
  AdminSessionDetail,
  AdminSessionListResponse,
} from "./lib/types";

export default function AdminPage() {
  const { token, isAuthenticated, isLoading, logout } = useAuth();

  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminSessionDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authorizedFetch = useCallback(
    (path: string, init?: RequestInit) => apiFetchJson<any>(path, init),
    []
  );

  const loadSessions = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const data = (await authorizedFetch(
        "/api/v1/admin/sessions"
      )) as AdminSessionListResponse;

      setSessions(data.sessions ?? []);

      if (!selectedId && data.sessions?.length) {
        setSelectedId(data.sessions[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sessions.");
    } finally {
      setLoadingList(false);
    }
  }, [authorizedFetch, selectedId]);

  const loadDetail = useCallback(
    async (sessionId: string) => {
      setLoadingDetail(true);
      setError(null);
      try {
        const data = (await authorizedFetch(
          `/api/v1/admin/sessions/${sessionId}`
        )) as AdminSessionDetail;
        setDetail(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session.");
      } finally {
        setLoadingDetail(false);
      }
    },
    [authorizedFetch]
  );

  useEffect(() => {
    if (!token) return;
    loadSessions();
  }, [token, loadSessions]);

  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      return;
    }
    loadDetail(selectedId);
  }, [token, selectedId, loadDetail]);

  const handleLogout = () => {
    void logout();
  };

  // Auth gating
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-700 shadow-sm">
          Loading…
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthGuard>{null}</AuthGuard>;
  }

  // Logged in but token not hydrated yet
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-700 shadow-sm">
          Preparing your session…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      {/* Dashboard toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 text-xs">This Week</button>
          <button className="rounded-full bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 text-xs">1 Jan - 7 Jan</button>
        </div>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <button className="rounded-full bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 text-xs">Overview</button>
        <button className="rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 px-3 py-1.5 text-xs">Insights</button>
        <button className="rounded-full bg-white/5 hover:bg-white/10 text-slate-200 px-3 py-1.5 text-xs">Customers</button>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <SessionList
          sessions={sessions}
          selectedId={selectedId}
          loadingList={loadingList}
          setSelectedId={setSelectedId}
          loadSessions={loadSessions}
        />

        <section className="space-y-6">
          <SessionDetail detail={detail} loadingDetail={loadingDetail} />
        </section>
      </div>
    </div>
  );
}
