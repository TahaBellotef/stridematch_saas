import { apiFetch } from "@/shared/api/client";

export type SessionCompletionStatus = "pending" | "processing" | "completed" | "failed";

export type SessionCompletionResponse = {
  id: string;
  status: SessionCompletionStatus;
  active_analysis_job_id?: string | null;
  [key: string]: unknown;
};

export async function waitForSessionCompletion(
  sessionId: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<SessionCompletionResponse> {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
  const intervalMs = opts?.intervalMs ?? 2000;
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for analysis");
    }

    const res = await apiFetch(`/api/v1/sessions/${sessionId}`, { method: "GET" });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to load session (${res.status}): ${text}`);
    }

    const session = (await res.json()) as SessionCompletionResponse;
    if (session.status === "completed") {
      return session;
    }
    if (session.status === "failed") {
      throw new Error("Analysis failed");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
