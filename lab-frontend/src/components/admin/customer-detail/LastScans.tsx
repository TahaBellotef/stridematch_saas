"use client";

import { useEffect, useState } from "react";
import { Eye, CornersIn } from "@phosphor-icons/react";
import {
  fetchCustomerAnalysesList,
  openCustomerAnalysisReport,
  CustomerAnalysisSummary,
} from "@/features/lab/services/customer.service";

type ScanItem = {
  id: string;
  jobId: string;
  dateText: string;
};

function formatDateText(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function mapAnalysisToScanItem(analysis: CustomerAnalysisSummary): ScanItem {
  return {
    id: analysis.job_id,
    jobId: analysis.job_id,
    dateText: formatDateText(analysis.created_at),
  };
}

interface LastScansProps {
  customerId: string;
}

export function LastScans({ customerId }: LastScansProps) {
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!customerId) {
      setScans([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchCustomerAnalysesList(customerId)
      .then((analyses) => {
        if (isMounted) setScans(analyses.map(mapAnalysisToScanItem));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  const handleViewReport = async (jobId: string) => {
    setOpenError(null);
    try {
      await openCustomerAnalysisReport(jobId);
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : "Failed to open report.");
    }
  };

  return (
    <div
      style={{ backgroundColor: "#28243D", border: "1px solid #3A3556" }}
      className="rounded-2xl p-4 h-full"
    >
      <div className="flex items-center gap-2 mb-4">
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            border: "1px solid rgba(89, 200, 139, 0.55)",
            backgroundColor: "rgba(89, 200, 139, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CornersIn size={16} color="#59C88B" />
        </div>
        <h2 className="text-sm font-medium text-white">Last Scan</h2>
      </div>

      <div
        style={{ backgroundColor: "#312D4B", border: "1px solid #3E3960" }}
        className="rounded-2xl p-4 space-y-3"
      >
        {loading && <p className="text-slate-400 text-sm px-1">Loading scans…</p>}
        {!loading && scans.length === 0 && (
          <p className="text-slate-400 text-sm px-1">No scans yet.</p>
        )}
        {openError && <p className="text-red-400 text-sm px-1">{openError}</p>}
        {scans.map((scan) => (
          <div
            key={scan.id}
            style={{ backgroundColor: "#4A4667", border: "1px solid #2F2B49" }}
            className="rounded-full px-5 py-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="text-white text-[18px] font-semibold leading-tight max-md:text-sm truncate">
                {scan.dateText}
              </p>
            </div>
            <button
              onClick={() => handleViewReport(scan.jobId)}
              style={{
                backgroundColor: "#4A456B",
                border: "1px solid #8A84B3",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm hover:bg-[#403B61] transition-colors flex-shrink-0"
            >
              <Eye size={14} />
              Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
