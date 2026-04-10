/**
 * Upload the local `onepiece/` folder to R2, preserving the folder and all nested contents:
 *   onepiece/** -> onepiece/** on R2
 *
 * Usage:
 *   node --import tsx/esm scripts/uploadOnePieceFolderToR2.ts
 *   DRY_RUN=1 node --import tsx/esm scripts/uploadOnePieceFolderToR2.ts
 */

import fs from "fs";
import path from "path";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { buildOnePieceS3Client, onePieceR2Key, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const ROOT = path.join(process.cwd(), "onepiece");
const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
const resume = Boolean(process.env.RESUME && process.env.RESUME !== "0");

function collectFiles(dir: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];

  function walk(current: string): void {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;

      const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
      out.push({ abs, rel });
    }
  }

  walk(dir);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

async function listExistingOnePieceKeys(): Promise<Set<string>> {
  const s3 = buildOnePieceS3Client();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");

  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "onepiece/",
        ContinuationToken: continuationToken,
      }),
    );

    for (const entry of out.Contents ?? []) {
      if (!entry.Key || entry.Key.endsWith("/")) continue;
      keys.add(entry.Key);
    }

    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function main(): Promise<void> {
  if (!fs.existsSync(ROOT)) {
    throw new Error(`Missing folder: ${ROOT}`);
  }

  const s3 = buildOnePieceS3Client();
  const files = collectFiles(ROOT);
  const existing = resume ? await listExistingOnePieceKeys() : null;
  const pending = existing ? files.filter((file) => !existing.has(onePieceR2Key(file.rel))) : files;

  console.log(
    `Uploading ${pending.length}/${files.length} onepiece files to R2 (${dryRun ? "dry-run" : "live"}${resume ? ", resume" : ""})`,
  );

  let index = 0;
  for (const file of pending) {
    index += 1;
    if (dryRun) {
      console.log(`[${index}/${pending.length}] ${onePieceR2Key(file.rel)}`);
      continue;
    }
    await uploadLocalFileToOnePieceR2(s3, file.abs, file.rel);
    if (index % 50 === 0 || index === pending.length) {
      console.log(`... ${index}/${pending.length} uploaded`);
    }
  }

  console.log(`Finished ${dryRun ? "(dry-run)" : "uploading"} onepiece/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
