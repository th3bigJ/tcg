import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

type SetJsonEntry = {
  id: string;
  name: string;
  code: string | null;
  tcgdexId: string | null;
  symbolSrc: string | null;
};

type SetSymbolHashEntry = {
  id: string;
  name: string;
  code: string | null;
  tcgdexId: string | null;
  symbolUrl: string;
  width: number;
  height: number;
  dHash: string;
  aHash: string;
  avgRgb: [number, number, number];
};

type SetSymbolHashIndex = {
  generatedAt: string;
  count: number;
  hashes: SetSymbolHashEntry[];
};

const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "set-symbol-hashes.json");

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
    // Optional file.
  }
};

const getMediaBaseURL = (): string => {
  const found = [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL,
  ].find(Boolean);

  if (!found) {
    throw new Error("Missing media base URL. Set R2_PUBLIC_BASE_URL or NEXT_PUBLIC_MEDIA_BASE_URL.");
  }

  return trimTrailingSlash(found);
};

const resolveMediaURL = (value: string): string => {
  if (/^https?:\/\//iu.test(value)) return value;
  return `${getMediaBaseURL()}/${value.replace(/^\/+/u, "")}`;
};

const bufferToHexHash = (bits: number[]): string => {
  let output = "";
  for (let index = 0; index < bits.length; index += 4) {
    const nibble = bits.slice(index, index + 4).join("");
    output += Number.parseInt(nibble, 2).toString(16);
  }
  return output;
};

const cropToOpaqueBounds = async (buffer: Buffer): Promise<Buffer> => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + (info.channels - 1)] ?? 0;
      if (alpha > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return buffer;
  }

  return sharp(buffer)
    .extract({
      left: minX,
      top: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1),
    })
    .png()
    .toBuffer();
};

const computeDifferenceHash = async (buffer: Buffer): Promise<string> => {
  const pixels = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(9, 8, { fit: "contain", background: "#ffffff" })
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
  return bufferToHexHash(bits);
};

const computeAverageHash = async (buffer: Buffer): Promise<string> => {
  const pixels = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize(8, 8, { fit: "contain", background: "#ffffff" })
    .raw()
    .toBuffer();

  const average = pixels.reduce((sum, value) => sum + value, 0) / Math.max(pixels.length, 1);
  return bufferToHexHash(Array.from(pixels, (value) => (value >= average ? 1 : 0)));
};

const computeAverageRgb = async (buffer: Buffer): Promise<[number, number, number]> => {
  const pixels = await sharp(buffer)
    .flatten({ background: "#ffffff" })
    .resize(1, 1, { fit: "contain", background: "#ffffff" })
    .removeAlpha()
    .raw()
    .toBuffer();

  return [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0];
};

const fetchBuffer = async (url: string): Promise<Buffer> => {
  const response = await fetch(url, {
    headers: {
      "user-agent": "tcg-set-symbol-hash-importer/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const loadSets = async (): Promise<SetJsonEntry[]> => {
  const content = await readFile(path.join(ROOT_DIR, "data", "sets.json"), "utf8");
  return (JSON.parse(content) as SetJsonEntry[]).filter((set) => Boolean(set.symbolSrc));
};

const main = async (): Promise<void> => {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");

  const sets = await loadSets();
  const hashes: SetSymbolHashEntry[] = [];

  for (const set of sets) {
    if (!set.symbolSrc) continue;
    const symbolUrl = resolveMediaURL(set.symbolSrc);
    const rawBuffer = await fetchBuffer(symbolUrl);
    const croppedBuffer = await cropToOpaqueBounds(rawBuffer);
    const metadata = await sharp(croppedBuffer).metadata();
    const [dHash, aHash, avgRgb] = await Promise.all([
      computeDifferenceHash(croppedBuffer),
      computeAverageHash(croppedBuffer),
      computeAverageRgb(croppedBuffer),
    ]);

    hashes.push({
      id: set.id,
      name: set.name,
      code: set.code,
      tcgdexId: set.tcgdexId,
      symbolUrl,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      dHash,
      aHash,
      avgRgb,
    });
  }

  hashes.sort((left, right) => (left.code ?? left.tcgdexId ?? left.id).localeCompare(right.code ?? right.tcgdexId ?? right.id));

  const output: SetSymbolHashIndex = {
    generatedAt: new Date().toISOString(),
    count: hashes.length,
    hashes,
  };

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Wrote ${hashes.length} set symbol hashes to ${OUTPUT_FILE}`);
};

await main();
