export interface BiomechanicalData {
  pronation: string;
  size: string;
  numberOfScans: string;
  lastScanDate: string;
}

export interface ShoeRecommendation {
  brand: string | null;
  model: string | null;
  matchPercentage: number;
  price: number | null;
  imageUrl: string | null;
  terrain: string | null;
  stability: string | null;
  gender: string | null;
  dropMm: number | null;
  weightG: number | null;
  stackMm: number | null;
  productUrl: string | null;
  metadata: Record<string, string> | null;
}

export interface CustomerDetailData {
  id: string;
  name: string;
  email: string;
  avatar: string;
  initials: string;
  biomechanical: BiomechanicalData;
}
