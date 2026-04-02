import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";

const TARGET_SET_CODES = ["2014xy", "2015xy", "2017sm", "2018sm", "mee", "sve"] as const;

const TARGET_SET_ASSETS = [
  {
    localPath: "public/sets/logo/sve-logo.png",
    r2Key: "sets/logo/sve-logo.png",
    contentType: "image/png",
  },
  {
    localPath: "public/sets/symbol/sve-symbol.png",
    r2Key: "sets/symbol/sve-symbol.png",
    contentType: "image/png",
  },
] as const;

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");
const SETS_FILE = path.join(DATA_DIR, "sets.json");
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

async function uploadSetAssets(s3: S3Client, bucket: string): Promise<void> {
  for (const asset of TARGET_SET_ASSETS) {
    const absPath = path.join(process.cwd(), asset.localPath);
    const body = fs.readFileSync(absPath);
    await uploadBuffer(s3, bucket, asset.r2Key, body, asset.contentType);
    console.log(`uploaded ${asset.r2Key}`);
  }
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

function verifySetAssetsInData(): void {
  const sets = readJson<SetJsonEntry[]>(SETS_FILE);
  const sve = sets.find((set) => set.tcgdexId === "sve");
  if (!sve) throw new Error("Could not find sve in data/sets.json");
  if (sve.logoSrc !== "sets/logo/sve-logo.png") throw new Error("Unexpected sve logoSrc");
  if (sve.symbolSrc !== "sets/symbol/sve-symbol.png") throw new Error("Unexpected sve symbolSrc");
}

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
  verifySetAssetsInData();

  const s3 = buildS3Client();
  const bucket = getBucket();

  await uploadSetAssets(s3, bucket);

  let totalUploaded = 0;
  let totalRewritten = 0;

  for (const setCode of TARGET_SET_CODES) {
    const { uploaded, rewritten } = await uploadCardsForSet(s3, bucket, setCode);
    totalUploaded += uploaded;
    totalRewritten += rewritten;
    console.log(`${setCode}: uploaded ${uploaded}, rewritten ${rewritten}`);
  }

  console.log(`done: uploaded ${totalUploaded} card image objects, rewrote ${totalRewritten} cards`);
}

await main();
