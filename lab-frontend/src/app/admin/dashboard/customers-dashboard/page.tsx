"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardToolbar } from "../DashboardToolbar";
import { MetricCard } from "../MetricCard";
import { ChartCard } from "../ChartCard";
import { UsersThree, UserSwitch, ClockUser, ChartLineUp, ChartPie, UserRectangle, PersonSimpleRun, Star, Wrench, UserFocus } from "@phosphor-icons/react";
import {
  exportDashboardCustomers,
  getDashboardBiomechanics,
  getDashboardCustomers,
  getMatchingCustomers,
  type DashboardBiomechanicsResponse,
  type DashboardCustomersResponse,
  type DashboardFilter,
} from "@/shared/api/dashboard";

const DONUT_CIRCUMFERENCE = 2 * Math.PI * 35;

const PRONATION_COLORS: Record<string, string> = {
  pronation: "#4B21EF",
  neutral: "#60E497",
  supination: "#28243D",
};

const SCAN_QUALITY_COLORS: Record<string, string> = {
  no_issues: "#60E497",
  unusual_length: "#4B21EF",
  unusual_width: "#3716B5",
  unusual_ratio: "#28243D",
};

const SEGMENT_PALETTE: Record<string, string> = {
  "One": "#3716B5",
  "2 to 3": "#4B21EF",
  "4 to 5": "#60E497",
  "Everyday": "#28243D",
  "Less than 6 months": "#3716B5",
  "6 months to 1 year": "#4B21EF",
  "1 year to 3 years": "#60E497",
  "More than 3 years": "#28243D",
};

function buildDonutSegments(
  segments: { key: string; label: string; count: number }[],
  colors: Record<string, string>
) {
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1;
  let offsetAcc = 0;
  return segments.map((seg) => {
    const length = (seg.count / total) * DONUT_CIRCUMFERENCE;
    const dashoffset = -offsetAcc;
    offsetAcc += length;
    return { ...seg, length, dashoffset, color: colors[seg.key] || "#2a2640" };
  });
}

function buildAreaPath(values: number[], max: number, width: number, height: number) {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * height,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  return { line, area };
}

function formatChange(changePct: number | null): string | null {
  if (changePct === null) return null;
  return `${changePct >= 0 ? "+" : ""}${changePct}%`;
}

