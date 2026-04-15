/**
 * Download the R2 `onepiece/` prefix into the local `data/onepiece/` folder, preserving
 * nested paths and removing stale local files not present on R2.
 *
 * Usage:
 *   node --import tsx/esm scripts/downloadOnePieceFolderFromR2.ts
 *   DRY_RUN=1 node --import tsx/esm scripts/downloadOnePieceFolderFromR2.ts
 *   SKIP_IMAGES=1 npm run r2:download-onepiece   — JSON/pricing only; skips cards/images and sets/images
 */

import fs from "fs";
import path from "path";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { ONEPIECE_R2_PREFIX, buildOnePieceS3Client, getOnePieceR2Bucket } from "../lib/onepieceR2";
import { onepieceLocalDataRoot } from "../lib/onepieceLocalDataPaths";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const ROOT = onepieceLocalDataRoot;
const PREFIX = `${ONEPIECE_R2_PREFIX}/`;
const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
const skipImages = Boolean(process.env.SKIP_IMAGES && process.env.SKIP_IMAGES !== "0");

function isOnePieceImageRelPath(rel: string): boolean {
  const n = rel.replace(/\\/g, "/").toLowerCase();
  return n.startsWith("cards/images/") || n.startsWith("sets/images/");
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error("Empty response body");
  const transform = (
    body as { transformToByteArray?: () => Promise<Uint8Array> }
  ).transformToByteArray;
  if (typeof transform === "function") {
    const bytes = await transform.call(body);
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function listAllKeys(prefix: string): Promise<string[]> {
  const s3 = buildOnePieceS3Client();
  const bucket = getOnePieceR2Bucket();
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
    for (const entry of out.Contents ?? []) {
      if (entry.Key && !entry.Key.endsWith("/")) keys.push(entry.Key);
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);

  keys.sort((a, b) => a.localeCompare(b));
  return keys;
}

function collectLocalFiles(root: string): string[] {
  const files: string[] = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      files.push(path.relative(root, abs).replace(/\\/g, "/"));
    }
  }

  if (fs.existsSync(root)) walk(root);
  files.sort((a, b) => a.localeCompare(b));
  return files;
}

async function main(): Promise<void> {
  const s3 = buildOnePieceS3Client();
  const bucket = getOnePieceR2Bucket();
  const keys = await listAllKeys(PREFIX);
  const expectedRelPaths = keys.map((key) => key.slice(PREFIX.length));
  const keysToDownload = skipImages ? keys.filter((key) => !isOnePieceImageRelPath(key.slice(PREFIX.length))) : keys;
  const skippedImageCount = keys.length - keysToDownload.length;

  console.log(
    `Downloading ${keysToDownload.length} onepiece files from R2 bucket ${bucket} (${dryRun ? "dry-run" : "live"}${skipImages ? `, skipping ${skippedImageCount} image objects` : ""})`,
  );

  if (!dryRun) fs.mkdirSync(ROOT, { recursive: true });

  let index = 0;
  const total = keysToDownload.length;
  for (const key of keysToDownload) {
    index += 1;
    const rel = key.slice(PREFIX.length);
    const abs = path.join(ROOT, ...rel.split("/"));

    if (dryRun) {
      console.log(`[${index}/${total}] ${key} -> ${path.relative(process.cwd(), abs)}`);
      continue;
    }

    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await bodyToBuffer(result.Body);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);

    if (index % 50 === 0 || index === total) {
      console.log(`... ${index}/${total} downloaded`);
    }
  }

  const expected = new Set(expectedRelPaths);
  for (const rel of collectLocalFiles(ROOT)) {
    if (expected.has(rel)) continue;
    if (dryRun) {
      console.log(`[dry-run] would remove stale local file: data/onepiece/${rel}`);
      continue;
    }
    fs.unlinkSync(path.join(ROOT, ...rel.split("/")));
    console.log(`removed stale local file: data/onepiece/${rel}`);
  }

  console.log(`Finished ${dryRun ? "(dry-run)" : "downloading"} data/onepiece/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
