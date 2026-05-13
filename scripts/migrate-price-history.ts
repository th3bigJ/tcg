/**
 * Consolidates existing per-set bucket files into single files per interval.
 *
 * Source:  r2_backup/new_pricing/daily/{YYYY-MM-DD}/{setCode}.json
 *          r2_backup/new_pricing/weekly/{YYYY-Www}/{setCode}.json
 *          r2_backup/new_pricing/monthly/{YYYY-MM}/{setCode}.json
 *          Each file: { [cardId]: { [variant]: { [grade]: price } } }
 *
 * Output:  r2_backup/new_pricing/daily/{YYYY-MM-DD}.json
 *          r2_backup/new_pricing/weekly/{YYYY-Www}.json
 *          r2_backup/new_pricing/monthly/{YYYY-MM}.json
 *          Each file: { [cardId]: { [variant]: { [grade]: price } } }
 *
 * Existing subfolders are deleted after merging.
 */

import fs from "fs";
import path from "path";

const BASE = path.join(process.cwd(), "r2_backup/new_pricing");

type FlatBucketFile = Record<string, Record<string, Record<string, number>>>;

function mergeAndWrite(dir: string): number {
  if (!fs.existsSync(dir)) return 0;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let mergedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "sealed") continue;

    const folderName = entry.name;
    const folderPath = path.join(dir, folderName);
    const setFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith(".json"));

    const combined: FlatBucketFile = {};
    let totalCards = 0;

    // If an existing flat file already exists for this interval, load it to merge into.
    const outFilePath = path.join(dir, `${folderName}.json`);
    if (fs.existsSync(outFilePath)) {
      try {
        Object.assign(combined, JSON.parse(fs.readFileSync(outFilePath, "utf-8")));
      } catch (e) {
        console.warn(`  Warning: could not read existing flat file ${outFilePath}: ${(e as Error).message}`);
      }
    }

    for (const filename of setFiles) {
      const setFilePath = path.join(folderPath, filename);
      try {
        const setMap = JSON.parse(fs.readFileSync(setFilePath, "utf-8")) as FlatBucketFile;
        for (const [cardId, variants] of Object.entries(setMap)) {
          combined[cardId] = variants;
          totalCards++;
        }
      } catch (e) {
        console.warn(`  Skipping ${setFilePath}: ${(e as Error).message}`);
      }
    }

    // Save combined JSON
    fs.writeFileSync(outFilePath, JSON.stringify(combined));
    mergedCount++;

    // Remove the old subdirectory recursively
    fs.rmSync(folderPath, { recursive: true, force: true });
    process.stdout.write(`  Merged ${folderName}: ${setFiles.length} sets (${totalCards} cards)\n`);
  }

  return mergedCount;
}

console.log("Consolidating daily...");
const d = mergeAndWrite(path.join(BASE, "daily"));

console.log("Consolidating weekly...");
const w = mergeAndWrite(path.join(BASE, "weekly"));

console.log("Consolidating monthly...");
const m = mergeAndWrite(path.join(BASE, "monthly"));

console.log(`\nDone. Consolidations complete: daily=${d} weekly=${w} monthly=${m} time periods`);
