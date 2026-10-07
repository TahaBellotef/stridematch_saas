import { apiFetch } from "@/shared/api/client";
import type { AnalysisResult } from "@/features/lab/domain/analysis.types";

/** Full customer profile from PostgreSQL (GET /admin/customers) */
export interface CustomerProfileInfo {
  id: string;
  customer_id?: string | null;
  email: string;
  organization_id?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  full_name?: string | null;
  name: string;
  sex?: string | null;
  age?: number | null;
  weight?: number | null;
  height?: number | null;
  weekly_distance?: string | null;
  preferred_surfaces?: string[] | null;
  running_duration?: string | null;
  runs_per_week?: string | null;
  distance_per_week?: string | null;
  shoe_preferences?: string[] | null;
  shoe_size?: string | null;
  shoe_size_unit?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  status: string;
  pronation?: string | null;
  scan_count?: number;
  last_scan_at?: string | null;
}

/** Row shape used by the customers table UI */
export interface CustomerRow {
  id: string;
  customerId?: string | null;
  name: string;
  email: string;
  givenName?: string | null;
  familyName?: string | null;
  age: string;
  sex: string;
  shoeSize: string;
  height: string;
  weight: string;
  shoeSizeUnit?: string | null;
  status: "Online" | "Offline";
  avatarUrl: string;
  initials: string;
  profile: CustomerProfileInfo;
}

export interface CreateCustomerPayload {
  email: string;
  given_name?: string;
  family_name?: string;
}

export interface CreateCustomerProfilePayload {
  email: string;
  customer_id?: string;
  given_name?: string;
  family_name?: string;
  full_name?: string;
  sex?: string;
  age?: number;
  weight?: number;
  height?: number;
  weekly_distance?: string;
  preferred_surfaces?: string[];
  running_duration?: string;
  runs_per_week?: string;
  distance_per_week?: string;
  shoe_preferences?: string[];
  shoe_size?: string;
  shoe_size_unit?: string;
}

function formatOptional(value?: string | number | null, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}

export function formatShoeSize(size?: string | null, unit?: string | null): string {
  if (!size) return "—";
  return unit ? `${size} ${unit}` : size;
}

export function mapProfileToRow(customer: CustomerProfileInfo): CustomerRow {
  const initials = customer.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return {
    id: customer.id,
    customerId: customer.customer_id,
    name: customer.name,
    email: customer.email,
    givenName: customer.given_name,
    familyName: customer.family_name,
    age: formatOptional(customer.age),
    sex: formatOptional(customer.sex),
    shoeSize: formatShoeSize(customer.shoe_size, customer.shoe_size_unit),
    height: formatOptional(customer.height, " cm"),
    weight: formatOptional(customer.weight, " kg"),
    shoeSizeUnit: customer.shoe_size_unit,
    status: customer.status === "CONFIRMED" ? "Online" : "Offline",
    avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(customer.name)}&background=2F2B4A&color=FFFFFF&size=64`,
    initials,
    profile: customer,
  };
}

async function adminFetch(path: string, init?: RequestInit) {
  return apiFetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

export async function createCustomer(
  payload: CreateCustomerPayload
): Promise<{ ok: boolean; username: string }> {
  const response = await adminFetch("/api/v1/admin/create-customer", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Failed to create customer: ${response.statusText}`);
  }

  return response.json();
}

export async function createCustomerProfile(
  payload: CreateCustomerProfilePayload
): Promise<{ ok: boolean; id: string }> {
  const response = await adminFetch("/api/v1/admin/customer-profile", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || `Failed to save customer profile: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchCustomers(): Promise<CustomerRow[]> {
  try {
    const response = await adminFetch("/api/v1/admin/customers");

    if (!response.ok) {
      console.warn(`Failed to fetch customers: ${response.statusText}`);
      return [];
    }

    const data: { ok: boolean; customers: CustomerProfileInfo[]; total: number } =
      await response.json();

    return data.customers.map(mapProfileToRow);
  } catch (error) {
    console.error("Error fetching customers:", error);
    return [];
  }
}

export interface CatalogItem {
  position: number;
  brand?: string | null;
  model?: string | null;
  image_url?: string | null;
  terrain?: string | null;
  stability?: string | null;
  cushioning?: string | null;
  gender?: string | null;
  drop_mm?: number | null;
  weight_g?: number | null;
  stack_mm?: number | null;
  price?: number | null;
  product_url?: string | null;
  metadata?: Record<string, string> | null;
  score: number;
  score_pct: number;
}

export async function fetchCustomerRecommendations(
  customerId: string,
  limit = 10
): Promise<CatalogItem[]> {
  try {
    const response = await adminFetch(
      `/api/v1/admin/customers/${encodeURIComponent(customerId)}/recommendations?limit=${limit}`
    );
    if (!response.ok) {
      console.warn(`Failed to fetch recommendations for ${customerId}: ${response.statusText}`);
      return [];
    }
    const data: { total: number; items: CatalogItem[] } = await response.json();
    return data.items;
  } catch (error) {
    console.error("Error fetching customer recommendations:", error);
    return [];
  }
}

/**
 * Open the PDF for a completed analysis session by job_id, generating it on
 * the fly if it hasn't been downloaded/sent before - works for every
 * completed session regardless of whether anyone hit "Download" yet.
 */
export async function openCustomerAnalysisReport(jobId: string): Promise<void> {
  const response = await adminFetch(`/api/v1/analysis/${encodeURIComponent(jobId)}/report`);
  if (!response.ok) {
    throw new Error(`Failed to load report: ${response.statusText}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function fetchCustomerLatestAnalysis(customerId: string): Promise<AnalysisResult | null> {
  try {
    const response = await adminFetch(`/api/v1/admin/customers/${encodeURIComponent(customerId)}/analysis`);
    if (!response.ok) {
      console.warn(`Failed to fetch analysis for ${customerId}: ${response.statusText}`);
      return null;
    }
    const data: { status: "found" | "not_found"; result: AnalysisResult | null } = await response.json();
    return data.status === "found" ? data.result : null;
  } catch (error) {
    console.error("Error fetching customer analysis:", error);
    return null;
  }
}

export interface CustomerAnalysisSummary {
  job_id: string;
  created_at: string;
  analysis_type?: string | null;
}

/** All of a customer's completed gait analyses, most recent first. */
export async function fetchCustomerAnalysesList(customerId: string): Promise<CustomerAnalysisSummary[]> {
  try {
    const response = await adminFetch(`/api/v1/admin/customers/${encodeURIComponent(customerId)}/analyses`);
    if (!response.ok) {
      console.warn(`Failed to fetch analyses for ${customerId}: ${response.statusText}`);
      return [];
    }
    const data: { items: CustomerAnalysisSummary[] } = await response.json();
    return data.items ?? [];
  } catch (error) {
    console.error("Error fetching customer analyses list:", error);
    return [];
  }
}

export async function fetchCustomerById(customerId: string): Promise<CustomerProfileInfo | null> {
  try {
    const response = await adminFetch(`/api/v1/admin/customers/${encodeURIComponent(customerId)}`);
    if (!response.ok) {
      console.warn(`Failed to fetch customer ${customerId}: ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching customer:", error);
    return null;
  }
}

export async function deleteCustomer(customerId: string): Promise<{ ok: boolean }> {
  const response = await adminFetch(`/api/v1/admin/customers/${encodeURIComponent(customerId)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Failed to delete customer: ${response.statusText}`);
  }

  return response.json();
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** @deprecated Use CustomerRow */
export type CustomerProfile = CustomerRow;
