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
import { buildOnePieceS3Client, onePieceR2Key, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const ROOT = path.join(process.cwd(), "onepiece");
const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");

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

async function main(): Promise<void> {
  if (!fs.existsSync(ROOT)) {
    throw new Error(`Missing folder: ${ROOT}`);
  }

  const files = collectFiles(ROOT);
  const s3 = buildOnePieceS3Client();

  console.log(`Uploading ${files.length} onepiece files to R2 (${dryRun ? "dry-run" : "live"})`);

  let index = 0;
  for (const file of files) {
    index += 1;
    if (dryRun) {
      console.log(`[${index}/${files.length}] ${onePieceR2Key(file.rel)}`);
      continue;
    }
    await uploadLocalFileToOnePieceR2(s3, file.abs, file.rel);
    if (index % 50 === 0 || index === files.length) {
      console.log(`... ${index}/${files.length} uploaded`);
    }
  }

  console.log(`Finished ${dryRun ? "(dry-run)" : "uploading"} onepiece/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
