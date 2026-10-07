"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardToolbar } from "../DashboardToolbar";
import { MetricCard } from "../MetricCard";
import { ChartCard } from "../ChartCard";
import { ChartLineUp, CubeFocus, UserFocus, CursorClick, Sneaker, Coins, CashRegister, HourglassLow, Tag, TrendUp, Percent } from "@phosphor-icons/react";
import {
  exportDashboardOverview,
  getDashboardOverview,
  type DashboardFilter,
  type DashboardOverviewResponse,
} from "@/shared/api/dashboard";

const DONUT_CIRCUMFERENCE = 2 * Math.PI * 35;
const DONUT_ORDER = ["youth", "men", "women", "kids"] as const;
const DONUT_COLORS: Record<(typeof DONUT_ORDER)[number], string> = {
  youth: "#60E497",
  men: "#4B21EF",
  women: "#3716B5",
  kids: "#28243D",
};
const SEGMENT_SWATCH: Record<(typeof DONUT_ORDER)[number], string> = {
  men: "#6366f1",
  women: "#6366f1",
  youth: "#60E497",
  kids: "#28243D",
};
const SEGMENT_LABEL: Record<(typeof DONUT_ORDER)[number], string> = {
  men: "Men",
  women: "Women",
  youth: "Youth",
  kids: "Kids",
};

function buildLineChart(values: number[], width = 280, height = 140) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * (height - 12) - 6,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area, width, height };
}

