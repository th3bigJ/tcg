/**
 * Rewrite portfolio snapshot JSON so any point dated **today** (UTC) becomes **yesterday**.
 *
 * Local files (in cwd):  npm run portfolio:snapshot:fix-dates -- 1 3 6
 * In-place on R2:        npm run portfolio:snapshot:fix-dates -- --r2 1 3 6
 *
 * R2 mode uses R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY from .env.local (same as uploads).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import { utcTodayKey } from "../lib/portfolioChartPoints";
import type { PortfolioSnapshotDocument } from "../lib/portfolioSnapshotTypes";
import {
  fetchPortfolioSnapshotDocumentFromBucket,
  putPortfolioSnapshotDocument,
} from "../lib/r2PortfolioSnapshots";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

function yesterdayKeyFromToday(today: string): string {
  const d = new Date(`${today}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function shiftTodayPointsToYesterday(
  doc: PortfolioSnapshotDocument,
  today: string,
  yesterday: string,
): number {
  let changed = 0;
  for (const p of doc.points ?? []) {
    if (p.date === today) {
      p.date = yesterday;
      changed += 1;
    }
  }
  doc.updatedAt = new Date().toISOString();
  return changed;
}

/** Bare numeric args like `1` → `./1.json` in the current working directory. */
function resolveSnapshotPath(arg: string): string {
  const t = arg.trim();
  if (/^\d+$/.test(t)) {
    return resolve(process.cwd(), `${t}.json`);
  }
  return isAbsolute(t) ? t : resolve(process.cwd(), t);
}

function missingR2Env(): boolean {
  return (
    !process.env.R2_BUCKET ||
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  );
}

async function runR2(customerIds: string[]): Promise<void> {
  loadEnvFilesFromRepoRoot(import.meta.url);
  if (missingR2Env()) {
    console.error("Missing R2 env: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY");
    process.exit(1);
  }

  const today = utcTodayKey();
  const yesterday = yesterdayKeyFromToday(today);

  for (const id of customerIds) {
    const doc = await fetchPortfolioSnapshotDocumentFromBucket(id);
    if (!doc) {
      console.error(`R2: could not read or parse portfolio-snapshots/${id}.json`);
      continue;
    }
    const changed = shiftTodayPointsToYesterday(doc, today, yesterday);
    await putPortfolioSnapshotDocument(doc);
    console.log(`R2 portfolio-snapshots/${id}.json: moved ${changed} point(s) ${today} → ${yesterday}`);
  }
}

function runLocal(paths: string[]): void {
  const today = utcTodayKey();
  const yesterday = yesterdayKeyFromToday(today);

  for (const filePath of paths) {
    const raw = readFileSync(filePath, "utf8");
    const doc = JSON.parse(raw) as PortfolioSnapshotDocument;
    const changed = shiftTodayPointsToYesterday(doc, today, yesterday);
    writeFileSync(filePath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    console.log(`${filePath}: moved ${changed} point(s) from ${today} → ${yesterday}`);
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const useR2 = argv.includes("--r2");
  const args = argv.filter((a) => a !== "--r2");

  if (args.length === 0) {
    console.error(
      "Usage:\n" +
        "  npm run portfolio:snapshot:fix-dates -- --r2 1 3 6     (edit files in R2 in place)\n" +
        "  npm run portfolio:snapshot:fix-dates -- 1 3 6          (edit 1.json, 3.json, 6.json in cwd)\n",
    );
    process.exit(1);
  }

  if (useR2) {
    const ids = args.map((a) => a.trim()).filter((a) => /^\d+$/.test(a));
    if (ids.length !== args.length) {
      console.error("With --r2, pass numeric customer ids only (e.g. --r2 1 3 6).");
      process.exit(1);
    }
    await runR2(ids);
    return;
  }

  const paths = args.map(resolveSnapshotPath);
  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
  }
  runLocal(paths);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
