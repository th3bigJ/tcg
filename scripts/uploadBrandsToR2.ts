/**
 * Upload local `tcg/brands/data/**` → `brands/data/**` on R2 and
 * `tcg/brands/images/**` → `brands/images/**` on R2.
 *
 * Usage:
 *   node --import tsx/esm scripts/uploadBrandsToR2.ts
 *   DRY_RUN=1 node --import tsx/esm scripts/uploadBrandsToR2.ts
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION=auto
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { R2_BRANDS_DATA, R2_BRANDS_IMAGES } from "../lib/r2BucketLayout";
import { getRepoRootFromScriptsDir, loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const repoRoot = getRepoRootFromScriptsDir(import.meta.url);
const LOCAL_DATA_DIR = path.join(repoRoot, "tcg/brands/data");
const LOCAL_IMAGES_DIR = path.join(repoRoot, "tcg/brands/images");

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

function contentTypeForKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function collectFiles(localRoot: string, r2Prefix: string): Array<{ key: string; abs: string }> {
  const out: Array<{ key: string; abs: string }> = [];
  if (!fs.existsSync(localRoot)) return out;

  function walk(current: string, relPosix: string): void {
    for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
      if (ent.name === ".DS_Store") continue;
      const abs = path.join(current, ent.name);
      const nextRel = relPosix ? `${relPosix}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        walk(abs, nextRel);
        continue;
      }
      if (!ent.isFile()) continue;
      out.push({ key: `${r2Prefix}/${nextRel}`, abs });
    }
  }

  walk(localRoot, "");
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

export async function runUploadBrandsToR2(dryRun: boolean): Promise<void> {
  const s3 = buildS3Client();
  const bucket = getBucket();

  const uploads = [
    ...collectFiles(LOCAL_DATA_DIR, R2_BRANDS_DATA),
    ...collectFiles(LOCAL_IMAGES_DIR, R2_BRANDS_IMAGES),
  ];

  if (uploads.length === 0) {
    throw new Error(
      `No files under ${path.relative(repoRoot, LOCAL_DATA_DIR)} or ${path.relative(repoRoot, LOCAL_IMAGES_DIR)}`,
    );
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
        ContentType: contentTypeForKey(key),
      }),
    );
    if (n % 20 === 0 || n === uploads.length) {
      console.log(`… ${n}/${uploads.length} done`);
    }
  }

  console.log(`Finished: ${uploads.length} files ${dryRun ? "(dry-run)" : "uploaded"}.`);
}

const __filename = fileURLToPath(import.meta.url);
const invokedAsMain = path.resolve(process.argv[1] ?? "") === __filename;
if (invokedAsMain) {
  const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
  await runUploadBrandsToR2(dryRun);
}
