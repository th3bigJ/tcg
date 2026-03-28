import type { CardVisualFingerprint } from "@/lib/cardVisualHash";

export type OcrResult = {
  cardName: string;
  cardNumber: string; // e.g. "062/091" or "SWSH001/198" — empty string if not found
  artist: string;
  hp: string;
  visualFingerprint: CardVisualFingerprint;
  symbolFingerprint: CardVisualFingerprint;
  rawText: string; // full OCR dump for debugging
  debugImages: {
    source: string;
    detectedCard: string;
    detectionOverlay: string;
    nameStrip: string;
    hpStrip: string;
    numberStrip: string;
    symbolStrip: string;
  };
};

export type ScanPreviewImages = OcrResult["debugImages"];

export type ScanCandidateHint = {
  masterCardId: string;
  cardName: string;
  cardNumber?: string;
  hp?: number | string;
};

export type ExtractCardTextOptions = {
  scanSettings?: Partial<ScanOcrSettings>;
  candidateCards?: ScanCandidateHint[];
};

export const DEFAULT_SCAN_OCR_SETTINGS = {
  nameBandEnd: 0.2,
  bottomBandStart: 0.76,
  threshold: 152,
  contrast: 1.35,
} as const;

export type ScanOcrSettings = {
  nameBandEnd: number;
  bottomBandStart: number;
  threshold: number;
  contrast: number;
};

export const SCAN_REGIONS = {
  name: { xStart: 0, xEnd: 1, yStart: 0, yEnd: 0.2, label: "Name + HP" },
  hp: { xStart: 0.72, xEnd: 0.98, yStart: 0, yEnd: 0.16, label: "HP" },
  number: { xStart: 0, xEnd: 1, yStart: 0.72, yEnd: 1, label: "Card Number" },
  symbol: { xStart: 0.14, xEnd: 0.38, yStart: 0.82, yEnd: 0.95, label: "Set Symbol" },
} as const;

const CARD_GUIDE = {
  left: 0.1,
  right: 0.9,
  top: 0.06,
  bottom: 0.94,
} as const;

const DETECTION_MAX_DIMENSION = 320;
const WARPED_CARD_WIDTH = 360;
const WARPED_CARD_HEIGHT = 540;

const CARD_NUMBER_RE = /\b([A-Z0-9]{1,6})\/(\d{2,3})\b/;
const HP_RE = /\bHP\s*(\d{2,3})\b/i;
const HP_NUMBER_RE = /\b(\d{2,3})\b/;
const ILLUS_RE = /\b(?:illus\.?|illustrated by)\s*[:.]?\s*([A-Za-zÀ-ÿ0-9.'\- ]{3,})/i;
const ENERGY_CHAR_RE = /^[WFGLPSDRMC]$/;
const BODY_TEXT_WORDS = /\b(ability|attack|evolves|trainer|item|supporter|stadium|rule|prize|damage|discard|energy|pokemon|knock|bench|active|shuffle|draw|search|reveal|hand|deck)\b/i;
const ARTIST_NOISE_RE = /\b(pokemon|nintendo|game freak|creatures|attack|ability|trainer|supporter|stadium|basic|stage|evolves)\b/i;
const GENERIC_TEXT_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-/éàèùâêîôûëïüçæœ";
const NAME_TEXT_WHITELIST =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-:/éàèùâêîôûëïüçæœ";
const HP_TEXT_WHITELIST = "HP0123456789 ";
const NUMBER_TEXT_WHITELIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/ ";
const NUMBER_STRIP_UPSCALE = 5;
const OCR_PASS_PRESETS: Array<Pick<ScanOcrSettings, "threshold" | "contrast">> = [
  { threshold: 128, contrast: 1.15 },
  { threshold: 142, contrast: 1.25 },
  { threshold: 152, contrast: 1.35 },
  { threshold: 164, contrast: 1.5 },
  { threshold: 176, contrast: 1.65 },
];

/** Upscale factor applied to cropped strips before Tesseract — bigger = more detail. */
const STRIP_UPSCALE = 3;

/**
 * Crop a horizontal strip of the image, upscale it, convert to greyscale,
 * apply contrast stretching and an S-curve, then return as a PNG blob.
 * @param bitmap  Source image
 * @param yStart  Fraction of image height where the strip starts (0–1)
 * @param yEnd    Fraction of image height where the strip ends (0–1)
 */
function processStrip(
  bitmap: ImageBitmap,
  {
    xStart,
    xEnd,
    yStart,
    yEnd,
  }: { xStart: number; xEnd: number; yStart: number; yEnd: number },
  settings: ScanOcrSettings,
  upscale = STRIP_UPSCALE,
): Promise<Blob> {
  const srcX = Math.round(bitmap.width * xStart);
  const srcY = Math.round(bitmap.height * yStart);
  const srcW = Math.round(bitmap.width * (xEnd - xStart));
  const srcH = Math.round(bitmap.height * (yEnd - yStart));

  const outW = srcW * upscale;
  const outH = srcH * upscale;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Draw just the strip, upscaled
  ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, outW, outH);

  const imageData = ctx.getImageData(0, 0, outW, outH);
  const data = imageData.data;

  // Greyscale
  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    data[i] = data[i + 1] = data[i + 2] = g;
  }

  // Contrast stretch
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i]! < min) min = data[i]!;
    if (data[i]! > max) max = data[i]!;
  }
  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    const stretched = ((data[i]! - min) / range) * 255;
    const contrasted = (stretched - 128) * settings.contrast + 128;
    const binary = contrasted >= settings.threshold ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = Math.round(binary);
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read image data."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image data."));
    reader.readAsDataURL(blob);
  });
}

