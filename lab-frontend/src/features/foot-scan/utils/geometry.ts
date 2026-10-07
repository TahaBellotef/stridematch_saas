export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const distance = (a: [number, number], b: [number, number]) => {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
};

export const polygonArea = (points: [number, number][]) => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
};

export const orderQuad = (corners: [number, number][]) => {
  if (corners.length !== 4) return corners;
  let minSum = Infinity;
  let maxSum = -Infinity;
  let minDiff = Infinity;
  let maxDiff = -Infinity;
  let topLeft: [number, number] = corners[0];
  let topRight: [number, number] = corners[0];
  let bottomRight: [number, number] = corners[0];
  let bottomLeft: [number, number] = corners[0];

  for (const [x, y] of corners) {
    const sum = x + y;
    const diff = x - y;
    if (sum < minSum) {
      minSum = sum;
      topLeft = [x, y];
    }
    if (sum > maxSum) {
      maxSum = sum;
      bottomRight = [x, y];
    }
    if (diff < minDiff) {
      minDiff = diff;
      bottomLeft = [x, y];
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      topRight = [x, y];
    }
  }

  return [topLeft, topRight, bottomRight, bottomLeft];
};

export const quadAngles = (quad: [number, number][]) => {
  if (quad.length !== 4) return [];
  const angles: number[] = [];
  for (let i = 0; i < quad.length; i += 1) {
    const prev = quad[(i + 3) % 4];
    const curr = quad[i];
    const next = quad[(i + 1) % 4];
    const v1x = prev[0] - curr[0];
    const v1y = prev[1] - curr[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const dot = v1x * v2x + v1y * v2y;
    const mag1 = Math.hypot(v1x, v1y);
    const mag2 = Math.hypot(v2x, v2y);
    if (mag1 === 0 || mag2 === 0) {
      angles.push(0);
      continue;
    }
    const cos = clamp(dot / (mag1 * mag2), -1, 1);
    const angle = (Math.acos(cos) * 180) / Math.PI;
    angles.push(angle);
  }
  return angles;
};
