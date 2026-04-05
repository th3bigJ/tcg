/**
 * Moves sealed Pokedata JSON out of `sealed-products/pokedata/`:
 *
 *   *-products.json       → data/
 *   *-prices.json         → pricing/
 *   *-price-history.json  → pricing/
 *   *-price-trends.json   → pricing/
 *
 * Skips `images/` and unrelated files (e.g. *-image-failures.json).
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/r2MoveSealedPokedataJsonToDataAndPricing.ts
 *   npx tsx scripts/r2MoveSealedPokedataJsonToDataAndPricing.ts
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

import { R2_DATA, R2_PRICING } from "../lib/r2BucketLayout";

const SOURCE_PREFIX = "sealed-products/pokedata/";

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), ".env.local");
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function destinationForKey(key: string): string | null {
  if (!key.startsWith(SOURCE_PREFIX)) return null;
  const name = key.slice(SOURCE_PREFIX.length);
  if (name.includes("/")) return null;
  if (name.endsWith("-products.json")) return `${R2_DATA}/${name}`;
  if (name.endsWith("-prices.json")) return `${R2_PRICING}/${name}`;
  if (name.endsWith("-price-history.json")) return `${R2_PRICING}/${name}`;
  if (name.endsWith("-price-trends.json")) return `${R2_PRICING}/${name}`;
  return null;
}

function copySourceHeader(bucket: string, key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${encodedKey}`;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  const endpoint = requireEnv("R2_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const region = process.env.R2_REGION?.trim() || "auto";
  const bucket = requireEnv("R2_BUCKET");

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  let total = 0;
  let continuationToken: string | undefined;

  do {
    const listed: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: SOURCE_PREFIX,
        ContinuationToken: continuationToken,
      }),
    );
    const contents = listed.Contents ?? [];
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;

    for (const obj of contents) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      const destKey = destinationForKey(key);
      if (!destKey) continue;

      if (dryRun) {
        console.log(`[dry-run] ${key} → ${destKey}`);
        total += 1;
        continue;
      }

      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: destKey,
          CopySource: copySourceHeader(bucket, key),
        }),
      );
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      total += 1;
      console.log(`moved ${key} → ${destKey}`);
    }
  } while (continuationToken);

  console.log(dryRun ? `[dry-run] Would move ${total} object(s).` : `Done: moved ${total} object(s).`);
}

await main();
