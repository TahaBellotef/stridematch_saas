export type Quad = [number, number][];

export type FootScanDebug = {
  a4Corners: Quad;
  orientation: "portrait" | "landscape";
  pxPerMm: number;
  warnings: string[];
};

export type FootScanResult = {
  lengthCm: number;
  widthCm?: number;
  euSize: number;
  usMen: number;
  usWomen: number;
  confidence: number;
  debug?: FootScanDebug;
};