type Point = { x: number; y: number };

type DetectionResult = {
  warpedCardBlob: Blob;
  overlayBlob: Blob;
  sourcePoints?: Point[];
};

function normalizeComparableText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const prev = Array.from({ length: right.length + 1 }, (_, index) => index);
  const next = new Array<number>(right.length + 1);

  for (let i = 1; i <= left.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      next[j] = Math.min(
        next[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }

    for (let j = 0; j <= right.length; j += 1) {
      prev[j] = next[j]!;
    }
  }

  return prev[right.length]!;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function fitLine(points: Point[], axis: "vertical" | "horizontal") {
  if (points.length < 2) return null;

  if (axis === "vertical") {
    const ys = points.map((point) => point.y);
    const xs = points.map((point) => point.x);
    const yMean = average(ys);
    const xMean = average(xs);
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < points.length; i++) {
      numerator += (ys[i] - yMean) * (xs[i] - xMean);
      denominator += (ys[i] - yMean) ** 2;
    }
    const slope = denominator === 0 ? 0 : numerator / denominator;
    const intercept = xMean - slope * yMean;
    return { slope, intercept };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMean = average(xs);
  const yMean = average(ys);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < points.length; i++) {
    numerator += (xs[i] - xMean) * (ys[i] - yMean);
    denominator += (xs[i] - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

function intersectLines(
  vertical: { slope: number; intercept: number },
  horizontal: { slope: number; intercept: number },
): Point | null {
  const denominator = 1 - vertical.slope * horizontal.slope;
  if (Math.abs(denominator) < 1e-6) return null;
  const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denominator;
  const y = horizontal.slope * x + horizontal.intercept;
  return { x, y };
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function computeDifferenceHashFromBitmap(bitmap: ImageBitmap): string {
  const canvas = createCanvas(9, 8);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 9, 8);
  const { data } = ctx.getImageData(0, 0, 9, 8);
  const greyPixels = new Array<number>(9 * 8).fill(0).map((_, index) => {
    const offset = index * 4;
    return Math.round(0.299 * data[offset]! + 0.587 * data[offset + 1]! + 0.114 * data[offset + 2]!);
  });

  let bits = "";
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      bits += greyPixels[row * 9 + column]! > greyPixels[row * 9 + column + 1]! ? "1" : "0";
    }
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    output += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return output;
}

function computeAverageHashFromBitmap(bitmap: ImageBitmap): string {
  const canvas = createCanvas(8, 8);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 8, 8);
  const { data } = ctx.getImageData(0, 0, 8, 8);
  const greyPixels = new Array<number>(8 * 8).fill(0).map((_, index) => {
    const offset = index * 4;
    return Math.round(0.299 * data[offset]! + 0.587 * data[offset + 1]! + 0.114 * data[offset + 2]!);
  });
  const average =
    greyPixels.reduce((sum, value) => sum + value, 0) / Math.max(greyPixels.length, 1);

  let bits = "";
  for (const value of greyPixels) {
    bits += value >= average ? "1" : "0";
  }

  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    output += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
  }
  return output;
}

function computeAverageRgbFromBitmap(bitmap: ImageBitmap): [number, number, number] {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, 1, 1);
  const { data } = ctx.getImageData(0, 0, 1, 1);
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
}

function computeVisualFingerprint(bitmap: ImageBitmap): CardVisualFingerprint {
  return {
    dHash: computeDifferenceHashFromBitmap(bitmap),
    aHash: computeAverageHashFromBitmap(bitmap),
    avgRgb: computeAverageRgbFromBitmap(bitmap),
  };
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      type,
      quality,
    );
  });
}

async function cropRegionBlob(
  bitmap: ImageBitmap,
  region: { xStart: number; xEnd: number; yStart: number; yEnd: number },
): Promise<Blob> {
  const srcX = Math.round(bitmap.width * region.xStart);
  const srcY = Math.round(bitmap.height * region.yStart);
  const srcW = Math.max(1, Math.round(bitmap.width * (region.xEnd - region.xStart)));
  const srcH = Math.max(1, Math.round(bitmap.height * (region.yEnd - region.yStart)));
  const canvas = createCanvas(srcW, srcH);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
  return canvasToBlob(canvas);
}

function getResizedImageData(bitmap: ImageBitmap) {
  const scale = Math.min(1, DETECTION_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return { imageData: ctx.getImageData(0, 0, width, height), width, height, scale };
}

function computeGradients(imageData: ImageData) {
  const { width, height, data } = imageData;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    grey[i] = 0.299 * data[offset]! + 0.587 * data[offset + 1]! + 0.114 * data[offset + 2]!;
  }

  const gx = new Float32Array(width * height);
  const gy = new Float32Array(width * height);
  const mag = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = grey[(y - 1) * width + (x - 1)]!;
      const tc = grey[(y - 1) * width + x]!;
      const tr = grey[(y - 1) * width + (x + 1)]!;
      const ml = grey[y * width + (x - 1)]!;
      const mr = grey[y * width + (x + 1)]!;
      const bl = grey[(y + 1) * width + (x - 1)]!;
      const bc = grey[(y + 1) * width + x]!;
      const br = grey[(y + 1) * width + (x + 1)]!;

      const gX = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gY = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const idx = y * width + x;
      gx[idx] = gX;
      gy[idx] = gY;
      mag[idx] = Math.abs(gX) + Math.abs(gY);
    }
  }

  return { width, height, gx, gy, mag };
}

