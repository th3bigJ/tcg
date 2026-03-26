export type OcrResult = {
  cardName: string;
  cardNumber: string; // e.g. "062/091" or "SWSH001/198" — empty string if not found
  rawText: string; // full OCR dump for debugging
};

const CARD_NUMBER_RE = /\b([A-Z0-9]{1,6})\/(\d{2,3})\b/;
const HP_RE = /HP\s*\d+/i;
const ENERGY_CHAR_RE = /^[WFGLPSDRMC]$/;
const BODY_TEXT_WORDS = /\b(ability|attack|evolves|trainer|item|supporter|stadium|rule|prize|damage|discard|energy|pokemon|knock|bench|active|shuffle|draw|search|reveal|hand|deck)\b/i;

/**
 * Draws the image onto a canvas, converts to greyscale, and applies contrast
 * stretching to make text stand out against foil/holographic backgrounds.
 * Returns a Blob the OCR engine can consume.
 */
async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  // Scale down if very large — Tesseract works well at ~1500px wide
  const MAX_DIM = 1500;
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(bitmap, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  // Convert to greyscale
  for (let i = 0; i < data.length; i += 4) {
    const grey = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    data[i] = data[i + 1] = data[i + 2] = grey;
  }

  // Find min/max for contrast stretching
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  // Stretch contrast + apply sharpening-like boost around midpoint
  for (let i = 0; i < data.length; i += 4) {
    // Contrast stretch
    let v = ((data[i]! - min) / range) * 255;
    // S-curve: push darks darker, lights lighter — improves text/background separation
    v = 255 / (1 + Math.exp(-0.05 * (v - 128)));
    data[i] = data[i + 1] = data[i + 2] = Math.round(v);
  }

  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("canvas.toBlob failed"));
    }, "image/png");
  });
}

function parseOcrText(raw: string): { cardName: string; cardNumber: string } {
  const numberMatch = raw.match(CARD_NUMBER_RE);
  const cardNumber = numberMatch ? numberMatch[0] : "";

  const lines = raw.split(/[\n\r]+/).map((l) => l.trim());

  // Strategy 1: line immediately before the HP line
  const hpIdx = lines.findIndex((l) => HP_RE.test(l));
  if (hpIdx > 0) {
    for (let i = hpIdx - 1; i >= 0; i--) {
      const candidate = lines[i]!
        .replace(CARD_NUMBER_RE, "")
        .replace(/\bSTAGE\s*\d+\b/i, "")
        .replace(/\bBASIC\b/i, "")
        .trim();
      if (
        candidate.length > 2 &&
        !ENERGY_CHAR_RE.test(candidate) &&
        !/^\d+$/.test(candidate) &&
        !BODY_TEXT_WORDS.test(candidate)
      ) {
        return { cardName: candidate.replace(/\s+/g, " "), cardNumber };
      }
    }
  }

  // Strategy 2: first non-noise line
  const candidates = lines
    .map((l) => l.replace(CARD_NUMBER_RE, "").replace(HP_RE, "").trim())
    .filter(
      (l) =>
        l.length > 2 &&
        !ENERGY_CHAR_RE.test(l) &&
        !/^\d+$/.test(l) &&
        !BODY_TEXT_WORDS.test(l),
    );

  return { cardName: candidates[0]?.replace(/\s+/g, " ") ?? "", cardNumber };
}

export async function extractCardTextFromImage(file: File): Promise<OcrResult> {
  let rawText = "";

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

  // Tesseract fallback with image preprocessing
  if (!rawText) {
    const processed = await preprocessImage(file);
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
      langPath: "https://tessdata.projectnaptha.com/4.0.0",
      corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js",
    });
    try {
      await worker.setParameters({
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,'-/éàèùâêîôûëïüçæœ",
        preserve_interword_spaces: "1",
      });
      const result = await worker.recognize(processed);
      rawText = result.data.text;
    } finally {
      await worker.terminate();
    }
  }

  const { cardName, cardNumber } = parseOcrText(rawText);

  return {
    cardName: cardName.trim().replace(/\s+/g, " "),
    cardNumber: cardNumber.trim(),
    rawText,
  };
}
