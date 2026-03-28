import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

type CardJsonEntry = {
  masterCardId: string;
  setCode: string;
  cardNumber: string;
  cardName: string;
  imageLowSrc: string;
  imageHighSrc: string | null;
};

type CardImageHashEntry = {
  masterCardId: string;
  setCode: string;
  cardNumber: string;
  cardName: string;
  imageUrl: string;
  width: number;
  height: number;
  dHash: string;
  aHash: string;
  avgRgb: [number, number, number];
};

type FailedCardImageHashEntry = {
  masterCardId: string;
  setCode: string;
  cardNumber: string;
  cardName: string;
  imageUrl: string;
  error: string;
};

type CardImageHashIndex = {
  generatedAt: string;
  source: "imageLowSrc";
  count: number;
  failedCount: number;
  hashes: CardImageHashEntry[];
  failed: FailedCardImageHashEntry[];
};

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");
const OUTPUT_FILE = path.join(DATA_DIR, "card-image-hashes.json");
const CONCURRENCY = 4;
const MAX_RETRIES = 6;

const sleep = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const loadDotEnvFile = async (filename: string): Promise<void> => {
  const filePath = path.join(ROOT_DIR, filename);

  try {
    const content = await readFile(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const equalsIndex = line.indexOf("=");
      if (equalsIndex <= 0) continue;

      const key = line.slice(0, equalsIndex).trim();
      if (process.env[key]) continue;

      let value = line.slice(equalsIndex + 1).trim();
      value = value.replace(/^(['"])(.*)\1$/u, "$2");
      process.env[key] = value;
    }
  } catch {
    // Missing env files are fine here.
  }
};

const getMediaBaseURL = (): string => {
  const candidates = [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  ];

  const found = candidates.find((value) => Boolean(value));
  if (!found) {
    throw new Error("Missing media base URL. Set R2_PUBLIC_BASE_URL or NEXT_PUBLIC_MEDIA_BASE_URL.");
  }

  return trimTrailingSlash(found);
};

const resolveMediaURL = (value: string): string => {
  if (/^https?:\/\//iu.test(value)) return value;
  return `${getMediaBaseURL()}/${value.replace(/^\/+/u, "")}`;
};

const bufferToBitHex = (bits: number[]): string => {
  let output = "";

  for (let index = 0; index < bits.length; index += 4) {
    const nibble = bits.slice(index, index + 4).join("");
    output += Number.parseInt(nibble, 2).toString(16);
  }

  return output;
};

const computeDifferenceHash = async (buffer: Buffer): Promise<string> => {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(9, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  const bits: number[] = [];

  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[row * 9 + column] ?? 0;
      const right = pixels[row * 9 + column + 1] ?? 0;
      bits.push(left > right ? 1 : 0);
    }
  }

  return bufferToBitHex(bits);
};

const computeAverageHash = async (buffer: Buffer): Promise<string> => {
  const pixels = await sharp(buffer)
    .greyscale()
    .resize(8, 8, { fit: "fill" })
    .raw()
    .toBuffer();

  const sum = pixels.reduce((total, value) => total + value, 0);
  const average = sum / pixels.length;
  const bits = Array.from(pixels, (value) => (value >= average ? 1 : 0));

  return bufferToBitHex(bits);
};

const computeAverageRgb = async (buffer: Buffer): Promise<[number, number, number]> => {
  const pixels = await sharp(buffer)
    .resize(1, 1, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();

  return [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0];
};

const getImageMetadata = async (buffer: Buffer): Promise<{ width: number; height: number }> => {
  const metadata = await sharp(buffer).metadata();
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
};

const fetchImageBuffer = async (imageUrl: string): Promise<Buffer> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const response = await fetch(imageUrl, {
      headers: {
        "user-agent": "tcg-card-image-hash-importer/1.0",
      },
    });

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    const retryable = response.status === 429 || response.status >= 500;
    lastError = new Error(`HTTP ${response.status}`);

    if (!retryable || attempt === MAX_RETRIES - 1) {
      throw lastError;
    }

    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number.parseFloat(retryAfterHeader) : Number.NaN;
    const backoffMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : 500 * 2 ** attempt;

    await sleep(backoffMs);
  }

  throw lastError ?? new Error("Unknown fetch failure");
};

const loadAllCards = async (): Promise<CardJsonEntry[]> => {
  const filenames = (await readdir(CARDS_DIR)).filter((filename) => filename.endsWith(".json"));
  const cards: CardJsonEntry[] = [];

  for (const filename of filenames) {
    const filePath = path.join(CARDS_DIR, filename);
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as CardJsonEntry[];
    cards.push(...parsed);
  }

  return cards.filter((card) => Boolean(card.imageLowSrc));
};

const loadExistingIndex = async (): Promise<CardImageHashIndex | null> => {
  try {
    const content = await readFile(OUTPUT_FILE, "utf8");
    return JSON.parse(content) as CardImageHashIndex;
  } catch {
    return null;
  }
};

const hashCardImage = async (card: CardJsonEntry): Promise<CardImageHashEntry> => {
  const imageUrl = resolveMediaURL(card.imageLowSrc);
  const buffer = await fetchImageBuffer(imageUrl);
  const [dHash, aHash, avgRgb, metadata] = await Promise.all([
    computeDifferenceHash(buffer),
    computeAverageHash(buffer),
    computeAverageRgb(buffer),
    getImageMetadata(buffer),
  ]);

  return {
    masterCardId: card.masterCardId,
    setCode: card.setCode,
    cardNumber: card.cardNumber,
    cardName: card.cardName,
    imageUrl,
    width: metadata.width,
    height: metadata.height,
    dHash,
    aHash,
    avgRgb,
  };
};

const runWithConcurrency = async <TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput, index: number) => Promise<TOutput>,
): Promise<TOutput[]> => {
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
};

const main = async (): Promise<void> => {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");

  const cards = await loadAllCards();
  const existingIndex = await loadExistingIndex();
  const hashes = existingIndex?.hashes ?? [];
  const failed: FailedCardImageHashEntry[] = [];
  const hashedIds = new Set(hashes.map((entry) => entry.masterCardId));
  const remainingCards = cards.filter((card) => !hashedIds.has(card.masterCardId));

  console.log(
    `Hashing ${remainingCards.length} remaining card images from ${getMediaBaseURL()} (${hashes.length} already cached) ...`,
  );

  await runWithConcurrency(remainingCards, CONCURRENCY, async (card, index) => {
    try {
      const hashEntry = await hashCardImage(card);
      hashes.push(hashEntry);
    } catch (error) {
      failed.push({
        masterCardId: card.masterCardId,
        setCode: card.setCode,
        cardNumber: card.cardNumber,
        cardName: card.cardName,
        imageUrl: resolveMediaURL(card.imageLowSrc),
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if ((index + 1) % 250 === 0 || index === remainingCards.length - 1) {
      console.log(`Processed ${index + 1}/${remainingCards.length} remaining images`);
    }

    return undefined;
  });

  hashes.sort((left, right) => left.masterCardId.localeCompare(right.masterCardId));
  failed.sort((left, right) => left.masterCardId.localeCompare(right.masterCardId));

  const output: CardImageHashIndex = {
    generatedAt: new Date().toISOString(),
    source: "imageLowSrc",
    count: hashes.length,
    failedCount: failed.length,
    hashes,
    failed,
  };

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Wrote ${hashes.length} hashes to ${OUTPUT_FILE}`);
  if (failed.length > 0) {
    console.log(`Failed to hash ${failed.length} images`);
  }
};

await main();