function computeBrightMask(imageData: ImageData) {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const neutralWhite = luminance >= 150 && spread <= 48;
    const brightBorder = luminance >= 185 && spread <= 78;
    mask[i] = neutralWhite || brightBorder ? 1 : 0;
  }

  return { width, height, mask };
}

function findBestBrightRun(
  mask: Uint8Array,
  fixedIndex: number,
  rangeStart: number,
  rangeEnd: number,
  getIndex: (primary: number, secondary: number) => number,
  preferHigherCoordinate: boolean,
  minRunLength: number,
) {
  let bestStart = -1;
  let bestEnd = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  let runStart = -1;

  for (let position = rangeStart; position <= rangeEnd; position += 1) {
    const isBright = mask[getIndex(fixedIndex, position)] === 1;

    if (isBright) {
      if (runStart === -1) runStart = position;
      continue;
    }

    if (runStart !== -1) {
      const runEnd = position - 1;
      const runLength = runEnd - runStart + 1;
      if (runLength >= minRunLength) {
        const edgeCoordinate = preferHigherCoordinate ? runEnd : runStart;
        const score = runLength * 4 + (preferHigherCoordinate ? edgeCoordinate : -edgeCoordinate);
        if (score > bestScore) {
          bestScore = score;
          bestStart = runStart;
          bestEnd = runEnd;
        }
      }
      runStart = -1;
    }
  }

  if (runStart !== -1) {
    const runEnd = rangeEnd;
    const runLength = runEnd - runStart + 1;
    if (runLength >= minRunLength) {
      const edgeCoordinate = preferHigherCoordinate ? runEnd : runStart;
      const score = runLength * 4 + (preferHigherCoordinate ? edgeCoordinate : -edgeCoordinate);
      if (score > bestScore) {
        bestStart = runStart;
        bestEnd = runEnd;
      }
    }
  }

  if (bestStart === -1 || bestEnd === -1) return null;
  return { start: bestStart, end: bestEnd };
}

function sampleVerticalEdges(
  gradients: ReturnType<typeof computeGradients>,
  leftToRight: boolean,
): Point[] {
  const { width, height, gx, mag } = gradients;
  const points: Point[] = [];
  const yStart = Math.round(height * CARD_GUIDE.top);
  const yEnd = Math.round(height * CARD_GUIDE.bottom);
  const xSearchStart = Math.round(width * (leftToRight ? 0.05 : 0.6));
  const xSearchEnd = Math.round(width * (leftToRight ? 0.4 : 0.95));
  const rows = 28;

  for (let i = 0; i < rows; i++) {
    const y = Math.round(yStart + ((yEnd - yStart) * i) / Math.max(rows - 1, 1));
    let bestX = -1;
    let bestScore = 0;
    for (let x = xSearchStart; x <= xSearchEnd; x++) {
      const idx = y * width + x;
      const score = Math.abs(gx[idx]!) + mag[idx]! * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    if (bestX !== -1) {
      points.push({ x: bestX, y });
    }
  }

  return points;
}

function sampleHorizontalEdges(
  gradients: ReturnType<typeof computeGradients>,
  topToBottom: boolean,
): Point[] {
  const { width, height, gy, mag } = gradients;
  const points: Point[] = [];
  const xStart = Math.round(width * CARD_GUIDE.left);
  const xEnd = Math.round(width * CARD_GUIDE.right);
  const ySearchStart = Math.round(height * (topToBottom ? 0.03 : 0.68));
  const ySearchEnd = Math.round(height * (topToBottom ? 0.3 : 0.97));
  const columns = 22;

  for (let i = 0; i < columns; i++) {
    const x = Math.round(xStart + ((xEnd - xStart) * i) / Math.max(columns - 1, 1));
    let bestY = -1;
    let bestScore = 0;
    for (let y = ySearchStart; y <= ySearchEnd; y++) {
      const idx = y * width + x;
      const score = Math.abs(gy[idx]!) + mag[idx]! * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
      }
    }
    if (bestY !== -1) {
      points.push({ x, y: bestY });
    }
  }

  return points;
}

function sampleMaskVerticalEdges(
  brightMask: ReturnType<typeof computeBrightMask>,
  leftToRight: boolean,
): Point[] {
  const { width, height, mask } = brightMask;
  const points: Point[] = [];
  const yStart = Math.round(height * CARD_GUIDE.top);
  const yEnd = Math.round(height * CARD_GUIDE.bottom);
  const xSearchStart = Math.round(width * (leftToRight ? 0.05 : 0.55));
  const xSearchEnd = Math.round(width * (leftToRight ? 0.45 : 0.95));
  const rows = 40;
  const minRunLength = Math.max(8, Math.round(width * 0.06));

  for (let i = 0; i < rows; i++) {
    const y = Math.round(yStart + ((yEnd - yStart) * i) / Math.max(rows - 1, 1));
    const run = findBestBrightRun(
      mask,
      y,
      xSearchStart,
      xSearchEnd,
      (row, column) => row * width + column,
      !leftToRight,
      minRunLength,
    );

    if (run) {
      points.push({ x: leftToRight ? run.start : run.end, y });
    }
  }

  return points;
}

