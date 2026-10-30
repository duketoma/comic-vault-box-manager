export interface Point2D {
  /** Normalized X coordinate (0..1) relative to rotated source image width */
  x: number;
  /** Normalized Y coordinate (0..1) relative to rotated source image height */
  y: number;
}

/**
 * Ordered: [TopLeft, TopRight, BottomRight, BottomLeft]
 */
export type QuadCorners = [Point2D, Point2D, Point2D, Point2D];

export type AspectRatioPreset = 'standard' | 'wraparound' | 'freeform';

export const DEFAULT_FULL_QUAD: QuadCorners = [
  { x: 0.0, y: 0.0 },
  { x: 1.0, y: 0.0 },
  { x: 1.0, y: 1.0 },
  { x: 0.0, y: 1.0 },
];

export const DEFAULT_INSET_QUAD: QuadCorners = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

/**
 * Renders a source image with a 90-degree multiple rotation onto an offscreen canvas.
 */
export function createRotatedSourceCanvas(
  img: HTMLImageElement | HTMLCanvasElement,
  rotation90: number
): HTMLCanvasElement {
  const normRot = ((rotation90 % 360) + 360) % 360;
  const srcW = img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width;
  const srcH = img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height;

  const swapDims = normRot === 90 || normRot === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swapDims ? srcH : srcW;
  canvas.height = swapDims ? srcW : srcH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normRot * Math.PI) / 180);
  ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  return canvas;
}

/**
 * Automatically detects the 4 corners of a comic cover against a background.
 * Uses border color sampling + edge gradient magnitude and extremal corner projection.
 * Falls back to full frame if the image already appears pre-cropped.
 */