export default function CustomersPage() {
  const router = useRouter();
  const [biomechanics, setBiomechanics] = useState<DashboardBiomechanicsResponse | null>(null);
  const [customers, setCustomers] = useState<DashboardCustomersResponse | null>(null);
  const [selectedFrequencies, setSelectedFrequencies] = useState<string[]>([]);
  const [selectedExperiences, setSelectedExperiences] = useState<string[]>([]);
  const [matching, setMatching] = useState<{ count: number; total: number } | null>(null);
  const [filter, setFilter] = useState<DashboardFilter>({ range: "week" });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [biomechanicsData, customersData] = await Promise.all([
          getDashboardBiomechanics(filter),
          getDashboardCustomers(filter),
        ]);
        if (mounted) {
          setBiomechanics(biomechanicsData);
          setCustomers(customersData);
        }
      } catch (err) {
        console.warn("Failed to load customers dashboard data:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filter]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportDashboardCustomers(filter);
    } catch (err) {
      console.error("Failed to export customers report:", err);
    } finally {
      setExporting(false);
    }
  }, [filter]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getMatchingCustomers(selectedExperiences, selectedFrequencies);
        if (mounted) setMatching(result);
      } catch (err) {
        console.warn("Failed to load matching customers:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedExperiences, selectedFrequencies]);

  const toggleFrequency = (value: string) =>
    setSelectedFrequencies((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );
  const toggleExperience = (value: string) =>
    setSelectedExperiences((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    );

  const pronationSegments = useMemo(
    () => buildDonutSegments(biomechanics?.pronation_breakdown || [], PRONATION_COLORS),
    [biomechanics]
  );
  const scanQualitySegments = useMemo(
    () => buildDonutSegments(biomechanics?.scan_quality_breakdown || [], SCAN_QUALITY_COLORS),
    [biomechanics]
  );
  const pronationTotal = biomechanics?.pronation_total ?? 0;
  const scanQualityTotal = biomechanics?.scan_quality_total ?? 0;

  const frequencySegments = useMemo(
    () => buildDonutSegments(customers?.run_frequency_breakdown || [], SEGMENT_PALETTE),
    [customers]
  );
  const experienceSegments = useMemo(
    () => buildDonutSegments(customers?.experience_breakdown || [], SEGMENT_PALETTE),
    [customers]
  );
  const frequencyTotal = frequencySegments.reduce((sum, s) => sum + s.count, 0);
  const experienceTotal = experienceSegments.reduce((sum, s) => sum + s.count, 0);

  const dailyPoints = customers?.daily_acquisition_retention || [];
  const acquisitionValues = dailyPoints.map((d) => d.acquisition);
  const retentionValues = dailyPoints.map((d) => d.retention);
  const chartMax = Math.max(1, ...acquisitionValues, ...retentionValues);
  const acquisitionChart = buildAreaPath(acquisitionValues, chartMax, 400, 200);
  const retentionChart = buildAreaPath(retentionValues, chartMax, 400, 200);

  const newCustomersChange = formatChange(customers?.new_customers.change_pct ?? null);
  const returningCustomersChange = formatChange(customers?.returning_customers.change_pct ?? null);
  const retentionRateChange = formatChange(customers?.retention_rate.change_pct ?? null);

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sm-fill)' }}>
      <DashboardToolbar
        activeTab="customers-dashboard"
        onTabChange={(tab) => router.push(`/admin/dashboard/${tab}`)}
        onFilterChange={setFilter}
        onExport={handleExport}
        exporting={exporting}
      />

      <div className="mx-auto w-full max-w-7xl px-6 pb-10">
        {/* Metrics Cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-6">
          <MetricCard
            icon={<UsersThree size={24} weight="duotone" />}
            iconColor="#987DFF"
            title="New Customers"
            value={customers?.new_customers.display ?? "0"}
            subtitle={newCustomersChange ? `${newCustomersChange} than last week` : "No data yet"}
          />

          <MetricCard
            icon={<UserSwitch size={24} weight="duotone" />}
            iconColor="#71A5FF"
            title="Returning Customers"
            value={customers?.returning_customers.display ?? "0"}
            subtitle={returningCustomersChange ? `${returningCustomersChange} than last week` : "No data yet"}
          />

          <MetricCard
            icon={<ClockUser size={24} weight="duotone" />}
            iconColor="#59C88B"
            title="Retention Rate"
            value={customers?.retention_rate.display ?? "0%"}
            subtitle={retentionRateChange ? `${retentionRateChange} than last week` : "No data yet"}
          />
        </div>

        {/* Second Row - Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Customer Acquisition vs Retention */}
          <div 
            className="rounded-2xl border px-6 py-6" 
            style={{ 
              backgroundColor: '#28243D',
              borderColor: '#1B1926'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#4B21EF60' }}>
                  <ChartLineUp size={16} weight="regular" color="#4B21EF" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Customer Acquisition vs Retention</h3>
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
                padding: '24px',
                height: '330px'
              }}
            >
              {/* Y-axis labels */}
              <div className="flex gap-3">
                <div className="flex flex-col justify-between text-xs text-slate-500" style={{ paddingTop: '10px', paddingBottom: '30px', height: '260px' }}>
                  {[chartMax, Math.round(chartMax * 0.75), Math.round(chartMax * 0.5), Math.round(chartMax * 0.25), 0].map((v, i) => (
                    <span key={i}>{v}</span>
                  ))}
                </div>

                {/* Chart Area */}
                <div className="flex-1 relative">
                  <svg viewBox="0 0 400 200" className="w-full" style={{ height: '260px' }}>
                    {/* X-axis line */}
                    <line x1="0" y1="200" x2="400" y2="200" stroke="#1F1F1F" strokeWidth="0.5" />
                    {/* Y-axis line */}
                    <line x1="0" y1="0" x2="0" y2="200" stroke="#1F1F1F" strokeWidth="0.5" />

                    {/* Green area (Retention) */}
                    <path d={retentionChart.area} fill="url(#greenGradient)" opacity="0.3" />
                    <path d={retentionChart.line} fill="none" stroke="#60E497" strokeWidth="2" />

                    {/* Blue/Purple area (Acquisition) */}
                    <path d={acquisitionChart.area} fill="url(#blueGradient)" opacity="0.3" />
                    <path d={acquisitionChart.line} fill="none" stroke="#4B21EF" strokeWidth="2" />

                    {/* Gradients */}
                    <defs>
                      <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60E497" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#60E497" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4B21EF" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#4B21EF" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* X-axis labels */}
                  <div className="flex justify-between text-xs text-slate-500 mt-2">
                    {dailyPoints.map((d, i) => (
                      <span key={i}>{d.label}</span>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4B21EF' }}></div>
                      <span className="text-slate-400">Acquisition (first-time scans)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#60E497' }}></div>
                      <span className="text-slate-400">Retention (repeat scans)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pronation Statistics */}
          <div 
            className="rounded-2xl border px-6 py-6" 
            style={{ 
              backgroundColor: '#28243D',
              borderColor: '#1B1926'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#4B21EF60' }}>
                  <ChartPie size={16} weight="regular" color="#4B21EF" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Pronation Statistics</h3>
              </div>
              <button className="text-slate-500 hover:text-slate-300 transition">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>
            
            <div 
              className="rounded-2xl border w-full flex flex-col items-center justify-center" 
              style={{ 
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '48px 24px',
                height: '330px'
              }}
            >
              {/* Donut Chart */}
              <div className="relative w-48 h-48 mb-6">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                  {pronationSegments.map((seg) => (
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

                {/* Center text */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-white">{pronationTotal}</span>
                  <span className="text-sm text-slate-400">Analyses</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center justify-center gap-6">
                {pronationSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: seg.color }}></div>
                    <span className="text-xs text-slate-400">{seg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Customer Profile Section */}
        <div 
          className="rounded-2xl border px-6 py-6 mb-6" 
          style={{ 
            backgroundColor: '#28243D',
            borderColor: '#1B1926'
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#4B21EF60' }}>
                <UserRectangle size={16} weight="regular" color="#4B21EF" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Customer Profile</h3>
            </div>
            <button className="text-slate-500 hover:text-slate-300 transition">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-6">Invoices have been paid by company</p>
          
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)] gap-6">
            {/* Running Type & Experience Card */}
            <div 
              className="rounded-2xl border" 
              style={{ 
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '32px 24px'
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                {/* Run Frequency */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4">Run Frequency</h4>
                  <div className="space-y-3">
                    {(customers?.run_frequency_breakdown || []).map((freq) => {
                      const checked = selectedFrequencies.includes(freq.key);
                      const color = SEGMENT_PALETTE[freq.key] || "#4B21EF";
                      return (
                        <div
                          key={freq.key}
                          onClick={() => toggleFrequency(freq.key)}
                          className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer"
                          style={{
                            backgroundColor: '#28243D',
                            borderColor: '#3C3854',
                            borderLeftWidth: '3px',
                            borderLeftColor: color
                          }}
                        >
                          <div
                            className="flex items-center justify-center rounded"
                            style={{
                              width: '16px',
                              height: '16px',
                              backgroundColor: checked ? color : '#28243D',
                              borderWidth: '1px',
                              borderColor: checked ? color : '#1E1C2B',
                              flexShrink: 0
                            }}
                          >
                            {checked && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ strokeWidth: '1.5' }}>
                                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm text-slate-300">{freq.label} ({freq.count})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <h4 className="text-sm font-medium text-white mb-4">Experience</h4>
                  <div className="space-y-3">
                    {(customers?.experience_breakdown || []).map((exp) => {
                      const checked = selectedExperiences.includes(exp.key);
                      const color = SEGMENT_PALETTE[exp.key] || "#4B21EF";
                      return (
                        <div
                          key={exp.key}
                          onClick={() => toggleExperience(exp.key)}
                          className="flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer"
                          style={{
                            backgroundColor: '#28243D',
                            borderColor: '#3C3854',
                            borderLeftWidth: '3px',
                            borderLeftColor: color
                          }}
                        >
                          <div
                            className="flex items-center justify-center rounded"
                            style={{
                              width: '16px',
                              height: '16px',
                              backgroundColor: checked ? color : '#28243D',
                              borderWidth: '1px',
                              borderColor: checked ? color : '#1E1C2B',
                              flexShrink: 0
                            }}
                          >
                            {checked && (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ strokeWidth: '1.5' }}>
                                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <span className="text-sm text-slate-300">{exp.label} ({exp.count})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Matching Customers Chart */}
            <div 
              className="rounded-2xl border" 
              style={{ 
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '32px 24px'
              }}
            >
              <div className="flex flex-col h-full">
                {/* Header with icon, label and number */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-lg border flex items-center justify-center"
                      style={{
                        backgroundColor: '#312D4B',
                        borderColor: '#201C35'
                      }}
                    >
                      <ChartLineUp size={20} weight="regular" color="#FFFFFF" />
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Matching Customers</div>
                      <div className="text-2xl font-bold text-white">{matching?.count ?? "—"}</div>
                    </div>
                  </div>
                </div>

                {/* Matching vs. rest donut */}
                <div className="flex-1 flex items-center justify-center">
                  <div className="relative w-36 h-36">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="35" fill="none" stroke="#28243D" strokeWidth="14" />
                      <circle
                        cx="50"
                        cy="50"
                        r="35"
                        fill="none"
                        stroke="#4B21EF"
                        strokeWidth="14"
                        strokeDasharray={`${matching && matching.total > 0 ? (matching.count / matching.total) * DONUT_CIRCUMFERENCE : 0} ${DONUT_CIRCUMFERENCE}`}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white">
                        {matching && matching.total > 0 ? Math.round((matching.count / matching.total) * 100) : 0}%
                      </span>
                      <span className="text-xs text-slate-400">match</span>
                    </div>
                  </div>
                </div>

                {/* Live progress against total */}
                <div className="flex flex-col">
                  <div className="text-xs text-slate-400 mb-2">
                    {matching
                      ? `${matching.count} of ${matching.total} total customers (${matching.total > 0 ? Math.round((matching.count / matching.total) * 100) : 0}%)`
                      : "Select filters to see matching customers"}
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: '#28243D' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${matching && matching.total > 0 ? (matching.count / matching.total) * 100 : 0}%`,
                        background: 'linear-gradient(to right, #4B21EF, #6F4CF5)',
                      }}
                    />
                  </div>
                  {(selectedFrequencies.length > 0 || selectedExperiences.length > 0) && (
                    <button
                      onClick={() => {
                        setSelectedFrequencies([]);
                        setSelectedExperiences([]);
                      }}
                      className="mt-4 self-start text-xs font-medium text-slate-400 hover:text-white transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Running Type & Experience Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Running Type Chart */}
          <div 
            className="rounded-2xl border px-6 py-6" 
            style={{ 
              backgroundColor: '#28243D',
              borderColor: '#1B1926',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#59C88B60' }}>
                  <PersonSimpleRun size={16} weight="regular" color="#59C88B" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Run Frequency</h3>
              </div>
              <button className="text-slate-500 hover:text-slate-300 transition">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-6">How often your customers run each week</p>

            <div
              className="rounded-2xl border"
              style={{
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '32px 24px'
              }}
            >
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-48 h-48 sm:w-52 sm:h-52">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                    {frequencySegments.map((seg) => (
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
                      <div className="text-xl font-bold text-white">{frequencyTotal}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {frequencySegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }}></div>
                    <span className="text-slate-300">
                      {frequencyTotal > 0 ? `${Math.round((seg.count / frequencyTotal) * 100)}% ` : "0% "}
                      {seg.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Experience Chart */}
          <div 
            className="rounded-2xl border px-6 py-6" 
            style={{ 
              backgroundColor: '#28243D',
              borderColor: '#1B1926',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#59C88B60' }}>
                  <Star size={16} weight="regular" color="#59C88B" />
                </div>
                <h3 className="text-sm font-medium text-slate-300">Experience</h3>
              </div>
              <button className="text-slate-500 hover:text-slate-300 transition">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-6">View each runner's experience level to guide better recommendations</p>

            <div
              className="rounded-2xl border"
              style={{
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
                padding: '32px 24px'
              }}
            >
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-48 h-48 sm:w-52 sm:h-52">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                    {experienceSegments.map((seg) => (
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
                      <div className="text-xl font-bold text-white">{experienceTotal}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {experienceSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }}></div>
                    <span className="text-slate-300">
                      {experienceTotal > 0 ? `${Math.round((seg.count / experienceTotal) * 100)}% ` : "0% "}
                      {seg.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>


        {/* Biomechanics Section */}
        <div 
          className="rounded-2xl border px-6 py-6" 
          style={{ 
            backgroundColor: '#28243D',
            borderColor: '#1B1926',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#59C88B60' }}>
                <Wrench size={16} weight="regular" color="#59C88B" />
              </div>
              <h3 className="text-sm font-medium text-slate-300">Biomechanics</h3>
            </div>
            <button className="text-slate-500 hover:text-slate-300 transition">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-slate-400 mb-6">Gain a deeper view of how your customers move and where support is needed</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 gap-6">
            {/* Pronation Statistics */}
            <div 
              className="rounded-2xl border px-6 py-6" 
              style={{ 
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#59C88B60' }}>
                  <UserFocus size={16} weight="regular" color="#59C88B" />
                </div>
                <h4 className="text-sm font-medium text-white">Pronation Statistics</h4>
              </div>
              <p className="text-xs text-slate-400 mb-6">Pronation type across completed gait analyses</p>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-48 h-48 sm:w-52 sm:h-52">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                    {pronationSegments.map((seg) => (
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
                      <div className="text-xl font-bold text-white">{pronationTotal}</div>
                      <div className="text-xs text-slate-400">analyses</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {pronationSegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }}></div>
                    <span className="text-slate-300">
                      {pronationTotal > 0 ? `${Math.round((seg.count / pronationTotal) * 100)}% ` : "0% "}
                      {seg.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Discomfort */}
            <div 
              className="rounded-2xl border px-6 py-6" 
              style={{ 
                backgroundColor: '#312D4B',
                borderColor: '#201C35',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03)'
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg border flex items-center justify-center" style={{ backgroundColor: '#312D4B', borderColor: '#59C88B60' }}>
                  <UserFocus size={16} weight="regular" color="#59C88B" />
                </div>
                <h4 className="text-sm font-medium text-white">Scan Quality</h4>
              </div>
              <p className="text-xs text-slate-400 mb-6">Measurement reliability across recent foot scans</p>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-48 h-48 sm:w-52 sm:h-52">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#2a2640" strokeWidth="14" />
                    {scanQualitySegments.map((seg) => (
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
                      <div className="text-xl font-bold text-white">{scanQualityTotal}</div>
                      <div className="text-xs text-slate-400">scans</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {scanQualitySegments.map((seg) => (
                  <div key={seg.key} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }}></div>
                    <span className="text-slate-300">
                      {scanQualityTotal > 0 ? `${Math.round((seg.count / scanQualityTotal) * 100)}% ` : "0% "}
                      {seg.label}
                    </span>
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
