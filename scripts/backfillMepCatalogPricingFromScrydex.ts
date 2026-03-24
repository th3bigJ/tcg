/**
 * Scrydex MEP catalog backfill only (no TCGdex phase). Default: master cards with `no_pricing === true`.
 * Pass `--all-mep` to consider every MEP master row (legacy behaviour).
 *
 * @see https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep
 *
 *   node --import tsx/esm scripts/backfillMepCatalogPricingFromScrydex.ts
 *   node --import tsx/esm scripts/backfillMepCatalogPricingFromScrydex.ts --dry-run
 *   node --import tsx/esm scripts/backfillMepCatalogPricingFromScrydex.ts --force
 *   node --import tsx/esm scripts/backfillMepCatalogPricingFromScrydex.ts --all-mep
 */

import nextEnvImport from "@next/env";

import { runMepScrydexCatalogFallback } from "../lib/mepScrydexCatalogFallback";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const allMep = process.argv.includes("--all-mep");

async function run(): Promise<void> {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const scrydex = await runMepScrydexCatalogFallback(payload, {
      onlyMasterNoPricing: !allMep,
      force,
      dryRun,
      onProgress: (line) => console.log(line),
    });

    console.log("");
    if (dryRun) {
      console.log("Dry run only — no writes.");
      console.log(`Would create: ${scrydex.dryRunWouldCreate}, would update: ${scrydex.dryRunWouldUpdate}`);
    } else {
      console.log(`Created: ${scrydex.created}, updated: ${scrydex.updated}`);
    }
    console.log(
      `Skipped — not no_pricing: ${scrydex.skippedNotNoPricing}, no id/list: ${scrydex.skippedNoScrydexId}, Scrydex N/A: ${scrydex.skippedScrydexNa}, catalog already TCGdex-ok: ${scrydex.skippedCatalogTcgdexOk}`,
    );
  } finally {
    await payload.destroy();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
