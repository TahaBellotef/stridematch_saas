type ComponentSummary = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  minSum: number;
  maxSum: number;
  minDiff: number;
  maxDiff: number;
  minSumPoint: [number, number];
  maxSumPoint: [number, number];
  minDiffPoint: [number, number];
  maxDiffPoint: [number, number];
};

export const resizeImageData = (
  imageData: ImageData,
  targetWidth: number,
  targetHeight: number
) => {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = imageData.width;
  sourceCanvas.height = imageData.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return imageData;
  sourceCtx.putImageData(imageData, 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) return imageData;
  targetCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
  return targetCtx.getImageData(0, 0, targetWidth, targetHeight);
};

export const cropImageData = (
  imageData: ImageData,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  const clampedX = Math.max(0, Math.min(imageData.width - 1, Math.round(x)));
  const clampedY = Math.max(0, Math.min(imageData.height - 1, Math.round(y)));
  const clampedW = Math.max(
    1,
    Math.min(imageData.width - clampedX, Math.round(width))
  );
  const clampedH = Math.max(
    1,
    Math.min(imageData.height - clampedY, Math.round(height))
  );

  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageData;
  ctx.putImageData(imageData, 0, 0);
  return ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
};

export const resizeMask = (
  mask: Uint8Array,
  srcWidth: number,
  srcHeight: number,
  destWidth: number,
  destHeight: number
) => {
  const out = new Uint8Array(destWidth * destHeight);
  for (let y = 0; y < destHeight; y += 1) {
    const sy = Math.min(
      srcHeight - 1,
      Math.round((y / destHeight) * srcHeight)
    );
    for (let x = 0; x < destWidth; x += 1) {
      const sx = Math.min(
        srcWidth - 1,
        Math.round((x / destWidth) * srcWidth)
      );
      out[y * destWidth + x] = mask[sy * srcWidth + sx];
    }
  }
  return out;
};

export const toGrayscale = (imageData: ImageData) => {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
};

export const sobelEdges = (gray: Float32Array, width: number, height: number) => {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  const gxKernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gyKernel = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const idx = (y + ky) * width + (x + kx);
          const value = gray[idx];
          gx += value * gxKernel[k];
          gy += value * gyKernel[k];
          k += 1;
        }
      }
      const index = y * width + x;
      magnitude[index] = Math.hypot(gx, gy);
      direction[index] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
};

export const thresholdBinary = (
  values: Float32Array,
  width: number,
  height: number,
  threshold: number
) => {
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    binary[i] = values[i] >= threshold ? 1 : 0;
  }
  return binary;
};

export const findLargestComponent = (
  binary: Uint8Array,
  width: number,
  height: number
) => {
  const visited = new Uint8Array(width * height);
  let best: ComponentSummary | null = null;
  const queue: number[] = [];

  const pushIfValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (binary[idx] === 0 || visited[idx] === 1) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (binary[idx] === 0 || visited[idx] === 1) continue;
      visited[idx] = 1;
      queue.length = 0;
      queue.push(idx);

      const summary: ComponentSummary = {
        area: 0,
        minX: x,
        minY: y,
        maxX: x,
        maxY: y,
        minSum: x + y,
        maxSum: x + y,
        minDiff: x - y,
        maxDiff: x - y,
        minSumPoint: [x, y],
        maxSumPoint: [x, y],
        minDiffPoint: [x, y],
        maxDiffPoint: [x, y],
      };

      for (let q = 0; q < queue.length; q += 1) {
        const current = queue[q];
        const cx = current % width;
        const cy = Math.floor(current / width);
        summary.area += 1;
        summary.minX = Math.min(summary.minX, cx);
        summary.minY = Math.min(summary.minY, cy);
        summary.maxX = Math.max(summary.maxX, cx);
        summary.maxY = Math.max(summary.maxY, cy);
        const sum = cx + cy;
        const diff = cx - cy;
        if (sum < summary.minSum) {
          summary.minSum = sum;
          summary.minSumPoint = [cx, cy];
        }
        if (sum > summary.maxSum) {
          summary.maxSum = sum;
          summary.maxSumPoint = [cx, cy];
        }
        if (diff < summary.minDiff) {
          summary.minDiff = diff;
          summary.minDiffPoint = [cx, cy];
        }
        if (diff > summary.maxDiff) {
          summary.maxDiff = diff;
          summary.maxDiffPoint = [cx, cy];
        }

        pushIfValid(cx + 1, cy);
        pushIfValid(cx - 1, cy);
        pushIfValid(cx, cy + 1);
        pushIfValid(cx, cy - 1);
      }

      if (!best || summary.area > best.area) {
        best = summary;
      }
    }
  }

  return best;
};