function sampleMaskHorizontalEdges(
  brightMask: ReturnType<typeof computeBrightMask>,
  topToBottom: boolean,
): Point[] {
  const { width, height, mask } = brightMask;
  const points: Point[] = [];
  const xStart = Math.round(width * CARD_GUIDE.left);
  const xEnd = Math.round(width * CARD_GUIDE.right);
  const ySearchStart = Math.round(height * (topToBottom ? 0.03 : 0.55));
  const ySearchEnd = Math.round(height * (topToBottom ? 0.45 : 0.97));
  const columns = 32;
  const minRunLength = Math.max(8, Math.round(height * 0.05));

  for (let i = 0; i < columns; i++) {
    const x = Math.round(xStart + ((xEnd - xStart) * i) / Math.max(columns - 1, 1));
    const run = findBestBrightRun(
      mask,
      x,
      ySearchStart,
      ySearchEnd,
      (column, row) => row * width + column,
      !topToBottom,
      minRunLength,
    );

    if (run) {
      points.push({ x, y: topToBottom ? run.start : run.end });
    }
  }

  return points;
}

function collectBrightMaskPoints(brightMask: ReturnType<typeof computeBrightMask>): Point[] {
  const { width, height, mask } = brightMask;
  const points: Point[] = [];
  const xStart = Math.round(width * 0.04);
  const xEnd = Math.round(width * 0.96);
  const yStart = Math.round(height * 0.04);
  const yEnd = Math.round(height * 0.96);

  for (let y = yStart; y <= yEnd; y += 1) {
    for (let x = xStart; x <= xEnd; x += 1) {
      if (mask[y * width + x] === 1) {
        points.push({ x, y });
      }
    }
  }

  return points;
}

function averagePoint(points: Point[]): Point | null {
  if (points.length === 0) return null;
  return {
    x: average(points.map((point) => point.x)),
    y: average(points.map((point) => point.y)),
  };
}

function detectCornersFromBrightMask(brightMask: ReturnType<typeof computeBrightMask>): Point[] | null {
  const points = collectBrightMaskPoints(brightMask);
  if (points.length < 200) return null;

  const topLeftPool = [...points]
    .sort((left, right) => (left.x + left.y) - (right.x + right.y))
    .slice(0, 120);
  const topRightPool = [...points]
    .sort((left, right) => (right.x - right.y) - (left.x - left.y))
    .slice(0, 120);
  const bottomRightPool = [...points]
    .sort((left, right) => (right.x + right.y) - (left.x + left.y))
    .slice(0, 120);
  const bottomLeftPool = [...points]
    .sort((left, right) => (right.y - right.x) - (left.y - left.x))
    .slice(0, 120);

  const topLeft = averagePoint(topLeftPool);
  const topRight = averagePoint(topRightPool);
  const bottomRight = averagePoint(bottomRightPool);
  const bottomLeft = averagePoint(bottomLeftPool);

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return null;

  return [topLeft, topRight, bottomRight, bottomLeft];
}

function quadArea(points: Point[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function validateDetectedQuad(points: Point[], width: number, height: number): boolean {
  if (points.length !== 4) return false;

  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  if (
    !(topLeft.x < topRight.x && bottomLeft.x < bottomRight.x && topLeft.y < bottomLeft.y && topRight.y < bottomRight.y)
  ) {
    return false;
  }

  const topWidth = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const bottomWidth = Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y);
  const leftHeight = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const rightHeight = Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y);
  const areaRatio = quadArea(points) / Math.max(width * height, 1);
  const aspectRatio = ((topWidth + bottomWidth) / 2) / Math.max((leftHeight + rightHeight) / 2, 1);

  return (
    topWidth > width * 0.25 &&
    bottomWidth > width * 0.25 &&
    leftHeight > height * 0.35 &&
    rightHeight > height * 0.35 &&
    areaRatio >= 0.12 &&
    areaRatio <= 0.92 &&
    aspectRatio >= 0.5 &&
    aspectRatio <= 0.82
  );
}

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);

  for (let pivot = 0; pivot < size; pivot++) {
    let maxRow = pivot;
    for (let row = pivot + 1; row < size; row++) {
      if (Math.abs(augmented[row]![pivot]!) > Math.abs(augmented[maxRow]![pivot]!)) {
        maxRow = row;
      }
    }

    if (Math.abs(augmented[maxRow]![pivot]!) < 1e-8) {
      throw new Error("Homography solve failed");
    }

    [augmented[pivot], augmented[maxRow]] = [augmented[maxRow]!, augmented[pivot]!];

    const pivotValue = augmented[pivot]![pivot]!;
    for (let col = pivot; col <= size; col++) {
      augmented[pivot]![col] = augmented[pivot]![col]! / pivotValue;
    }

    for (let row = 0; row < size; row++) {
      if (row === pivot) continue;
      const factor = augmented[row]![pivot]!;
      for (let col = pivot; col <= size; col++) {
        augmented[row]![col] = augmented[row]![col]! - factor * augmented[pivot]![col]!;
      }
    }
  }

  return augmented.map((row) => row[size]!);
}

function computeHomography(src: Point[], dst: Point[]) {
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const solution = solveLinearSystem(matrix, vector);
  return [
    solution[0]!, solution[1]!, solution[2]!,
    solution[3]!, solution[4]!, solution[5]!,
    solution[6]!, solution[7]!, 1,
  ];
}

function applyHomography(matrix: number[], point: Point): Point {
  const x = point.x;
  const y = point.y;
  const denominator = matrix[6]! * x + matrix[7]! * y + matrix[8]!;
  return {
    x: (matrix[0]! * x + matrix[1]! * y + matrix[2]!) / denominator,
    y: (matrix[3]! * x + matrix[4]! * y + matrix[5]!) / denominator,
  };
}

