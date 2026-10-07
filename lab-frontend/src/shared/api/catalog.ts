import { apiFetch, apiFetchJson } from "./client";
import type { CatalogInventoryItem } from "../types/catalog";

export interface CatalogInventoryResponse {
  total: number;
  items: CatalogInventoryItem[];
}

export interface CatalogInventoryUpdateRequest {
  brand?: string;
  model?: string;
  terrain?: string;
  stability?: string;
  cushioning?: string;
  drop_mm?: number;
  weight_g?: number;
  stack_mm?: number;
  price?: number;
  metadata?: Record<string, any>;
}

/**
 * Fetch catalog inventory from the backend (admin endpoint)
 */
export async function getCatalogInventory(limit: number = 100): Promise<CatalogInventoryResponse> {
  return apiFetchJson<CatalogInventoryResponse>(`/api/v1/admin/catalog?limit=${limit}`);
}

export interface CatalogGenderSegment {
  gender: string;
  count: number;
}

export interface CatalogTopBrand {
  brand: string;
  product_count: number;
  active_count: number;
  inactive_count: number;
  top_gender: string | null;
}

export interface CatalogOverviewResponse {
  total_products: number;
  active_products: number;
  inactive_products: number;
  total_brands: number;
  avg_price: number | null;
  gender_breakdown: CatalogGenderSegment[];
  top_brands: CatalogTopBrand[];
}

/**
 * Fetch aggregate catalog stats for the Inventory Overview tab (admin endpoint)
 */
export async function getCatalogOverview(): Promise<CatalogOverviewResponse> {
  return apiFetchJson<CatalogOverviewResponse>("/api/v1/admin/catalog/overview");
}

/**
 * Update a catalog item (admin endpoint)
 */
export async function updateCatalogItem(
  itemId: string,
  payload: CatalogInventoryUpdateRequest
): Promise<CatalogInventoryItem> {
  const response = await apiFetch(`/api/v1/admin/catalog/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update catalog item: ${response.statusText}`);
  }

  return response.json();
}
