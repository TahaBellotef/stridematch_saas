import { apiFetch, apiFetchJson } from "./client";

export type DashboardRangePreset = "week" | "month" | "year";

export interface DashboardFilter {
  range?: DashboardRangePreset;
  /** ISO date (YYYY-MM-DD). When both startDate & endDate are set, they take precedence over `range`. */
  startDate?: string;
  endDate?: string;
}

function filterQueryString(filter?: DashboardFilter): string {
  if (!filter) return "";
  const params = new URLSearchParams();
  if (filter.startDate && filter.endDate) {
    params.set("start_date", filter.startDate);
    params.set("end_date", filter.endDate);
  } else if (filter.range) {
    params.set("range", filter.range);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function downloadDashboardExport(path: string, filter: DashboardFilter | undefined, filename: string): Promise<void> {
  const response = await apiFetch(`${path}${filterQueryString(filter)}`, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportDashboardOverview(filter?: DashboardFilter): Promise<void> {
  return downloadDashboardExport("/api/v1/admin/dashboard/overview/export", filter, "overview-report.pdf");
}

export function exportDashboardCustomers(filter?: DashboardFilter): Promise<void> {
  return downloadDashboardExport("/api/v1/admin/dashboard/customers/export", filter, "customers-report.xlsx");
}

export function exportDashboardInsights(filter?: DashboardFilter): Promise<void> {
  return downloadDashboardExport("/api/v1/admin/dashboard/insights/export", filter, "insights-report.xlsx");
}

export interface DashboardMetric {
  value: number;
  display: string;
  change_pct: number | null;
  is_percentage: boolean;
}

export interface DashboardSeriesPoint {
  label: string;
  date: string;
  value: number;
}

export interface DashboardStatusPoint {
  label: string;
  date: string;
  completed: number;
  pending: number;
}

export interface DashboardSegment {
  segment: "men" | "women" | "youth" | "kids";
  count: number;
}

export interface DashboardActivityItem {
  id: string;
  type: "foot_scan" | "analysis";
  title: string;
  subtitle: string;
  customer_name: string | null;
  initials: string | null;
  timestamp: string;
  status_color: "red" | "blue";
}

export interface DashboardOverviewResponse {
  scans_this_week: DashboardMetric;
  total_scans: DashboardMetric;
  new_customers_this_week: DashboardMetric;
  conversion_rate: DashboardMetric;
  daily_scans: DashboardSeriesPoint[];
  daily_status: DashboardStatusPoint[];
  demographics: DashboardSegment[];
  total_customers: number;
  activity: DashboardActivityItem[];
  avg_confidence_pct: number | null;
}

export interface BiomechanicsSegment {
  key: string;
  label: string;
  count: number;
}

export interface DashboardBiomechanicsResponse {
  pronation_total: number;
  pronation_breakdown: BiomechanicsSegment[];
  scan_quality_total: number;
  scan_quality_breakdown: BiomechanicsSegment[];
}

export async function getDashboardOverview(filter?: DashboardFilter): Promise<DashboardOverviewResponse> {
  try {
    return await apiFetchJson<DashboardOverviewResponse>(
      `/api/v1/admin/dashboard/overview${filterQueryString(filter)}`
    );
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Failed to fetch dashboard overview");
  }
}

export interface DashboardAcquisitionPoint {
  label: string;
  date: string;
  acquisition: number;
  retention: number;
}

export interface DashboardCustomersResponse {
  new_customers: DashboardMetric;
  returning_customers: DashboardMetric;
  retention_rate: DashboardMetric;
  daily_acquisition_retention: DashboardAcquisitionPoint[];
  experience_breakdown: BiomechanicsSegment[];
  run_frequency_breakdown: BiomechanicsSegment[];
  total_customers: number;
}

export interface MatchingCustomersResponse {
  count: number;
  total: number;
}

export async function getDashboardCustomers(filter?: DashboardFilter): Promise<DashboardCustomersResponse> {
  return apiFetchJson<DashboardCustomersResponse>(
    `/api/v1/admin/dashboard/customers${filterQueryString(filter)}`
  );
}

export async function getMatchingCustomers(
  experiences: string[],
  frequencies: string[]
): Promise<MatchingCustomersResponse> {
  const params = new URLSearchParams();
  if (experiences.length) params.set("experience", experiences.join(","));
  if (frequencies.length) params.set("frequency", frequencies.join(","));

  return apiFetchJson<MatchingCustomersResponse>(
    `/api/v1/admin/dashboard/customers/matching?${params.toString()}`
  );
}

export async function getDashboardBiomechanics(filter?: DashboardFilter): Promise<DashboardBiomechanicsResponse> {
  return apiFetchJson<DashboardBiomechanicsResponse>(
    `/api/v1/admin/dashboard/biomechanics${filterQueryString(filter)}`
  );
}

export interface DashboardAnalysisStackPoint {
  label: string;
  date: string;
  rear: number;
  side: number;
  unspecified: number;
}

export interface DashboardInsightsResponse {
  total_analyses: DashboardMetric;
  back_view_count: DashboardMetric;
  side_view_count: DashboardMetric;
  daily_analysis_breakdown: DashboardAnalysisStackPoint[];
  total_scans: number;
  daily_scan_counts: DashboardSeriesPoint[];
  total_recommendations: number;
  daily_recommendation_counts: DashboardSeriesPoint[];
  analysis_type_breakdown: BiomechanicsSegment[];
}

export async function getDashboardInsights(filter?: DashboardFilter): Promise<DashboardInsightsResponse> {
  return apiFetchJson<DashboardInsightsResponse>(
    `/api/v1/admin/dashboard/insights${filterQueryString(filter)}`
  );
}