export function detectComicCoverQuad(
  sourceCanvas: HTMLCanvasElement
): QuadCorners {
  const maxSampleDim = 220;
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (srcW < 16 || srcH < 16) {
    return DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners;
  }

  const scale = Math.min(1, maxSampleDim / Math.max(srcW, srcH));
  const w = Math.max(16, Math.round(srcW * scale));
  const h = Math.max(16, Math.round(srcH * scale));

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = w;
  tempCanvas.height = h;
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    return DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners;
  }

  ctx.drawImage(sourceCanvas, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;

  // 1. Sample outer border pixels (top, bottom, left, right strips) to estimate background color
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let borderCount = 0;

  const sampleBorderPixel = (px: number, py: number) => {
    const idx = (py * w + px) * 4;
    rSum += imgData[idx];
    gSum += imgData[idx + 1];
    bSum += imgData[idx + 2];
    borderCount++;
  };

  for (let x = 0; x < w; x += 2) {
    sampleBorderPixel(x, 0);
    sampleBorderPixel(x, 1);
    sampleBorderPixel(x, h - 1);
    sampleBorderPixel(x, h - 2);
  }
  for (let y = 2; y < h - 2; y += 2) {
    sampleBorderPixel(0, y);
    sampleBorderPixel(1, y);
    sampleBorderPixel(w - 1, y);
    sampleBorderPixel(w - 2, y);
  }

  const bgR = rSum / Math.max(1, borderCount);
  const bgG = gSum / Math.max(1, borderCount);
  const bgB = bSum / Math.max(1, borderCount);

  // Measure border variance to see if border is uniform background (tabletop/scanner bed)
  let borderVarSum = 0;
  const measureBorderVar = (px: number, py: number) => {
    const idx = (py * w + px) * 4;
    const dr = imgData[idx] - bgR;
    const dg = imgData[idx + 1] - bgG;
    const db = imgData[idx + 2] - bgB;
    borderVarSum += Math.sqrt(dr * dr + dg * dg + db * db);
  };
  for (let x = 0; x < w; x += 4) {
    measureBorderVar(x, 0);
    measureBorderVar(x, h - 1);
  }
  for (let y = 0; y < h; y += 4) {
    measureBorderVar(0, y);
    measureBorderVar(w - 1, y);
  }
  const avgBorderDiff = borderVarSum / Math.max(1, Math.ceil(w / 4) * 2 + Math.ceil(h / 4) * 2);

  // If border already has high color variance, the image is likely already cropped to the cover
  if (avgBorderDiff > 48) {
    return DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners;
  }

  // 2. Threshold foreground pixels that differ significantly from the background color
  const diffThreshold = Math.max(28, avgBorderDiff * 1.85);
  const fgPoints: Array<{ x: number; y: number }> = [];
  const marginX = Math.max(2, Math.floor(w * 0.015));
  const marginY = Math.max(2, Math.floor(h * 0.015));

  for (let y = marginY; y < h - marginY; y++) {
    for (let x = marginX; x < w - marginX; x++) {
      const idx = (y * w + x) * 4;
      const dr = imgData[idx] - bgR;
      const dg = imgData[idx + 1] - bgG;
      const db = imgData[idx + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist > diffThreshold) {
        fgPoints.push({ x, y });
      }
    }
  }

  const totalInnerPixels = (w - 2 * marginX) * (h - 2 * marginY);
  // If foreground is too small (<12% of image) or almost the entire image (>94%), return full quad
  if (
    fgPoints.length < totalInnerPixels * 0.12 ||
    fgPoints.length > totalInnerPixels * 0.94
  ) {
    return DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners;
  }

  // 3. Find the 4 extremal corners using sum and difference of coordinates:
  // Top-Left minimizes (x + y)
  // Bottom-Right maximizes (x + y)
  // Top-Right maximizes (x - y)
  // Bottom-Left minimizes (x - y)
  let tl = fgPoints[0];
  let tr = fgPoints[0];
  let br = fgPoints[0];
  let bl = fgPoints[0];

  let minSum = Infinity;
  let maxSum = -Infinity;
  let maxDiff = -Infinity;
  let minDiff = Infinity;

  // Normalize x and y to [0, 1] when scoring so aspect ratio doesn't bias diagonal projections
  for (let i = 0; i < fgPoints.length; i++) {
    const pt = fgPoints[i];
    const nx = pt.x / w;
    const ny = pt.y / h;
    const sum = nx + ny;
    const diff = nx - ny;

    if (sum < minSum) {
      minSum = sum;
      tl = pt;
    }
    if (sum > maxSum) {
      maxSum = sum;
      br = pt;
    }
    if (diff > maxDiff) {
      maxDiff = diff;
      tr = pt;
    }
    if (diff < minDiff) {
      minDiff = diff;
      bl = pt;
    }
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const corners: QuadCorners = [
    { x: clamp01(tl.x / w), y: clamp01(tl.y / h) },
    { x: clamp01(tr.x / w), y: clamp01(tr.y / h) },
    { x: clamp01(br.x / w), y: clamp01(br.y / h) },
    { x: clamp01(bl.x / w), y: clamp01(bl.y / h) },
  ];

  // Validate quad area (shoelace formula in normalized space)
  const area = computeQuadArea(corners);
  if (area < 0.1) {
    return DEFAULT_FULL_QUAD.map((p) => ({ ...p })) as QuadCorners;
  }

  return corners;
}

/**
 * Computes the signed area of a 4-point quad in normalized coordinates.
 */
export function computeQuadArea(q: QuadCorners): number {
  const [p0, p1, p2, p3] = q;
  const doubleArea =
    p0.x * p1.y - p1.x * p0.y +
    p1.x * p2.y - p2.x * p1.y +
    p2.x * p3.y - p3.x * p2.y +
    p3.x * p0.y - p0.x * p3.y;
  return Math.abs(doubleArea) * 0.5;
}

/**
 * Solves an 8x8 linear system A * h = b using Gaussian elimination with partial pivoting,
 * returning the 3x3 homography matrix [h0, h1, h2, h3, h4, h5, h6, h7, 1]
 * that maps destination (u, v) -> source (x, y).
 */
function solveHomography(
  dstPts: [Point2D, Point2D, Point2D, Point2D],
  srcPts: [Point2D, Point2D, Point2D, Point2D]
): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = dstPts[i].x;
    const v = dstPts[i].y;
    const x = srcPts[i].x;
    const y = srcPts[i].y;

    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }

  const n = 8;
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) {
      return [1, 0, 0, 0, 1, 0, 0, 0, 1];
    }

    if (maxRow !== col) {
      const tmpRow = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tmpRow;
      const tmpB = b[col];
      b[col] = b[maxRow];
      b[maxRow] = tmpB;
    }

    const pivot = A[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / pivot;
      b[row] -= factor * b[col];
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
    }
  }

  const h = new Array<number>(9);
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let k = row + 1; k < n; k++) {
      sum -= A[row][k] * h[k];
    }
    h[row] = sum / A[row][row];
  }
  h[8] = 1;
  return h;
}