function formatChange(changePct: number | null): { text: string; isPositive: boolean } | null {
  if (changePct === null) return null;
  const isPositive = changePct >= 0;
  return { text: `${isPositive ? "+" : ""}${changePct}%`, isPositive };
}

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<DashboardFilter>({ range: "week" });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    (async () => {
      try {
        const overview = await getDashboardOverview(filter);
        if (mounted) setData(overview);
      } catch (err: any) {
        if (mounted) setError(err?.message || "Failed to load dashboard data.");
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filter]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportDashboardOverview(filter);
    } catch (err) {
      console.error("Failed to export overview report:", err);
    } finally {
      setExporting(false);
    }
  }, [filter]);

  const scanTrend = useMemo(
    () => buildLineChart(data?.daily_scans.map((d) => d.value) || [0, 0, 0, 0, 0, 0, 0]),
    [data]
  );

  const maxDailyStatus = Math.max(
    1,
    ...(data?.daily_status.map((d) => d.completed + d.pending) || [1])
  );
  const maxDailyScans = Math.max(1, ...(data?.daily_scans.map((d) => d.value) || [1]));

  const donutSegments = useMemo(() => {
    const segments = data?.demographics || [];
    const classifiedTotal = segments.reduce((sum, s) => sum + s.count, 0) || 1;
    let offsetAcc = 0;
    return DONUT_ORDER.map((key) => {
      const count = segments.find((s) => s.segment === key)?.count ?? 0;
      const length = (count / classifiedTotal) * DONUT_CIRCUMFERENCE;
      const dashoffset = -offsetAcc;
      offsetAcc += length;
      return { key, count, length, dashoffset, color: DONUT_COLORS[key] };
    });
  }, [data]);

  const scansGrowth = formatChange(data?.scans_this_week.change_pct ?? null);
  const customersGrowth = formatChange(data?.new_customers_this_week.change_pct ?? null);
  const conversionGrowth = formatChange(data?.conversion_rate.change_pct ?? null);

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--sm-fill)' }}>
        <span className="text-slate-400 text-sm">Loading dashboard…</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sm-fill)' }}>
      <DashboardToolbar
        activeTab="overview"
        onTabChange={(tab) => router.push(`/admin/dashboard/${tab}`)}
        onFilterChange={setFilter}
        onExport={handleExport}
        exporting={exporting}
      />

      <div className="mx-auto w-full max-w-7xl px-6 pb-10">
        {/* Overview Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">Overview</h2>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
          <MetricCard
            icon={<ChartLineUp size={20} weight="regular" />}
            iconColor="#4B21EF"
            title="Total Scans Growth"
            value={data?.scans_this_week.display ?? "0"}
            subtitle={scansGrowth ? `${scansGrowth.text} than last week` : "No data yet"}
          />

          <MetricCard
            icon={<CubeFocus size={20} weight="regular" />}
            iconColor="#71A5FF"
            title="Scan by Numbers"
            value={data?.total_scans.display ?? "0"}
            subtitle="All time total"
            noBadge
          />

          <MetricCard
            icon={<UserFocus size={20} weight="regular" />}
            iconColor="#59C88B"
            title="New Customers Scan"
            value={data?.new_customers_this_week.display ?? "0"}
            subtitle={customersGrowth ? `${customersGrowth.text} than last week` : "No data yet"}
          />

          <MetricCard
            icon={<CursorClick size={20} weight="regular" />}
            iconColor="#FBBB00"
            title="Conversion Rate"
            value={data?.conversion_rate.display ?? "0%"}
            subtitle={conversionGrowth ? `${conversionGrowth.text} than last week` : "No data yet"}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
          {/* Scan Trend */}
          <ChartCard
            icon={<Sneaker size={20} weight="regular" />}
            iconBgColor="#3d3960"
            iconColor="#4B21EF"
            title="Scan Trend"
          >
            <div className="flex flex-col min-h-[280px]">
              <div className="mb-4">
                <div className="text-xl font-bold text-white">{data?.scans_this_week.display ?? "0"} scans</div>
              </div>
              <div className="relative w-full max-w-[240px] sm:max-w-none">
                <svg
                  viewBox={`0 0 ${scanTrend.width} ${scanTrend.height}`}
                  className="w-full h-auto"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity="0.5" />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  <path d={scanTrend.area} fill="url(#areaGradient)" />
                  <path
                    d={scanTrend.line}
                    stroke="#6366F1"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="flex justify-between mt-3 text-xs text-slate-500 w-full max-w-[240px] sm:max-w-none">
                {(data?.daily_scans || []).map((d, i) => (
                  <span key={i}>{d.label}</span>
                ))}
              </div>
            </div>
          </ChartCard>

          {/* Scan Status */}
          <ChartCard
            icon={<Coins size={20} weight="regular" />}
            iconBgColor="#3d3960"
            iconColor="#4B21EF"
            title="Scan Status"
          >
            <div className="flex flex-col h-full">
              <div className="flex gap-4 mb-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#60E497]"></div>
                  <span className="text-slate-300">Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-[#6B7280]"></div>
                  <span className="text-slate-300">Pending</span>
                </div>
              </div>
              <div className="w-full max-w-[240px] sm:max-w-none h-48 flex items-end justify-between gap-2">
                {(data?.daily_status || []).map((d, i) => {
                  const total = d.completed + d.pending;
                  const totalPx = total > 0 ? Math.max(6, (total / maxDailyStatus) * 180) : 4;
                  const completedPx = total > 0 ? (d.completed / total) * totalPx : 0;
                  const pendingPx = totalPx - completedPx;
                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: "180px" }}>
                      {pendingPx > 0 && (
                        <div
                          className="rounded-t-lg"
                          style={{ height: `${pendingPx}px`, backgroundColor: "#6B7280" }}
                        />
                      )}
                      {completedPx > 0 && (
                        <div
                          className={pendingPx > 0 ? "" : "rounded-t-lg"}
                          style={{
                            height: `${completedPx}px`,
                            background: "linear-gradient(180deg, #60E497 0%, #4FBE7F 100%)",
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 text-xs text-slate-500 w-full max-w-[240px] sm:max-w-none">
                {(data?.daily_status || []).map((d, i) => (
                  <span key={i}>{d.label}</span>
                ))}
              </div>
            </div>
          </ChartCard>

          {/* Customer Demographics */}
          <ChartCard
            icon={<CashRegister size={20} weight="regular" />}
            iconBgColor="#3d3960"
            iconColor="#4B21EF"
            title="Customer Demographics"
            colSpan={2}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-8 px-2 sm:px-4 min-h-[280px]">
              {/* Donut Chart */}
              <div className="relative w-32 h-32 sm:w-44 sm:h-44 flex-shrink-0 self-center lg:self-auto">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.key}
                      cx="50"
                      cy="50"
                      r="35"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="16"
                      strokeDasharray={`${seg.length} ${DONUT_CIRCUMFERENCE}`}
                      strokeDashoffset={seg.dashoffset}
                    />
                  ))}
                </svg>

                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{data?.total_customers ?? 0}</div>
                    <div className="text-sm text-slate-400">Total Customers</div>
                  </div>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="flex-1 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-6 text-center sm:text-left items-center sm:items-start">
                  <div className="w-12 h-12 rounded-xl bg-[#2A2640] flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">%</span>
                  </div>
                  <div>
                    <div className="text-slate-400 text-sm">Avg. Scan Confidence</div>
                    <div className="text-xl font-bold text-white">
                      {data?.avg_confidence_pct != null ? `${data.avg_confidence_pct}%` : "—"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {DONUT_ORDER.map((key) => (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-sm"
                          style={{ backgroundColor: SEGMENT_SWATCH[key] }}
                        ></div>
                        <span className="text-slate-400 text-sm">{SEGMENT_LABEL[key]}</span>
                      </div>
                      <div className="text-white font-semibold text-lg">
                        {data?.demographics.find((s) => s.segment === key)?.count ?? 0}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Activity Timeline & Weekly Scans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Activity Timeline */}
          <ChartCard
            icon={<HourglassLow size={20} weight="regular" />}
            iconBgColor="#3d3960"
            iconColor="#4B21EF"
            title="Activity Timeline"
          >
            <div className="space-y-4 overflow-hidden">
              {(data?.activity || []).length === 0 && (
                <p className="text-sm text-slate-400">No recent activity yet.</p>
              )}
              {(data?.activity || []).map((item) => (
                <div key={item.id} className="flex items-start gap-4">
                  <div
                    className="w-3 h-3 rounded flex-shrink-0 mt-1"
                    style={{ backgroundColor: item.status_color === "blue" ? "#3B82F6" : "#E74C3C" }}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <h4 className="text-base font-semibold text-white">{item.title}</h4>
                      <span className="text-sm text-slate-400 whitespace-nowrap">
                        {item.timestamp
                          ? new Date(item.timestamp).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : ""}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{item.subtitle}</p>
                    {item.customer_name && (
                      <div
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-300"
                        style={{ backgroundColor: '#3A3654' }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{ backgroundColor: '#4A5568', color: '#E2E8F0' }}
                        >
                          {item.initials || "?"}
                        </div>
                        {item.customer_name}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          {/* Weekly Scans */}
          <ChartCard
            icon={<Tag size={20} weight="regular" />}
            iconBgColor="#3d3960"
            iconColor="#4B21EF"
            title="Weekly Scans"
          >
            <div>
              <div className="flex items-center pb-5" style={{ gap: '150px' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#28243D'}}>
                    <TrendUp size={20} weight="regular" style={{ color: '#987DFF' }} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Scans</div>
                    <div className="text-xl font-bold text-white">{data?.scans_this_week.display ?? "0"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#2A2640' }}>
                    <Percent size={20} weight="regular" className="text-white" />
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Avg. Confidence</div>
                    <div className="text-xl font-bold text-white">
                      {data?.avg_confidence_pct != null ? `${data.avg_confidence_pct}%` : "—"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full h-px mb-5" style={{ backgroundColor: '#3C3854' }}></div>

              <div className="flex justify-between gap-2">
                {(data?.daily_scans || []).map((d, i) => {
                  const CHART_HEIGHT = 144;
                  const CAP_HEIGHT = 8;
                  const ratio = maxDailyScans > 0 ? d.value / maxDailyScans : 0;
                  const barHeight = Math.max(CAP_HEIGHT, ratio * CHART_HEIGHT);
                  const stemHeight = barHeight - CAP_HEIGHT;
                  const hasScans = d.value > 0;

                  return (
                    <div key={i} className="flex flex-col items-center flex-1">
                      <div
                        className="flex flex-col items-center justify-end mb-3"
                        style={{ height: `${CHART_HEIGHT}px` }}
                      >
                        <div
                          className="rounded-full flex-shrink-0"
                          style={{
                            width: '10px',
                            height: `${CAP_HEIGHT}px`,
                            backgroundColor: hasScans ? '#987DFF' : '#3C3854',
                          }}
                        />
                        {stemHeight > 0 && (
                          <div
                            className="flex-shrink-0"
                            style={{
                              width: '10px',
                              height: `${stemHeight}px`,
                              backgroundColor: '#4B21EF',
                            }}
                          />
                        )}
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{d.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
