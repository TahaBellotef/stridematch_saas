"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Footprints, Upload } from "lucide-react";
import { fetchCatalogRecommendations } from "@/features/lab/services/catalog.service";
import { CustomerSelectionStep, mapCustomerRowToLabCustomer } from "@/features/lab/steps/CustomerSelectionStep";
import { ResultStep } from "@/features/lab/steps/ResultStep";
import type { CatalogRecommendationItem } from "@/shared/types/catalog";
import type { AnalysisResult } from "@/features/lab/domain/analysis.types";
import {
  fetchCustomers,
  fetchCustomerAnalysesList,
  type CustomerRow,
  type CustomerAnalysisSummary,
} from "@/features/lab/services/customer.service";
import { fetchAnalysisByJobId } from "@/features/lab/services/analysis.service";
import {
  getFootScanResultByCustomer,
  type BackendFootScanSessionResult,
  type BackendFootScanResult,
} from "@/features/foot-scan/services/footScanApi.service";

const PENDING_CUSTOMER_KEY = "lab:pendingCustomer";

// Mirrors the width/length ratio heuristic backend uses for wide/narrow fit
// adjustments (app/services/foot_scan/sizing.py::_calculate_fit_adjustment).
const TYPICAL_WIDTH_RATIO = 0.38;

function widthRatioLabel(lengthMm?: number | null, widthMm?: number | null): "Narrow" | "Average" | "Wide" | null {
  if (!lengthMm || !widthMm) return null;
  const ratio = widthMm / lengthMm;
  if (ratio > TYPICAL_WIDTH_RATIO * 1.1) return "Wide";
  if (ratio < TYPICAL_WIDTH_RATIO * 0.9) return "Narrow";
  return "Average";
}

function widthRatioPosition(lengthMm?: number | null, widthMm?: number | null): number {
  if (!lengthMm || !widthMm) return 50;
  const ratio = widthMm / lengthMm;
  const min = TYPICAL_WIDTH_RATIO * 0.7;
  const max = TYPICAL_WIDTH_RATIO * 1.3;
  const pct = ((ratio - min) / (max - min)) * 100;
  return Math.max(5, Math.min(95, pct));
}

function confidenceLabel(confidence?: number | null): "Low" | "Average" | "High" | null {
  if (confidence == null) return null;
  if (confidence >= 0.75) return "High";
  if (confidence >= 0.45) return "Average";
  return "Low";
}

function confidencePosition(confidence?: number | null): number {
  if (confidence == null) return 50;
  return Math.max(5, Math.min(95, confidence * 100));
}

function formatMm(value?: number | null): string {
  return value != null ? `${value.toFixed(1)}mm` : "—";
}

function formatPct(value?: number | null): string {
  return value != null ? `${Math.round(value * 100)}%` : "—";
}

// Mirrors lab-backend/app/services/foot_scan/sizing.py::EU_SIZE_TABLE - same
// reference points, so a manually entered size converts to the same EU/US/UK
// values a 3D scan would land on for that size.
const EU_SIZE_TABLE: Record<number, { usMen: number; usWomen: number; uk: number }> = {
  35: { usMen: 3, usWomen: 5, uk: 2.5 },
  36: { usMen: 4, usWomen: 6, uk: 3.5 },
  37: { usMen: 5, usWomen: 7, uk: 4 },
  38: { usMen: 6, usWomen: 8, uk: 5 },
  39: { usMen: 6.5, usWomen: 8.5, uk: 5.5 },
  40: { usMen: 7, usWomen: 9, uk: 6 },
  41: { usMen: 8, usWomen: 10, uk: 7 },
  42: { usMen: 9, usWomen: 11, uk: 8 },
  43: { usMen: 10, usWomen: 12, uk: 9 },
  44: { usMen: 11, usWomen: 13, uk: 10 },
  45: { usMen: 12, usWomen: 14, uk: 11 },
  46: { usMen: 13, usWomen: 15, uk: 12 },
};

function closestEuSize(eu: number): number {
  const keys = Object.keys(EU_SIZE_TABLE).map(Number);
  return keys.reduce((closest, key) => (Math.abs(key - eu) < Math.abs(closest - eu) ? key : closest), keys[0]);
}

function euFromUk(uk: number): number {
  const entries = Object.entries(EU_SIZE_TABLE);
  const [closest] = entries.reduce((best, [euStr, v]) =>
    Math.abs(v.uk - uk) < Math.abs(best[1].uk - uk) ? [euStr, v] : best
  );
  return Number(closest);
}

function euFromUs(us: number, gender: "men" | "women"): number {
  const entries = Object.entries(EU_SIZE_TABLE);
  const [closest] = entries.reduce((best, [euStr, v]) => {
    const value = gender === "women" ? v.usWomen : v.usMen;
    const bestValue = gender === "women" ? best[1].usWomen : best[1].usMen;
    return Math.abs(value - us) < Math.abs(bestValue - us) ? [euStr, v] : best;
  });
  return Number(closest);
}

type ShoeSizeConversion = { eu: number; us: number; uk: number; usLabel: string };

// Converts a manually entered shoe size (any unit) into EU/US/UK using the
// table above - an approximation for display, not a measurement.
function convertShoeSize(
  rawSize?: string | null,
  unit?: string | null,
  sex?: string | null
): ShoeSizeConversion | null {
  const value = Number.parseFloat(rawSize ?? "");
  if (!rawSize || Number.isNaN(value)) return null;

  const gender: "men" | "women" = sex === "female" ? "women" : "men";
  const normalizedUnit = (unit || "EU").toUpperCase();

  let eu: number;
  if (normalizedUnit === "UK") eu = euFromUk(value);
  else if (normalizedUnit === "US") eu = euFromUs(value, gender);
  else eu = value;

  const tableEu = closestEuSize(eu);
  const sizes = EU_SIZE_TABLE[tableEu];

  return {
    eu: normalizedUnit === "EU" ? value : tableEu,
    us: gender === "women" ? sizes.usWomen : sizes.usMen,
    uk: sizes.uk,
    usLabel: gender === "women" ? "US (Women)" : "US (Men)",
  };
}

