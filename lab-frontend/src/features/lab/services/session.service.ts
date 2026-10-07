import { apiFetch } from "@/shared/api/client";
import { RunnerProfile } from "../domain/runner.types";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */

export type CaptureType = "side" | "rear";

export type AnalysisSession = {
  id: string;
  created_at: string;
  status: "pending" | "processing" | "completed" | "failed";

  runner_profile: RunnerProfile;

  // IMPORTANT: order matters
  required_captures: CaptureType[];
  completed_captures: CaptureType[];

  inferred_pronation?: string | null;
  active_analysis_job_id?: string | null;
};

/* ------------------------------------------------------------------ */
/* Create session */
/* ------------------------------------------------------------------ */

export async function createSession(
  runnerProfile: RunnerProfile,
  customerId?: string,
  analysisType?: "rear" | "side"
): Promise<AnalysisSession> {
  const res = await apiFetch("/api/v1/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      runner_profile: runnerProfile,
      customer_id: customerId ?? null,
      analysis_type: analysisType ?? null,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${text}`);
  }

  const session: AnalysisSession = await res.json();

  if (!Array.isArray(session.required_captures) || session.required_captures.length === 0) {
    throw new Error("Session returned without required captures");
  }

  if (!Array.isArray(session.completed_captures)) {
    session.completed_captures = [];
  }

  return session;
}

/* ------------------------------------------------------------------ */
/* Get session (authoritative state refresh)
 * ------------------------------------------------------------------ */

export async function getSession(sessionId: string): Promise<AnalysisSession> {
  const res = await apiFetch(`/api/v1/sessions/${sessionId}`, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load session (${res.status}): ${text}`);
  }

  return res.json();
}

/* ------------------------------------------------------------------ */
/* Capture helper: get the next capture that backend expects
 * ------------------------------------------------------------------ */

export function getNextCapture(session: AnalysisSession): CaptureType | null {
  const required = session.required_captures ?? [];
  const completed = session.completed_captures ?? [];

  // Next capture is required[index] where index == completed.length
  if (completed.length >= required.length) return null;

  return required[completed.length] ?? null;
}
