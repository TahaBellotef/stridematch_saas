"use client";

import { useState, type ReactNode, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnalysisResult, BackendInsightItem } from "../domain/analysis.types";
import { buildInsights } from "../domain/insights.mapper";
import { buildImprovements } from "../domain/improvements.mapper";
import { Insight } from "../domain/insights.types";
import { Improvement } from "../domain/improvements.types";
import { apiFetch } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import { fetchCatalogRecommendations } from "@/features/lab/services/catalog.service";
import {
  ArrowLeft,
  ArrowsClockwise,
  Bone,
  Angle as AngleIcon,
  CaretLineDown,
  ChartBar as ChartBarIcon,
  ChartLineUp,
  DownloadSimple,
  Footprints,
  GearFine as GearFineIcon,
  Lightning,
  MaskHappy as MaskHappyIcon,
  PaperPlaneTilt,
  PersonSimpleRun as PersonSimpleRunIcon,
  PersonSimpleWalk,
  Ruler,
  Scales,
  SealCheck,
  Sneaker,
  SneakerMove as SneakerMoveIcon,
  UserFocus,
  Target,
  TrendUp,
  Timer as TimerIcon,
  Wind as WindIcon,
} from "@phosphor-icons/react";

type CatalogItem = {
  position: number;
  brand?: string | null;
  model?: string | null;
  terrain?: string | null;
  drop_mm?: number | null;
  weight_g?: number | null;
  stack_mm?: number | null;
  price?: number | null;
  product_url?: string | null;
  score: number;
  score_pct: number;
};

type CatalogResponse = {
  total: number;
  items: CatalogItem[];
};

type Props = {
  analysis: AnalysisResult;
  onNewAnalysis: () => void;
  hideVideo?: boolean;
  minimalActions?: boolean;
  onBackToReports?: () => void;
};

