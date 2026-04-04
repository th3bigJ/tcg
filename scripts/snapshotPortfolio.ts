import "./registerCjsRequireForEsm";

/**
 * For every row in `customers`, computes a portfolio snapshot (stored under **yesterday's** UTC date) and merges it into
 * R2 at `portfolio-snapshots/{customerId}.json` (one JSON file per user). The dashboard chart adds **today** as the live total.
 *
 * CLI:
 *   npm run portfolio:snapshot
 *   npm run portfolio:snapshot -- --dry-run
 *   npm run portfolio:snapshot -- --only=1,2,3
 */

import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runSnapshotPortfolio } from "../lib/jobs/jobSnapshotPortfolio";

loadEnvFilesFromRepoRoot(import.meta.url);

const dryRun = process.argv.includes("--dry-run");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const onlyIds = onlyArg
  ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

runSnapshotPortfolio({ dryRun, onlyIds }).catch((e) => {
  console.error(e);
  process.exit(1);
});
