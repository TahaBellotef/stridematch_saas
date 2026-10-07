"use client";

import { apiFetchJson } from "@/shared/api/client";

export type InventoryItem = {
  id?: string;
  brand?: string;
  model?: string;
  shoe_image_url?: string;
  terrain?: string;
  stability?: string;
  cushioning?: string;
  drop_mm?: number | null;
  weight_g?: number | null;
  stack_mm?: number | null;
  price?: number | null;
  metadata?: Record<string, any> | null;
};

export async function fetchInventoryItems(limit?: number): Promise<InventoryItem[]> {
  const path = limit ? `/api/v1/admin/catalog?limit=${limit}` : "/api/v1/admin/catalog";
  const data = await apiFetchJson<{ items?: InventoryItem[] }>(path);
  return data.items ?? [];
}
