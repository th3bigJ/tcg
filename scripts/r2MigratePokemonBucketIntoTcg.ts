/**
 * Copy all objects from R2 bucket `pokemon` → `tcg` under prefix `pokemon/` (same S3 API as uploads).
 *
 * Loads .env.local when present (does not require dotenv package).
 *
 * Usage:
 *   npx tsx scripts/r2MigratePokemonBucketIntoTcg.ts
 *   DRY_RUN=1 npx tsx scripts/r2MigratePokemonBucketIntoTcg.ts
 *
 * Env (from .env.local or shell):
 *   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 * Optional: SOURCE_BUCKET (default pokemon), DEST_BUCKET (default tcg), DEST_PREFIX (default images/pokemon)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  CopyObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

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
  if (!v) throw new Error(`Missing ${name} (set in .env.local or export)`);
  return v;
}

function copySourceHeader(sourceBucket: string, sourceKey: string): string {
  const encodedKey = sourceKey.split("/").map(encodeURIComponent).join("/");
  return `${sourceBucket}/${encodedKey}`;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  const endpoint = requireEnv("R2_ENDPOINT");
  const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
  const region = process.env.R2_REGION?.trim() || "auto";

  const sourceBucket = process.env.SOURCE_BUCKET?.trim() || "pokemon";
  const destBucket = process.env.DEST_BUCKET?.trim() || "tcg";
  const destPrefix = (process.env.DEST_PREFIX?.trim() || "images/pokemon").replace(/^\/+|\/+$/g, "");

  const client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  let continuationToken: string | undefined;
  let copied = 0;
  let skipped = 0;

  console.log(
    dryRun
      ? `[dry-run] Would copy s3://${sourceBucket}/* → s3://${destBucket}/${destPrefix}/`
      : `Copying s3://${sourceBucket}/* → s3://${destBucket}/${destPrefix}/`,
  );

  do {
    const out: ListObjectsV2CommandOutput = await client.send(
      new ListObjectsV2Command({
        Bucket: sourceBucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    const contents = out.Contents ?? [];
    for (const obj of contents) {
      const key = obj.Key;
      if (!key || key.endsWith("/")) continue;

      const destKey = `${destPrefix}/${key}`;

      if (dryRun) {
        console.log(`  would copy ${key} → ${destKey}`);
        copied++;
        continue;
      }

      try {
        await client.send(
          new CopyObjectCommand({
            Bucket: destBucket,
            Key: destKey,
            CopySource: copySourceHeader(sourceBucket, key),
          }),
        );
        copied++;
        if (copied % 200 === 0) console.log(`  … ${copied} objects copied`);
      } catch (e) {
        console.error(`Failed: ${key}`, e);
        skipped++;
      }
    }

    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(
    dryRun ? `[dry-run] ${copied} object(s). Run without DRY_RUN=1 to copy.` : `Done. Copied ${copied} object(s).`,
  );
  if (skipped > 0) console.log(`Errors: ${skipped} object(s) skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
