/**
 * Deletes R2 objects that `downloadStaticCardDataFromR2.ts` mirrors, then uploads the local tree
 * (same payload as `uploadStaticCardDataToR2.ts`). Use this after renames or when you want R2 to
 * match the repo exactly for those keys.
 *
 * Deletes:
 *   - `data/sets.json`, `data/series.json`, `data/pokemon.json`
 *   - `data/{slug}-products.json` (sealed Pokedata catalog; same key as download)
 *   - all objects under `data/cards/` (`.json` only)
 *   - all objects under `pricing/` (`.json` only)
 *
 * Does not delete `sealed-products/pokedata/…` (image failures), or `images/`.
 *
 * Usage:
 *   npm run r2:replace-mirrored-data
 *   DRY_RUN=1 npm run r2:replace-mirrored-data
 *   SKIP_UPLOAD=1 npm run r2:replace-mirrored-data
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 */

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  R2_PRICING,
  R2_SEALED_POKEDATA_DEFAULT_SLUG,
  r2SealedPokedataCatalogKey,
} from "../lib/r2BucketLayout";
import { runUploadStaticCardDataToR2 } from "./uploadStaticCardDataToR2";

const ENV_FILE = path.join(process.cwd(), ".env.local");
const CARDS_PREFIX = "data/cards/";
const PRICING_PREFIX = `${R2_PRICING}/`;
const ROOT_R2_KEYS = ["data/sets.json", "data/series.json", "data/pokemon.json"] as const;
const SEALED_CATALOG_R2_KEY = r2SealedPokedataCatalogKey(R2_SEALED_POKEDATA_DEFAULT_SLUG);
const DELETE_BATCH = 1000;

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

async function listJsonKeysUnderPrefix(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of out.Contents ?? []) {
      const k = obj.Key;
      if (k && !k.endsWith("/") && k.endsWith(".json")) keys.push(k);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

async function deleteKeys(s3: S3Client, bucket: string, keys: string[], dryRun: boolean): Promise<void> {
  if (keys.length === 0) {
    console.log("No keys to delete.");
    return;
  }
  console.log(`Deleting ${keys.length} objects${dryRun ? " (dry-run)" : ""}…`);
  if (dryRun) {
    const preview = keys.slice(0, 10);
    for (const k of preview) console.log(`  would delete: ${k}`);
    if (keys.length > preview.length) console.log(`  … and ${keys.length - preview.length} more`);
    return;
  }
  for (let i = 0; i < keys.length; i += DELETE_BATCH) {
    const batch = keys.slice(i, i + DELETE_BATCH);
    const out = await s3.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: false,
        },
      }),
    );
    const errs = out.Errors ?? [];
    if (errs.length > 0) {
      for (const e of errs) {
        console.error(`delete error: ${e.Key}: ${e.Code} ${e.Message}`);
      }
      throw new Error(`DeleteObjects failed for ${errs.length} key(s)`);
    }
    console.log(`… deleted ${Math.min(i + DELETE_BATCH, keys.length)}/${keys.length}`);
  }
}

async function main(): Promise<void> {
  loadEnvFile(ENV_FILE);
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  const skipUpload = Boolean(process.env.SKIP_UPLOAD && process.env.SKIP_UPLOAD !== "0");
  const s3 = buildS3Client();
  const bucket = getBucket();

  console.log(`Listing keys on ${bucket}…`);
  const [cardKeys, pricingKeys] = await Promise.all([
    listJsonKeysUnderPrefix(s3, bucket, CARDS_PREFIX),
    listJsonKeysUnderPrefix(s3, bucket, PRICING_PREFIX),
  ]);
  const toDelete = [
    ...new Set([...ROOT_R2_KEYS, SEALED_CATALOG_R2_KEY, ...cardKeys, ...pricingKeys]),
  ].sort();

  console.log(
    `Mirror replace: ${toDelete.length} keys (roots: ${ROOT_R2_KEYS.length}, sealed catalog: 1, cards: ${cardKeys.length}, pricing: ${pricingKeys.length}).`,
  );
  await deleteKeys(s3, bucket, toDelete, dryRun);

  if (skipUpload) {
    console.log("SKIP_UPLOAD set — not uploading.");
    return;
  }
  await runUploadStaticCardDataToR2(dryRun);
}

const __filename = fileURLToPath(import.meta.url);
const invokedAsMain = path.resolve(process.argv[1] ?? "") === __filename;
if (invokedAsMain) {
  await main();
}
