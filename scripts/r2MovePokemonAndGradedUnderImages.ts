/**
 * Moves only National Dex + graded slab image prefixes under `images/` (does not touch `cards/`).
 *
 *   pokemon/          → images/pokemon/
 *   graded-images/    → images/graded_images/
 *
 * Usage:
 *   DRY_RUN=1 npx tsx scripts/r2MovePokemonAndGradedUnderImages.ts
 *   npx tsx scripts/r2MovePokemonAndGradedUnderImages.ts
 *
 * After running, set `R2_POKEMON_MEDIA_PREFIX=images/pokemon` in `.env` if you still override it with `pokemon`.
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

const PREFIX_MOVES: Array<{ from: string; to: string }> = [
  { from: "pokemon/", to: "images/pokemon/" },
  { from: "graded-images/", to: "images/graded_images/" },
];

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

  let totalMoved = 0;

  for (const { from, to } of PREFIX_MOVES) {
    let continuationToken: string | undefined;
    let batch = 0;
    do {
      const listed: ListObjectsV2CommandOutput = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: from,
          ContinuationToken: continuationToken,
        }),
      );
      const contents = listed.Contents ?? [];
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;

      for (const obj of contents) {
        const key = obj.Key;
        if (!key || key.endsWith("/")) continue;
        if (!key.startsWith(from)) continue;
        const destKey = to + key.slice(from.length);

        if (dryRun) {
          console.log(`[dry-run] ${key} → ${destKey}`);
          totalMoved += 1;
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
        totalMoved += 1;
        batch += 1;
        if (batch % 200 === 0) {
          console.log(`… ${from} progress: ${batch} objects`);
        }
      }
    } while (continuationToken);

    console.log(`Done: ${from} → ${to}`);
  }

  console.log(
    dryRun
      ? `[dry-run] Would move ${totalMoved} objects.`
      : `Finished: moved ${totalMoved} objects (copy + delete).`,
  );
}

await main();
