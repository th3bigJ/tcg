/**
 * Uploads local static JSON to R2.
 *   - Local `data/pokemon/{sets,series,pokemon}.json`, `data/pokemon/cards/{setCode}.json` → same keys under `data/…` on R2
 *   - `data/pokemon/{slug}-products.json` → same key on R2 (sealed Pokedata catalog; slug from lib/r2BucketLayout.ts)
 *   - `data/pokemon/pricing/**` (recursive `.json` only) → `pricing/**` on R2 (matches bucket layout in lib/r2BucketLayout.ts)
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
import { fileURLToPath } from "url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  R2_PRICING,
  R2_SEALED_POKEDATA_DEFAULT_SLUG,
  r2SealedPokedataCatalogKey,
} from "../lib/r2BucketLayout";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");
const PRICING_DIR = path.join(pokemonLocalDataRoot, "pricing");

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

function collectPricingUploads(pricingDir: string): Array<{ key: string; abs: string }> {
  const out: Array<{ key: string; abs: string }> = [];
  function walk(sub: string, relPosix: string): void {
    for (const ent of fs.readdirSync(sub, { withFileTypes: true })) {
      const abs = path.join(sub, ent.name);
      const nextRel = relPosix ? `${relPosix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(abs, nextRel);
      } else if (ent.isFile() && ent.name.endsWith(".json")) {
        out.push({ key: `${R2_PRICING}/${nextRel}`, abs });
      }
    }
  }
  if (fs.existsSync(pricingDir)) walk(pricingDir, "");
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

export async function runUploadStaticCardDataToR2(dryRun: boolean): Promise<void> {
  loadEnvFile(ENV_FILE);
  const s3 = buildS3Client();
  const bucket = getBucket();

  const uploads: Array<{ key: string; abs: string }> = [];

  for (const name of ROOT_FILES) {
    const abs = path.join(pokemonLocalDataRoot, name);
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

  const sealedSlug = R2_SEALED_POKEDATA_DEFAULT_SLUG;
  const sealedCatalogAbs = path.join(pokemonLocalDataRoot, `${sealedSlug}-products.json`);
  const sealedCatalogKey = r2SealedPokedataCatalogKey(sealedSlug);
  if (!fs.existsSync(sealedCatalogAbs)) {
    console.warn(`skip missing sealed catalog: ${sealedCatalogAbs} (expected R2 key ${sealedCatalogKey})`);
  } else {
    uploads.push({ key: sealedCatalogKey, abs: sealedCatalogAbs });
  }

  const pricingUploads = collectPricingUploads(PRICING_DIR);
  if (pricingUploads.length === 0) {
    console.warn(`No files under ${path.relative(process.cwd(), PRICING_DIR)} — skipping pricing/ uploads`);
  } else {
    uploads.push(...pricingUploads);
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

const __filename = fileURLToPath(import.meta.url);
const invokedAsMain = path.resolve(process.argv[1] ?? "") === __filename;
if (invokedAsMain) {
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  await runUploadStaticCardDataToR2(dryRun);
}
