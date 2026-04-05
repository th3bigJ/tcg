/**
 * Uploads local static JSON (sets, series, pokemon dex, all card files) to R2.
 * Keys mirror repo paths: `data/sets.json`, `data/series.json`, `data/pokemon.json`, `data/cards/{setCode}.json`.
 * Does not modify files on disk or any URLs inside them.
 *
 * Usage:
 *   npx tsx scripts/uploadStaticCardDataToR2.ts
 *   DRY_RUN=1 npx tsx scripts/uploadStaticCardDataToR2.ts
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 */

import fs from "fs";
import path from "path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");

const ROOT_FILES = ["sets.json", "series.json", "pokemon.json"] as const;

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

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  const s3 = buildS3Client();
  const bucket = getBucket();

  const uploads: Array<{ key: string; abs: string }> = [];

  for (const name of ROOT_FILES) {
    const abs = path.join(DATA_DIR, name);
    if (!fs.existsSync(abs)) {
      console.warn(`skip missing: ${abs}`);
      continue;
    }
    uploads.push({ key: `data/${name}`, abs });
  }

  if (!fs.existsSync(CARDS_DIR)) {
    throw new Error(`Missing cards dir: ${CARDS_DIR}`);
  }
  const cardFiles = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  cardFiles.sort();
  for (const f of cardFiles) {
    uploads.push({ key: `data/cards/${f}`, abs: path.join(CARDS_DIR, f) });
  }

  console.log(`Uploading ${uploads.length} objects to ${bucket} (${dryRun ? "dry-run" : "live"})`);

  let n = 0;
  for (const { key, abs } of uploads) {
    n += 1;
    const body = fs.readFileSync(abs);
    if (dryRun) {
      console.log(`[${n}/${uploads.length}] ${key} (${body.length} bytes)`);
      continue;
    }
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "application/json; charset=utf-8",
      }),
    );
    if (n % 50 === 0 || n === uploads.length) {
      console.log(`… ${n}/${uploads.length} done`);
    }
  }

  console.log(`Finished: ${uploads.length} files ${dryRun ? "(dry-run)" : "uploaded"}.`);
}

await main();