export function ResultStep({ analysis, onNewAnalysis, hideVideo = false, minimalActions = false, onBackToReports }: Props) {
  const router = useRouter();
  const {
    bio,
    energy_score,
    motion_type,
    strike_pattern,
    contact_time_left,
    contact_time_right,
    flight_ratio,
    trunk_lean,
    trunk_stability,
    arm_swing,
    hip_mobility,
  } = analysis;

  const isRearOnly = analysis.analysis_type === "rear";

  const [reportLang, setReportLang] = useState<"fr" | "en">("fr");
  const [localizedInsights, setLocalizedInsights] = useState<BackendInsightItem[] | null>(null);
  const [localizedTips, setLocalizedTips] = useState<string[] | null>(null);

  // Prefer the backend's own computed insights/tips (richer, localized,
  // already factor in the full set of rear/side metrics) and only fall
  // back to the lightweight client-side heuristics when the backend has
  // nothing to say. `localizedInsights`/`localizedTips` hold a re-fetched,
  // re-translated copy when the user picks a language other than the one
  // the analysis was originally run in.
  const effectiveInsights = localizedInsights ?? analysis.insights ?? [];
  const effectiveTips = localizedTips ?? analysis.improvement_tips ?? [];

  const backendInsights: Insight[] = effectiveInsights.map((item) => ({
    id: item.id,
    title: item.title,
    message: item.measured ? `${item.summary} (${item.measured})` : item.summary,
    level: item.severity,
    metric: item.category,
  }));
  const insights = backendInsights.length > 0 ? backendInsights : buildInsights(analysis);

  const backendImprovements: Improvement[] = effectiveTips.map((tip) => ({
    title: "",
    rationale: tip,
    first_step: "",
    priority: "medium",
    source: "rule",
  }));
  const improvements =
    backendImprovements.length > 0 ? backendImprovements : buildImprovements(analysis, []);

  const safeNum = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const bioSafe = {
    cadence: safeNum(bio?.cadence),
    osc: safeNum(bio?.osc),
    sym: safeNum(bio?.sym),
    contact_time: safeNum(bio?.contact_time),
    knee_left_mean: safeNum(bio?.knee_left_mean),
    knee_right_mean: safeNum(bio?.knee_right_mean),
    knee_mean: safeNum(bio?.knee_mean),
  };

  const leftContact = safeNum(contact_time_left);
  const rightContact = safeNum(contact_time_right);
  const flightRatioSafe = safeNum(flight_ratio);

  const derivedMotionType =
    motion_type ??
    (flightRatioSafe !== null ? (flightRatioSafe <= 35 ? "grounded" : "aerial") : null);

  const derivedStrikePattern = (() => {
    if (strike_pattern) return strike_pattern;

    const avgContact =
      bioSafe.contact_time !== null
        ? bioSafe.contact_time
        : leftContact !== null && rightContact !== null
          ? (leftContact + rightContact) / 2
          : null;

    if (avgContact === null) return null;
    if (avgContact >= 280) return "heel";
    if (avgContact >= 240) return "midfoot";
    return "forefoot";
  })();

  const derivedSymmetry =
    bioSafe.sym !== null
      ? bioSafe.sym
      : leftContact !== null && rightContact !== null && leftContact + rightContact > 0
        ? Math.max(
            0,
            100 -
              (Math.abs(leftContact - rightContact) /
                ((leftContact + rightContact) / 2)) *
                100
          )
        : null;

  const safe = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const derivedVerticalMovement = bioSafe.osc !== null ? `${bioSafe.osc.toFixed(1)} cm` : "4.7 cm";
  const derivedTrunkLean = safe(trunk_lean) !== null ? `${safe(trunk_lean)?.toFixed(1)}°` : "12.2°";
  const derivedTrunkStability = safe(trunk_stability) !== null ? `${safe(trunk_stability)?.toFixed(1)}` : "Upper-body control";
  const derivedArmSwing = arm_swing ? (typeof arm_swing === "number" ? `${arm_swing.toFixed(1)}` : arm_swing) : "Arm swing balance";
  const derivedHipMobility = hip_mobility ? (typeof hip_mobility === "number" ? `${hip_mobility.toFixed(1)}` : hip_mobility) : "Hip extension";

  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [recommendations, setRecommendations] = useState<CatalogItem[]>([]);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [runnerProfile, setRunnerProfile] = useState<Record<string, unknown> | null>(null);
  const [reportEmail, setReportEmail] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasRear = Boolean(analysis.rear_video_url);
  const hasSide = Boolean(analysis.video_url);
  const videoUrl = analysis.rear_video_url || analysis.video_url;
  const videoNeedsToken = Boolean(videoUrl && videoUrl.includes("/video") && !videoUrl.includes("token="));
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | null>(
    videoNeedsToken ? null : videoUrl ?? null
  );

  const rearMetrics = analysis.rear_metrics || {};
  const getRearMetric = (keys: string[]) => {
    for (const key of keys) {
      const value = rearMetrics[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  };

  const rearDrift = getRearMetric(["drift_norm", "ankle_knee_drift_norm"]);
  const rearKneeLeft = getRearMetric(["left_knee_offset_norm"]);
  const rearKneeRight = getRearMetric(["right_knee_offset_norm"]);
  const rearKneeAvg = getRearMetric(["knee_alignment_norm", "knee_width_norm"]);
  const rearAnkleLeft = getRearMetric(["left_ankle_offset_norm"]);
  const rearAnkleRight = getRearMetric(["right_ankle_offset_norm"]);
  const rearAnkleAvg = getRearMetric(["ankle_alignment_norm", "ankle_width_norm"]);
  const rearAnkleOffset = getRearMetric(["ankle_offset_norm", "heel_offset_norm"]);
  const rearQuality = analysis.rear_quality ?? "—";

  const formatRearPct = (value: number | null) =>
    value !== null ? `${(value * 100).toFixed(1)}%` : "—";

  const fmtDeg = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}°` : "—";
  const fmtPlainPct = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(1)}%` : "—";
  const fmtDegPerSec = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(0)}°/s` : "—";

  const rearSymmetryScore =
    typeof analysis.rear_metrics?.rear_symmetry_score === "number"
      ? (analysis.rear_metrics.rear_symmetry_score as number)
      : null;
  const rearHint =
    typeof analysis.rear_metrics?.hint === "string" ? (analysis.rear_metrics.hint as string) : null;

  useEffect(() => {
    setResolvedVideoUrl(videoNeedsToken ? null : videoUrl ?? null);
  }, [videoUrl, videoNeedsToken]);

  useEffect(() => {
    let cancelled = false;

    const fetchResultDetails = async () => {
      if (!analysis.job_id) return;

      try {
        // Only force a re-fetch with ?lang= when asking for a translation
        // other than how the analysis was originally generated (usually
        // French) - avoids needlessly regenerating insights on every load.
        const langSuffix = reportLang !== "fr" ? `?lang=${reportLang}` : "";
        const res = await apiFetch(`/api/v1/analysis/${analysis.job_id}${langSuffix}`, {
          method: "GET",
        });
        if (!res.ok) return;

        const payload = await res.json();
        if (cancelled) return;

        const customerEmail = payload?.customer_email as string | undefined;
        if (customerEmail) {
          setReportEmail(customerEmail);
        }

        if (langSuffix) {
          setLocalizedInsights(payload?.result?.insights ?? null);
          setLocalizedTips(payload?.result?.improvement_tips ?? null);
        } else {
          setLocalizedInsights(null);
          setLocalizedTips(null);
        }

        if (videoUrl && videoUrl.includes("/video") && !videoUrl.includes("token=")) {
          const videoToken = payload?.video_token as string | undefined;
          if (videoToken) {
            const sep = videoUrl.includes("?") ? "&" : "?";
            setResolvedVideoUrl(`${videoUrl}${sep}token=${encodeURIComponent(videoToken)}`);
          }
        }
      } catch {
        // keep defaults; fallback handled by backend/frontend flows
      }
    };

    void fetchResultDetails();
    return () => {
      cancelled = true;
    };
  }, [analysis.job_id, videoUrl, reportLang]);

  useEffect(() => {
    // <source> changes inside <video> aren't picked up automatically by the
    // browser - it only re-runs resource selection when .load() is called.
    // Without this, the first (untokenized) request 403s and the player
    // stays stuck on that failure even after resolvedVideoUrl is corrected.
    videoRef.current?.load();
  }, [resolvedVideoUrl]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Debug: Log video URL on mount
  useEffect(() => {
    console.log("[ResultStep] Analysis data received:", {
      video_url: analysis.video_url,
      rear_video_url: analysis.rear_video_url,
      fullVideoUrl: analysis.video_url ? `${env.apiBaseUrl}${analysis.video_url}` : null,
    });
  }, [analysis]);

  useEffect(() => {
    try {
      const byJob = sessionStorage.getItem(`analysisProfile:${analysis.job_id}`);
      const raw = byJob || sessionStorage.getItem("analysisProfile:last");
      if (!raw) return;
      const profile = JSON.parse(raw) as Record<string, unknown>;
      setRunnerProfile(profile);
      if (typeof profile.email === "string" && profile.email) {
        setReportEmail(profile.email);
      }
    } catch {
      setRunnerProfile(null);
    }
  }, [analysis.job_id]);

  useEffect(() => {
    let isMounted = true;

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

        const result = (await fetchCatalogRecommendations(payload)) as CatalogResponse;
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

    if (analysis) {
      loadRecommendations();
    }

    return () => {
      isMounted = false;
    };
  }, [analysis, runnerProfile]);

  const handleShoeRecommendations = () => {
    try {
      sessionStorage.setItem(
        `analysis:${analysis.job_id}`,
        JSON.stringify(analysis)
      );
    } catch {
      // ignore storage issues
    }
    router.push(`/admin/analysis?tab=shoe&jobId=${analysis.job_id}`);
  };

  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownloadReport = async () => {
    setDownloadError(null);
    setDownloadingReport(true);
    try {
      const langSuffix = reportLang !== "fr" ? `?lang=${reportLang}` : "";
      const res = await apiFetch(`/api/v1/analysis/${analysis.job_id}/report${langSuffix}`, {
        method: "GET",
      });
      if (!res.ok) {
        throw new Error(`Failed to generate report (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `report-${analysis.job_id}.pdf`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Failed to download report.");
    } finally {
      setDownloadingReport(false);
    }
  };

  const [sendingReport, setSendingReport] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  const handleSendReport = async () => {
    setSendError(null);
    setSendSuccess(false);
    if (!reportEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportEmail)) {
      setSendError("Please enter a valid email address.");
      return;
    }
    setSendingReport(true);
    try {
      const res = await apiFetch(`/api/v1/analysis/${analysis.job_id}/report/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: reportEmail, lang: reportLang }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.detail || `Failed to send report (${res.status})`);
      }
      setSendSuccess(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send report.");
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="w-full flex flex-col" style={{ minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ height: "40px" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          margin: "0 auto",
          width: "90%",
          maxWidth: "900px",
        }}
      >
        <h1 className="font-bold text-white" style={{ fontSize: "28px" }}>
          Biomechanical Results
        </h1>
        {onBackToReports && (
          <button
            onClick={onBackToReports}
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
            Back to all reports
          </button>
        )}
      </div>

      <div style={{ height: "24px" }} />

      {/* Main Card */}
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto 30px auto",
          width: "90%",
          backgroundColor: "#2D2B47",
          borderRadius: "20px",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* 1. Score Section */}
        <div
          style={{
            position: "relative",
            borderRadius: "16px",
            overflow: "hidden",
            width: "100%",
            height: "180px",
            backgroundColor: "rgba(0,0,0,0.2)",
          }}
        >
          <img
            src="/images/gait-methods/score.jpg"
            alt="Running score"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* Score Overlay */}
          <div
            style={{
              position: "absolute",
              top: "24px",
              left: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <span style={{ fontSize: "14px", color: "#E2E8F0", fontWeight: 500 }}>
              Your Running Score
            </span>
            <span style={{ fontSize: "48px", color: "#FFFFFF", fontWeight: 700, lineHeight: 1 }}>
              {safe(energy_score) ?? "—"}<span style={{ fontSize: "28px", color: "#CBD5E1" }}>/100</span>
            </span>
          </div>
        </div>

        {/* 2. Video Player Section */}
        {!hideVideo && (
        <div
          style={{
            backgroundColor: "#1E1B38",
            borderRadius: "16px",
            overflow: "hidden",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              {[0.2, 0.5, 1].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: playbackSpeed === speed ? "2px solid #6A47F4" : "1px solid rgba(255, 255, 255, 0.2)",
                    backgroundColor: playbackSpeed === speed ? "rgba(106, 71, 244, 0.1)" : "transparent",
                    color: "#E2E8F0",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {speed}X
                </button>
              ))}
            </div>
          </div>

          {/* Video Player */}
          <div
            style={{
              width: "100%",
              backgroundColor: "#000",
              borderRadius: "12px",
              overflow: "hidden",
              aspectRatio: "16/9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            {resolvedVideoUrl ? (
              <video
                ref={videoRef}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
                controls
                controlsList="nodownload"
              >
              <source
                src={resolvedVideoUrl.startsWith("http") ? resolvedVideoUrl : `${env.apiBaseUrl}${resolvedVideoUrl}`}
                type="video/mp4"
              />
                Your browser does not support the video tag.
              </video>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  color: "#94A3B8",
                  gap: "12px",
                }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="23 7 16 12 23 17 23 7"></polygon>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                </svg>
                <p style={{ fontSize: "14px", textAlign: "center" }}>
                  Video not available
                </p>
                <p style={{ fontSize: "12px", color: "#64748B" }}>
                  The analysis video will appear here
                </p>
              </div>
            )}
          </div>
        </div>
        )}

        {/* 3. Key Metrics Section */}
        {!isRearOnly ? (
          <div
            style={{
              backgroundColor: "#1E1B38",
              borderRadius: "16px",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
              >
                <UserFocus size={22} />
              </span>
              <h2 className="text-xl font-semibold text-white">
                Key Metrics
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                icon={<TimerIcon size={22} />}
                label="Cadence"
                value={bioSafe.cadence !== null ? `${bioSafe.cadence}` : "—"}
                unit="steps/min"
              />
              <MetricCard
                icon={<Lightning size={22} weight="light" />}
                label="Energy Score"
                value={safe(energy_score)?.toFixed(1) ?? "—"}
                unit="/100"
              />
              <MetricCard
                icon={<MaskHappyIcon size={32} />}
                label="Motion Type"
                value={formatText(derivedMotionType)}
              />
              <MetricCard
                icon={<SneakerMoveIcon size={32} />}
                label="Strike Pattern"
                value={formatText(derivedStrikePattern)}
              />
              <MetricCard
                icon={<Scales size={22} weight="light" />}
                label="Symmetry"
                value={
                  typeof derivedSymmetry === "number"
                    ? `${derivedSymmetry.toFixed(1)}%`
                    : "—"
                }
              />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <h2 className="text-xl font-semibold text-white" style={{ marginBottom: "12px" }}>
                Rear Analysis Summary
              </h2>
              <p style={{ color: "#94A3B8", fontSize: "13px" }}>
                This rear-view scan checks how centered your legs and ankles are while you run. Lower values mean
                better alignment. We display them as deviation percentages for easier reading.
              </p>
            </div>

            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
                >
                  <UserFocus size={22} />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  Key Metrics
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  icon={<TimerIcon size={22} />}
                  label="Cadence"
                  value={bioSafe.cadence !== null ? `${bioSafe.cadence}` : "—"}
                  unit="steps/min"
                />
                <MetricCard
                  icon={<Lightning size={22} weight="light" />}
                  label="Energy Score"
                  value={safe(energy_score)?.toFixed(1) ?? "—"}
                  unit="/100"
                />
                <MetricCard
                  icon={<MaskHappyIcon size={22} />}
                  label="Motion Type"
                  value={formatText(derivedMotionType)}
                />
                <MetricCard
                  icon={<SneakerMoveIcon size={22} />}
                  label="Strike Pattern"
                  value={formatText(derivedStrikePattern)}
                />
                <MetricCard
                  icon={<Scales size={22} weight="light" />}
                  label="Symmetry"
                  value={
                    typeof derivedSymmetry === "number"
                      ? `${derivedSymmetry.toFixed(1)}%`
                      : "—"
                  }
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
                >
                  <AngleIcon size={22} />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  Knee Analysis
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  icon={<PersonSimpleRunIcon size={22} />}
                  label="Left Knee"
                  value={formatRearPct(rearKneeLeft)}
                />
                <MetricCard
                  icon={<PersonSimpleRunIcon size={22} />}
                  label="Right Knee"
                  value={formatRearPct(rearKneeRight)}
                />
                <MetricCard
                  icon={<ChartBarIcon size={22} />}
                  label="Average"
                  value={formatRearPct(rearKneeAvg)}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
                >
                  <CaretLineDown size={22} />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  Ground Contact
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  icon={<TimerIcon size={22} />}
                  label="Left Contact"
                  value={formatRearPct(rearAnkleLeft)}
                />
                <MetricCard
                  icon={<TimerIcon size={22} />}
                  label="Right Contact"
                  value={formatRearPct(rearAnkleRight)}
                />
                <MetricCard
                  icon={<TimerIcon size={22} />}
                  label="Average"
                  value={formatRearPct(rearAnkleAvg)}
                />
                <MetricCard
                  icon={<WindIcon size={22} />}
                  label="Flight Ratio"
                  value={formatRearPct(rearAnkleOffset)}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
                >
                  <PersonSimpleRunIcon size={22} />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  Body Mechanics
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <BodyMechanicsCard
                  icon={<Target size={20} weight="light" />}
                  label="Overall Alignment"
                  status="Good"
                  statusColor="#22C55E"
                  description="Based on rear alignment and drift values."
                  measured={formatRearPct(rearDrift)}
                />
                <BodyMechanicsCard
                  icon={<PersonSimpleWalk size={20} weight="light" />}
                  label="Knee Stability"
                  status="Good"
                  statusColor="#22C55E"
                  description="Consistency of knee tracking from rear view."
                  measured={formatRearPct(rearKneeAvg)}
                />
                <BodyMechanicsCard
                  icon={<Footprints size={20} weight="light" />}
                  label="Ankle Stability"
                  status="Good"
                  statusColor="#22C55E"
                  description="Consistency of ankle alignment from rear view."
                  measured={formatRearPct(rearAnkleAvg)}
                />
                <BodyMechanicsCard
                  icon={<PersonSimpleWalk size={20} weight="light" />}
                  label="Arm coordination"
                  status="Can improve"
                  statusColor="#F59E0B"
                  description="Balance and rhythm of arm movement."
                  measured={derivedArmSwing}
                />
                <BodyMechanicsCard
                  icon={<Bone size={20} weight="light" />}
                  label="Hip mobility"
                  status="Needs attention"
                  statusColor="#EF4444"
                  description="Freedom of hip movement during stride."
                  measured={derivedHipMobility}
                />
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-lg"
                  style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
                >
                  <Ruler size={22} />
                </span>
                <h2 className="text-xl font-semibold text-white">
                  Advanced Biomechanics
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  icon={<SneakerMoveIcon size={22} />}
                  label="Pronation"
                  value={formatText(analysis.pronation_label)}
                />
                <MetricCard
                  icon={<AngleIcon size={22} />}
                  label="Ankle Eversion (L / R)"
                  value={`${fmtDeg(analysis.left_ankle_eversion_deg)} / ${fmtDeg(analysis.right_ankle_eversion_deg)}`}
                />
                <MetricCard
                  icon={<Scales size={22} weight="light" />}
                  label="Pelvic Drop"
                  value={fmtDeg(analysis.pelvic_drop_deg)}
                  unit={formatText(analysis.pelvic_drop_label) !== "—" ? formatText(analysis.pelvic_drop_label) : undefined}
                />
                <MetricCard
                  icon={<Bone size={22} weight="light" />}
                  label="Knee Valgus (L / R)"
                  value={`${formatText(analysis.left_knee_valgus_label)} / ${formatText(analysis.right_knee_valgus_label)}`}
                />
                <MetricCard
                  icon={<Footprints size={22} />}
                  label="Foot Progression (L / R)"
                  value={`${fmtDeg(analysis.left_foot_progression_deg)} / ${fmtDeg(analysis.right_foot_progression_deg)}`}
                  unit={`${formatText(analysis.left_foot_progression_label)} / ${formatText(analysis.right_foot_progression_label)}`}
                />
                <MetricCard
                  icon={<Scales size={22} weight="light" />}
                  label="Balance Score"
                  value={fmtPlainPct(analysis.balance_score_pct)}
                  unit={formatText(analysis.balance_score_label) !== "—" ? formatText(analysis.balance_score_label) : undefined}
                />
                <MetricCard
                  icon={<ChartLineUp size={22} />}
                  label="Pronation Velocity (L / R)"
                  value={`${fmtDegPerSec(analysis.pronation_velocity_left_deg_s)} / ${fmtDegPerSec(analysis.pronation_velocity_right_deg_s)}`}
                />
                <MetricCard
                  icon={<SealCheck size={22} />}
                  label="Foot Stability"
                  value={fmtPlainPct(analysis.foot_stability_pct)}
                />
                <MetricCard
                  icon={<Scales size={22} weight="light" />}
                  label="Foot Asymmetry"
                  value={fmtPlainPct(analysis.foot_asymmetry_pct)}
                />
                <MetricCard
                  icon={<CaretLineDown size={22} />}
                  label="Arch Collapse"
                  value={fmtPlainPct(analysis.arch_collapse_pct)}
                />
                {rearSymmetryScore !== null && (
                  <MetricCard
                    icon={<ChartBarIcon size={22} />}
                    label="Rear Symmetry Score"
                    value={`${rearSymmetryScore.toFixed(1)}`}
                    unit="/100"
                  />
                )}
              </div>
              {rearHint && (
                <p style={{ color: "#94A3B8", fontSize: "13px", marginTop: "16px" }}>
                  {rearHint}
                </p>
              )}
            </div>

            <div
              style={{
                marginTop: "4px",
                padding: "14px 16px",
                borderRadius: "12px",
                backgroundColor: "rgba(15, 23, 42, 0.5)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#CBD5E1",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: "6px", color: "#E2E8F0" }}>
                How to read these numbers
              </div>
              <div>
                Lower values mean better stability and alignment. If any value is high, it may suggest side-to-side
                sway or uneven loading. This helps us confirm pronation and guide shoe stability choices.
              </div>
            </div>
          </div>
        )}

        {!isRearOnly && (
          <div
            style={{
              backgroundColor: "#1E1B38",
              borderRadius: "16px",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
              >
                <AngleIcon size={22} />
              </span>
              <h2 className="text-xl font-semibold text-white">
                Knee Analysis
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                icon={<PersonSimpleWalk size={22} weight="light" />}
                label="Left Knee"
                value={
                  bioSafe.knee_left_mean !== null
                    ? `${bioSafe.knee_left_mean.toFixed(1)}°`
                    : "—"
                }
              />
              <MetricCard
                icon={<PersonSimpleWalk size={22} weight="light" />}
                label="Right Knee"
                value={
                  bioSafe.knee_right_mean !== null
                    ? `${bioSafe.knee_right_mean.toFixed(1)}°`
                    : "—"
                }
              />
              <MetricCard
                icon={<ChartLineUp size={22} weight="light" />}
                label="Average"
                value={
                  bioSafe.knee_mean !== null
                    ? `${bioSafe.knee_mean.toFixed(1)}°`
                    : "—"
                }
              />
            </div>
          </div>
        )}

        {!isRearOnly && (
          <div
            style={{
              backgroundColor: "#1E1B38",
              borderRadius: "16px",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
              >
                <CaretLineDown size={22} />
              </span>
              <h2 className="text-xl font-semibold text-white">
                Ground Contact
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                icon={<TimerIcon size={32} />}
                label="Left Contact"
                value={`${contact_time_left}`}
                unit="ms"
              />
              <MetricCard
                icon={<TimerIcon size={32} />}
                label="Right Contact"
                value={`${contact_time_right}`}
                unit="ms"
              />
              <MetricCard
                icon={<ChartLineUp size={22} weight="light" />}
                label="Average"
                value={bioSafe.contact_time !== null ? `${bioSafe.contact_time}` : "—"}
                unit="ms"
              />
              <MetricCard
                icon={<TrendUp size={22} weight="light" />}
                label="Flight Ratio"
                value={safe(flight_ratio)?.toFixed(1) ?? "—"}
                unit="%"
              />
            </div>
          </div>
        )}

        {!isRearOnly && (
          <div
            style={{
              backgroundColor: "#1E1B38",
              borderRadius: "16px",
              padding: "24px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
              >
                <PersonSimpleRunIcon size={22} />
              </span>
              <h2 className="text-xl font-semibold text-white">
                Body Mechanics
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <BodyMechanicsCard
                icon={<Ruler size={20} weight="light" />}
                label="Vertical Movement"
                status="Good"
                statusColor="#22C55E"
                description="How much the body moves up and down while running."
                measured={derivedVerticalMovement}
              />
              <BodyMechanicsCard
                icon={<TrendUp size={20} weight="light" />}
                label="Trunk lean"
                status="Excellent"
                statusColor="#22C55E"
                description="Forward inclination of the upper body."
                measured={derivedTrunkLean}
              />
              <BodyMechanicsCard
                icon={<Target size={20} weight="light" />}
                label="Trunk stability"
                status="Good"
                statusColor="#22C55E"
                description="How stable the torso remains while running."
                measured={derivedTrunkStability}
              />
              <BodyMechanicsCard
                icon={<PersonSimpleWalk size={20} weight="light" />}
                label="Arm coordination"
                status="Can improve"
                statusColor="#F59E0B"
                description="Balance and rhythm of arm movement."
                measured={derivedArmSwing}
              />
              <BodyMechanicsCard
                icon={<Bone size={20} weight="light" />}
                label="Hip mobility"
                status="Needs attention"
                statusColor="#EF4444"
                description="Freedom of hip movement during stride."
                measured={derivedHipMobility}
              />
            </div>
          </div>
        )}

        {/* 7. Technical Remarks Section */}
        <div
          style={{
            backgroundColor: "#1E1B38",
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: "#60E4971A", color: "#60E497", flexShrink: 0 }}
              >
                <GearFineIcon size={22} />
              </span>
              <h2 className="text-xl font-semibold text-white">
                Technical Remarks & Improvement Tips
              </h2>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["fr", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setReportLang(lang)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: reportLang === lang ? "1.5px solid #6A47F4" : "1px solid rgba(255, 255, 255, 0.15)",
                    background: reportLang === lang ? "rgba(106, 71, 244, 0.15)" : "transparent",
                    color: reportLang === lang ? "#E7E3FC" : "#9CA3AF",
                  }}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Observations Card */}
            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#2A2847",
                  borderRadius: "12px",
                  padding: "12px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
                  Observations
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {insights.length > 0 ? (
                    insights.slice(0, 6).map((insight, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor:
                            /cadence/i.test(insight.message || insight.title) ? "#3C3854" : "#2A2847",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                          borderRadius: "12px",
                          padding: "6px",
                        }}
                      >
                        <ObservationItem text={insight.message || insight.title} type={insight.level} />
                      </div>
                    ))
                  ) : (
                    <>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Cadence could be slightly increased." type="warning" />
                      </div>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Good symmetry." type="success" />
                      </div>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Controlled oscillation." type="success" />
                      </div>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Heel striker pattern detected." type="info" />
                      </div>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Grounded running style." type="info" />
                      </div>
                      <div style={{ backgroundColor: "#2A2847", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "12px", padding: "6px" }}>
                        <ObservationItem text="Energy efficiency could be improved." type="warning" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tips Column */}
            <div
              style={{
                backgroundColor: "#1E1B38",
                borderRadius: "16px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div
                style={{
                  backgroundColor: "#2A2847",
                  borderRadius: "12px",
                  padding: "12px 14px",
                  border: "1px solid rgba(255, 255, 255, 0.05)",
                }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "#E2E8F0" }}>
                  Improvement Tips
                </h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {improvements.slice(0, 3).map((tip, idx) => (
                  <TipCard
                    key={idx}
                    title={tip.title}
                    description={tip.rationale || tip.first_step}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Actions Section */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "20px",
            justifyContent: minimalActions ? "flex-end" : "space-between",
            alignItems: "center",
            padding: "20px",
            borderRadius: "20px",
            backgroundColor: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {!minimalActions && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#9CA3AF", letterSpacing: "0.02em" }}>
                EMAIL THIS REPORT
              </span>
              <div style={{ display: "flex", alignItems: "stretch" }}>
                <input
                  type="email"
                  placeholder="customer@email.com"
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: "180px",
                    padding: "11px 16px",
                    borderRadius: "999px 0 0 999px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRight: "none",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#E2E8F0",
                    fontSize: "14px",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSendReport}
                  disabled={sendingReport}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "11px 20px",
                    borderRadius: "0 999px 999px 0",
                    fontWeight: 600,
                    fontSize: "13px",
                    whiteSpace: "nowrap",
                    color: "#FFFFFF",
                    background: sendingReport
                      ? "rgba(106, 71, 244, 0.5)"
                      : "linear-gradient(90deg, #6A47F4 0%, #8F6BFF 100%)",
                    border: "none",
                    cursor: sendingReport ? "default" : "pointer",
                  }}
                >
                  <PaperPlaneTilt size={15} weight="fill" />
                  {sendingReport ? "Sending…" : "Send"}
                </button>
              </div>
              {sendError && (
                <span style={{ fontSize: "12px", color: "#EF4444" }}>{sendError}</span>
              )}
              {sendSuccess && (
                <span style={{ fontSize: "12px", color: "#22C55E" }}>Report sent to {reportEmail}.</span>
              )}
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center", marginLeft: "auto" }}>
            {!minimalActions && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <button
                  onClick={handleDownloadReport}
                  disabled={downloadingReport}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "11px 20px",
                    borderRadius: "999px",
                    fontWeight: 600,
                    fontSize: "14px",
                    color: "#E7E3FC",
                    background: "transparent",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    cursor: downloadingReport ? "default" : "pointer",
                    flexShrink: 0,
                  }}
                >
                  <DownloadSimple size={16} />
                  {downloadingReport ? "Generating…" : "Download PDF"}
                </button>
                {downloadError && (
                  <p style={{ color: "#FCA5A5", fontSize: "12px", margin: 0 }}>{downloadError}</p>
                )}
              </div>
            )}
            <button
              onClick={onNewAnalysis}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "11px 20px",
                borderRadius: "999px",
                fontWeight: 600,
                fontSize: "14px",
                color: "#E7E3FC",
                background: "transparent",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <ArrowsClockwise size={16} />
              New analysis
            </button>
            <button
              onClick={handleShoeRecommendations}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "11px 22px",
                borderRadius: "999px",
                fontWeight: 600,
                fontSize: "14px",
                color: "#FFFFFF",
                background: "linear-gradient(90deg, #6A47F4 0%, #8F6BFF 100%)",
                border: "none",
                cursor: "pointer",
                flexShrink: 0,
                boxShadow: "0 4px 14px rgba(106, 71, 244, 0.35)",
              }}
            >
              <Sneaker size={16} weight="fill" />
              Shoe recommendations
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

/* Helper Components */

function MetricCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: "#2A2847",
        borderRadius: "16px",
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        <div style={{ position: "relative", width: "48px", height: "48px" }}>
          {/* Shadow circle */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: "rotate(150deg)",
            }}
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="4"
              strokeDasharray="83.78 125.66"
              strokeLinecap="round"
            />
          </svg>
          {/* Red segment (left) */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: "rotate(150deg)",
            }}
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#E53542"
              strokeWidth="4"
              strokeDasharray="22.68 103.98"
              strokeLinecap="round"
            />
          </svg>
          {/* Blue segment (middle, longest) */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: "rotate(150deg)",
            }}
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#6F4CF5"
              strokeWidth="4"
              strokeDasharray="34.91 125.66"
              strokeDashoffset="-24.43"
              strokeLinecap="round"
            />
          </svg>
          {/* Green segment (right) */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              transform: "rotate(150deg)",
            }}
          >
            <circle
              cx="24"
              cy="24"
              r="20"
              fill="none"
              stroke="#6AFAA5"
              strokeWidth="4"
              strokeDasharray="22.68 125.66"
              strokeDashoffset="-61.09"
              strokeLinecap="round"
            />
          </svg>
          {/* Icon in center */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#E2E8F0",
            }}
          >
            {icon}
          </div>
        </div>
        <span
          style={{
            fontSize: "14px",
            color: "#E2E8F0",
            fontWeight: 400,
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: "4px",
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontSize: "20px",
            fontWeight: 600,
            color: "#FFFFFF",
            lineHeight: 1.2,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "12px", color: "#94A3B8", lineHeight: 1.2 }}>{unit}</span>
        )}
      </div>
    </div>
  );
}

function ObservationItem({ text, type }: { text: string; type?: string }) {
  const icons: Record<string, string> = {
    success: "✅",
    good: "✅",
    warning: "⚠️",
    critical: "⚠️",
    focus: "🎯",
    info: "ℹ️",
    error: "❌",
    neutral: "⚪",
  };

  const colors: Record<string, string> = {
    success: "#22C55E",
    good: "#22C55E",
    warning: "#F59E0B",
    critical: "#EF4444",
    focus: "#A78BFA",
    info: "#3B82F6",
    error: "#EF4444",
    neutral: "#94A3B8",
  };

  const icon = icons[type || "neutral"] || "⚪";
  const color = colors[type || "neutral"] || "#94A3B8";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        backgroundColor: "transparent",
        borderRadius: "8px",
      }}
    >
      <span style={{ fontSize: "14px" }}>{icon}</span>
      <span style={{ fontSize: "13px", color: "#E2E8F0" }}>{text}</span>
    </div>
  );
}

function TipCard({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        backgroundColor: "#2A2847",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        border: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      {title && (
        <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#FFFFFF" }}>
          {title}
        </h4>
      )}
      <p style={{ fontSize: "12px", color: "#94A3B8", lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  );
}

function BodyMechanicsCard({
  icon,
  label,
  status,
  statusColor,
  description,
  measured,
}: {
  icon: ReactNode;
  label: string;
  status: string;
  statusColor: string;
  description: string;
  measured: string;
}) {
  const getStaticBar = (currentStatus: string) => {
    const normalized = currentStatus.trim().toLowerCase();

    if (normalized === "excellent") {
      return { width: "92%", color: "#6AFAA5" };
    }
    if (normalized === "good") {
      return { width: "68%", color: "#6AFAA5" };
    }
    if (normalized === "can improve") {
      return { width: "45%", color: "#F59E0B" };
    }
    if (normalized === "needs attention") {
      return { width: "28%", color: "#EF4444" };
    }

    return { width: "55%", color: statusColor };
  };

  const bar = getStaticBar(status);

  return (
    <div
      style={{
        backgroundColor: "#2A2847",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        border: "1px solid rgba(255, 255, 255, 0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ display: "flex", alignItems: "center", color: "#E2E8F0" }}>
            {icon}
          </span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#E2E8F0" }}>
            {label}
          </span>
        </div>
        <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor, textTransform: "uppercase" }}>
          {status}
        </span>
      </div>
      <p style={{ fontSize: "12px", color: "#94A3B8", lineHeight: 1.4 }}>
        {description}
      </p>
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "999px",
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: bar.width,
            height: "100%",
            borderRadius: "999px",
            backgroundColor: bar.color,
          }}
        />
      </div>
      <div style={{ paddingTop: "8px", borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
        <p style={{ fontSize: "11px", color: "#94A3B8" }}>
          Measured: <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{measured}</span>
        </p>
      </div>
    </div>
  );
}

function formatText(value?: string | null) {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