function sampleImage(data: Uint8ClampedArray, width: number, height: number, point: Point) {
  const x = Math.max(0, Math.min(width - 1, point.x));
  const y = Math.max(0, Math.min(height - 1, point.y));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const wx = x - x0;
  const wy = y - y0;

  const idx = (xx: number, yy: number) => (yy * width + xx) * 4;
  const topLeft = idx(x0, y0);
  const topRight = idx(x1, y0);
  const bottomLeft = idx(x0, y1);
  const bottomRight = idx(x1, y1);

  const rgba = [0, 1, 2, 3].map((channel) => {
    const top =
      data[topLeft + channel]! * (1 - wx) + data[topRight + channel]! * wx;
    const bottom =
      data[bottomLeft + channel]! * (1 - wx) + data[bottomRight + channel]! * wx;
    return top * (1 - wy) + bottom * wy;
  });

  return rgba as [number, number, number, number];
}

async function detectAndRectifyCard(bitmap: ImageBitmap): Promise<DetectionResult> {
  const resized = getResizedImageData(bitmap);
  const gradients = computeGradients(resized.imageData);
  const brightMask = computeBrightMask(resized.imageData);
  const maskCorners = detectCornersFromBrightMask(brightMask);
  const leftPoints = sampleMaskVerticalEdges(brightMask, true);
  const rightPoints = sampleMaskVerticalEdges(brightMask, false);
  const topPoints = sampleMaskHorizontalEdges(brightMask, true);
  const bottomPoints = sampleMaskHorizontalEdges(brightMask, false);

  // If the bright-border heuristic fails, fall back to the gradient-based detector.
  const fallbackLeftPoints = sampleVerticalEdges(gradients, true);
  const fallbackRightPoints = sampleVerticalEdges(gradients, false);
  const fallbackTopPoints = sampleHorizontalEdges(gradients, true);
  const fallbackBottomPoints = sampleHorizontalEdges(gradients, false);

  const leftLine = fitLine(leftPoints.length >= 8 ? leftPoints : fallbackLeftPoints, "vertical");
  const rightLine = fitLine(rightPoints.length >= 8 ? rightPoints : fallbackRightPoints, "vertical");
  const topLine = fitLine(topPoints.length >= 8 ? topPoints : fallbackTopPoints, "horizontal");
  const bottomLine = fitLine(bottomPoints.length >= 8 ? bottomPoints : fallbackBottomPoints, "horizontal");

  const fallbackSourceCanvas = createCanvas(bitmap.width, bitmap.height);
  fallbackSourceCanvas.getContext("2d")!.drawImage(bitmap, 0, 0);

  if (maskCorners && validateDetectedQuad(maskCorners, resized.width, resized.height)) {
    const scaleUp = 1 / resized.scale;
    const sourcePoints: Point[] = maskCorners.map((point) => ({
      x: point.x * scaleUp,
      y: point.y * scaleUp,
    }));

    return rectifyFromSourcePoints(bitmap, sourcePoints);
  }

  if (!leftLine || !rightLine || !topLine || !bottomLine) {
    const blob = await canvasToBlob(fallbackSourceCanvas);
    return {
      warpedCardBlob: blob,
      overlayBlob: blob,
    };
  }

  const topLeft = intersectLines(leftLine, topLine);
  const topRight = intersectLines(rightLine, topLine);
  const bottomRight = intersectLines(rightLine, bottomLine);
  const bottomLeft = intersectLines(leftLine, bottomLine);

  if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
    const blob = await canvasToBlob(fallbackSourceCanvas);
    return {
      warpedCardBlob: blob,
      overlayBlob: blob,
    };
  }

  const scaleUp = 1 / resized.scale;
  const sourcePoints: Point[] = [topLeft, topRight, bottomRight, bottomLeft].map((point) => ({
    x: point.x * scaleUp,
    y: point.y * scaleUp,
  }));

  return rectifyFromSourcePoints(bitmap, sourcePoints);
}

