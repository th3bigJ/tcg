import { createClient } from "@supabase/supabase-js";
import { fetchAllCustomerIds } from "../portfolioSnapshotCustomers";
import { computePortfolioSnapshotPoint } from "../portfolioSnapshotCompute";
import { mergeAndUploadPortfolioSnapshot } from "../r2PortfolioSnapshots";

export interface SnapshotPortfolioOptions {
  dryRun?: boolean;
  onlyIds?: string[];
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

export async function runSnapshotPortfolio(opts: SnapshotPortfolioOptions = {}): Promise<void> {
  const { dryRun = false, onlyIds } = opts;

  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";

  if (!url || !key) {
    const missing: string[] = [];
    if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
    if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    throw new Error(
      `Missing ${missing.join(", ")}. Service role key: Supabase → Project Settings → API → service_role (secret).`,
    );
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
    throw new Error(
      "Missing R2 config: R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and a public base URL (R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL).",
    );
  }

  const concurrency = Math.max(
    1,
    Math.min(
      8,
      parseInt(process.env.PORTFOLIO_SNAPSHOT_CONCURRENCY ?? "2", 10) || 2,
    ),
  );

  const supabase = createClient(url, key);

  let customerIds = await fetchAllCustomerIds(supabase);
  if (onlyIds?.length) {
    const allowed = new Set(onlyIds);
    customerIds = customerIds.filter((id) => allowed.has(id));
  }

  console.log(
    dryRun
      ? `[dry-run] Would sync ${customerIds.length} customer(s)`
      : `Syncing ${customerIds.length} customer(s) (concurrency ${concurrency})`,
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
  if (failures.length > 0) {
    throw new Error(`Portfolio snapshot had ${failures.length} failure(s): ${failures.join("; ")}`);
  }
}
