export type CatalogInventoryItem = {
  id?: string | null;
  brand?: string | null;
  model?: string | null;
  terrain?: string | null;
  stability?: string | null;
  cushioning?: string | null;
  drop_mm?: number | null;
  weight_g?: number | null;
  stack_mm?: number | null;
  price?: number | null;
  image_url?: string | null;
  product_url?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type CatalogRecommendationItem = {
  position: number;
  brand?: string | null;
  model?: string | null;
  image_url?: string | null;
  terrain?: string | null;
  drop_mm?: number | null;
  weight_g?: number | null;
  stack_mm?: number | null;
  price?: number | null;
  product_url?: string | null;
  score: number;
  score_pct: number;
};
