import { quadAngles, polygonArea, distance } from "./geometry";
import { maskTouchesEdge } from "./footMetrics";

type ConfidenceInput = {
  quad: [number, number][];
  imageWidth: number;
  imageHeight: number;
  rectifiedMask?: Uint8Array;
  rectifiedWidth?: number;
  rectifiedHeight?: number;
  blurVariance?: number;
};

export const computeConfidence = ({
  quad,
  imageWidth,
  imageHeight,
  rectifiedMask,
  rectifiedWidth,
  rectifiedHeight,
  blurVariance,
}: ConfidenceInput) => {
  let score = 100;
  const warnings: string[] = [];

  const area = polygonArea(quad);
  const frameArea = imageWidth * imageHeight;
  const areaRatio = area / Math.max(frameArea, 1);
  if (areaRatio < 0.12) {
    score -= 25;
    warnings.push("A4 too small in frame");
  } else if (areaRatio > 0.85) {
    score -= 10;
    warnings.push("A4 too close to camera");
  }

  const angles = quadAngles(quad);
  if (angles.length === 4) {
    const avgDeviation =
      angles.reduce((acc, value) => acc + Math.abs(90 - value), 0) / 4;
    if (avgDeviation > 12) {
      score -= Math.min(20, avgDeviation);
      warnings.push("Paper corners look skewed");
    }
  }

  const top = distance(quad[0], quad[1]);
  const bottom = distance(quad[3], quad[2]);
  const left = distance(quad[0], quad[3]);
  const right = distance(quad[1], quad[2]);
  const widthSkew = Math.max(top, bottom) / Math.max(1, Math.min(top, bottom));
  const heightSkew = Math.max(left, right) / Math.max(1, Math.min(left, right));
  if (widthSkew > 1.25 || heightSkew > 1.25) {
    score -= 15;
    warnings.push("Camera angle too steep");
  }

  if (
    rectifiedMask &&
    rectifiedWidth &&
    rectifiedHeight &&
    maskTouchesEdge(rectifiedMask, rectifiedWidth, rectifiedHeight)
  ) {
    score -= 15;
    warnings.push("Foot touches A4 edge");
  }

  if (typeof blurVariance === "number") {
    if (blurVariance < 60) {
      score -= 15;
      warnings.push("Image looks blurry");
    } else if (blurVariance < 110) {
      score -= 8;
      warnings.push("Slight blur detected");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, warnings };
};
