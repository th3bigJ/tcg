/**
 * Uploads remote card/set images to R2 and rewrites JSON to relative keys.
 *
 * Default: all sets in TARGET_SET_CODES.
 * Energy-only (no full catalog refresh): `--only=sve,mee` or `UPLOAD_SET_CODES=sve,mee`.
 *
 *   node --import tsx/esm scripts/uploadSeededImagesToR2.ts -- --only=sve,mee
 */

import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { r2SetLogoPrefix, r2SetSymbolPrefix } from "../lib/r2BucketLayout";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";
import { getSinglesCatalogSetKey } from "../lib/singlesCatalogSetKey";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const TARGET_SET_CODES = [
  "2014xy",
  "2015xy",
  "2017sm",
  "2018sm",
  "2022swsh",
  "2023sv",
  "2024sv",
  "cel25c",
  "clb",
  "clc",
  "clv",
  "ecard2",
  "ex5.5",
  "ex5",
  "hgssp",
  "mee",
  "svp",
  "sve",
  "xyp",
] as const;

const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");
const SETS_FILE = path.join(pokemonLocalDataRoot, "sets.json");
const ENV_FILE = path.join(process.cwd(), ".env.local");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function inferContentType(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function inferExtFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ext || ".jpg";
}

async function uploadBuffer(
  s3: S3Client,
  bucket: string,
  r2Key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function fetchRemoteImage(url: string): Promise<{ body: Buffer; contentType: string; ext: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  const ext = inferExtFromUrl(url);
  const contentType = (res.headers.get("content-type") || inferContentType(ext)).split(";")[0].trim();
  const body = Buffer.from(await res.arrayBuffer());
  return { body, contentType, ext };
}

async function uploadSetAssets(s3: S3Client, bucket: string, targets: ReadonlySet<string>): Promise<void> {
  const sets = readJson<SetJsonEntry[]>(SETS_FILE);

  for (const set of sets) {
    const catalog = getSinglesCatalogSetKey(set) ?? "";
    const hit = Boolean(catalog && targets.has(catalog));
    if (!hit) continue;
    const setCode = catalog;

    const uploadSetAsset = async (
      field: "logoSrc" | "symbolSrc",
      prefix: "logo" | "symbol",
    ): Promise<void> => {
      const src = set[field]?.trim();
      if (!src || !/^https?:\/\//iu.test(src)) return;
      const { body, contentType, ext } = await fetchRemoteImage(src);
      const r2Key = `${prefix === "logo" ? r2SetLogoPrefix : r2SetSymbolPrefix}/${setCode}-${prefix}${ext}`;
      await uploadBuffer(s3, bucket, r2Key, body, contentType);
      set[field] = r2Key;
      console.log(`uploaded ${r2Key}`);
    };

    await uploadSetAsset("logoSrc", "logo");
    await uploadSetAsset("symbolSrc", "symbol");
  }

  writeJson(SETS_FILE, sets);
}

/** Restrict upload to specific catalog keys, e.g. `--only=sve,mee` or `UPLOAD_SET_CODES=sve,mee`. */
function targetCodesFromCliOrEnv(): Set<string> {
  const argv = process.argv.slice(2);
  const flag = argv.find((a) => a.startsWith("--only="));
  const raw = flag ? flag.slice("--only=".length).trim() : process.env.UPLOAD_SET_CODES?.trim();
  if (raw) {
    const codes = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!codes.length) throw new Error("--only / UPLOAD_SET_CODES must list at least one set code.");
    return new Set(codes);
  }
  return new Set(TARGET_SET_CODES as unknown as string[]);
}

async function uploadCardsForSet(
  s3: S3Client,
  bucket: string,
  setCode: string,
): Promise<{ uploaded: number; rewritten: number }> {
  const filePath = path.join(CARDS_DIR, `${setCode}.json`);
  const cards = readJson<CardJsonEntry[]>(filePath);
  let uploaded = 0;
  let rewritten = 0;

  for (const card of cards) {
    const lowSrc = card.imageLowSrc?.trim();
    const highSrc = card.imageHighSrc?.trim() || null;
    if (!lowSrc) continue;

    const localId = (card.localId ?? "").trim() || "unknown";
    const lowNeedsUpload = /^https?:\/\//iu.test(lowSrc);
    const highNeedsUpload = Boolean(highSrc && /^https?:\/\//iu.test(highSrc));

    if (!lowNeedsUpload && !highNeedsUpload) continue;

    let nextLow = lowSrc;
    let nextHigh = highSrc;

    if (lowNeedsUpload) {
      const { body, contentType, ext } = await fetchRemoteImage(lowSrc);
      const r2Key = `cards/${setCode}-${localId}-low${ext}`;
      await uploadBuffer(s3, bucket, r2Key, body, contentType);
      nextLow = r2Key;
      uploaded += 1;
    }

    if (highNeedsUpload && highSrc) {
      if (highSrc === lowSrc) {
        nextHigh = nextLow;
      } else {
        const { body, contentType, ext } = await fetchRemoteImage(highSrc);
        const r2Key = `cards/${setCode}-${localId}-high${ext}`;
        await uploadBuffer(s3, bucket, r2Key, body, contentType);
        nextHigh = r2Key;
        uploaded += 1;
      }
    } else if (highSrc === lowSrc) {
      nextHigh = nextLow;
    }

    card.imageLowSrc = nextLow;
    card.imageHighSrc = nextHigh;
    rewritten += 1;
  }

  writeJson(filePath, cards);
  return { uploaded, rewritten };
}

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);

  const s3 = buildS3Client();
  const bucket = getBucket();

  const targets = targetCodesFromCliOrEnv();

  await uploadSetAssets(s3, bucket, targets);

  let totalUploaded = 0;
  let totalRewritten = 0;

  const allSetsForResolve = readJson<SetJsonEntry[]>(SETS_FILE);
  const catalogKeys = new Set<string>();
  for (const t of targets) {
    const row = allSetsForResolve.find((s) => (s.setKey ?? "").trim() === t);
    const key = row ? getSinglesCatalogSetKey(row) : t;
    if (key) catalogKeys.add(key);
  }

  for (const setCode of catalogKeys) {
    const { uploaded, rewritten } = await uploadCardsForSet(s3, bucket, setCode);
    totalUploaded += uploaded;
    totalRewritten += rewritten;
    console.log(`${setCode}: uploaded ${uploaded}, rewritten ${rewritten}`);
  }

  console.log(`done: uploaded ${totalUploaded} card image objects, rewrote ${totalRewritten} cards`);
}

await main();
