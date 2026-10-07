import { closeMask, fillHoles, keepLargestBlob } from "./imageOps";

export const maskFromCategory = (
  categoryMask: Uint8Array,
  width: number,
  height: number,
  threshold = 1
) => {
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    binary[i] = categoryMask[i] >= threshold ? 1 : 0;
  }
  return binary;
};

export const cleanFootMask = (
  mask: Uint8Array,
  width: number,
  height: number
) => {
  const closed = closeMask(mask, width, height, 1);
  const filled = fillHoles(closed, width, height);
  return keepLargestBlob(filled, width, height);
};

export const maskTouchesEdge = (
  mask: Uint8Array,
  width: number,
  height: number
) => {
  for (let x = 0; x < width; x += 1) {
    if (mask[x] || mask[(height - 1) * width + x]) return true;
  }
  for (let y = 0; y < height; y += 1) {
    if (mask[y * width] || mask[y * width + (width - 1)]) return true;
  }
  return false;
};

export const measureFoot = (
  mask: Uint8Array,
  width: number,
  height: number,
  pxPerMm: number
) => {
  const points: [number, number][] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        points.push([x, y]);
      }
    }
  }

  if (points.length < 50) {
    return null;
  }

  let meanX = 0;
  let meanY = 0;
  for (const [x, y] of points) {
    meanX += x;
    meanY += y;
  }
  meanX /= points.length;
  meanY /= points.length;

  let covXX = 0;
  let covYY = 0;
  let covXY = 0;
  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    covXX += dx * dx;
    covYY += dy * dy;
    covXY += dx * dy;
  }
  covXX /= points.length;
  covYY /= points.length;
  covXY /= points.length;

  const trace = covXX + covYY;
  const det = covXX * covYY - covXY * covXY;
  const lambda1 = trace / 2 + Math.sqrt(Math.max(0, trace * trace / 4 - det));

  let axisX = covXY;
  let axisY = lambda1 - covXX;
  let axisNorm = Math.hypot(axisX, axisY);
  if (axisNorm < 1e-6) {
    axisX = 1;
    axisY = 0;
    axisNorm = 1;
  }
  axisX /= axisNorm;
  axisY /= axisNorm;

  const perpX = -axisY;
  const perpY = axisX;

  let minProj = Infinity;
  let maxProj = -Infinity;
  let minPerp = Infinity;
  let maxPerp = -Infinity;
  const projections: number[] = [];

  for (const [x, y] of points) {
    const dx = x - meanX;
    const dy = y - meanY;
    const proj = dx * axisX + dy * axisY;
    const perp = dx * perpX + dy * perpY;
    projections.push(proj);
    minProj = Math.min(minProj, proj);
    maxProj = Math.max(maxProj, proj);
    minPerp = Math.min(minPerp, perp);
    maxPerp = Math.max(maxPerp, perp);
  }

  const lengthPx = maxProj - minProj;
  const lengthMm = lengthPx / pxPerMm;
  const lengthCm = lengthMm / 10;

  const targetProj = minProj + lengthPx * 0.7;
  const slice = lengthPx * 0.04;
  let sliceMin = Infinity;
  let sliceMax = -Infinity;
  for (let i = 0; i < points.length; i += 1) {
    const proj = projections[i];
    if (Math.abs(proj - targetProj) <= slice) {
      const [x, y] = points[i];
      const dx = x - meanX;
      const dy = y - meanY;
      const perp = dx * perpX + dy * perpY;
      sliceMin = Math.min(sliceMin, perp);
      sliceMax = Math.max(sliceMax, perp);
    }
  }

  const widthPx =
    sliceMin !== Infinity && sliceMax !== -Infinity
      ? sliceMax - sliceMin
      : maxPerp - minPerp;
  const widthMm = widthPx / pxPerMm;
  const widthCm = widthMm / 10;

  return {
    lengthPx,
    widthPx,
    lengthCm,
    widthCm,
    axis: [axisX, axisY] as [number, number],
  };
};
