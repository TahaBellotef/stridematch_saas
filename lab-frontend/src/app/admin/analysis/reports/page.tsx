"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { ResultStep } from "@/features/lab/steps/ResultStep";
import { useToast } from "@/components/shared/Toast";
import type { AnalysisResult } from "@/features/lab/domain/analysis.types";
import { apiFetch, apiFetchJson } from "@/shared/api/client";
import { waitForSessionCompletion } from "@/shared/analysis/waitForSessionCompletion";
import type {
  AdminSessionDetail,
  AdminSessionListResponse,
  AdminSessionSummary,
} from "@/app/admin/lib/types";

const REPORTS_PAGE_SIZE = 5;

// One status block (Completed / Processing / Pending / Failed) with its own
// page cursor - mirrors the pagination pattern from RecommendedShoes
// (components/admin/customer-detail/RecommendedShoes.tsx) so each block
// pages through its own reports independently of the others.
function SessionStatusBlock({
  label,
  sessions,
  customersById,
  selectedIds,
  onToggleSelect,
  onOpen,
  onDownload,
  onDelete,
  downloadingId,
  deletingId,
}: {
  label: string;
  sessions: AdminSessionSummary[];
  customersById: Record<string, string>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onDownload: (session: AdminSessionSummary, e: MouseEvent) => void;
  onDelete: (session: AdminSessionSummary, e: MouseEvent) => void;
  downloadingId: string | null;
  deletingId: string | null;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(sessions.length / REPORTS_PAGE_SIZE);
  const visible = sessions.slice(page * REPORTS_PAGE_SIZE, page * REPORTS_PAGE_SIZE + REPORTS_PAGE_SIZE);

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-white/10 p-4"
      style={{ backgroundColor: "#1B1830" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-500">{sessions.length}</span>
        </div>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white disabled:opacity-30"
              style={{ backgroundColor: "#3B3658", border: "1px solid #7B75A5" }}
            >
              <CaretLeft size={11} />
            </button>
            <span className="text-xs text-slate-500">
              {page + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="flex h-6 w-6 items-center justify-center rounded-full text-white disabled:opacity-30"
              style={{ backgroundColor: "#3B3658", border: "1px solid #7B75A5" }}
            >
              <CaretRight size={11} />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((session) => {
          const customerName = session.customer_id
            ? customersById[session.customer_id] ?? session.customer_id
            : "Unknown customer";
          const isDeleting = deletingId === session.id;
          const isDownloading = downloadingId === session.id;
          const isCompleted = session.status === "completed";
          const isSelected = selectedIds.has(session.id);
          return (
            <div
              key={session.id}
              style={{ boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)" }}
              className={`flex items-center gap-3 rounded-2xl border bg-[#1F1B2E] px-4 py-3 text-slate-200 transition ${
                isSelected ? "border-indigo-400/50" : "border-white/10 hover:border-white/20"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(session.id)}
                aria-label={`Select report for ${customerName}`}
                className="h-4 w-4 shrink-0 cursor-pointer rounded border-white/20 bg-[#26223B] accent-indigo-500"
              />
              <button type="button" onClick={() => onOpen(session.id)} className="flex-1 text-left">
                <div className="text-sm font-semibold">{customerName}</div>
                <div className="text-xs text-slate-400">
                  {new Date(session.created_at).toLocaleString()}
                </div>
                <div className="text-xs text-slate-500">Status: {session.status}</div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {isCompleted && (
                  <button
                    type="button"
                    onClick={(e) => onDownload(session, e)}
                    disabled={!session.active_analysis_job_id || isDownloading}
                    title={session.active_analysis_job_id ? "Download report" : "No report available yet"}
                    className="rounded-lg border border-white/10 bg-[#26223B] px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isDownloading ? "Downloading…" : "Download"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => onDelete(session, e)}
                  disabled={isDeleting}
                  className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:border-red-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isDeleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AdminSessionDetail | null>(null);
  const [customersById, setCustomersById] = useState<Record<string, string>>({});
  const [customerEmailById, setCustomerEmailById] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [showStillWorking, setShowStillWorking] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [emailFilter, setEmailFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminSessionSummary | null>(null);
  const { showToast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const customerFilter = useMemo(() => searchParams.get("customerId"), [searchParams]);
  const processingSessionId = useMemo(() => searchParams.get("sessionId"), [searchParams]);
  const warningParam = useMemo(() => searchParams.get("warning"), [searchParams]);

  const authorizedFetch = (path: string, init?: RequestInit) => apiFetchJson<any>(path, init);

  useEffect(() => {
    if (processingSessionId) return;
    setLoadingData(true);
    setError(null);

    const loadData = async () => {
      const customerParam = customerFilter
        ? `?customer_id=${encodeURIComponent(customerFilter)}`
        : "";

      const [sessionsRes, customersRes] = await Promise.all([
        authorizedFetch(`/api/v1/admin/sessions${customerParam}`) as Promise<AdminSessionListResponse>,
        authorizedFetch("/api/v1/admin/customers") as Promise<{
          customers: Array<{ id: string; name: string; email: string }>;
        }>,
      ]);

      const mapped: Record<string, string> = {};
      const mappedEmails: Record<string, string> = {};
      for (const customer of customersRes.customers ?? []) {
        mapped[customer.id] = customer.name;
        mappedEmails[customer.id] = customer.email;
      }

      setCustomersById(mapped);
      setCustomerEmailById(mappedEmails);
      const nextSessions = sessionsRes.sessions ?? [];
      setSessions(nextSessions);

      setSelectedSessionId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) {
          return current;
        }
        return null;
      });
      setSelectedDetail(null);
    };

    loadData()
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load reports.");
        setSessions([]);
        setSelectedSessionId(null);
        setSelectedDetail(null);
      })
      .finally(() => {
        setLoadingData(false);
      });
  }, [customerFilter, processingSessionId]);

  useEffect(() => {
    if (!processingSessionId) return;

    let isMounted = true;
    setProcessingError(null);
    setShowStillWorking(false);

    const stillTimer = setTimeout(() => {
      if (isMounted) {
        setShowStillWorking(true);
      }
    }, 2 * 60 * 1000);

    waitForSessionCompletion(processingSessionId)
      .then((session) => {
        if (!isMounted) return;
        const jobId = session.active_analysis_job_id;
        if (jobId) {
          router.replace(`/admin/analysis/reports/${jobId}`);
          return;
        }
        router.replace("/admin/analysis/reports?warning=missing-job");
      })
      .catch((err) => {
        if (!isMounted) return;
        setProcessingError(
          err instanceof Error ? err.message : "Failed to load analysis status."
        );
      });

    return () => {
      isMounted = false;
      clearTimeout(stillTimer);
    };
  }, [processingSessionId, retryToken, router]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSelectedDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError(null);
    authorizedFetch(`/api/v1/admin/sessions/${selectedSessionId}`)
      .then((detail) => setSelectedDetail(detail as AdminSessionDetail))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load session.");
        setSelectedDetail(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedSessionId]);

  // Drop selections that no longer exist after a reload/delete.
  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(sessions.map((s) => s.id));
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sessions]);

  const selectedResult = useMemo(() => {
    const results = selectedDetail?.analysis_results ?? [];
    if (!results.length) return null;
    return results[results.length - 1] as AnalysisResult;
  }, [selectedDetail]);

  const resolveEmail = (session: AdminSessionSummary): string =>
    session.customer_email || (session.customer_id ? customerEmailById[session.customer_id] : "") || "";

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (emailFilter.trim()) {
        const email = resolveEmail(session).toLowerCase();
        if (!email.includes(emailFilter.trim().toLowerCase())) return false;
      }
      if (dateFilter) {
        const sessionDate = new Date(session.created_at);
        const localDate = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, "0")}-${String(sessionDate.getDate()).padStart(2, "0")}`;
        if (localDate !== dateFilter) return false;
      }
      return true;
    });
  }, [sessions, emailFilter, dateFilter, customerEmailById]);

  // Block order/labels for the statuses AnalysisSessionModel actually uses
  // (app/routers/analysis.py / app/services/foot_scan/persistence.py).
  const STATUS_GROUPS: Array<{ status: string; label: string }> = [
    { status: "completed", label: "Completed" },
    { status: "processing", label: "Processing" },
    { status: "pending", label: "Pending" },
    { status: "failed", label: "Failed" },
  ];

  const groupedSessions = useMemo(() => {
    const groups = STATUS_GROUPS.map((group) => ({
      ...group,
      sessions: filteredSessions.filter((session) => session.status === group.status),
    }));
    const knownStatuses = new Set(STATUS_GROUPS.map((g) => g.status));
    const other = filteredSessions.filter((session) => !knownStatuses.has(session.status));
    if (other.length > 0) {
      groups.push({ status: "other", label: "Other", sessions: other });
    }
    return groups.filter((group) => group.sessions.length > 0);
  }, [filteredSessions]);

  const requestDeleteSession = (session: AdminSessionSummary, e: MouseEvent) => {
    e.stopPropagation();
    setPendingDelete(session);
  };

  const cancelDeleteSession = () => setPendingDelete(null);

  const confirmDeleteSession = async () => {
    const session = pendingDelete;
    if (!session) return;

    setDeletingId(session.id);
    setPendingDelete(null);
    try {
      await authorizedFetch(`/api/v1/admin/sessions/${session.id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      showToast("success", "Report deleted.");
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete report.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setPendingBulkDelete(false);
    setBulkDeleting(true);
    try {
      await Promise.all(ids.map((id) => authorizedFetch(`/api/v1/admin/sessions/${id}`, { method: "DELETE" })));
      setSessions((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      showToast("success", `${ids.length} report${ids.length > 1 ? "s" : ""} deleted.`);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to delete selected reports.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDownloadReport = async (session: AdminSessionSummary, e: MouseEvent) => {
    e.stopPropagation();
    if (!session.active_analysis_job_id) {
      showToast("error", "This report has no generated PDF to download.");
      return;
    }

    setDownloadingId(session.id);
    try {
      const res = await apiFetch(`/api/v1/analysis/${session.active_analysis_job_id}/report`, {
        method: "GET",
      });
      if (!res.ok) throw new Error(`Failed to generate report (${res.status})`);

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `report-${session.active_analysis_job_id}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to download report.");
    } finally {
      setDownloadingId(null);
    }
  };

  if (processingSessionId) {
    return (
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="rounded-2xl border border-white/10 bg-[#26223B] p-10 text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-transparent" />
          <h1 className="text-xl font-semibold text-white">
            Video uploaded. Analysis is processing…
          </h1>
          {!processingError && (
            <p className="mt-2 text-sm text-slate-400">
              We are preparing your report. This usually takes a few minutes.
            </p>
          )}
          {showStillWorking && !processingError && (
            <p className="mt-2 text-sm text-slate-500">Still working…</p>
          )}
          {processingError && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-red-400">{processingError}</p>
              <button
                type="button"
                onClick={() => setRetryToken((value) => value + 1)}
                className="rounded-full border border-white/10 bg-[#1F1B2E] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/20"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-sm text-slate-400">
          Review past gait analyses by customer.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#26223B] p-4">
        {loadingData ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading reports…</div>
        ) : (
          selectedResult ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setSelectedSessionId(null);
                    setSelectedDetail(null);
                  }}
                  className="rounded-full border border-white/10 bg-[#1F1B2E] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/20"
                >
                  Back to Reports
                </button>
                {selectedDetail?.customer_id && (
                  <div className="text-sm text-slate-400">
                    {customersById[selectedDetail.customer_id] ?? selectedDetail.customer_id}
                  </div>
                )}
              </div>
              {loadingDetail ? (
                <div className="py-10 text-center text-sm text-slate-400">Loading report…</div>
              ) : (
                <ResultStep
                  analysis={selectedResult}
                  onNewAnalysis={() => router.push("/admin/analysis/new")}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold text-slate-200">Reports</div>
              {warningParam === "missing-job" && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
                  We finished processing the session, but a report ID was missing. Please refresh or contact support.
                </div>
              )}
              {error && <div className="text-xs text-red-400">{error}</div>}
              <div className="flex flex-wrap items-end gap-3 pb-1">
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Customer email
                  <input
                    type="text"
                    value={emailFilter}
                    onChange={(e) => setEmailFilter(e.target.value)}
                    placeholder="Filter by email…"
                    className="rounded-lg border border-white/10 bg-[#1F1B2E] px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-white/30 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-400">
                  Date
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-[#1F1B2E] px-3 py-1.5 text-sm text-slate-200 focus:border-white/30 focus:outline-none"
                  />
                </label>
                {(emailFilter || dateFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailFilter("");
                      setDateFilter("");
                    }}
                    className="rounded-lg border border-white/10 bg-[#1F1B2E] px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-white/20"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#1F1B2E] px-3 py-2">
                  <span className="text-xs text-slate-300">{selectedIds.size} selected</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedIds(new Set())}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingBulkDelete(true)}
                      disabled={bulkDeleting}
                      className="rounded-lg border border-red-400/30 bg-red-900/20 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:border-red-400/50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {bulkDeleting ? "Deleting…" : `Delete selected (${selectedIds.size})`}
                    </button>
                  </div>
                </div>
              )}
              {sessions.length === 0 ? (
                <div className="text-xs text-slate-400">
                  No reports yet. Run an analysis to see results here.
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="text-xs text-slate-400">No reports match these filters.</div>
              ) : (
                <div className="flex flex-col gap-5">
                  {groupedSessions.map((group) => (
                    <SessionStatusBlock
                      key={group.status}
                      label={group.label}
                      sessions={group.sessions}
                      customersById={customersById}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      onOpen={setSelectedSessionId}
                      onDownload={handleDownloadReport}
                      onDelete={requestDeleteSession}
                      downloadingId={downloadingId}
                      deletingId={deletingId}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={cancelDeleteSession}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#26223B] p-6 shadow-xl"
          >
            <h2 className="text-base font-semibold text-white">Delete this report?</h2>
            <p className="mt-2 text-sm text-slate-400">
              {pendingDelete.customer_id && customersById[pendingDelete.customer_id]
                ? `The report for ${customersById[pendingDelete.customer_id]} will be permanently deleted.`
                : "This report will be permanently deleted."}
              {" "}This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelDeleteSession}
                className="rounded-full border border-white/10 bg-[#1F1B2E] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSession}
                className="rounded-full border border-red-400/30 bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-400/50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBulkDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setPendingBulkDelete(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#26223B] p-6 shadow-xl"
          >
            <h2 className="text-base font-semibold text-white">Delete {selectedIds.size} reports?</h2>
            <p className="mt-2 text-sm text-slate-400">
              These reports will be permanently deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingBulkDelete(false)}
                className="rounded-full border border-white/10 bg-[#1F1B2E] px-4 py-2 text-sm font-semibold text-slate-200 hover:border-white/20"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkDelete}
                className="rounded-full border border-red-400/30 bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-200 hover:border-red-400/50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
