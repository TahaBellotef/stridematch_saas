"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getFootScanSessionResult,
  type BackendFootScanResult,
  type BackendFootScanSessionResult,
} from "@/features/foot-scan/services/footScanApi.service";

// Standalone (no customer attached) foot scan results. Separate from the
// customer-linked "3D Foot Scan Results" section on /admin/analysis on
// purpose - that page is keyed entirely off a selected customer, so a
// scan with no customer has nowhere to surface there.

export default function FootScanResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  const [result, setResult] = useState<BackendFootScanSessionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("No scan session was specified.");
      return;
    }

    let cancelled = false;

    // foot-scan-start already stashes the freshly-completed result in
    // sessionStorage right before redirecting here via foot-scan-complete -
    // use it for an instant render, falling back to the API (e.g. on a
    // direct link or page refresh, where that stash is gone).
    try {
      const cached = sessionStorage.getItem(`footscan:result:${sessionId}`);
      if (cached) {
        setResult(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {
      // Fall through to the API fetch below.
    }

    setLoading(true);
    setError(null);
    getFootScanSessionResult(sessionId)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load foot scan results.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div
      style={{
        backgroundColor: "#28243D",
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
          onClick={() => router.push("/admin/dashboard/overview")}
        >
          ×
        </button>
      </div>

      {/* Main Content */}
      <div style={{ padding: "48px 32px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "720px" }}>
          <h1 style={{ color: "#FFFFFF", fontSize: "18px", fontWeight: 600, margin: "0 0 16px 0" }}>
            3D Foot Scan Results
          </h1>

          {loading && (
            <div style={{ padding: "60px 20px", textAlign: "center", color: "#A0A8B5", fontSize: "13px" }}>
              Loading foot scan results…
            </div>
          )}

          {!loading && error && (
            <div
              style={{
                padding: "20px",
                borderRadius: "16px",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#FCA5A5",
                fontSize: "13px",
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && result && (
            <FootScanResultContent result={result} onNewScan={() => router.push("/foot-scan-steps")} />
          )}
        </div>
      </div>
    </div>
  );
}

function FootScanResultContent({
  result,
  onNewScan,
}: {
  result: BackendFootScanSessionResult;
  onNewScan: () => void;
}) {
  const { left_result, right_result, recommendation } = result;

  const hasAnyData = Boolean(left_result?.measurement || right_result?.measurement);

  if (!hasAnyData) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        style={{ borderRadius: "16px", backgroundColor: "#312D4B", minHeight: "300px" }}
      >
        <h3 className="text-lg font-semibold text-slate-100">Scan incomplete</h3>
        <p className="max-w-md text-sm text-slate-400">
          We couldn&apos;t find completed measurements for this scan. Try running it again.
        </p>
        <button
          onClick={onNewScan}
          className="mt-1 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Start a new scan
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {recommendation && (
        <div
          style={{
            backgroundColor: "#312D4B",
            borderRadius: "16px",
            padding: "20px",
            display: "flex",
            gap: "12px",
            justifyContent: "space-around",
          }}
        >
          <SizeBox label="EU" value={recommendation.eu} />
          <SizeBox label="US" value={recommendation.us_men} />
          <SizeBox label="UK" value={recommendation.uk} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <FootCard label="Left Foot" foot={left_result} />
        <FootCard label="Right Foot" foot={right_result} />
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <button
          onClick={onNewScan}
          style={{
            padding: "10px 24px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: 600,
            backgroundColor: "transparent",
            color: "#E2E8F0",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            cursor: "pointer",
          }}
        >
          Start another scan
        </button>
      </div>
    </div>
  );
}

function SizeBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
      <span style={{ color: "#9AA3AF", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}
      </span>
      <span style={{ color: "#FFFFFF", fontSize: "24px", fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function FootCard({ label, foot }: { label: string; foot?: BackendFootScanResult | null }) {
  const failed = foot?.status === "failed";
  const measurement = foot?.measurement;
  const sizes = foot?.sizes;
  const confidence = foot?.confidence;

  return (
    <div
      style={{
        backgroundColor: "#312D4B",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <span style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 600 }}>{label}</span>

      {failed || !measurement ? (
        <p style={{ color: "#FCA5A5", fontSize: "12px", margin: 0 }}>
          {foot?.error_message || "No measurement available."}
        </p>
      ) : (
        <>
          {sizes && (
            <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
              <span style={{ color: "#A78BFA", fontSize: "28px", fontWeight: 700 }}>EU {sizes.eu}</span>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <Metric label="Length" value={`${measurement.length_mm.toFixed(0)}mm`} />
            <Metric label="Width" value={`${measurement.width_mm.toFixed(0)}mm`} />
            {confidence && (
              <Metric label="Confidence" value={`${Math.round(confidence.overall * 100)}%`} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#1A1828",
        borderRadius: "10px",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "2px",
      }}
    >
      <span style={{ color: "#9AA3AF", fontSize: "10px" }}>{label}</span>
      <span style={{ color: "#E2E8F0", fontSize: "14px", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
