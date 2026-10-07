"use client";

import Image from "next/image";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LAST_FOOT_SCAN_SESSION_KEY = "footscan:lastSessionId";

export default function FootScanCompletePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");

  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem(LAST_FOOT_SCAN_SESSION_KEY, sessionId);
    }
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
          onClick={() => {
            let hasCustomer = false;
            try {
              hasCustomer = !!sessionStorage.getItem("lab:pendingCustomer");
            } catch {
              hasCustomer = false;
            }
            router.push(hasCustomer ? "/admin/analysis" : "/admin/dashboard/overview");
          }}
        >
          ×
        </button>
      </div>

      {/* Main Content */}
      <div style={{ padding: "48px 32px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "560px" }}>
          <h1 style={{ color: "#FFFFFF", fontSize: "18px", fontWeight: 600, margin: "0 0 16px 0" }}>
            3D Foot Scan
          </h1>

          <div
            style={{
              backgroundColor: "#312D4B",
              borderRadius: "16px",
              padding: "28px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>

            <div style={{ textAlign: "center" }}>
              <p style={{ color: "#FFFFFF", fontSize: "16px", fontWeight: 600, margin: "0 0 4px 0" }}>
                Congratulations!
              </p>
              <p style={{ color: "#C8CDD7", fontSize: "13px", margin: 0 }}>
                your biomechanics scan is ready
              </p>
            </div>

            <button
              style={{
                width: "100%",
                padding: "10px 0",
                borderRadius: "9999px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#6A47F4",
                color: "#FFFFFF",
                border: "none",
                cursor: "pointer",
              }}
              onClick={() => {
                // Customer-linked scans set "lab:pendingCustomer" right
                // before navigating into this flow and that key is only
                // ever consumed (cleared) once the customer Analysis page
                // itself loads - so seeing it here means this scan belongs
                // to a customer and should land on that existing results
                // tab, unchanged. A standalone scan (started from "New
                // Scan" > "Foot Scan") clears that key up front, so its
                // absence here means there's no customer to attribute
                // this to - it goes to the separate standalone results
                // page instead.
                let hasCustomer = false;
                try {
                  hasCustomer = !!sessionStorage.getItem("lab:pendingCustomer");
                } catch {
                  hasCustomer = false;
                }
                if (hasCustomer) {
                  router.push(
                    `/admin/analysis?tab=results&section=foot${sessionId ? `&footScanSessionId=${sessionId}` : ""}`
                  );
                } else {
                  router.push(`/foot-scan-result${sessionId ? `?sessionId=${sessionId}` : ""}`);
                }
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