async function rectifyFromSourcePoints(
  bitmap: ImageBitmap,
  sourcePoints: Point[],
): Promise<DetectionResult> {
  const fallbackSourceCanvas = createCanvas(bitmap.width, bitmap.height);
  fallbackSourceCanvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  if (!validateDetectedQuad(sourcePoints, bitmap.width, bitmap.height)) {
    const blob = await canvasToBlob(fallbackSourceCanvas);
    return {
      warpedCardBlob: blob,
      overlayBlob: blob,
    };
  }

  const destinationPoints: Point[] = [
    { x: 0, y: 0 },
    { x: WARPED_CARD_WIDTH - 1, y: 0 },
    { x: WARPED_CARD_WIDTH - 1, y: WARPED_CARD_HEIGHT - 1 },
    { x: 0, y: WARPED_CARD_HEIGHT - 1 },
  ];

  const inverseHomography = computeHomography(destinationPoints, sourcePoints);

  const sourceCanvas = createCanvas(bitmap.width, bitmap.height);
  const sourceCtx = sourceCanvas.getContext("2d")!;
  sourceCtx.drawImage(bitmap, 0, 0);
  const sourceImageData = sourceCtx.getImageData(0, 0, bitmap.width, bitmap.height);

  const warpedCanvas = createCanvas(WARPED_CARD_WIDTH, WARPED_CARD_HEIGHT);
  const warpedCtx = warpedCanvas.getContext("2d")!;
  const warpedImage = warpedCtx.createImageData(WARPED_CARD_WIDTH, WARPED_CARD_HEIGHT);

  for (let y = 0; y < WARPED_CARD_HEIGHT; y++) {
    for (let x = 0; x < WARPED_CARD_WIDTH; x++) {
      const sourcePoint = applyHomography(inverseHomography, { x, y });
      const [r, g, b, a] = sampleImage(
        sourceImageData.data,
        sourceImageData.width,
        sourceImageData.height,
        sourcePoint,
      );
      const idx = (y * WARPED_CARD_WIDTH + x) * 4;
      warpedImage.data[idx] = Math.round(r);
      warpedImage.data[idx + 1] = Math.round(g);
      warpedImage.data[idx + 2] = Math.round(b);
      warpedImage.data[idx + 3] = Math.round(a);
    }
  }
  warpedCtx.putImageData(warpedImage, 0, 0);

  const overlayCanvas = createCanvas(bitmap.width, bitmap.height);
  const overlayCtx = overlayCanvas.getContext("2d")!;
  overlayCtx.drawImage(bitmap, 0, 0);
  overlayCtx.strokeStyle = "#22d3ee";
  overlayCtx.lineWidth = Math.max(4, Math.round(bitmap.width * 0.006));
  overlayCtx.beginPath();
  overlayCtx.moveTo(sourcePoints[0]!.x, sourcePoints[0]!.y);
  for (let i = 1; i < sourcePoints.length; i++) {
    overlayCtx.lineTo(sourcePoints[i]!.x, sourcePoints[i]!.y);
  }
  overlayCtx.closePath();
  overlayCtx.stroke();
  overlayCtx.fillStyle = "#22d3ee";
  for (const point of sourcePoints) {
    overlayCtx.beginPath();
    overlayCtx.arc(
      point.x,
      point.y,
      Math.max(5, Math.round(bitmap.width * 0.008)),
      0,
      Math.PI * 2,
    );
    overlayCtx.fill();
  }

  return {
    warpedCardBlob: await canvasToBlob(warpedCanvas),
    overlayBlob: await canvasToBlob(overlayCanvas),
    sourcePoints,
  };
}

export async function isCardFullyInView(file: File): Promise<boolean> {
  const bitmap = await createImageBitmap(file);
  const detection = await detectAndRectifyCard(bitmap);
  const points = detection.sourcePoints;
  if (!points || points.length !== 4) return false;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const areaRatio = (width * height) / (bitmap.width * bitmap.height);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const aspectRatio = width / Math.max(height, 1);
  const marginX = bitmap.width * 0.02;
  const marginY = bitmap.height * 0.02;
  const centerToleranceX = bitmap.width * 0.18;
  const centerToleranceY = bitmap.height * 0.2;

  return (
    minX >= marginX &&
    maxX <= bitmap.width - marginX &&
    minY >= marginY &&
    maxY <= bitmap.height - marginY &&
    areaRatio >= 0.08 &&
    areaRatio <= 0.9 &&
    aspectRatio >= 0.52 &&
    aspectRatio <= 0.78 &&
    Math.abs(centerX - bitmap.width / 2) <= centerToleranceX &&
    Math.abs(centerY - bitmap.height / 2) <= centerToleranceY
  );
}

async function buildScanPreviewImages(
  file: File,
  settings: ScanOcrSettings,
): Promise<{
  detectedCardBlob: Blob;
  debugImages: ScanPreviewImages;
  hpStripBlob: Blob;
  nameStripBlob: Blob;
  numberStripBlob: Blob;
  symbolStripBlob: Blob;
  visualFingerprint: CardVisualFingerprint;
  symbolFingerprint: CardVisualFingerprint;
}> {
  const bitmap = await createImageBitmap(file);
  const detection = await detectAndRectifyCard(bitmap);
  const detectedCardBlob = detection.warpedCardBlob;
  const detectionOverlayBlob = detection.overlayBlob;
  const detectedBitmap = await createImageBitmap(detectedCardBlob);

  const [nameStripBlob, hpStripBlob, numberStripBlob, rawSymbolBlob, symbolStripBlob] = await Promise.all([
    processStrip(
      detectedBitmap,
      { ...SCAN_REGIONS.name, yEnd: settings.nameBandEnd },
      settings,
    ),
    processStrip(detectedBitmap, SCAN_REGIONS.hp, settings),
    processStrip(
      detectedBitmap,
      { ...SCAN_REGIONS.number, yStart: settings.bottomBandStart },
      settings,
      NUMBER_STRIP_UPSCALE,
    ),
    cropRegionBlob(detectedBitmap, SCAN_REGIONS.symbol),
    processStrip(detectedBitmap, SCAN_REGIONS.symbol, settings, NUMBER_STRIP_UPSCALE),
  ]);
  const visualFingerprint = computeVisualFingerprint(detectedBitmap);
  const symbolFingerprint = computeVisualFingerprint(await createImageBitmap(rawSymbolBlob));

  const [source, detectedCard, detectionOverlay, nameStrip, hpStrip, numberStrip, symbolStrip] =
    await Promise.all([
      blobToDataUrl(file),
      blobToDataUrl(detectedCardBlob),
      blobToDataUrl(detectionOverlayBlob),
      blobToDataUrl(nameStripBlob),
      blobToDataUrl(hpStripBlob),
      blobToDataUrl(numberStripBlob),
      blobToDataUrl(symbolStripBlob),
    ]);

  return {
    detectedCardBlob,
    hpStripBlob,
    nameStripBlob,
    numberStripBlob,
    symbolStripBlob,
    visualFingerprint,
    symbolFingerprint,
    debugImages: {
      source,
      detectedCard,
      detectionOverlay,
      nameStrip,
      hpStrip,
      numberStrip,
      symbolStrip,
    },
  };
}

