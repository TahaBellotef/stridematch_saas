import { apiFetch } from "@/shared/api/client";

export async function fetchCatalogRecommendations(payload: any) {
  const res = await apiFetch("/api/v1/catalog/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Catalog fetch failed (${res.status})`);
  }
  return res.json();
}
