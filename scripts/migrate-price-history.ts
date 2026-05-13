/**
 * Migrates existing flat daily/weekly/monthly bucket files into the new
 * folder-per-date, per-set layout.
 *
 * Source:  r2_backup/new_pricing/daily/{YYYY-MM-DD}.json
 *          r2_backup/new_pricing/weekly/{YYYY-Www}.json
 *          r2_backup/new_pricing/monthly/{YYYY-MM}.json
 *          Each file: { [cardId]: { [variant]: { [grade]: price } } }
 *
 * Output:  r2_backup/new_pricing/daily/{YYYY-MM-DD}/{setCode}.json
 *          r2_backup/new_pricing/weekly/{YYYY-Www}/{setCode}.json
 *          r2_backup/new_pricing/monthly/{YYYY-MM}/{setCode}.json
 *          Each file: { [cardId]: { [variant]: { [grade]: price } } }
 *
 * Set code is derived from the card ID prefix before the first '-'.
 * Existing flat files are deleted after splitting.
 */

import fs from "fs";
import path from "path";

const BASE = path.join(process.cwd(), "r2_backup/new_pricing");

type FlatBucketFile = Record<string, Record<string, Record<string, number>>>;

function setCodeFromCardId(cardId: string): string {
  return cardId.slice(0, cardId.indexOf("-"));
}

function splitAndWrite(dir: string): number {
  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let written = 0;

  for (const filename of entries) {
    const bucketKey = filename.replace(".json", "");
    const filePath = path.join(dir, filename);

    let flat: FlatBucketFile;
    try {
      flat = JSON.parse(fs.readFileSync(filePath, "utf-8")) as FlatBucketFile;
    } catch (e) {
      console.warn(`  Skipping ${filename}: ${(e as Error).message}`);
      continue;
    }

    // Group cards by set code.
    const bySet = new Map<string, FlatBucketFile>();
    for (const [cardId, variants] of Object.entries(flat)) {
      const setCode = setCodeFromCardId(cardId);
      if (!setCode) continue;
      let setMap = bySet.get(setCode);
      if (!setMap) { setMap = {}; bySet.set(setCode, setMap); }
      setMap[cardId] = variants;
    }

    // Write per-set files into a subfolder named after the bucket key.
    const outDir = path.join(dir, bucketKey);
    fs.mkdirSync(outDir, { recursive: true });
    for (const [setCode, setMap] of bySet) {
      fs.writeFileSync(path.join(outDir, `${setCode}.json`), JSON.stringify(setMap));
      written++;
    }

    // Remove the old flat file.
    fs.unlinkSync(filePath);
    process.stdout.write(`  ${bucketKey}: ${bySet.size} sets\n`);
  }

  return written;
}

console.log("Migrating daily...");
const d = splitAndWrite(path.join(BASE, "daily"));

console.log("Migrating weekly...");
const w = splitAndWrite(path.join(BASE, "weekly"));

console.log("Migrating monthly...");
const m = splitAndWrite(path.join(BASE, "monthly"));

console.log(`\nDone. Written: daily=${d} weekly=${w} monthly=${m} set files`);