export async function prepareCardScanPreview(
  file: File,
  scanSettings?: Partial<ScanOcrSettings>,
): Promise<ScanPreviewImages> {
  const settings = withScanSettings(scanSettings);
  const { debugImages } = await buildScanPreviewImages(file, settings);
  return debugImages;
}

export async function prepareCardVisualFingerprint(
  file: File,
  scanSettings?: Partial<ScanOcrSettings>,
): Promise<{ visualFingerprint: CardVisualFingerprint; symbolFingerprint: CardVisualFingerprint }> {
  const settings = withScanSettings(scanSettings);
  const { visualFingerprint, symbolFingerprint } = await buildScanPreviewImages(file, settings);
  return { visualFingerprint, symbolFingerprint };
}

async function runTesseract(blob: Blob): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({
      // Restrict to printable ASCII + common accented chars to cut garbage symbols
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-/éàèùâêîôûëïüçæœ",
      preserve_interword_spaces: "1",
    });
    const result = await worker.recognize(blob);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function createOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  await worker.setParameters({
    tessedit_char_whitelist: GENERIC_TEXT_WHITELIST,
    preserve_interword_spaces: "1",
  });
  return worker;
}

async function runTesseractWithWorker(
  worker: Awaited<ReturnType<typeof createOcrWorker>>,
  blob: Blob,
  whitelist: string,
): Promise<string> {
  await worker.setParameters({
    tessedit_char_whitelist: whitelist,
    preserve_interword_spaces: "1",
  });
  const result = await worker.recognize(blob);
  return result.data.text;
}

/**
 * From a noisy OCR line, extract the longest word or phrase that looks like
 * a real card name token — filters single chars, pure numbers, and noise words.
 */
function extractBestNameFromLine(line: string): string {
  return line
    .replace(CARD_NUMBER_RE, "")
    .replace(HP_RE, "")
    .replace(/\bSTAGE\s*\d+\b/i, "")
    .replace(/\bBASIC\b/i, "")
    .replace(/\bTERA\b/i, "")
    // Keep words that are at least 3 chars and not pure noise
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !ENERGY_CHAR_RE.test(w))
    .join(" ")
    .trim();
}

function parseArtist(raw: string): string {
  const illusMatch = raw.match(ILLUS_RE);
  if (illusMatch?.[1]) {
    return illusMatch[1].trim().replace(/\s+/g, " ");
  }

  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLocaleLowerCase();
    if (!lower.includes("illus")) continue;
    const cleaned = line
      .replace(/\billus\.?\b/i, "")
      .replace(/\billustrated by\b/i, "")
      .replace(/[:.]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 3 && !ARTIST_NOISE_RE.test(cleaned)) {
      return cleaned;
    }
  }

  return "";
}

function parseHp(raw: string, hpRaw: string): string {
  const hpMatch = hpRaw.match(HP_RE) ?? raw.match(HP_RE);
  if (hpMatch?.[1]) return hpMatch[1];

  const lines = hpRaw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 3)) {
    const numberMatch = line.match(HP_NUMBER_RE);
    if (numberMatch?.[1]) return numberMatch[1];
  }

  return "";
}

function parseCardNumber(rawTexts: string[]): string {
  for (const raw of rawTexts) {
    const normalized = raw
      .replace(/[Oo]/g, "0")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ");
    const numberMatch = normalized.match(CARD_NUMBER_RE);
    if (numberMatch) {
      return numberMatch[0].replace(/\s+/g, "");
    }
  }

  return "";
}

function resolveCandidateName(
  rawTexts: string[],
  candidateCards: ScanCandidateHint[],
): string {
  const uniqueCandidateNames = Array.from(
    new Map(candidateCards.map((card) => [card.cardName, card.cardName])).values(),
  );
  if (uniqueCandidateNames.length === 0) return "";

  const candidateStrings = uniqueCandidateNames.map((name) => ({
    name,
    normalized: normalizeComparableText(name),
  }));

  let bestMatch = { name: "", score: 0 };

  for (const rawText of rawTexts) {
    const lines = rawText.split(/[\n\r]+/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const extracted = extractBestNameFromLine(line);
      const normalizedExtracted = normalizeComparableText(extracted);
      if (normalizedExtracted.length < 3) continue;

      for (const candidate of candidateStrings) {
        let score = 0;
        if (candidate.normalized === normalizedExtracted) {
          score = 1;
        } else if (
          candidate.normalized.includes(normalizedExtracted) ||
          normalizedExtracted.includes(candidate.normalized)
        ) {
          score = 0.94;
        } else {
          const distance = levenshteinDistance(normalizedExtracted, candidate.normalized);
          score = 1 - distance / Math.max(candidate.normalized.length, normalizedExtracted.length, 1);
        }

        if (score > bestMatch.score) {
          bestMatch = { name: candidate.name, score };
        }
      }
    }
  }

  return bestMatch.score >= 0.56 ? bestMatch.name : "";
}