export const dilate = (
  binary: Uint8Array,
  width: number,
  height: number,
  radius = 1
) => {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        for (let kx = -radius; kx <= radius; kx += 1) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (binary[ny * width + nx] === 1) {
            on = 1;
            break;
          }
        }
        if (on) break;
      }
      out[y * width + x] = on;
    }
  }
  return out;
};

export const erode = (
  binary: Uint8Array,
  width: number,
  height: number,
  radius = 1
) => {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 1;
      for (let ky = -radius; ky <= radius; ky += 1) {
        for (let kx = -radius; kx <= radius; kx += 1) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            on = 0;
            break;
          }
          if (binary[ny * width + nx] === 0) {
            on = 0;
            break;
          }
        }
        if (!on) break;
      }
      out[y * width + x] = on;
    }
  }
  return out;
};

export const closeMask = (
  binary: Uint8Array,
  width: number,
  height: number,
  radius = 1
) => {
  const dilated = dilate(binary, width, height, radius);
  return erode(dilated, width, height, radius);
};

export const fillHoles = (
  binary: Uint8Array,
  width: number,
  height: number
) => {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const pushIfValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx] === 1 || binary[idx] === 1) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let x = 0; x < width; x += 1) {
    pushIfValid(x, 0);
    pushIfValid(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    pushIfValid(0, y);
    pushIfValid(width - 1, y);
  }

  for (let q = 0; q < queue.length; q += 1) {
    const idx = queue[q];
    const cx = idx % width;
    const cy = Math.floor(idx / width);
    pushIfValid(cx + 1, cy);
    pushIfValid(cx - 1, cy);
    pushIfValid(cx, cy + 1);
    pushIfValid(cx, cy - 1);
  }

  const filled = binary.slice();
  for (let i = 0; i < width * height; i += 1) {
    if (binary[i] === 0 && visited[i] === 0) {
      filled[i] = 1;
    }
  }
  return filled;
};

export const keepLargestBlob = (
  binary: Uint8Array,
  width: number,
  height: number
) => {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  let bestPixels: number[] = [];

  const pushIfValid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (binary[idx] === 0 || visited[idx] === 1) return;
    visited[idx] = 1;
    queue.push(idx);
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (binary[idx] === 0 || visited[idx] === 1) continue;
      visited[idx] = 1;
      queue.length = 0;
      queue.push(idx);
      const pixels: number[] = [];

      for (let q = 0; q < queue.length; q += 1) {
        const current = queue[q];
        pixels.push(current);
        const cx = current % width;
        const cy = Math.floor(current / width);
        pushIfValid(cx + 1, cy);
        pushIfValid(cx - 1, cy);
        pushIfValid(cx, cy + 1);
        pushIfValid(cx, cy - 1);
      }

      if (pixels.length > bestPixels.length) {
        bestPixels = pixels;
      }
    }
  }

  const out = new Uint8Array(width * height);
  for (const idx of bestPixels) {
    out[idx] = 1;
  }
  return out;
};

export const varianceOfLaplacian = (
  gray: Float32Array,
  width: number,
  height: number
) => {
  const kernel = [0, 1, 0, 1, -4, 1, 0, 1, 0];
  const values: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let sum = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const idx = (y + ky) * width + (x + kx);
          sum += gray[idx] * kernel[k];
          k += 1;
        }
      }
      values.push(sum);
    }
  }
  const mean =
    values.reduce((acc, value) => acc + value, 0) /
    Math.max(values.length, 1);
  const variance =
    values.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
    Math.max(values.length, 1);
  return variance;
};
