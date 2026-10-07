import { clamp } from "./geometry";

export type Homography = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

const solveLinearSystem = (matrix: number[][], vector: number[]) => {
  const size = matrix.length;
  const augmented = matrix.map((row, i) => [...row, vector[i]]);

  for (let i = 0; i < size; i += 1) {
    let maxRow = i;
    for (let k = i + 1; k < size; k += 1) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    const pivot = augmented[i][i];
    if (Math.abs(pivot) < 1e-9) {
      return null;
    }
    for (let j = i; j <= size; j += 1) {
      augmented[i][j] /= pivot;
    }

    for (let k = 0; k < size; k += 1) {
      if (k === i) continue;
      const factor = augmented[k][i];
      for (let j = i; j <= size; j += 1) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  return augmented.map((row) => row[size]);
};

export const computeHomography = (
  src: [number, number][],
  dst: [number, number][]
): Homography | null => {
  if (src.length !== 4 || dst.length !== 4) return null;
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let i = 0; i < 4; i += 1) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) return null;
  return [
    solution[0],
    solution[1],
    solution[2],
    solution[3],
    solution[4],
    solution[5],
    solution[6],
    solution[7],
    1,
  ];
};

export const invertHomography = (h: Homography): Homography | null => {
  const [a, b, c, d, e, f, g, h2, i] = h;
  const det =
    a * (e * i - f * h2) - b * (d * i - f * g) + c * (d * h2 - e * g);
  if (Math.abs(det) < 1e-9) return null;
  const invDet = 1 / det;
  return [
    (e * i - f * h2) * invDet,
    (c * h2 - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h2 - e * g) * invDet,
    (b * g - a * h2) * invDet,
    (a * e - b * d) * invDet,
  ];
};

export const applyHomography = (
  h: Homography,
  x: number,
  y: number
) => {
  const denom = h[6] * x + h[7] * y + h[8];
  const nx = (h[0] * x + h[1] * y + h[2]) / denom;
  const ny = (h[3] * x + h[4] * y + h[5]) / denom;
  return [nx, ny] as [number, number];
};

export const warpImageData = (
  imageData: ImageData,
  homography: Homography,
  destWidth: number,
  destHeight: number
) => {
  const inverse = invertHomography(homography);
  if (!inverse) return new ImageData(destWidth, destHeight);
  const src = imageData.data;
  const dest = new Uint8ClampedArray(destWidth * destHeight * 4);

  for (let y = 0; y < destHeight; y += 1) {
    for (let x = 0; x < destWidth; x += 1) {
      const [sx, sy] = applyHomography(inverse, x, y);
      const x0 = clamp(Math.floor(sx), 0, imageData.width - 1);
      const y0 = clamp(Math.floor(sy), 0, imageData.height - 1);
      const x1 = clamp(x0 + 1, 0, imageData.width - 1);
      const y1 = clamp(y0 + 1, 0, imageData.height - 1);
      const dx = sx - x0;
      const dy = sy - y0;
      const idx00 = (y0 * imageData.width + x0) * 4;
      const idx10 = (y0 * imageData.width + x1) * 4;
      const idx01 = (y1 * imageData.width + x0) * 4;
      const idx11 = (y1 * imageData.width + x1) * 4;
      const outIdx = (y * destWidth + x) * 4;

      for (let c = 0; c < 3; c += 1) {
        const v00 = src[idx00 + c];
        const v10 = src[idx10 + c];
        const v01 = src[idx01 + c];
        const v11 = src[idx11 + c];
        const v0 = v00 * (1 - dx) + v10 * dx;
        const v1 = v01 * (1 - dx) + v11 * dx;
        dest[outIdx + c] = v0 * (1 - dy) + v1 * dy;
      }
      dest[outIdx + 3] = 255;
    }
  }

  return new ImageData(dest, destWidth, destHeight);
};

export const warpMask = (
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  homography: Homography,
  destWidth: number,
  destHeight: number
) => {
  const inverse = invertHomography(homography);
  if (!inverse) return new Uint8Array(destWidth * destHeight);
  const dest = new Uint8Array(destWidth * destHeight);
  for (let y = 0; y < destHeight; y += 1) {
    for (let x = 0; x < destWidth; x += 1) {
      const [sx, sy] = applyHomography(inverse, x, y);
      const ix = clamp(Math.round(sx), 0, srcWidth - 1);
      const iy = clamp(Math.round(sy), 0, srcHeight - 1);
      dest[y * destWidth + x] = mask[iy * srcWidth + ix];
    }
  }
  return dest;
};
