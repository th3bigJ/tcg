export type OcrResult = {
  cardName: string;
  cardNumber: string; // e.g. "062/091" or "SWSH001/198" — empty string if not found
  rawText: string; // full OCR dump for debugging
  debugImages: {
    source: string;
    nameStrip: string;
    numberStrip: string;
  };
};

export const SCAN_REGIONS = {
  name: { yStart: 0, yEnd: 0.2, label: "Name + HP" },
  number: { yStart: 0.84, yEnd: 1, label: "Card Number" },
} as const;

const CARD_NUMBER_RE = /\b([A-Z0-9]{1,6})\/(\d{2,3})\b/;
const HP_RE = /HP\s*\d+/i;
const ENERGY_CHAR_RE = /^[WFGLPSDRMC]$/;
const BODY_TEXT_WORDS = /\b(ability|attack|evolves|trainer|item|supporter|stadium|rule|prize|damage|discard|energy|pokemon|knock|bench|active|shuffle|draw|search|reveal|hand|deck)\b/i;

/** Upscale factor applied to cropped strips before Tesseract — bigger = more detail. */
const STRIP_UPSCALE = 3;

/**
 * Crop a horizontal strip of the image, upscale it, convert to greyscale,
 * apply contrast stretching and an S-curve, then return as a PNG blob.
 * @param bitmap  Source image
 * @param yStart  Fraction of image height where the strip starts (0–1)
 * @param yEnd    Fraction of image height where the strip ends (0–1)
 */
function processStrip(bitmap: ImageBitmap, yStart: number, yEnd: number): Promise<Blob> {
  const srcY = Math.round(bitmap.height * yStart);
  const srcH = Math.round(bitmap.height * (yEnd - yStart));
  const srcW = bitmap.width;

  const outW = srcW * STRIP_UPSCALE;
  const outH = srcH * STRIP_UPSCALE;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;

  // Draw just the strip, upscaled
  ctx.drawImage(bitmap, 0, srcY, srcW, srcH, 0, 0, outW, outH);

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
    // Stretch then S-curve
    const stretched = ((data[i]! - min) / range) * 255;
    const curved = 255 / (1 + Math.exp(-0.06 * (stretched - 128)));
    data[i] = data[i + 1] = data[i + 2] = Math.round(curved);
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

function parseOcrText(raw: string): { cardName: string; cardNumber: string } {
  const numberMatch = raw.match(CARD_NUMBER_RE);
  const cardNumber = numberMatch ? numberMatch[0] : "";

  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  // Strategy 1: line immediately before the HP line
  const hpIdx = lines.findIndex((l) => HP_RE.test(l));
  if (hpIdx > 0) {
    for (let i = hpIdx - 1; i >= 0; i--) {
      const candidate = extractBestNameFromLine(lines[i]!);
      if (candidate.length > 2 && !BODY_TEXT_WORDS.test(candidate)) {
        return { cardName: candidate.replace(/\s+/g, " "), cardNumber };
      }
    }
  }

  // Strategy 2: first non-noise line with at least one word >= 4 chars
  for (const line of lines) {
    const candidate = extractBestNameFromLine(line);
    if (candidate.length > 2 && !BODY_TEXT_WORDS.test(candidate)) {
      return { cardName: candidate.replace(/\s+/g, " "), cardNumber };
    }
  }

  return { cardName: "", cardNumber };
}

export async function extractCardTextFromImage(file: File): Promise<OcrResult> {
  let rawText = "";
  let nameStripBlob: Blob | null = null;
  let numberStripBlob: Blob | null = null;

  // Try native TextDetector first (Chrome Android/desktop)
  if (typeof window !== "undefined" && "TextDetector" in window) {
    try {
      // @ts-expect-error TextDetector is not in standard lib types
      const detector = new window.TextDetector();
      const bitmap = await createImageBitmap(file);
      const blocks: Array<{ rawValue: string }> = await detector.detect(bitmap);
      rawText = blocks.map((b) => b.rawValue).join("\n");
    } catch {
      // fall through
    }
  }

  // Tesseract fallback — run on targeted strips rather than the full card image.
  // Pokemon cards have a predictable layout:
  //   top 0–18%:  card name (+ stage/HP line)
  //   bottom 88–96%: card number (e.g. 295/217)
  // Cropping + upscaling these thin bands massively improves accuracy on foil cards.
  const bitmap = await createImageBitmap(file);
  [nameStripBlob, numberStripBlob] = await Promise.all([
    processStrip(bitmap, SCAN_REGIONS.name.yStart, SCAN_REGIONS.name.yEnd),
    processStrip(bitmap, SCAN_REGIONS.number.yStart, SCAN_REGIONS.number.yEnd),
  ]);

  if (!rawText) {
    const [nameText, numberText] = await Promise.all([
      runTesseract(nameStripBlob),
      runTesseract(numberStripBlob),
    ]);
    rawText = nameText + "\n" + numberText;
  }

  const { cardName, cardNumber } = parseOcrText(rawText);
  const [source, nameStrip, numberStrip] = await Promise.all([
    blobToDataUrl(file),
    blobToDataUrl(nameStripBlob),
    blobToDataUrl(numberStripBlob),
  ]);

  return {
    cardName: cardName.trim().replace(/\s+/g, " "),
    cardNumber: cardNumber.trim(),
    rawText,
    debugImages: {
      source,
      nameStrip,
      numberStrip,
    },
  };
}