function RecommendationsPanel({
  analysis,
  runnerProfile,
}: {
  analysis: AnalysisResult | null;
  runnerProfile: Record<string, unknown> | null;
}) {
  const [recommendations, setRecommendations] = useState<CatalogRecommendationItem[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!analysis) return;

    const loadRecommendations = async () => {
      setRecoLoading(true);
      setRecoError(null);
      try {
        const payload = {
          ...(runnerProfile ?? {}),
          limit: 10,
          pronation: analysis.pronation ?? (runnerProfile?.pronation as string | undefined),
          strike_pattern: analysis.strike_pattern,
          cadence: analysis.bio?.cadence,
          osc: analysis.bio?.osc,
          contact_time: analysis.bio?.contact_time,
          knee_mean: analysis.bio?.knee_mean,
          sym: analysis.bio?.sym,
          // Rear analyses carry no cadence/osc/contact_time/sym - these two
          // are what actually varies per rear analysis (the alignment score
          // shown on the report, and the rear kinematics it's built from).
          energy_score: analysis.energy_score,
          rear_metrics: analysis.rear_metrics,
          gait: { bio: analysis.bio },
        };

        const result = (await fetchCatalogRecommendations(payload)) as {
          total: number;
          items: CatalogRecommendationItem[];
        };

        if (!isMounted) return;
        setRecommendations(result.items ?? []);
      } catch (err) {
        if (!isMounted) return;
        setRecoError(err instanceof Error ? err.message : "Failed to load recommendations");
      } finally {
        if (!isMounted) return;
        setRecoLoading(false);
      }
    };

    loadRecommendations();
    return () => {
      isMounted = false;
    };
  }, [analysis, runnerProfile]);

  if (!analysis) {
    return (
      <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#1E1B38", color: "#E2E8F0" }}>
        Run a gait analysis to unlock your personalized recommendations.
      </div>
    );
  }

  if (recoLoading) {
    return (
      <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "rgba(255, 255, 255, 0.06)", color: "#E2E8F0" }}>
        Loading recommendations…
      </div>
    );
  }

  if (recoError) {
    return (
      <div
        style={{
          padding: "20px",
          borderRadius: "16px",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          color: "#FCA5A5",
          border: "1px solid rgba(239, 68, 68, 0.3)",
        }}
      >
        {recoError}
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "rgba(255, 255, 255, 0.06)", color: "#E2E8F0" }}>
        No recommendations available yet.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
      {recommendations.map((shoe) => (
        <div
          key={`${shoe.position}-${shoe.brand ?? "brand"}-${shoe.model ?? "model"}`}
          style={{
            backgroundColor: "#312D4B",
            borderRadius: "20px",
            padding: "20px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span
              style={{
                fontSize: "12px",
                color: "#60E497",
                fontWeight: 600,
                border: "1px solid #60E497",
                borderRadius: "8px",
                padding: "4px 8px",
              }}
            >
              {shoe.terrain ?? "Mixed"}
            </span>
            <span style={{ fontSize: "12px", color: "#E2E8F0" }}>{shoe.score_pct}% match</span>
          </div>

          <div
            style={{
              borderRadius: "16px",
              backgroundColor: "#28243D",
              height: "200px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {shoe.image_url ? (
              <img
                src={shoe.image_url}
                alt={[shoe.brand, shoe.model].filter(Boolean).join(" ")}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                loading="lazy"
              />
            ) : (
              <span style={{ fontSize: "12px", color: "#94A3B8" }}>No image</span>
            )}
          </div>

          <div>
            <div style={{ color: "#FFFFFF", fontSize: "16px", fontWeight: 700 }}>{shoe.brand ?? "Unknown brand"}</div>
            <div style={{ color: "#94A3B8", fontSize: "13px" }}>{shoe.model ?? "Unknown model"}</div>
          </div>

          <div style={{ color: "#B7BFD6", fontSize: "12px" }}>
            {[
              shoe.drop_mm != null && `Drop: ${shoe.drop_mm} mm`,
              shoe.stack_mm != null && `Stack: ${shoe.stack_mm} mm`,
              shoe.weight_g != null && `Weight: ${shoe.weight_g} g`,
              shoe.price != null && `$${shoe.price}`,
            ]
              .filter(Boolean)
              .join(" • ")}
          </div>
          {shoe.product_url && (
            <a
              href={shoe.product_url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: "#60E497",
                fontSize: "12px",
                fontWeight: 600,
                marginTop: "4px",
              }}
            >
              View product
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function AnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<"gait" | "foot" | "shoe" | "results">("results");
  const [resultsSection, setResultsSection] = useState<"gait" | "foot">("gait");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [runnerProfile, setRunnerProfile] = useState<Record<string, unknown> | null>(null);
  const [showCustomerSelectionModal, setShowCustomerSelectionModal] = useState(false);
  const [customerSelectionTarget, setCustomerSelectionTarget] = useState<"gait" | "foot">("gait");
  const [footScanResult, setFootScanResult] = useState<BackendFootScanSessionResult | null>(null);
  const [footScanLoading, setFootScanLoading] = useState(false);
  const [footScanError, setFootScanError] = useState<string | null>(null);

  // Customer filter for the Results tab — each customer has their own gait
  // report and foot scan, looked up by email since it's unique.
  const [customerOptions, setCustomerOptions] = useState<CustomerRow[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [customerAnalysisResult, setCustomerAnalysisResult] = useState<AnalysisResult | null>(null);
  const [customerAnalysisLoading, setCustomerAnalysisLoading] = useState(false);
  const [customerAnalysisError, setCustomerAnalysisError] = useState<string | null>(null);
  const [customerAnalysesList, setCustomerAnalysesList] = useState<CustomerAnalysisSummary[]>([]);
  const [selectedAnalysisJobId, setSelectedAnalysisJobId] = useState<string | null>(null);
  const [analysisSwitchLoading, setAnalysisSwitchLoading] = useState(false);
  const customerFilterRef = useRef<HTMLDivElement>(null);
  const autoSelectAttemptedRef = useRef(false);

  // "shoe" (Recommendations) is intentionally not in this list: it's only
  // reachable via the report's "Show Recommendations" action or a deep link
  // with ?tab=shoe&jobId=..., never as a directly clickable top-level tab.
  // "foot" (3D Foot Scan instructions) is also excluded — starting a scan now
  // happens from the customer creation flow (unknown size) or the Results
  // tab's "Start foot scan" button, not from a standalone top-level tab.
  const tabs: Array<{ key: "gait" | "foot" | "results"; label: string }> = [
    { key: "gait", label: "Gait Analysis" },
    { key: "results", label: "Results" },
  ];

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "gait" || tabParam === "foot" || tabParam === "shoe" || tabParam === "results") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    const section = searchParams.get("section");
    if (section === "gait" || section === "foot") {
      setResultsSection(section);
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const jobId = searchParams.get("jobId");
    const analysisKey = jobId ? `analysis:${jobId}` : "analysis:last";
    const profileKey = jobId ? `analysisProfile:${jobId}` : "analysisProfile:last";

    try {
      const storedAnalysis =
        sessionStorage.getItem(analysisKey) || sessionStorage.getItem("analysis:last");
      const storedProfile =
        sessionStorage.getItem(profileKey) || sessionStorage.getItem("analysisProfile:last");

      setAnalysis(storedAnalysis ? (JSON.parse(storedAnalysis) as AnalysisResult) : null);
      setRunnerProfile(storedProfile ? (JSON.parse(storedProfile) as Record<string, unknown>) : null);
    } catch {
      setAnalysis(null);
      setRunnerProfile(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (activeTab !== "results") return;
    const section = searchParams.get("section");
    if (section !== "gait") return;

    const target = document.getElementById("gait-results");
    if (!target) return;

    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activeTab, searchParams]);

  // Refetch the customer directory every time the filter dropdown opens,
  // not just once on mount — otherwise a customer created after this page
  // loaded (e.g. via the "Create Customer" wizard in another tab) never
  // shows up here without a full page reload.
  useEffect(() => {
    if (!showCustomerDropdown) return;
    let cancelled = false;
    fetchCustomers().then((rows) => {
      if (!cancelled) setCustomerOptions(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showCustomerDropdown]);

  // Default the Results tab to a customer instead of an empty "Select a
  // customer" state: prefer whoever a scan/analysis was just run for (handed
  // off via sessionStorage right before redirecting back here), otherwise
  // fall back to the most recently created customer (/admin/customers is
  // already ordered newest-first).
  useEffect(() => {
    if (autoSelectAttemptedRef.current) return;
    autoSelectAttemptedRef.current = true;
    if (selectedCustomer) return;

    let pendingId: string | null = null;
    try {
      const raw = sessionStorage.getItem(PENDING_CUSTOMER_KEY);
      if (raw) {
        pendingId = (JSON.parse(raw) as { id?: string })?.id ?? null;
        // Consume it - only relevant for the page load right after a scan
        // or analysis; later visits should default to the most recent
        // customer overall instead of replaying an old selection.
        sessionStorage.removeItem(PENDING_CUSTOMER_KEY);
      }
    } catch {
      // Ignore storage errors and fall back to the most recent customer.
    }

    fetchCustomers().then((rows) => {
      setCustomerOptions(rows);
      if (rows.length === 0) return;
      const match = pendingId ? rows.find((row) => row.id === pendingId) : undefined;
      setSelectedCustomer(match ?? rows[0]);
    });
  }, [selectedCustomer]);

  const filteredCustomerOptions =
    customerSearch.trim().length === 0
      ? customerOptions
      : customerOptions.filter((row) => row.email.toLowerCase().includes(customerSearch.trim().toLowerCase()));

  const handleSelectCustomer = (row: CustomerRow) => {
    setSelectedCustomer(row);
    setCustomerSearch("");
    setShowCustomerDropdown(false);
  };

  const handleClearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerAnalysisResult(null);
    setCustomerAnalysisError(null);
    setCustomerAnalysesList([]);
    setSelectedAnalysisJobId(null);
    setFootScanResult(null);
    setFootScanError(null);
  };

  const handleSelectAnalysis = (jobId: string) => {
    if (jobId === selectedAnalysisJobId) return;
    setSelectedAnalysisJobId(jobId);
    setAnalysisSwitchLoading(true);
    setCustomerAnalysisError(null);
    fetchAnalysisByJobId(jobId)
      .then((result) => setCustomerAnalysisResult(result))
      .catch((err) => {
        setCustomerAnalysisResult(null);
        setCustomerAnalysisError(err instanceof Error ? err.message : "Failed to load gait analysis.");
      })
      .finally(() => setAnalysisSwitchLoading(false));
  };

  // Close the customer dropdown when clicking outside it.
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (customerFilterRef.current && !customerFilterRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCustomerDropdown]);

  // Fetch the selected customer's gait analyses and foot scan results
  // (each customer has their own reports and scan, looked up by their id).
  // Defaults to the most recent analysis, but keeps the full list so the
  // admin can switch to an older one.
  useEffect(() => {
    if (!selectedCustomer) return;
    let cancelled = false;

    setCustomerAnalysisLoading(true);
    setCustomerAnalysisError(null);
    setCustomerAnalysesList([]);
    setSelectedAnalysisJobId(null);
    fetchCustomerAnalysesList(selectedCustomer.id)
      .then((items) => {
        if (cancelled) return;
        setCustomerAnalysesList(items);
        if (items.length === 0) {
          setCustomerAnalysisResult(null);
          setCustomerAnalysisLoading(false);
          return;
        }
        const latest = items[0];
        setSelectedAnalysisJobId(latest.job_id);
        return fetchAnalysisByJobId(latest.job_id).then((result) => {
          if (!cancelled) setCustomerAnalysisResult(result);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setCustomerAnalysisResult(null);
          setCustomerAnalysisError(err instanceof Error ? err.message : "Failed to load gait analysis.");
        }
      })
      .finally(() => {
        if (!cancelled) setCustomerAnalysisLoading(false);
      });

    setFootScanLoading(true);
    setFootScanError(null);
    getFootScanResultByCustomer(selectedCustomer.id)
      .then((result) => {
        if (!cancelled) setFootScanResult(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setFootScanResult(null);
          setFootScanError(err instanceof Error ? err.message : "Failed to load foot scan results.");
        }
      })
      .finally(() => {
        if (!cancelled) setFootScanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer]);

  const startGaitFlow = () => {
    setCustomerSelectionTarget("gait");
    setShowCustomerSelectionModal(true);
  };

  // A foot scan session needs a customer_id to be looked up later from the
  // Results tab's customer filter — without this step it's saved as
  // customer_id=None and is never retrievable per-customer.
  const startFootScanFlow = () => {
    setCustomerSelectionTarget("foot");
    setShowCustomerSelectionModal(true);
  };

  const handleStartGaitAnalysisForSelectedCustomer = () => {
    if (selectedCustomer) {
      // Customer is already chosen via the filter — carry it straight
      // through instead of asking again. Must go through the same mapping
      // CustomerSelectionStep uses, or createSession() 422s on missing
      // runner_profile fields.
      try {
        sessionStorage.setItem(
          PENDING_CUSTOMER_KEY,
          JSON.stringify(mapCustomerRowToLabCustomer(selectedCustomer))
        );
      } catch {
        // Ignore storage failures and continue flow.
      }
      router.push("/admin/analysis/new");
    } else {
      startGaitFlow();
    }
  };

  const handleStartFootScanForSelectedCustomer = () => {
    if (selectedCustomer) {
      // Customer is already chosen via the filter — carry it
      // straight through instead of asking again.
      try {
        sessionStorage.setItem(PENDING_CUSTOMER_KEY, JSON.stringify(selectedCustomer));
      } catch {
        // Ignore storage failures and continue flow.
      }
      router.push("/foot-scan-steps");
    } else {
      startFootScanFlow();
    }
  };

  const handleCustomerSelected = (customer: unknown) => {
    try {
      sessionStorage.setItem(PENDING_CUSTOMER_KEY, JSON.stringify(customer));
    } catch {
      // Ignore storage failures and continue flow.
    }
    setShowCustomerSelectionModal(false);
    if (customerSelectionTarget === "foot") {
      router.push("/foot-scan-steps");
    } else {
      router.push("/admin/analysis/new");
    }
  };

  const footLeft: BackendFootScanResult | null = footScanResult?.left_result ?? null;
  const footRight: BackendFootScanResult | null = footScanResult?.right_result ?? null;
  const footRecommendation = footScanResult?.recommendation ?? null;
  const footPrimary: BackendFootScanResult | null = footRecommendation
    ? footRecommendation.larger_foot === "left"
      ? footLeft
      : footRight
    : footLeft ?? footRight;

  const footSummaryBullets: string[] = [];
  if (footLeft?.measurement && footRight?.measurement) {
    const diffMm = Math.abs(footLeft.measurement.length_mm - footRight.measurement.length_mm);
    if (diffMm < 2) {
      footSummaryBullets.push("Your feet are about the same length");
    } else {
      const longer = footLeft.measurement.length_mm > footRight.measurement.length_mm ? "left" : "right";
      footSummaryBullets.push(`Your ${longer} foot is longer than the other by ${diffMm.toFixed(1)}mm`);
    }
  } else if (footLeft?.measurement || footRight?.measurement) {
    footSummaryBullets.push("Scan the other foot to compare left vs right length");
  }

  const footWidthLabel = widthRatioLabel(footPrimary?.measurement?.length_mm, footPrimary?.measurement?.width_mm);
  if (footWidthLabel === "Wide") footSummaryBullets.push("Your foot is wider than the norm");
  else if (footWidthLabel === "Narrow") footSummaryBullets.push("Your foot is narrower than the norm");
  else if (footWidthLabel === "Average") footSummaryBullets.push("Your foot width is close to average");

  const footOverallConfidence = footScanResult?.overall_confidence ?? footPrimary?.confidence?.overall ?? null;
  const footConfLabel = confidenceLabel(footOverallConfidence);
  if (footConfLabel) {
    footSummaryBullets.push(`Scan confidence is ${footConfLabel.toLowerCase()} (${formatPct(footOverallConfidence)})`);
  }

  if (footSummaryBullets.length === 0) {
    footSummaryBullets.push("Results will appear once both feet finish processing.");
  }

  const footSizesForBoxes = footRecommendation ?? footPrimary?.sizes ?? null;
  const footCards: Array<{ title: string; color: string; bgColor: string; result: BackendFootScanResult | null }> = [
    { title: "Left Foot", color: "#6A47F4", bgColor: "rgba(106, 71, 244, 0.15)", result: footLeft },
    { title: "Right Foot", color: "#4ADE80", bgColor: "rgba(74, 222, 128, 0.15)", result: footRight },
  ];

  // A scan can come back with no usable data for all sorts of reasons: it
  // explicitly failed (paper/foot not detected), or the admin left/closed
  // the flow before submitting both photos and the session just sits there
  // half-done. Either way there's nothing to render in the detailed grid -
  // only show it once at least one foot has a real measurement, otherwise
  // surface a single "redo it" action instead of a grid full of empty
  // placeholders the admin can't act on.
  const footScanFailed =
    footScanResult?.status === "failed" ||
    footLeft?.status === "failed" ||
    footRight?.status === "failed";
  const footScanHasData = Boolean(footLeft?.measurement || footRight?.measurement);
  const footScanFailureMessage = footScanFailed
    ? footLeft?.error_message ||
      footRight?.error_message ||
      "We couldn't read this scan. Make sure both feet are clearly visible next to the A4 sheet, then try again."
    : "This scan was never finished — the session was left before both feet were captured.";

  // A gait analysis's shoe recommendations need a known shoe size - either
  // from a completed foot scan or a manually entered size on the profile.
  // Without either, starting the analysis would just produce a report with
  // no sizing to act on, so push the foot scan first instead.
  const hasManualShoeSize = Boolean(selectedCustomer?.shoeSize && selectedCustomer.shoeSize !== "—");
  const hasShoeSizeInfo = footScanHasData || hasManualShoeSize;

  return (
    <div
      style={{
        backgroundColor: "#28243D",
        minHeight: "100vh",
        fontFamily: "'Satoshi', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: "0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Section Container */}
      <div style={{ padding: "32px 32px 20px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Page Header */}
        <div>
          <h1 style={{ fontSize: "32px", fontWeight: "bold", color: "#FFFFFF", margin: "0" }}>Analysis</h1>
        </div>

        {/* Tabs — hidden when viewing recommendations from a report */}
        {activeTab !== "shoe" && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                gap: "8px",
                padding: "6px",
                borderRadius: "9999px",
                backgroundColor: "#201C35",
                border: "1px solid #1B1926",
                flexWrap: "wrap",
              }}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "9999px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: isActive ? "#E7E3FC" : "#A0A8B5",
                      background: isActive ? "linear-gradient(180deg, #3C3854 0%, #2D2A42 100%)" : "transparent",
                      border: isActive ? "1.5px solid #1E1C2B" : "none",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.3s",
                    }}
                    onMouseEnter={(e) => !isActive && (e.currentTarget.style.color = "#E2E8F0")}
                    onMouseLeave={(e) => !isActive && (e.currentTarget.style.color = "#A0A8B5")}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Foot Scan Tab Content */}
      {activeTab === "foot" && (
        <div
          style={{
            padding: "0 32px 40px 32px",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#FFFFFF", margin: 0 }}>
              To scan your feet you need:
            </h2>
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              <div
                style={{
                  width: "100%",
                  maxWidth: "461px",
                  height: "385px",
                  borderRadius: "16px",
                  overflow: "hidden",
                  position: "relative",
                  backgroundColor: "#1A1828",
                }}
              >
                <Image
                  src="/images/foot-scan/foot_scan2.png"
                  alt="Foot Scan"
                  fill
                  style={{ objectFit: "cover" }}
                />
              </div>
              <div
                style={{
                  width: "100%",
                  maxWidth: "625px",
                  minHeight: "385px",
                  borderRadius: "16px",
                  backgroundColor: "#2D2B47",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <ul style={{ color: "#E2E8F0", fontSize: "12px", lineHeight: "1.6", listStyle: "none", padding: 0, margin: 0 }}>
                  <li style={{ marginBottom: "8px" }}>• A well-lit area without glare</li>
                  <li style={{ marginBottom: "8px" }}>
                    • A standard sheet of white paper (ISO A4) — with no bends or wrinkles
                  </li>
                  <li style={{ marginBottom: "8px" }}>
                    • A hard floor of a color that contrasts with your feet and with the white sheet of paper
                  </li>
                  <li style={{ marginBottom: "8px" }}>• Roll up your pants</li>
                  <li style={{ marginBottom: "8px" }}>• Bare feet — no socks</li>
                  <li>• Optionally, you can ask someone to take the photo</li>
                </ul>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={startFootScanFlow}
                    style={{
                      padding: "0px",
                      width: "134px",
                      height: "40px",
                      borderRadius: "9999px",
                      fontSize: "14px",
                      fontWeight: 600,
                      backgroundColor: "#6A47F4",
                      color: "#FFFFFF",
                      border: "none",
                      cursor: "pointer",
                      transition: "all 0.3s",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#7D56FF")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#6A47F4")}
                  >
                    Start Analysis
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Tab Content */}
      {activeTab === "results" && (
        <div
          style={{
            padding: "24px 32px 40px 32px",
            flex: 1,
          }}
        >
          <div
            style={{
              borderRadius: "20px",
              backgroundColor: "#28243D",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {/* Results Header */}
            <div id="gait-results" style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", width: "100%", height: "40px" }}>
              <h2 style={{ color: "#E7E3FC", fontSize: "16px", fontWeight: 600, margin: 0 }}>
                Results
              </h2>
            </div>

            {/* Customer Filter — each customer has their own gait report and foot scan */}
            <div ref={customerFilterRef} style={{ position: "relative", maxWidth: "360px" }}>
              <label style={{ display: "block", color: "#A0A8B5", fontSize: "12px", marginBottom: "6px" }}>
                Filter by customer email
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setShowCustomerDropdown((prev) => !prev)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    backgroundColor: "#1F1B2E",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    fontSize: "13px",
                    color: selectedCustomer ? "#E7E3FC" : "#6B7280",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedCustomer ? selectedCustomer.email : "Select a customer email…"}
                  </span>
                  <span style={{ color: "#8B93A1", flexShrink: 0 }}>▾</span>
                </button>
                {selectedCustomer && (
                  <button
                    onClick={handleClearCustomer}
                    style={{
                      backgroundColor: "#1F1B2E",
                      border: "1px solid rgba(255, 255, 255, 0.12)",
                      color: "#B8C0CC",
                      borderRadius: "10px",
                      padding: "0 14px",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {showCustomerDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "4px",
                    backgroundColor: "#1F1B2E",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    zIndex: 20,
                    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.4)",
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search emails…"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      backgroundColor: "#26223B",
                      border: "none",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "#E7E3FC",
                      outline: "none",
                    }}
                  />
                  <div style={{ maxHeight: "260px", overflowY: "auto" }}>
                    {filteredCustomerOptions.length === 0 ? (
                      <div style={{ padding: "12px", fontSize: "12px", color: "#6B7280" }}>No customers found.</div>
                    ) : (
                      filteredCustomerOptions.map((row) => (
                        <button
                          key={row.id}
                          onClick={() => handleSelectCustomer(row)}
                          style={{
                            display: "block",
                            width: "100%",
                            textAlign: "left",
                            padding: "10px 12px",
                            backgroundColor: selectedCustomer?.id === row.id ? "#2D2B47" : "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#E7E3FC",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#2D2B47")}
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = selectedCustomer?.id === row.id ? "#2D2B47" : "transparent")
                          }
                        >
                          <div style={{ fontSize: "13px" }}>{row.email}</div>
                          <div style={{ fontSize: "11px", color: "#8B93A1" }}>{row.name}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Toggle Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px", flexWrap: "wrap" }}>
              <button
                onClick={() => setResultsSection("gait")}
                style={{
                  backgroundColor: resultsSection === "gait" ? "#3A3358" : "#1F1B2E",
                  border: resultsSection === "gait" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.08)",
                  color: resultsSection === "gait" ? "#E7E3FC" : "#B8C0CC",
                  padding: "0 12px",
                  borderRadius: "9999px",
                  fontSize: "11px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  lineHeight: "32px",
                  cursor: "pointer",
                }}
              >
                Gait Analysis Results
              </button>
              <button
                onClick={() => setResultsSection("foot")}
                style={{
                  backgroundColor: resultsSection === "foot" ? "#3A3358" : "#1F1B2E",
                  border: resultsSection === "foot" ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.08)",
                  color: resultsSection === "foot" ? "#E7E3FC" : "#B8C0CC",
                  padding: "0 12px",
                  height: "32px",
                  display: "flex",
                  alignItems: "center",
                  lineHeight: "32px",
                  borderRadius: "9999px",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                3D Foot Scan Results
              </button>
            </div>

            {/* Gait Analysis Results */}
            {resultsSection === "gait" && (
              <div
                style={{
                  borderRadius: "16px",
                  minHeight: "400px",
                  overflow: "hidden",
                }}
              >
                {!selectedCustomer && (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                    style={{ borderRadius: "16px", backgroundColor: "#26223B", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  >
                    <h3 className="text-lg font-semibold text-slate-100">Select a customer</h3>
                    <p className="text-sm text-slate-400">
                      Filter by the customer&apos;s email above to view their gait analysis report.
                    </p>
                  </div>
                )}

                {selectedCustomer && customerAnalysisLoading && (
                  <div
                    style={{ padding: "60px 20px", textAlign: "center", color: "#A0A8B5", fontSize: "13px", borderRadius: "16px", backgroundColor: "#26223B", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  >
                    Loading gait analysis report…
                  </div>
                )}

                {selectedCustomer && !customerAnalysisLoading && customerAnalysisError && (
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
                    {customerAnalysisError}
                  </div>
                )}

                {selectedCustomer && !customerAnalysisLoading && !customerAnalysisError && !customerAnalysisResult && (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                    style={{ borderRadius: "16px", backgroundColor: "#26223B", border: "1px solid rgba(255, 255, 255, 0.06)" }}
                  >
                    <h3 className="text-lg font-semibold text-slate-100">No completed gait analysis</h3>
                    <p className="text-sm text-slate-400">
                      {selectedCustomer.name} ({selectedCustomer.email}) has no completed gait analysis yet.
                    </p>
                    {hasShoeSizeInfo ? (
                      <button
                        onClick={handleStartGaitAnalysisForSelectedCustomer}
                        className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        Start Analysis
                      </button>
                    ) : (
                      <>
                        <p className="max-w-md text-sm text-amber-300">
                          A foot scan or shoe size is needed before starting a gait analysis, so shoe
                          recommendations can be sized correctly.
                        </p>
                        <button
                          onClick={handleStartFootScanForSelectedCustomer}
                          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Start foot scan
                        </button>
                      </>
                    )}
                  </div>
                )}

                {selectedCustomer && customerAnalysesList.length > 1 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      padding: "12px 16px",
                      borderRadius: "16px",
                      backgroundColor: "#26223B",
                      border: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <span style={{ color: "#A0A8B5", fontSize: "12px", alignSelf: "center", marginRight: "4px" }}>
                      {customerAnalysesList.length} analyses —
                    </span>
                    {customerAnalysesList.map((item, idx) => {
                      const isActive = item.job_id === selectedAnalysisJobId;
                      return (
                        <button
                          key={item.job_id}
                          onClick={() => handleSelectAnalysis(item.job_id)}
                          style={{
                            backgroundColor: isActive ? "#6A47F4" : "#1F1B2E",
                            border: isActive ? "none" : "1px solid rgba(255, 255, 255, 0.12)",
                            color: isActive ? "#FFFFFF" : "#B8C0CC",
                            padding: "6px 12px",
                            borderRadius: "9999px",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {idx === 0 ? "Latest — " : ""}
                          {new Date(item.created_at).toLocaleString()}
                        </button>
                      );
                    })}
                  </div>
                )}

                {selectedCustomer && analysisSwitchLoading && (
                  <div style={{ padding: "40px 20px", textAlign: "center", color: "#A0A8B5", fontSize: "13px" }}>
                    Loading analysis…
                  </div>
                )}

                {selectedCustomer && customerAnalysisResult && !analysisSwitchLoading && (
                  <ResultStep
                    analysis={customerAnalysisResult}
                    onNewAnalysis={handleStartGaitAnalysisForSelectedCustomer}
                    hideVideo
                    minimalActions
                  />
                )}
              </div>
            )}

            {/* 3D Foot Scan Results */}
            {resultsSection === "foot" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "20px",
                  padding: "0",
                  borderRadius: "0",
                  backgroundColor: "transparent",
                  border: "none",
                  width: "100%",
                  boxSizing: "border-box",
                  overflow: "hidden",
                }}
              >
                {footScanLoading && (
                  <div style={{ padding: "60px 20px", textAlign: "center", color: "#A0A8B5", fontSize: "13px" }}>
                    Loading foot scan results…
                  </div>
                )}

                {!footScanLoading && footScanError && (
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
                    {footScanError}
                  </div>
                )}

                {!footScanLoading && !footScanError && !footScanResult && (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                    style={{ borderRadius: "16px", backgroundColor: "#26223B", border: "1px solid rgba(255, 255, 255, 0.06)", minHeight: "400px" }}
                  >
                    {selectedCustomer && selectedCustomer.shoeSize && selectedCustomer.shoeSize !== "—" ? (
                      <>
                        <h3 className="text-lg font-semibold text-slate-100">No foot scan yet</h3>
                        <p className="text-sm text-slate-400">
                          {selectedCustomer.name} entered a shoe size manually when their profile was created.
                        </p>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "4px",
                            padding: "16px 28px",
                            borderRadius: "16px",
                            backgroundColor: "#1F1B2E",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                          }}
                        >
                          <span className="text-xs uppercase tracking-wide text-slate-500">
                            Shoe size on file
                          </span>
                          <span className="text-2xl font-bold text-white">{selectedCustomer.shoeSize}</span>
                          <span className="text-xs text-slate-500">Entered manually — not yet verified by a 3D scan</span>

                          {(() => {
                            const conversion = convertShoeSize(
                              selectedCustomer.profile.shoe_size,
                              selectedCustomer.shoeSizeUnit,
                              selectedCustomer.profile.sex
                            );
                            if (!conversion) return null;
                            return (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "20px",
                                  marginTop: "10px",
                                  paddingTop: "10px",
                                  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                                }}
                              >
                                <div style={{ textAlign: "center" }}>
                                  <div className="text-[10px] uppercase tracking-wide text-slate-500">EU</div>
                                  <div className="text-sm font-semibold text-white">{conversion.eu}</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{conversion.usLabel}</div>
                                  <div className="text-sm font-semibold text-white">{conversion.us}</div>
                                </div>
                                <div style={{ textAlign: "center" }}>
                                  <div className="text-[10px] uppercase tracking-wide text-slate-500">UK</div>
                                  <div className="text-sm font-semibold text-white">{conversion.uk}</div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        <p className="text-[11px] text-slate-500" style={{ marginTop: "-4px" }}>
                          Approximate conversion — only the original size was entered.
                        </p>
                        <button
                          onClick={handleStartFootScanForSelectedCustomer}
                          className="mt-1 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Verify with a 3D foot scan
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-semibold text-slate-100">No foot scan yet</h3>
                        <p className="text-sm text-slate-400">
                          Run a 3D foot scan to see your measurements and size recommendation here.
                        </p>
                        <button
                          onClick={handleStartFootScanForSelectedCustomer}
                          className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                        >
                          Start foot scan
                        </button>
                      </>
                    )}
                  </div>
                )}

                {footScanResult && !footScanHasData && (
                  <div
                    className="flex flex-col items-center justify-center gap-3 py-16 text-center"
                    style={{
                      borderRadius: "16px",
                      backgroundColor: "#26223B",
                      border: footScanFailed
                        ? "1px solid rgba(239, 68, 68, 0.25)"
                        : "1px solid rgba(255, 255, 255, 0.06)",
                      minHeight: "400px",
                    }}
                  >
                    <h3 className="text-lg font-semibold text-slate-100">
                      {footScanFailed ? "Scan failed" : "Scan incomplete"}
                    </h3>
                    <p className="max-w-md text-sm text-slate-400">{footScanFailureMessage}</p>
                    <button
                      onClick={handleStartFootScanForSelectedCustomer}
                      className="mt-1 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      Retake photos
                    </button>
                  </div>
                )}

                {footScanResult && footScanHasData && (
                <>
                {/* Main Content Grid - Left and Right */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
                    gap: "16px",
                    width: "100%",
                  }}
                >
                  {/* LEFT PART */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, height: "100%", justifyContent: "space-between" }}>
                    {/* 3D Foot Image and Sliders */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div
                        style={{
                          backgroundColor: "#2D2B47",
                          borderRadius: "16px",
                          padding: "16px",
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          height: "380px",
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        <Image src="/images/foot-scan/results.png" alt="3D Foot Scan" fill style={{ objectFit: "contain" }} />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        {/* Ball Width */}
                        <div
                          style={{
                            backgroundColor: "#2D2B47",
                            borderRadius: "16px",
                            padding: "16px",
                            display: "flex",
                            flexDirection: "column",
                            height: "180px",
                          }}
                        >
                          <div style={{ textAlign: "center", marginBottom: "12px" }}>
                            <span style={{ color: "#E2E8F0", fontSize: "13px", fontWeight: 600 }}>Ball Width</span>
                          </div>
                          <div
                            style={{
                              backgroundColor: "#312D4B",
                              borderRadius: "12px",
                              padding: "16px",
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ color: "#9AA3AF", fontSize: "11px" }}>Narrow</span>
                              <span style={{ color: "#E2E8F0", fontSize: "11px", fontWeight: 600 }}>Average</span>
                              <span style={{ color: "#9AA3AF", fontSize: "11px" }}>Wide</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                              <span style={{ color: "#9AA3AF", fontSize: "10px" }}>Left</span>
                              <span style={{ color: "#9AA3AF", fontSize: "10px" }}>Right</span>
                            </div>
                            <div style={{ position: "relative", height: "32px", display: "flex", alignItems: "center" }}>
                              <div style={{ position: "absolute", width: "100%", height: "6px", borderRadius: "9999px", backgroundColor: "#1F1B2E" }} />
                              <div
                                style={{
                                  position: "absolute",
                                  left: `${Math.min(widthRatioPosition(footLeft?.measurement?.length_mm, footLeft?.measurement?.width_mm), widthRatioPosition(footRight?.measurement?.length_mm, footRight?.measurement?.width_mm))}%`,
                                  width: `${Math.abs(widthRatioPosition(footLeft?.measurement?.length_mm, footLeft?.measurement?.width_mm) - widthRatioPosition(footRight?.measurement?.length_mm, footRight?.measurement?.width_mm))}%`,
                                  height: "6px",
                                  borderRadius: "9999px",
                                  backgroundColor: "#6A47F4",
                                }}
                              />
                              <div style={{ position: "absolute", left: `${widthRatioPosition(footLeft?.measurement?.length_mm, footLeft?.measurement?.width_mm)}%`, transform: "translateX(-50%)" }}>
                                <div style={{ color: "#9AA3AF", fontSize: "16px" }}>▲</div>
                              </div>
                              <div style={{ position: "absolute", left: `${widthRatioPosition(footRight?.measurement?.length_mm, footRight?.measurement?.width_mm)}%`, transform: "translateX(-50%)" }}>
                                <div style={{ color: "#E2E8F0", fontSize: "16px" }}>▼</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Scan Confidence (backend does not measure instep height) */}
                        <div
                          style={{
                            backgroundColor: "#2D2B47",
                            borderRadius: "16px",
                            padding: "16px",
                            display: "flex",
                            flexDirection: "column",
                            height: "180px",
                          }}
                        >
                          <div style={{ textAlign: "center", marginBottom: "12px" }}>
                            <span style={{ color: "#E2E8F0", fontSize: "13px", fontWeight: 600 }}>Scan Confidence</span>
                          </div>
                          <div
                            style={{
                              backgroundColor: "#312D4B",
                              borderRadius: "12px",
                              padding: "16px",
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <span style={{ color: "#9AA3AF", fontSize: "11px" }}>Low</span>
                              <span style={{ color: "#E2E8F0", fontSize: "11px", fontWeight: 600 }}>Average</span>
                              <span style={{ color: "#9AA3AF", fontSize: "11px" }}>High</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                              <span style={{ color: "#9AA3AF", fontSize: "10px" }}>Left</span>
                              <span style={{ color: "#9AA3AF", fontSize: "10px" }}>Right</span>
                            </div>
                            <div style={{ position: "relative", height: "32px", display: "flex", alignItems: "center" }}>
                              <div style={{ position: "absolute", width: "100%", height: "6px", borderRadius: "9999px", backgroundColor: "#1F1B2E" }} />
                              <div
                                style={{
                                  position: "absolute",
                                  left: `${Math.min(confidencePosition(footLeft?.confidence?.overall), confidencePosition(footRight?.confidence?.overall))}%`,
                                  width: `${Math.abs(confidencePosition(footLeft?.confidence?.overall) - confidencePosition(footRight?.confidence?.overall))}%`,
                                  height: "6px",
                                  borderRadius: "9999px",
                                  backgroundColor: "#6A47F4",
                                }}
                              />
                              <div style={{ position: "absolute", left: `${confidencePosition(footLeft?.confidence?.overall)}%`, transform: "translateX(-50%)" }}>
                                <div style={{ color: "#9AA3AF", fontSize: "16px" }}>▲</div>
                              </div>
                              <div style={{ position: "absolute", left: `${confidencePosition(footRight?.confidence?.overall)}%`, transform: "translateX(-50%)" }}>
                                <div style={{ color: "#E2E8F0", fontSize: "16px" }}>▼</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RIGHT PART */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0, height: "100%", justifyContent: "space-between" }}>
                    <div style={{ height: "64px" }} />

                    {/* Summary Section */}
                    <div
                      style={{
                        backgroundColor: "#2D2B47",
                        borderRadius: "16px",
                        padding: "18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        flex: "1 1 auto",
                        minHeight: "0",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(16, 185, 129, 0.15)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <div style={{ width: "5px", height: "5px", borderRadius: "50%", backgroundColor: "#10B981" }} />
                        </div>
                        <span style={{ color: "#E2E8F0", fontSize: "14px", fontWeight: 600 }}>Summary</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {footSummaryBullets.map((text, index) => (
                          <div
                            key={index}
                            style={{
                              backgroundColor: "#312D4B",
                              borderRadius: "12px",
                              padding: "14px",
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                              minHeight: "78px",
                            }}
                          >
                            <div
                              style={{
                                width: "44px",
                                height: "44px",
                                minWidth: "44px",
                                borderRadius: "12px",
                                backgroundColor: "rgba(16, 185, 129, 0.15)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#10B981",
                              }}
                            >
                              <Footprints size={24} />
                            </div>
                            <span style={{ color: "#C8CDD7", fontSize: "13px", lineHeight: "1.4" }}>{text}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Size Section */}
                    <div
                      style={{
                        backgroundColor: "#2D2B47",
                        borderRadius: "16px",
                        padding: "18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        marginTop: "auto",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "stretch", gap: "10px", width: "100%" }}>
                        {[
                          { label: "US", value: footSizesForBoxes ? String(footSizesForBoxes.us_men) : "—", country: "🇺🇸" },
                          { label: "UK", value: footSizesForBoxes ? String(footSizesForBoxes.uk) : "—", country: "🇬🇧" },
                          { label: "EU", value: footSizesForBoxes ? String(footSizesForBoxes.eu) : "—", country: "🇪🇺" },
                        ].map((item) => (
                          <div
                            key={item.label}
                            style={{
                              flex: "1 1 0",
                              minWidth: 0,
                              backgroundColor: "#312D4B",
                              borderRadius: "12px",
                              padding: "12px 8px",
                              textAlign: "center",
                              cursor: "pointer",
                              transition: "all 0.2s",
                              border: "1.5px solid transparent",
                              height: "90px",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",
                              gap: "6px",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = "#3A3554";
                              e.currentTarget.style.borderColor = "#6A47F4";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = "#312D4B";
                              e.currentTarget.style.borderColor = "transparent";
                            }}
                          >
                            <div style={{ fontSize: "18px", lineHeight: 1 }}>{item.country}</div>
                            <div style={{ color: "#9AA3AF", fontSize: "10px", lineHeight: 1 }}>{item.label}</div>
                            <div style={{ color: "#FFFFFF", fontSize: "16px", fontWeight: 700, lineHeight: 1 }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* BOTTOM PART - Foot Analysis Cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", width: "100%" }}>
                  {footCards.map((foot) => (
                    <div
                      key={foot.title}
                      style={{
                        backgroundColor: "#2D2B47",
                        borderRadius: "16px",
                        padding: "18px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        minHeight: "300px",
                        boxSizing: "border-box",
                        width: "100%",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", height: "48px" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            minWidth: "48px",
                            borderRadius: "12px",
                            backgroundColor: foot.bgColor,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: foot.color,
                          }}
                        >
                          <Footprints size={26} />
                        </div>
                        <span style={{ color: "#E2E8F0", fontSize: "14px", fontWeight: 600 }}>{foot.title}</span>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "minmax(170px, 210px) 1fr", gap: "10px", flex: 1, alignItems: "stretch" }}>
                        <div
                          style={{
                            backgroundColor: "#312D4B",
                            borderRadius: "12px",
                            padding: "12px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                          }}
                        >
                          <span style={{ color: "#B8C0CC", fontSize: "12px" }}>EU Size</span>
                          <div style={{ position: "relative", width: "156px", height: "156px" }}>
                            <svg width="156" height="156" style={{ transform: "rotate(-90deg)" }}>
                              <circle cx="78" cy="78" r="62" fill="none" stroke="#1F1B2E" strokeWidth="12" />
                              <circle
                                cx="78"
                                cy="78"
                                r="62"
                                fill="none"
                                stroke={foot.color}
                                strokeWidth="12"
                                strokeDasharray={`${2 * Math.PI * 62 * Math.max(0.1, Math.min(0.95, foot.result?.confidence?.overall ?? 0))} ${2 * Math.PI * 62}`}
                                strokeLinecap="round"
                              />
                            </svg>
                            <div
                              style={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                transform: "translate(-50%, -50%)",
                                textAlign: "center",
                              }}
                            >
                              <div style={{ fontSize: "28px", fontWeight: 700, color: "#FFFFFF" }}>
                                {foot.result?.sizes?.eu ?? "—"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: "8px", alignItems: "stretch" }}>
                          {[
                            { label: "Foot Length", value: formatMm(foot.result?.measurement?.length_mm) },
                            { label: "Foot Width", value: formatMm(foot.result?.measurement?.width_mm) },
                            { label: "Confidence", value: formatPct(foot.result?.confidence?.overall) },
                            { label: "Calibration", value: formatPct(foot.result?.confidence?.calibration) },
                          ].map((metric) => (
                            <div
                              key={metric.label}
                              style={{
                                backgroundColor: "#312D4B",
                                borderRadius: "12px",
                                padding: "10px 12px",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                gap: "4px",
                                height: "112px",
                              }}
                            >
                              <div style={{ color: "#9AA3AF", fontSize: "11px", lineHeight: 1.1 }}>{metric.label}</div>
                              <div style={{ color: "#FFFFFF", fontSize: "15px", fontWeight: 700, lineHeight: 1.1 }}>{metric.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shoe Recommendations Tab */}
      {activeTab === "shoe" && (
        <div style={{ padding: "32px 32px 40px 32px" }}>
          <div
            style={{
              borderRadius: "20px",
              backgroundColor: "#28243D",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
                  Shoe Recommendations
                </h2>
                <p style={{ marginTop: "6px", color: "#A0A8B5", fontSize: "13px" }}>
                  Personalized picks based on your latest gait analysis.
                </p>
              </div>
              <button
                onClick={() => {
                  const jobId = searchParams.get("jobId") || analysis?.job_id;
                  router.push(jobId ? `/admin/analysis/reports/${jobId}` : "/admin/analysis/reports");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "8px 16px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  backgroundColor: "#1E1C2B",
                  color: "#E2E8F0",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  cursor: "pointer",
                }}
              >
                <ArrowLeft size={14} />
                Back to report
              </button>
            </div>

            <RecommendationsPanel analysis={analysis} runnerProfile={runnerProfile} />
          </div>
        </div>
      )}

      {/* Other Tabs - Placeholder */}
      {activeTab !== "foot" && activeTab !== "results" && activeTab !== "shoe" && (
        <div style={{ padding: "32px 32px 40px 32px" }}>
          <div
            style={{
              borderRadius: "20px",
              backgroundColor: "#312D4B",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
              padding: "32px",
            }}
          >
            <h2 style={{ 
              fontSize: "18px", 
              fontWeight: "600", 
              color: "#FFFFFF", 
              margin: "0 0 20px 0" 
            }}>
              Recording Instructions
            </h2>
            
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
              <ul style={{ 
                listStyle: "disc", 
                paddingLeft: "20px", 
                margin: "0",
                color: "#FFFFFF",
                fontSize: "14px",
                lineHeight: "1.8",
                flex: "0 0 auto"
              }}>
                <li>Duration: 5-10 seconds</li>
                <li>View - rear of the runner</li>
                <li>Ensure stable framing and consistent pace</li>
              </ul>

              <div style={{ 
                display: "flex", 
                gap: "12px", 
                alignItems: "center",
                justifyContent: "flex-start"
              }}>
                <button
                  onClick={startGaitFlow}
                  style={{
                    padding: "8px 20px",
                    borderRadius: "999px",
                    background: "linear-gradient(90deg, #3C3854 0%, #4B4474 100%)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: "500",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <Upload size={16} />
                  Start Analysis
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustomerSelectionModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div
            className="relative rounded-3xl bg-slate-950 border border-slate-700 shadow-2xl overflow-hidden flex flex-col"
            style={{ width: "90%", maxWidth: "1000px", maxHeight: "90vh" }}
          >
            <button
              onClick={() => setShowCustomerSelectionModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white transition z-10"
              aria-label="Close customer selection"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            <div className="flex-1 overflow-y-auto">
              <CustomerSelectionStep onSelectCustomer={handleCustomerSelected} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
