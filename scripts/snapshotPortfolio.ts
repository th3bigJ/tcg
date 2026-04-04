import "./registerCjsRequireForEsm";

/**
 * For every row in `customers`, computes a portfolio snapshot (stored under **yesterday’s** UTC date) and merges it into
 * R2 at `portfolio-snapshots/{customerId}.json` (one JSON file per user). The dashboard chart adds **today** as the live total.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 *   R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL (read-merge-write uses the public URL)
 *
 * Optional:
 *   PORTFOLIO_SNAPSHOT_CONCURRENCY — default 2 (parallel customers; each does pricing I/O)
 *
 * CLI:
 *   npm run portfolio:snapshot
 *   npm run portfolio:snapshot -- --dry-run
 *   npm run portfolio:snapshot -- --only=1,2,3
 *
 * Loads `.env` then `.env.local` from the repo root.
 */

import { createClient } from "@supabase/supabase-js";

import { fetchAllCustomerIds } from "../lib/portfolioSnapshotCustomers";
import { computePortfolioSnapshotPoint } from "../lib/portfolioSnapshotCompute";
import { mergeAndUploadPortfolioSnapshot } from "../lib/r2PortfolioSnapshots";
import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";

loadEnvFilesFromRepoRoot(import.meta.url);

function parseArgs(): { dryRun: boolean; onlySet: Set<string> | null } {
  const dryRun = process.argv.includes("--dry-run");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const onlySet =
    onlyArg != null
      ? new Set(
          onlyArg
            .slice("--only=".length)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null;
  return { dryRun, onlySet };
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  const q = [...items];
  const workers = Array.from({ length: Math.min(concurrency, q.length) }, async () => {
    for (;;) {
      const item = q.shift();
      if (item === undefined) return;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!url || !key) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    console.error(
      `Missing ${missing.join(", ")}. Add to .env.local at the project root (same folder as package.json), or export in your shell. Service role key: Supabase → Project Settings → API → service_role (secret).`,
    );
    process.exit(1);
  }

  const publicBase =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
  if (
    !publicBase?.trim() ||
    !process.env.R2_BUCKET ||
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    console.error(
      "Missing R2 config: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and a public base URL (R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL).",
    );
    process.exit(1);
  }

  const concurrency = Math.max(
    1,
    Math.min(
      8,
      parseInt(process.env.PORTFOLIO_SNAPSHOT_CONCURRENCY ?? "2", 10) || 2,
    ),
  );

  const { dryRun, onlySet } = parseArgs();

  const supabase = createClient(url, key);

  let customerIds = await fetchAllCustomerIds(supabase);
  if (onlySet) {
    customerIds = customerIds.filter((id) => onlySet.has(id));
  }

  console.log(
    dryRun ? `[dry-run] Would sync ${customerIds.length} customer(s)` : `Syncing ${customerIds.length} customer(s) (concurrency ${concurrency})`,
  );

  if (dryRun) {
    for (const id of customerIds) console.log(`  customer ${id}`);
    return;
  }

  const failures: string[] = [];

  await mapPool(customerIds, concurrency, async (customerId) => {
    try {
      const point = await computePortfolioSnapshotPoint(supabase, customerId);
      await mergeAndUploadPortfolioSnapshot(customerId, point);
      console.log(`OK ${customerId}  ${point.date}  £${point.totalValueGbp.toFixed(2)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push(`${customerId}: ${msg}`);
      console.error(`FAIL ${customerId}: ${msg}`);
    }
  });

  const ok = customerIds.length - failures.length;
  console.log(`Done. ${ok} ok, ${failures.length} failed.`);
  if (failures.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
