"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { NewCustomerModal } from "@/components/admin/new-customer/NewCustomerModal";
import { GaitAnalysisModal } from "./GaitAnalysisModal";
import { ChartLineUp, Footprints, UserPlus } from "@phosphor-icons/react";

type NewScanModalProps = {
  onClose: () => void;
};

export function NewScanModal({ onClose }: NewScanModalProps) {
  const router = useRouter();
  const [selectedScan, setSelectedScan] = useState<string | null>(null);

  const scanOptions = [
    {
      id: "new-client",
      title: "New Client",
      icon: <UserPlus size={32} weight="light" />,
    },
    {
      id: "gait-analysis",
      title: "Gait Analysis",
      icon: <ChartLineUp size={32} weight="light" />,
    },
    {
      id: "foot-scan",
      title: "Foot Scan",
      icon: <Footprints size={32} weight="light" />,
    },
  ];

  const handleOptionClick = (id: string) => {
    if (id === "foot-scan") {
      // General/standalone scan, not tied to a customer - clear any
      // leftover "pendingCustomer" from an unrelated earlier flow so this
      // session is created with customer_id=null (the backend already
      // supports this) and its results land on the standalone results
      // page instead of being attributed to whichever customer happened
      // to be selected last. Does not touch the customer-linked flow
      // (started from the Customers/Analysis pages), which still sets
      // pendingCustomer itself right before navigating here.
      try {
        sessionStorage.removeItem("lab:pendingCustomer");
      } catch {
        // Ignore storage errors - worst case a stale id lingers.
      }
      router.push("/foot-scan-steps");
      onClose();
      return;
    }
    if (id === "gait-analysis" || id === "new-client") {
      setSelectedScan(id);
      return;
    }
  };

  let content: ReactNode;
  if (selectedScan === "gait-analysis") {
    content = (
      <GaitAnalysisModal
        onClose={() => {
          setSelectedScan(null);
          onClose();
        }}
      />
    );
  } else if (selectedScan === "new-client") {
    content = (
      <NewCustomerModal
        open
        onClose={() => {
          setSelectedScan(null);
          onClose();
        }}
      />
    );
  } else {
    content = (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="relative w-full max-w-lg rounded-3xl bg-[#2D2B47] border border-slate-700 p-8 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-xl font-bold text-white">New Scan</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 2x2 Grid of options */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {scanOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option.id)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  minHeight: "160px",
                  borderRadius: "16px",
                  backgroundColor: "#3E3B56",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  padding: "20px",
                  gridColumn: option.id === "foot-scan" ? "1 / -1" : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#4A4763";
                  e.currentTarget.style.borderColor = "rgba(106, 71, 244, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#3E3B56";
                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                }}
              >
                <div style={{ fontSize: "32px", color: "#E2E8F0" }}>{option.icon}</div>
                <span style={{ fontSize: "13px", fontWeight: 500, color: "#E2E8F0", textAlign: "center" }}>
                  {option.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Rendered via a portal straight onto document.body: NewScanModal is
  // mounted inside AdminHeader (a "position: fixed" element, its own
  // stacking context), while the sidebar is a separate sibling fixed
  // element later in DOM order - same z-index siblings stack by DOM order,
  // not by descendants' z-index, so the sidebar was painting over this
  // modal regardless of its z-[100]. A portal escapes that subtree
  // entirely so the modal/backdrop stacks above everything, sidebar
  // included.
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
