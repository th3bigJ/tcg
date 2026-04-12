/**
 * Sum byte sizes of Pokémon singles card images on R2 under the `cards/` prefix.
 *
 * Classifies each object key by basename:
 *   - contains `-low` before the file extension → low-res
 *   - contains `-high` before the file extension → high-res
 *   - anything else → other (reported separately)
 *
 * Usage:
 *   npx tsx scripts/r2SumPokemonCardImageSizes.ts
 *   R2_CARDS_PREFIX=cards/ npx tsx scripts/r2SumPokemonCardImageSizes.ts
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 * Optional: R2_CARDS_PREFIX (default `cards/`)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { ListObjectsV2Command, S3Client, type ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";

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

type Bucket = "low" | "high" | "other";

function classifyKey(key: string): Bucket {
  const base = key.split("/").pop() ?? "";
  const stem = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  // Match keys like `sv1-258-low.png` / `sv1-258-high.jpg` (stem ends with -low / -high).
  if (/-low$/iu.test(stem)) return "low";
  if (/-high$/iu.test(stem)) return "high";
  return "other";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const endpoint = requireEnv("R2_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const region = process.env.R2_REGION?.trim() || "auto";
  const bucket = requireEnv("R2_BUCKET");

  let prefix = (process.env.R2_CARDS_PREFIX ?? "cards/").trim();
  if (prefix && !prefix.endsWith("/")) prefix = `${prefix}/`;

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const sums: Record<Bucket, { bytes: number; objects: number }> = {
    low: { bytes: 0, objects: 0 },
    high: { bytes: 0, objects: 0 },
    other: { bytes: 0, objects: 0 },
  };

  let continuationToken: string | undefined;
  let totalListed = 0;
  do {
    const listed: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of listed.Contents ?? []) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;
      const size = typeof obj.Size === "number" ? obj.Size : 0;
      const cat = classifyKey(key);
      sums[cat].bytes += size;
      sums[cat].objects += 1;
      totalListed += 1;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  const totalBytes = sums.low.bytes + sums.high.bytes + sums.other.bytes;

  console.log(`Bucket: ${bucket}`);
  console.log(`Prefix: ${prefix || "(root)"}`);
  console.log(`Objects: ${totalListed}`);
  console.log("");
  console.log(`Low-res:  ${formatBytes(sums.low.bytes)}  (${sums.low.objects} objects)`);
  console.log(`High-res: ${formatBytes(sums.high.bytes)}  (${sums.high.objects} objects)`);
  if (sums.other.objects > 0) {
    console.log(`Other:    ${formatBytes(sums.other.bytes)}  (${sums.other.objects} objects)`);
  }
  console.log(`Total:    ${formatBytes(totalBytes)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
