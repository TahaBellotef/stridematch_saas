"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ResultStep } from "@/features/lab/steps/ResultStep";
import { AnalysisResult } from "@/features/lab/domain/analysis.types";
import { apiFetch } from "@/shared/api/client";

function withVideoToken(url: string | null | undefined, token?: string): string | null | undefined {
  if (!url || !token || !url.includes("/video")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export default function AnalysisReportPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = typeof params.job_id === "string" ? params.job_id : "";
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!jobId) return;
    cancelRef.current = false;

    const cached = sessionStorage.getItem(`analysis:${jobId}`);
    if (cached) {
      try {
        setAnalysis(JSON.parse(cached) as AnalysisResult);
      } catch {
        // ignore parse issues
      }
    }

    const poll = async () => {
      let interval = 2000;
      const maxWait = 10 * 60 * 1000;
      const start = Date.now();

      while (!cancelRef.current) {
        try {
          setError(null);
          const res = await apiFetch(`/api/v1/analysis/${jobId}`);
          if (!res.ok) {
            const text = await res.text();
            throw new Error(text || `Failed to load analysis (${res.status})`);
          }

          const data = await res.json();

          // The endpoint returns { status, result } — unwrap it
          if (data?.status === "succeeded" && data.result) {
            const resultRaw = data.result as AnalysisResult;
            const result: AnalysisResult = {
              ...resultRaw,
              video_url: withVideoToken(resultRaw.video_url, data.video_token) || resultRaw.video_url,
              rear_video_url:
                withVideoToken(resultRaw.rear_video_url, data.video_token) ?? resultRaw.rear_video_url,
              side_video_url:
                withVideoToken(resultRaw.side_video_url, data.video_token) ?? resultRaw.side_video_url,
            };
            setAnalysis(result);
            try {
              sessionStorage.setItem(`analysis:${jobId}`, JSON.stringify(result));
            } catch {
              // ignore storage issues
            }
            setLoading(false);
            return;
          }

          if (data?.status === "failed") {
            throw new Error(data.error || "Analysis failed");
          }

          // Still processing — check timeout
          if (Date.now() - start > maxWait) {
            throw new Error("Timed out waiting for analysis result");
          }

          // Wait and retry
          await new Promise((r) => setTimeout(r, interval));
          interval = Math.min(Math.round(interval * 1.5), 8000);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load analysis");
          setLoading(false);
          return;
        }
      }
    };

    poll();

    return () => {
      cancelRef.current = true;
    };
  }, [jobId]);

  if (!jobId) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 text-center text-slate-300">
        Missing analysis ID.
      </div>
    );
  }

  if (loading && !analysis) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 text-center">
        <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-200 border-t-transparent" />
        <p className="text-slate-300">Loading analysis…</p>
      </div>
    );
  }

  if (error && !analysis) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 text-center text-red-300">
        {error}
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-12 text-center text-slate-300">
        No analysis available.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <ResultStep
        analysis={analysis}
        onNewAnalysis={() => router.push("/admin/analysis/new")}
        onBackToReports={() => router.push("/admin/analysis/reports")}
      />
    </div>
  );
}