/**
 * Computes output dimensions (width, height) given the source canvas, quad corners,
 * aspect ratio preset, and maximum dimension cap.
 */
export function computeWarpedOutputDimensions(
  srcW: number,
  srcH: number,
  quad: QuadCorners,
  preset: AspectRatioPreset,
  maxDimension: number = 1000
): { width: number; height: number } {
  const [tl, tr, br, bl] = quad.map((p) => ({ x: p.x * srcW, y: p.y * srcH }));

  const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

  let rawW = Math.max(64, (topW + botW) * 0.5);
  let rawH = Math.max(64, (leftH + rightH) * 0.5);

  if (preset === 'standard') {
    // Standard modern comic book cover ratio ~ 6.625 : 10.25 (~ 0.65 / 2:3)
    rawW = rawH * (2 / 3);
  } else if (preset === 'wraparound') {
    // Wraparound front + back spread ratio ~ 4:3
    rawW = rawH * (4 / 3);
  }

  const scale = Math.min(1, maxDimension / Math.max(rawW, rawH));
  return {
    width: Math.max(64, Math.round(rawW * scale)),
    height: Math.max(64, Math.round(rawH * scale)),
  };
}

/**
 * Warps the 4-corner quad from `rotatedSourceCanvas` into a flat rectangular canvas,
 * applying bilinear interpolation and optional fine deskew rotation (`deskewDegrees`).
 */
