import { orderQuad, polygonArea } from "./geometry";
import {
  findLargestComponent,
  resizeImageData,
  sobelEdges,
  thresholdBinary,
  toGrayscale,
} from "./imageOps";

type A4Detection = {
  corners: [number, number][];
  orientation: "portrait" | "landscape";
  area: number;
};

const estimateThreshold = (values: Float32Array) => {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    sumSq += values[i] * values[i];
  }
  const mean = sum / Math.max(values.length, 1);
  const variance = sumSq / Math.max(values.length, 1) - mean * mean;
  return mean + Math.sqrt(Math.max(variance, 0));
};

export const detectA4Quad = (
  imageData: ImageData,
  options?: { targetWidth?: number; targetHeight?: number }
): A4Detection | null => {
  const targetWidth = options?.targetWidth ?? 360;
  const scale = Math.min(1, targetWidth / imageData.width);
  const targetHeight =
    options?.targetHeight ?? Math.round(imageData.height * scale);

  const resized = resizeImageData(imageData, targetWidth, targetHeight);
  const scaleX = imageData.width / resized.width;
  const scaleY = imageData.height / resized.height;
  const gray = toGrayscale(resized);
  const { magnitude } = sobelEdges(gray, resized.width, resized.height);

  const edgeThreshold = estimateThreshold(magnitude);
  let edgeMask = thresholdBinary(
    magnitude,
    resized.width,
    resized.height,
    edgeThreshold
  );
  let component = findLargestComponent(
    edgeMask,
    resized.width,
    resized.height
  );

  if (!component || component.area < resized.width * resized.height * 0.01) {
    const brightThreshold = Math.min(
      220,
      estimateThreshold(gray) + 20
    );
    edgeMask = thresholdBinary(
      gray,
      resized.width,
      resized.height,
      brightThreshold
    );
    component = findLargestComponent(
      edgeMask,
      resized.width,
      resized.height
    );
  }

  if (!component) return null;

  const corners = orderQuad([
    [
      component.minSumPoint[0] * scaleX,
      component.minSumPoint[1] * scaleY,
    ],
    [
      component.maxDiffPoint[0] * scaleX,
      component.maxDiffPoint[1] * scaleY,
    ],
    [
      component.maxSumPoint[0] * scaleX,
      component.maxSumPoint[1] * scaleY,
    ],
    [
      component.minDiffPoint[0] * scaleX,
      component.minDiffPoint[1] * scaleY,
    ],
  ]);

  const area = polygonArea(corners);
  if (area <= 1) return null;

  const widthTop = Math.hypot(
    corners[1][0] - corners[0][0],
    corners[1][1] - corners[0][1]
  );
  const heightLeft = Math.hypot(
    corners[3][0] - corners[0][0],
    corners[3][1] - corners[0][1]
  );
  const orientation = widthTop >= heightLeft ? "landscape" : "portrait";

  return {
    corners,
    orientation,
    area,
  };
};
