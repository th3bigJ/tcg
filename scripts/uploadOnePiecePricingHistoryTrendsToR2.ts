/**
 * Upload only One Piece price history + trends JSON to R2 (not market, cards, sets, images).
 *
 * R2 keys: onepiece/pricing/history/{setCode}.json, onepiece/pricing/trends/{setCode}.json
 *
 * Usage:
 *   node --import tsx/esm scripts/uploadOnePiecePricingHistoryTrendsToR2.ts
 *   DRY_RUN=1 node --import tsx/esm scripts/uploadOnePiecePricingHistoryTrendsToR2.ts
 *   node --import tsx/esm scripts/uploadOnePiecePricingHistoryTrendsToR2.ts --set=OP02,OP15
 *
 * Env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_REGION (same as r2:upload-onepiece)
 */

import fs from "fs";
import path from "path";
import { buildOnePieceS3Client, uploadLocalFileToOnePieceR2 } from "../lib/onepieceR2";
import { onepieceLocalDataRoot } from "../lib/onepieceLocalDataPaths";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

const ONEPIECE_ROOT = onepieceLocalDataRoot;
const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? new Set(
      setArg
        .slice("--set=".length)
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    )
  : null;

function collectJsonFiles(subdir: "pricing/history" | "pricing/trends"): Array<{ abs: string; rel: string }> {
  const dir = path.join(ONEPIECE_ROOT, ...subdir.split("/"));
  if (!fs.existsSync(dir)) return [];

  const out: Array<{ abs: string; rel: string }> = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const setCode = name.replace(/\.json$/i, "").toUpperCase();
    if (onlySetCodes && !onlySetCodes.has(setCode)) continue;

    const abs = path.join(dir, name);
    const rel = path.relative(ONEPIECE_ROOT, abs).replace(/\\/g, "/");
    out.push({ abs, rel });
  }
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

async function main(): Promise<void> {
  const historyFiles = collectJsonFiles("pricing/history");
  const trendsFiles = collectJsonFiles("pricing/trends");
  const files = [...historyFiles, ...trendsFiles];

  if (files.length === 0) {
    console.log("No JSON files found under data/onepiece/pricing/history or data/onepiece/pricing/trends (check --set filter).");
    return;
  }

  const label = onlySetCodes ? [...onlySetCodes].join(", ") : "all sets";
  console.log(
    `Uploading ${files.length} file(s) to R2 (${label}) — history + trends only (${dryRun ? "dry-run" : "live"})`,
  );

  const s3 = buildOnePieceS3Client();
  let index = 0;
  for (const file of files) {
    index += 1;
    if (dryRun) {
      console.log(`[${index}/${files.length}] R2 onepiece/${file.rel}`);
      continue;
    }
    await uploadLocalFileToOnePieceR2(s3, file.abs, file.rel);
    if (index % 20 === 0 || index === files.length) {
      console.log(`... ${index}/${files.length}`);
    }
  }

  console.log(`Finished ${dryRun ? "(dry-run)" : "uploading"} One Piece history + trends.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