export function warpPerspectiveCanvas(
  rotatedSourceCanvas: HTMLCanvasElement,
  quad: QuadCorners,
  preset: AspectRatioPreset = 'standard',
  deskewDegrees: number = 0,
  maxDimension: number = 1000
): HTMLCanvasElement {
  const srcW = rotatedSourceCanvas.width;
  const srcH = rotatedSourceCanvas.height;
  const { width: outW, height: outH } = computeWarpedOutputDimensions(
    srcW,
    srcH,
    quad,
    preset,
    maxDimension
  );

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d');
  const srcCtx = rotatedSourceCanvas.getContext('2d');
  if (!outCtx || !srcCtx) return outCanvas;

  // Check if quad is full-frame and deskew is 0 (fast path)
  const isIdentityQuad =
    Math.abs(quad[0].x) < 0.001 &&
    Math.abs(quad[0].y) < 0.001 &&
    Math.abs(quad[1].x - 1) < 0.001 &&
    Math.abs(quad[1].y) < 0.001 &&
    Math.abs(quad[2].x - 1) < 0.001 &&
    Math.abs(quad[2].y - 1) < 0.001 &&
    Math.abs(quad[3].x) < 0.001 &&
    Math.abs(quad[3].y - 1) < 0.001;

  if (isIdentityQuad && Math.abs(deskewDegrees) < 0.05) {
    outCtx.drawImage(rotatedSourceCanvas, 0, 0, outW, outH);
    return outCanvas;
  }

  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const outImageData = outCtx.createImageData(outW, outH);
  const dstData = outImageData.data;

  const dstPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];
  const srcPts: [Point2D, Point2D, Point2D, Point2D] = [
    { x: quad[0].x * (srcW - 1), y: quad[0].y * (srcH - 1) },
    { x: quad[1].x * (srcW - 1), y: quad[1].y * (srcH - 1) },
    { x: quad[2].x * (srcW - 1), y: quad[2].y * (srcH - 1) },
    { x: quad[3].x * (srcW - 1), y: quad[3].y * (srcH - 1) },
  ];

  const H = solveHomography(dstPts, srcPts);
  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;

  // Fine deskew rotation around destination center (inverse rotation + slight auto-zoom to avoid black corners)
  const rad = (-deskewDegrees * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const absCos = Math.abs(cosA);
  const absSin = Math.abs(sinA);
  // Auto-scale slightly when deskewing so tilted borders don't introduce dark triangles
  const zoom =
    Math.abs(deskewDegrees) > 0.05
      ? 1 / Math.max(absCos + (outH / outW) * absSin, absCos + (outW / outH) * absSin)
      : 1;

  const cx = (outW - 1) * 0.5;
  const cy = (outH - 1) * 0.5;
  const maxX = srcW - 1;
  const maxY = srcH - 1;

  let dstIdx = 0;
  for (let v = 0; v < outH; v++) {
    const dy = (v - cy) * zoom;
    for (let u = 0; u < outW; u++) {
      const dx = (u - cx) * zoom;
      const ru = cx + dx * cosA - dy * sinA;
      const rv = cy + dx * sinA + dy * cosA;

      const denom = h6 * ru + h7 * rv + 1;
      const sx = (h0 * ru + h1 * rv + h2) / denom;
      const sy = (h3 * ru + h4 * rv + h5) / denom;

      // Clamp to source bounds and bilinearly interpolate
      const csx = sx < 0 ? 0 : sx > maxX ? maxX : sx;
      const csy = sy < 0 ? 0 : sy > maxY ? maxY : sy;

      const x0 = csx | 0;
      const y0 = csy | 0;
      const x1 = x0 < maxX ? x0 + 1 : x0;
      const y1 = y0 < maxY ? y0 + 1 : y0;

      const fx = csx - x0;
      const fy = csy - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;

      dstData[dstIdx] =
        srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[dstIdx + 1] =
        srcData[i00 + 1] * w00 +
        srcData[i10 + 1] * w10 +
        srcData[i01 + 1] * w01 +
        srcData[i11 + 1] * w11;
      dstData[dstIdx + 2] =
        srcData[i00 + 2] * w00 +
        srcData[i10 + 2] * w10 +
        srcData[i01 + 2] * w01 +
        srcData[i11 + 2] * w11;
      dstData[dstIdx + 3] = 255;
      dstIdx += 4;
    }
  }

  outCtx.putImageData(outImageData, 0, 0);
  return outCanvas;
}

/**
 * Generates a Google Drive compatible cover filename:
 * - Front cover: "<Title> #<Issue>.webp"
 * - Wraparound full cover: "<Title> Full #<Issue>.webp" (or "<Title> Annual Full #<Issue>.webp")
 */
export function buildCoverDownloadFilename(
  title?: string,
  issueNumber?: string,
  isFullWraparound: boolean = false,
  ext: string = 'webp'
): string {
  const cleanExt = ext.replace(/^\./, '');
  const rawTitle = (title || 'Comic Cover').trim().replace(/[<>:"/\\|?*]+/g, '');
  const rawIssue = (issueNumber || '1').trim().replace(/^#/, '').replace(/[<>:"/\\|?*]+/g, '');

  if (isFullWraparound) {
    if (/\bannual\b/i.test(rawTitle)) {
      return `${rawTitle} Full #${rawIssue || '1'}.${cleanExt}`;
    }
    return `${rawTitle} Full #${rawIssue || '1'}.${cleanExt}`;
  }

  return `${rawTitle} #${rawIssue || '1'}.${cleanExt}`;
}