function parseOcrText(
  rawTexts: string[],
  hpRawTexts: string[],
  candidateCards: ScanCandidateHint[],
): { cardName: string; cardNumber: string; artist: string; hp: string } {
  const raw = rawTexts.join("\n");
  const hpRaw = hpRawTexts.join("\n");
  const cardNumber = parseCardNumber(rawTexts);
  const artist = parseArtist(raw);
  const hp = parseHp(raw, hpRaw);
  const candidateName = resolveCandidateName(rawTexts, candidateCards);
  if (candidateName) {
    return { cardName: candidateName, cardNumber, artist, hp };
  }

  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  // Strategy 1: line immediately before the HP line
  const hpIdx = lines.findIndex((l) => HP_RE.test(l));
  if (hpIdx > 0) {
    for (let i = hpIdx - 1; i >= 0; i--) {
      const candidate = extractBestNameFromLine(lines[i]!);
      if (candidate.length > 2 && !BODY_TEXT_WORDS.test(candidate)) {
        return { cardName: candidate.replace(/\s+/g, " "), cardNumber, artist, hp };
      }
    }
  }

  // Strategy 2: first non-noise line with at least one word >= 4 chars
  for (const line of lines) {
    const candidate = extractBestNameFromLine(line);
    if (candidate.length > 2 && !BODY_TEXT_WORDS.test(candidate)) {
      return { cardName: candidate.replace(/\s+/g, " "), cardNumber, artist, hp };
    }
  }

  return { cardName: "", cardNumber, artist, hp };
}

function withScanSettings(settings?: Partial<ScanOcrSettings>): ScanOcrSettings {
  return {
    nameBandEnd: settings?.nameBandEnd ?? DEFAULT_SCAN_OCR_SETTINGS.nameBandEnd,
    bottomBandStart: settings?.bottomBandStart ?? DEFAULT_SCAN_OCR_SETTINGS.bottomBandStart,
    threshold: settings?.threshold ?? DEFAULT_SCAN_OCR_SETTINGS.threshold,
    contrast: settings?.contrast ?? DEFAULT_SCAN_OCR_SETTINGS.contrast,
  };
}

export async function extractCardTextFromImage(
  file: File,
  options?: ExtractCardTextOptions,
): Promise<OcrResult> {
  const settings = withScanSettings(options?.scanSettings);
  let rawText = "";
  let hpRawText = "";
  let rawTexts: string[] = [];

  // Try native TextDetector first (Chrome Android/desktop)
  if (typeof window !== "undefined" && "TextDetector" in window) {
    try {
      // @ts-expect-error TextDetector is not in standard lib types
      const detector = new window.TextDetector();
      const bitmap = await createImageBitmap(file);
      const detection = await detectAndRectifyCard(bitmap);
      const detectedBitmap = await createImageBitmap(detection.warpedCardBlob);
      const blocks: Array<{ rawValue: string }> = await detector.detect(detectedBitmap);
      rawText = blocks.map((b) => b.rawValue).join("\n");
      rawTexts = rawText.split(/\n+/).map((value) => value.trim()).filter(Boolean);
    } catch {
      // fall through
    }
  }

  const previewBundle = await buildScanPreviewImages(file, settings);
  const {
    debugImages,
    hpStripBlob,
    nameStripBlob,
    numberStripBlob,
    visualFingerprint,
    symbolFingerprint,
  } = previewBundle;

  if (!rawText) {
    const worker = await createOcrWorker();
    try {
      const detectedBitmap = await createImageBitmap(previewBundle.detectedCardBlob);
      const namePassSettings = OCR_PASS_PRESETS.map((preset) => ({
        ...settings,
        threshold: preset.threshold,
        contrast: preset.contrast,
      }));
      const namePassBlobs = await Promise.all(
        namePassSettings.map((passSettings) =>
          processStrip(
            detectedBitmap,
            { ...SCAN_REGIONS.name, yEnd: passSettings.nameBandEnd },
            passSettings,
          ),
        ),
      );
      const numberPassBlobs = await Promise.all(
        namePassSettings.map((passSettings) =>
          processStrip(
            detectedBitmap,
            { ...SCAN_REGIONS.number, yStart: passSettings.bottomBandStart },
            passSettings,
            NUMBER_STRIP_UPSCALE,
          ),
        ),
      );
      const [nameTexts, numberTexts, hpText] = await Promise.all([
        Promise.all(
          [nameStripBlob, ...namePassBlobs].map((blob) =>
            runTesseractWithWorker(worker, blob, NAME_TEXT_WHITELIST),
          ),
        ),
        Promise.all(
          [numberStripBlob, ...numberPassBlobs].map((blob) =>
            runTesseractWithWorker(worker, blob, NUMBER_TEXT_WHITELIST),
          ),
        ),
        runTesseractWithWorker(worker, hpStripBlob, HP_TEXT_WHITELIST),
      ]);

      hpRawText = hpText;
      rawTexts = [...nameTexts, hpText, ...numberTexts]
        .flatMap((value) => value.split(/\n+/))
        .map((value) => value.trim())
        .filter(Boolean);
      rawText = rawTexts.join("\n");
    } finally {
      await worker.terminate();
    }
  } else {
    hpRawText = await runTesseract(hpStripBlob);
  }

  const { cardName, cardNumber, artist, hp } = parseOcrText(
    rawTexts.length > 0 ? rawTexts : [rawText],
    [hpRawText],
    options?.candidateCards ?? [],
  );

  return {
    cardName: cardName.trim().replace(/\s+/g, " "),
    cardNumber: cardNumber.trim(),
    artist: artist.trim().replace(/\s+/g, " "),
    hp: hp.trim(),
    visualFingerprint,
    symbolFingerprint,
    rawText,
    debugImages,
  };
}
