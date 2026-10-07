import { apiFetch } from "@/shared/api/client";
import { AnalysisResult } from "../domain/analysis.types";

export type CaptureType = "side" | "rear";

export type RearAnalysisResponse = {
  status: "rear_completed";
  pronation: string;
  next_capture: CaptureType;
};

export type ProcessingAnalysisResponse = {
  status: "processing";
  job_id: string;
  session_id: string;
  capture_type: CaptureType;
  analysis_type?: "rear" | "side";
};

export type RunAnalysisResponse =
  | AnalysisResult
  | RearAnalysisResponse
  | ProcessingAnalysisResponse;

type RunAnalysisInput = {
  sessionId: string;
  captureType: CaptureType;
  file: File;
  analysisType?: "rear" | "side";
};

type UploadResult = {
  s3Key: string;
};

type TriggerAnalysisInput = {
  sessionId: string;
  captureType: CaptureType;
  s3Key: string;
  analysisType?: "rear" | "side";
};

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
type AllowedVideoType = typeof ALLOWED_VIDEO_TYPES[number];

function withVideoToken(url: string | null | undefined, token?: string): string | null | undefined {
  if (!url || !token || !url.includes("/video")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function attachVideoTokenToResult(result: AnalysisResult, token?: string): AnalysisResult {
  if (!token) return result;
  return {
    ...result,
    video_url: withVideoToken(result.video_url, token) || result.video_url,
    rear_video_url: withVideoToken(result.rear_video_url, token) ?? result.rear_video_url,
    side_video_url: withVideoToken(result.side_video_url, token) ?? result.side_video_url,
  };
}

export async function runAnalysis(
  input: RunAnalysisInput
): Promise<UploadResult> {
  const { sessionId, captureType, file } = input;

  const t0 = performance.now();
  console.log("[submitVideo] UPLOAD START", {
    sessionId,
    captureType,
    file: { name: file.name, type: file.type, size: file.size },
  });

  // 0) Validate
  if (!ALLOWED_VIDEO_TYPES.includes(file.type as AllowedVideoType)) {
    throw new Error("Unsupported video format. Please upload MP4, MOV, or WEBM.");
  }

  // 1) Presign
  const presignRes = await apiFetch("/api/v1/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: file.type }),
  });

  if (!presignRes.ok) {
    const msg = await presignRes.text();
    throw new Error(msg || "Failed to get upload URL");
  }

  const { upload_url, s3_key }: { upload_url: string; s3_key: string } =
    await presignRes.json();

  // 2) Upload to S3
  const uploadRes = await fetch(upload_url, { method: "PUT", body: file });
  if (!uploadRes.ok) throw new Error("Video upload failed");

  const t1 = performance.now();
  console.log("[TIMING] uploadVideo:", (t1 - t0).toFixed(1), "ms");

  return { s3Key: s3_key };
}

export async function fetchAnalysisByJobId(jobId: string): Promise<AnalysisResult | null> {
  const res = await apiFetch(`/api/v1/analysis/${jobId}`, { method: "GET" });

  if (!res.ok) {
    if (res.status === 404) return null;
    const text = await res.text();
    throw new Error(text || `Failed to load analysis (${res.status})`);
  }

  const data = await res.json();
  if (data?.status === "succeeded" && data.result) {
    return attachVideoTokenToResult(data.result as AnalysisResult, data.video_token);
  }
  if (data?.job_id || data?.analysis_type) {
    return data as AnalysisResult;
  }
  return null;
}

export async function triggerAnalysisRun(
  input: TriggerAnalysisInput
): Promise<{ ok: boolean; status: number }> {
  const { sessionId, captureType, s3Key, analysisType } = input;

  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("capture_type", captureType);
  formData.append("s3_key", s3Key);
  if (analysisType) {
    formData.append("analysis_type", analysisType);
  }

  const response = await apiFetch("/api/v1/analysis/run", {
    method: "POST",
    body: formData,
  });

  if (response.status === 409) {
    return { ok: true, status: response.status };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Analysis request failed.");
  }

  return { ok: true, status: response.status };
}

/* ------------------------------------------------------------------
 * Poll for analysis result with backoff + timeout
 * ------------------------------------------------------------------ */

export async function waitForAnalysisResult(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<AnalysisResult> {
  let intervalMs = opts?.intervalMs ?? 2000;
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;

  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Analysis timed out. Please try again.");
    }

    const res = await apiFetch(`/api/v1/analysis/${jobId}`, { method: "GET" });

    if (res.ok) {
      const data = await res.json();
      if (data?.status === "succeeded") {
        return attachVideoTokenToResult(data.result as AnalysisResult, data.video_token);
      }
      if (data?.status === "failed") {
        throw new Error(data.error || "Analysis failed");
      }
      if (data?.status === "processing") {
        // keep polling
      } else if (data?.job_id || data?.analysis_type) {
        // Backward compatibility: if backend returns AnalysisResult directly
        return data as AnalysisResult;
      }
    } else if (res.status !== 404) {
      const text = await res.text();
      throw new Error(`Failed to load analysis (${res.status}): ${text}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    intervalMs = Math.min(Math.round(intervalMs * 1.5), 8000);
  }
}
