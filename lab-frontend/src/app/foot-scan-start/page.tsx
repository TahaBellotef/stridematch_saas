"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createFootScanSession,
  getFootScanSessionResult,
  pollFootScanJob,
  submitFootScan,
  uploadFootImage,
  type FootSide,
} from "@/features/foot-scan/services/footScanApi.service";
import { FootPlacementGuide } from "@/features/foot-scan/components/FootPlacementGuide";

const PENDING_CUSTOMER_KEY = "lab:pendingCustomer";
const SESSION_ID_KEY = "footscan:sessionId";

type FootStatus = "idle" | "uploading" | "analyzing" | "completed" | "failed";

type FootSlotState = {
  status: FootStatus;
  previewUrl: string | null;
  errorMessage: string | null;
};

const INITIAL_SLOT: FootSlotState = { status: "idle", previewUrl: null, errorMessage: null };

export default function FootScanStartPage() {
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Record<FootSide, FootSlotState>>({
    left: { ...INITIAL_SLOT },
    right: { ...INITIAL_SLOT },
  });
  const [redirecting, setRedirecting] = useState(false);

  const leftInputRef = useRef<HTMLInputElement>(null);
  const rightInputRef = useRef<HTMLInputElement>(null);

  const startNewSession = useCallback(async () => {
    setSessionError(null);
    setSlots({ left: { ...INITIAL_SLOT }, right: { ...INITIAL_SLOT } });

    let customerId: string | undefined;
    try {
      const raw = sessionStorage.getItem(PENDING_CUSTOMER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: string };
        customerId = parsed?.id || undefined;
      }
    } catch {
      customerId = undefined;
    }

    try {
      const { sessionId: newSessionId } = await createFootScanSession(customerId);
      setSessionId(newSessionId);
      sessionStorage.setItem(SESSION_ID_KEY, newSessionId);
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Failed to start foot scan session.");
    }
  }, []);

  useEffect(() => {
    startNewSession();
  }, [startNewSession]);

  const updateSlot = useCallback((foot: FootSide, patch: Partial<FootSlotState>) => {
    setSlots((prev) => ({ ...prev, [foot]: { ...prev[foot], ...patch } }));
  }, []);

  const handleFileSelected = useCallback(
    async (foot: FootSide, file: File) => {
      if (!sessionId) {
        updateSlot(foot, { errorMessage: "Session not ready yet. Please wait a moment and try again." });
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      updateSlot(foot, { status: "uploading", previewUrl, errorMessage: null });

      try {
        const { s3Key } = await uploadFootImage(file);

        updateSlot(foot, { status: "analyzing" });
        const { jobId } = await submitFootScan(sessionId, s3Key, foot, navigator.userAgent);

        const result = await pollFootScanJob(jobId);
        if (result.status === "completed") {
          updateSlot(foot, { status: "completed" });
        } else {
          updateSlot(foot, {
            status: "failed",
            errorMessage: result.error_message || "Could not analyze this photo. Please try another.",
          });
        }
      } catch (err) {
        updateSlot(foot, {
          status: "failed",
          errorMessage: err instanceof Error ? err.message : "Upload failed. Please try again.",
        });
      }
    },
    [sessionId, updateSlot]
  );

  const onInputChange = (foot: FootSide) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) {
      handleFileSelected(foot, file);
    }
  };

  const bothCompleted = slots.left.status === "completed" && slots.right.status === "completed";

  useEffect(() => {
    if (!bothCompleted || !sessionId || redirecting) return;

    setRedirecting(true);
    (async () => {
      try {
        const result = await getFootScanSessionResult(sessionId);
        sessionStorage.setItem(`footscan:result:${sessionId}`, JSON.stringify(result));
      } catch {
        // Complete page will re-fetch by sessionId if this fails.
      }
      router.push(`/foot-scan-complete?sessionId=${sessionId}`);
    })();
  }, [bothCompleted, sessionId, redirecting, router]);

  const anyFailed = slots.left.status === "failed" || slots.right.status === "failed";

  return (
    <div
      style={{
        backgroundColor: "#2D2B47",
        minHeight: "100vh",
        fontFamily: "'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          height: "64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 32px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <Image src="/logo.svg" alt="StrideMatch" width={140} height={28} />
        <button
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            color: "#E2E8F0",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close"
          onClick={() => router.push("/admin/analysis")}
        >
          ×
        </button>
      </div>

      {/* Main Content */}
      <div style={{ padding: "40px 32px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "760px" }}>
          <h1 style={{ color: "#FFFFFF", fontSize: "18px", fontWeight: 600, margin: "0 0 16px 0" }}>
            3D Foot Scan
          </h1>

          <div
            style={{
              backgroundColor: "#312D4B",
              borderRadius: "16px",
              padding: "20px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            }}
          >
            <p style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600, margin: "0 0 4px 0" }}>
              Upload a photo of each foot
            </p>
            <p style={{ color: "#A0A8B5", fontSize: "12px", margin: "0 0 16px 0" }}>
              Place only the foot being scanned beside an A4 sheet of paper - keep your other foot and leg out of frame - then take a clear photo from directly above.
            </p>

            {sessionError && (
              <div
                style={{
                  marginBottom: "14px",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: "12px",
                  padding: "10px 12px",
                }}
              >
                <p style={{ color: "#FCA5A5", fontSize: "12px", margin: 0 }}>{sessionError}</p>
                <button
                  onClick={startNewSession}
                  style={{
                    marginTop: "8px",
                    background: "none",
                    border: "none",
                    color: "#A78BFA",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FootUploadCard
                foot="left"
                label="Left Foot"
                slot={slots.left}
                disabled={!sessionId}
                onPick={() => leftInputRef.current?.click()}
                onRetryAll={startNewSession}
              />
              <FootUploadCard
                foot="right"
                label="Right Foot"
                slot={slots.right}
                disabled={!sessionId}
                onPick={() => rightInputRef.current?.click()}
                onRetryAll={startNewSession}
              />
            </div>

            <input
              ref={leftInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              style={{ display: "none" }}
              onChange={onInputChange("left")}
            />
            <input
              ref={rightInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              style={{ display: "none" }}
              onChange={onInputChange("right")}
            />

            {anyFailed && (
              <div
                style={{
                  marginTop: "16px",
                  textAlign: "center",
                }}
              >
                <button
                  onClick={startNewSession}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "9999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    backgroundColor: "transparent",
                    color: "#E2E8F0",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    cursor: "pointer",
                  }}
                >
                  Start over
                </button>
              </div>
            )}

            <div
              style={{
                marginTop: "16px",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "9999px",
                padding: "8px 12px",
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <span style={{ color: "#10B981", fontSize: "12px", lineHeight: "18px" }}>●</span>
              <p style={{ color: "#A0A8B5", fontSize: "12px", margin: 0 }}>
                This analysis provides insights into your stride, movement patterns, and biomechanics. It delivers precise data
                to help you understand your unique running style and determine the best shoe for your needs.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FootUploadCard({
  foot,
  label,
  slot,
  disabled,
  onPick,
  onRetryAll,
}: {
  foot: FootSide;
  label: string;
  slot: FootSlotState;
  disabled: boolean;
  onPick: () => void;
  onRetryAll: () => void;
}) {
  const { status, previewUrl, errorMessage } = slot;
  // The backend allows retrying a single foot on the same session as long
  // as that foot's last job failed - so a failed photo can be replaced
  // in-place. A foot that already completed locks its slot though:
  // redoing it requires starting a brand new session for both feet.
  const needsFullReset = status === "completed";

  return (
    <div
      style={{
        backgroundColor: "#1A1828",
        borderRadius: "12px",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <p style={{ color: "#FFFFFF", fontSize: "13px", fontWeight: 600, margin: 0 }}>{label}</p>

      <div
        style={{
          position: "relative",
          width: "100%",
          height: "220px",
          borderRadius: "10px",
          overflow: "hidden",
          backgroundColor: "#28243D",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {previewUrl ? (
          <Image src={previewUrl} alt={`${label} preview`} fill style={{ objectFit: "contain" }} unoptimized />
        ) : (
          <FootPlacementGuide foot={foot} />
        )}

        {status === "uploading" || status === "analyzing" ? (
          <div className="scan-line" />
        ) : null}
      </div>

      <StatusBadge status={status} />

      {errorMessage && (
        <p style={{ color: "#FCA5A5", fontSize: "11px", margin: 0 }}>{errorMessage}</p>
      )}

      <button
        onClick={needsFullReset ? onRetryAll : onPick}
        disabled={disabled || status === "uploading" || status === "analyzing"}
        style={{
          padding: "8px 0",
          borderRadius: "9999px",
          fontSize: "12px",
          fontWeight: 600,
          backgroundColor:
            disabled || status === "uploading" || status === "analyzing" ? "#4B4768" : "#6A47F4",
          color: "#FFFFFF",
          border: "none",
          cursor: disabled || status === "uploading" || status === "analyzing" ? "not-allowed" : "pointer",
        }}
      >
        {status === "completed" ? "Start Over" : status === "failed" ? "Try Again" : "Upload Photo"}
      </button>

      <style jsx>{`
        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, rgba(106, 71, 244, 0.9), transparent);
          animation: scan-move 1.6s ease-in-out infinite;
        }

        @keyframes scan-move {
          0% {
            top: 8px;
          }
          50% {
            top: calc(100% - 12px);
          }
          100% {
            top: 8px;
          }
        }
      `}</style>
    </div>
  );
}

function StatusBadge({ status }: { status: FootStatus }) {
  const copy: Record<FootStatus, string> = {
    idle: "Waiting for photo",
    uploading: "Uploading…",
    analyzing: "Analyzing…",
    completed: "Scan complete",
    failed: "Scan failed",
  };

  const color: Record<FootStatus, string> = {
    idle: "#9CA3AF",
    uploading: "#A78BFA",
    analyzing: "#A78BFA",
    completed: "#10B981",
    failed: "#F87171",
  };

  return (
    <span style={{ color: color[status], fontSize: "11px", fontWeight: 600 }}>{copy[status]}</span>
  );
}
