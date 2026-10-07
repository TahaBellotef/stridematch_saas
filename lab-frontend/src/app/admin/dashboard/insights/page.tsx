"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardToolbar } from "../DashboardToolbar";
import { ChartLineUp, ArrowSquareDown, ArrowSquareRight, MonitorPlay, CubeFocus, Sneaker, SealPercent } from "@phosphor-icons/react";
import {
  exportDashboardInsights,
  getDashboardInsights,
  type DashboardFilter,
  type DashboardInsightsResponse,
} from "@/shared/api/dashboard";

const DONUT_CIRCUMFERENCE = 2 * Math.PI * 35;

const ANALYSIS_TYPE_COLORS: Record<string, string> = {
  rear: "#4B21EF",
  side: "#60E497",
  unspecified: "#6A6299",
};

function formatChangeBadge(changePct: number | null) {
  if (changePct === null) return null;
  const isPositive = changePct >= 0;
  return {
    text: `${isPositive ? "+" : ""}${changePct}%`,
    bg: isPositive ? "rgba(89, 200, 139, 0.15)" : "rgba(189, 61, 68, 0.15)",
    color: isPositive ? "#59C88B" : "#BD3D44",
  };
}

export default function InsightsPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardInsightsResponse | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>({ range: "week" });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getDashboardInsights(filter);
        if (mounted) setData(result);
      } catch (err) {
        console.warn("Failed to load insights data:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filter]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportDashboardInsights(filter);
    } catch (err) {
      console.error("Failed to export insights report:", err);
    } finally {
      setExporting(false);
    }
  }, [filter]);

  const analysisBars = data?.daily_analysis_breakdown || [];
  const maxAnalysisTotal = Math.max(1, ...analysisBars.map((d) => d.rear + d.side + d.unspecified));

  const scanBars = data?.daily_scan_counts || [];
  const maxScans = Math.max(1, ...scanBars.map((d) => d.value));

  const recommendationBars = data?.daily_recommendation_counts || [];
  const maxRecommendations = Math.max(1, ...recommendationBars.map((d) => d.value));

  const donutSegments = useMemo(() => {
    const segments = data?.analysis_type_breakdown || [];
    const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
    let offsetAcc = 0;
    return segments.map((seg) => {
      const length = (seg.count / total) * DONUT_CIRCUMFERENCE;
      const dashoffset = -offsetAcc;
      offsetAcc += length;
      return { ...seg, length, dashoffset, color: ANALYSIS_TYPE_COLORS[seg.key] || "#2a2640" };
    });
  }, [data]);
  const donutTotal = donutSegments.reduce((sum, s) => sum + s.count, 0);

  const totalAnalysesBadge = formatChangeBadge(data?.total_analyses.change_pct ?? null);
  const backViewBadge = formatChangeBadge(data?.back_view_count.change_pct ?? null);
  const sideViewBadge = formatChangeBadge(data?.side_view_count.change_pct ?? null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sm-fill)' }}>
      <DashboardToolbar
        activeTab="insights"
        onTabChange={(tab) => router.push(`/admin/dashboard/${tab}`)}
        onFilterChange={setFilter}
        onExport={handleExport}
        exporting={exporting}
      />

      <div className="mx-auto w-full max-w-7xl px-6 pb-10">
        {/* Analytics of Videos */}
        <div
          className="rounded-2xl border px-6 py-6 mb-6"
          style={{
            backgroundColor: '#28243D',
            borderColor: '#1B1926'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                <MonitorPlay size={20} weight="regular" color="#4B21EF" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Analytics of Videos</h3>
            </div>
            <button className="text-slate-500 hover:text-slate-300 transition">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>

          <div
            className="rounded-2xl border w-full"
            style={{
              backgroundColor: '#312D4B',
              borderColor: '#201C35',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
              padding: '24px'
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-6 gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960', border: '1px solid rgba(96, 228, 151, 0.3)' }}>
                  <ChartLineUp size={20} color="#B0ACC7" weight="regular" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Total Analysis</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white">{data?.total_analyses.display ?? "0"}</span>
                    {totalAnalysesBadge && (
                      <span
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: totalAnalysesBadge.bg, color: totalAnalysesBadge.color, fontSize: '10px' }}
                      >
                        {totalAnalysesBadge.text}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">than last period</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960', border: '1px solid rgba(75, 33, 239, 0.3)' }}>
                  <ArrowSquareDown size={20} color="#4B21EF" weight="regular" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Number of Back View</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white">{data?.back_view_count.display ?? "0"}</span>
                    {backViewBadge && (
                      <span
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: backViewBadge.bg, color: backViewBadge.color, fontSize: '10px' }}
                      >
                        {backViewBadge.text}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">than last period</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960', border: '1px solid rgba(96, 228, 151, 0.3)' }}>
                  <ArrowSquareRight size={20} color="#60E497" weight="regular" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Number of Side View</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-white">{data?.side_view_count.display ?? "0"}</span>
                    {sideViewBadge && (
                      <span
                        className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: sideViewBadge.bg, color: sideViewBadge.color, fontSize: '10px' }}
                      >
                        {sideViewBadge.text}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">than last period</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Separator Line */}
            <div className="w-full h-px mb-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

            {/* Chart with Y-axis */}
            <div className="flex gap-3 overflow-x-auto">
              {/* Y-axis */}
              <div className="flex flex-col justify-between text-xs text-slate-500 flex-shrink-0" style={{ height: '160px', paddingTop: '2px', paddingBottom: '2px' }}>
                <span>100</span>
                <span>80</span>
                <span>60</span>
                <span>40</span>
                <span>20</span>
                <span>0</span>
              </div>

              {/* Y-axis line */}
              <div className="flex-shrink-0" style={{ width: '1px', height: '160px', backgroundColor: '#1F1F1F' }} />

              {/* Bars and Date Labels Container */}
              <div className="min-w-[520px] flex-1">
                {/* Bars */}
                <div className="flex items-end" style={{ height: '160px', position: 'relative' }}>
                  {/* X-axis line */}
                  <div style={{ position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '1px', backgroundColor: '#1F1F1F', zIndex: 10 }} />

                  {analysisBars.map((bar, i) => {
                    const total = bar.rear + bar.side + bar.unspecified;
                    const totalPx = total > 0 ? Math.max(6, (total / maxAnalysisTotal) * 160) : 0;
                    const segments = total > 0
                      ? [
                          { height: (bar.unspecified / total) * totalPx, color: ANALYSIS_TYPE_COLORS.unspecified },
                          { height: (bar.rear / total) * totalPx, color: ANALYSIS_TYPE_COLORS.rear },
                          { height: (bar.side / total) * totalPx, color: ANALYSIS_TYPE_COLORS.side },
                        ]
                      : [];
                    return (
                      <div key={i} className="flex-1 flex justify-center">
                        <div className="flex flex-col-reverse" style={{ height: '160px', width: '10px' }}>
                          {segments.map((segment, j) => (
                            <div
                              key={j}
                              style={{
                                height: `${segment.height}px`,
                                backgroundColor: segment.color,
                                borderRadius: j === segments.length - 1 ? '4px 4px 0 0' : '0',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Date Labels */}
                <div className="flex justify-between mt-3 text-xs text-slate-500 gap-2">
                  {analysisBars.map((bar, i) => (
                    <span key={i} className="flex-1" style={{ fontSize: '10px', textAlign: 'center' }}>{bar.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Analytics of Scan */}
        <div
          className="rounded-2xl border px-6 py-6 mb-6"
          style={{
            backgroundColor: '#28243D',
            borderColor: '#1B1926'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                <CubeFocus size={20} weight="regular" color="#4B21EF" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Analytics of Scan</h3>
            </div>
            <button className="text-slate-500 hover:text-slate-300 transition">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>

          <div
            className="rounded-2xl border w-full"
            style={{
              backgroundColor: '#312D4B',
              borderColor: '#201C35',
              boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
              padding: '24px'
            }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                <ArrowSquareRight size={20} weight="regular" color="#60E497" />
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">Number of Scans</div>
                <div className="text-xl font-bold text-white">{data?.total_scans ?? 0}</div>
              </div>
            </div>

            {/* Separator Line */}
            <div className="w-full h-px mb-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

            {/* Chart with Y-axis */}
            <div className="flex gap-3 overflow-x-auto">
              {/* Y-axis */}
              <div className="flex flex-col justify-between text-xs text-slate-500 flex-shrink-0" style={{ height: '113px', paddingTop: '2px', paddingBottom: '2px' }}>
                <span>100</span>
                <span>80</span>
                <span>60</span>
                <span>40</span>
                <span>20</span>
                <span>0</span>
              </div>

              {/* Y-axis line */}
              <div className="flex-shrink-0" style={{ width: '1px', height: '113px', backgroundColor: '#1F1F1F' }} />

              {/* Bars and Date Labels Container */}
              <div className="min-w-[520px] flex-1">
                {/* Bars */}
                <div className="flex items-end" style={{ height: '113px', position: 'relative' }}>
                  {/* X-axis line */}
                  <div style={{ position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '0.5px', backgroundColor: '#1F1F1F', zIndex: 10 }} />

                  {scanBars.map((bar, i) => (
                    <div key={i} className="flex-1 flex justify-center">
                      <div
                        style={{
                          width: '10px',
                          height: `${Math.max(2, (bar.value / maxScans) * 113)}px`,
                          background: 'linear-gradient(180deg, #60E497 0%, #4FBE7F 100%)',
                          borderRadius: '4px',
                          border: '1px solid rgba(96, 228, 151, 0.1)',
                          boxShadow: 'inset 0 -2px 4px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Date Labels */}
                <div className="flex justify-between mt-3 text-xs text-slate-500 gap-2">
                  {scanBars.map((bar, i) => (
                    <span key={i} className="flex-1" style={{ fontSize: '10px', textAlign: 'center' }}>{bar.label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shoe Recommendations & Analysis Type Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Shoe Recommendation */}
          <div
            className="rounded-2xl border px-6 py-6 lg:col-span-1 xl:col-span-2"
            style={{
              backgroundColor: '#28243D',
              borderColor: '#1B1926'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                  <Sneaker size={20} weight="regular" color="#4B21EF" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Shoe Recommendation</h3>
              </div>
              <button className="text-slate-500 hover:text-slate-300 transition">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>

            <div
              className="rounded-2xl border w-full"
              style={{
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '24px'
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                  <ArrowSquareRight size={20} weight="regular" color="#60E497" />
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Recommendations Generated</div>
                  <div className="text-xl font-bold text-white">{data?.total_recommendations ?? 0}</div>
                </div>
              </div>

              {/* Separator Line */}
              <div className="w-full h-px mb-4" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }} />

              {/* Chart with Y-axis */}
              <div className="flex gap-3 overflow-x-auto">
                {/* Y-axis */}
                <div className="flex flex-col justify-between text-xs text-slate-500 flex-shrink-0" style={{ height: '180px', paddingTop: '2px', paddingBottom: '2px' }}>
                  <span>100</span>
                  <span>80</span>
                  <span>60</span>
                  <span>40</span>
                  <span>20</span>
                  <span>0</span>
                </div>

                {/* Y-axis line */}
                <div className="flex-shrink-0" style={{ width: '1px', height: '180px', backgroundColor: '#1F1F1F' }} />

                {/* Bars and Date Labels Container */}
                <div className="min-w-[520px] flex-1">
                  {/* Bars */}
                  <div className="flex items-end" style={{ height: '180px', position: 'relative' }}>
                    {/* X-axis line */}
                    <div style={{ position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '1px', backgroundColor: '#1F1F1F', zIndex: 10 }} />

                    {recommendationBars.map((bar, i) => (
                      <div key={i} className="flex-1 flex justify-center">
                        <div
                          style={{
                            width: '10px',
                            height: `${Math.max(2, (bar.value / maxRecommendations) * 180)}px`,
                            background: 'linear-gradient(180deg, #60E497 0%, #4FBE7F 100%)',
                            borderRadius: '4px',
                            border: '1px solid rgba(96, 228, 151, 0.1)',
                            boxShadow: 'inset 0 -2px 4px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                      </div>
                    ))}
                  </div>

                  {/* Date Labels */}
                  <div className="flex justify-between mt-3 text-xs text-slate-500 gap-2">
                    {recommendationBars.map((bar, i) => (
                      <span key={i} className="flex-1" style={{ fontSize: '10px', textAlign: 'center' }}>{bar.label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Type Breakdown */}
          <div
            className="rounded-2xl border px-6 py-6"
            style={{
              backgroundColor: '#28243D',
              borderColor: '#1B1926'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3d3960' }}>
                  <SealPercent size={20} weight="regular" color="#4B21EF" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Analysis Type Breakdown</h3>
              </div>
              <button className="text-slate-500 hover:text-slate-300 transition">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>

            <div
              className="rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-6 w-full max-w-full overflow-hidden"
              style={{
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '32px 24px',
                minHeight: '350px'
              }}
            >
              {/* Donut Chart */}
              <div className="flex-shrink-0 mx-auto sm:mx-0">
                <div className="relative w-36 h-36 sm:w-40 sm:h-40">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                    {donutSegments.map((seg) => (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r="35"
                        fill="none"
                        stroke={seg.color}
                        strokeWidth="14"
                        strokeDasharray={`${seg.length} ${DONUT_CIRCUMFERENCE}`}
                        strokeDashoffset={seg.dashoffset}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-xl font-bold text-white">{donutTotal}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Legend Items */}
              <div className="flex-1 min-w-0 flex flex-col gap-3">
                {donutSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center justify-between gap-2 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: seg.color }}></div>
                      <span className="text-sm text-slate-300 truncate">{seg.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-white flex-shrink-0">{seg.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
