import { apiFetch } from "@/shared/api/client";

/* ------------------------------------------------------------------
 * Types (mirror lab-backend/app/schemas/foot_scan.py)
 * ------------------------------------------------------------------ */

export type FootSide = "left" | "right";
export type BackendScanStatus = "pending" | "processing" | "completed" | "failed";

export type BackendCalibrationInfo = {
  method: "a4_paper";
  detected: boolean;
  orientation?: "portrait" | "landscape" | null;
  px_per_mm?: number | null;
  confidence: number;
  corners?: number[][] | null;
};

export type BackendFootMeasurement = {
  length_px: number;
  width_px: number;
  length_mm: number;
  width_mm: number;
  length_cm: number;
  width_cm: number;
  axis?: number[] | null;
};

export type BackendShoeSizes = {
  eu: number;
  us_men: number;
  us_women: number;
  uk: number;
  jp: number;
};

export type BackendConfidenceBreakdown = {
  overall: number;
  calibration: number;
  segmentation: number;
  measurement: number;
  warnings: string[];
};

export type BackendFootScanResult = {
  job_id: string;
  session_id: string;
  foot: FootSide;
  status: BackendScanStatus;
  calibration?: BackendCalibrationInfo | null;
  measurement?: BackendFootMeasurement | null;
  sizes?: BackendShoeSizes | null;
  confidence?: BackendConfidenceBreakdown | null;
  debug_image_url?: string | null;
  original_image_url?: string | null;
  created_at: string;
  completed_at?: string | null;
  error_message?: string | null;
};

export type BackendSizeRecommendation = {
  eu: number;
  us_men: number;
  us_women: number;
  uk: number;
  jp: number;
  larger_foot: FootSide;
  length_difference_mm: number;
};

export type BackendFootScanSessionResult = {
  session_id: string;
  customer_id?: string | null;
  status: BackendScanStatus;
  created_at: string;
  completed_at?: string | null;
  left_result?: BackendFootScanResult | null;
  right_result?: BackendFootScanResult | null;
  recommendation?: BackendSizeRecommendation | null;
  overall_confidence?: number | null;
};

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedImageType = typeof ALLOWED_IMAGE_TYPES[number];

/** FastAPI error bodies are `{ "detail": "..." }` — fall back to raw text otherwise. */
function extractErrorDetail(text: string, fallback: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.detail && typeof parsed.detail === "string") {
      return parsed.detail;
    }
  } catch {
    // not JSON, fall through
  }
  return text || fallback;
}

/* ------------------------------------------------------------------
 * Session
 * ------------------------------------------------------------------ */

export async function createFootScanSession(customerId?: string): Promise<{ sessionId: string }> {
  const res = await apiFetch("/api/v1/foot-scan/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_id: customerId ?? null }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorDetail(text, `Failed to create foot scan session (${res.status})`));
  }

  const data: { session_id: string } = await res.json();
  return { sessionId: data.session_id };
}

/* ------------------------------------------------------------------
 * Upload image (presign + PUT), mirrors analysis.service.ts runAnalysis()
 * ------------------------------------------------------------------ */

export async function uploadFootImage(file: File): Promise<{ s3Key: string }> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    throw new Error("Unsupported image format. Please upload a JPG, PNG, or WEBP photo.");
  }

  const presignRes = await apiFetch("/api/v1/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: file.type, allow_images: true }),
  });

  if (!presignRes.ok) {
    const text = await presignRes.text();
    throw new Error(extractErrorDetail(text, "Failed to get upload URL"));
  }

  const { upload_url, s3_key }: { upload_url: string; s3_key: string } = await presignRes.json();

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!uploadRes.ok) {
    throw new Error("Image upload failed");
  }

  return { s3Key: s3_key };
}

/* ------------------------------------------------------------------
 * Submit foot for analysis
 * ------------------------------------------------------------------ */

export async function submitFootScan(
  sessionId: string,
  s3Key: string,
  foot: FootSide,
  deviceInfo?: string
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("s3_key", s3Key);
  formData.append("foot", foot);
  if (deviceInfo) {
    formData.append("device_info", deviceInfo);
  }

  const res = await apiFetch("/api/v1/foot-scan/analyze", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorDetail(text, `Failed to submit ${foot} foot for analysis`));
  }

  const data: { job_id: string } = await res.json();
  return { jobId: data.job_id };
}

/* ------------------------------------------------------------------
 * Poll job until completed/failed
 * ------------------------------------------------------------------ */

export async function pollFootScanJob(
  jobId: string,
  opts?: { intervalMs?: number; timeoutMs?: number }
): Promise<BackendFootScanResult> {
  let intervalMs = opts?.intervalMs ?? 1500;
  const timeoutMs = opts?.timeoutMs ?? 3 * 60 * 1000;
  const start = Date.now();

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Foot scan analysis timed out. Please try again.");
    }

    const res = await apiFetch(`/api/v1/foot-scan/${jobId}`, { method: "GET" });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(extractErrorDetail(text, `Failed to check scan status (${res.status})`));
    }

    const result: BackendFootScanResult = await res.json();
    if (result.status === "completed" || result.status === "failed") {
      return result;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
    intervalMs = Math.min(Math.round(intervalMs * 1.4), 6000);
  }
}

/* ------------------------------------------------------------------
 * Combined session result
 * ------------------------------------------------------------------ */

export async function getFootScanSessionResult(sessionId: string): Promise<BackendFootScanSessionResult> {
  const res = await apiFetch(`/api/v1/foot-scan/session/${sessionId}`, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorDetail(text, `Failed to load foot scan session (${res.status})`));
  }

  return res.json();
}

/** Most recent foot scan session for a customer, looked up without a session id. */
export async function getFootScanResultByCustomer(
  customerId: string
): Promise<BackendFootScanSessionResult | null> {
  const res = await apiFetch(`/api/v1/foot-scan/customer/${encodeURIComponent(customerId)}/latest`, {
    method: "GET",
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorDetail(text, `Failed to load foot scan results (${res.status})`));
  }

  return res.json();
}
