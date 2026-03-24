/**
 * Scrape Scrydex for all mapped sets (all series) unless `--series=` narrows Payload series.
 * Writes `externalPrice` + `externalPricing` on `catalog-card-pricing`.
 *
 *   node --import tsx/esm scripts/scrapeMegaEvolutionScrydexPricing.ts
 *   node --import tsx/esm scripts/scrapeMegaEvolutionScrydexPricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapeMegaEvolutionScrydexPricing.ts --set=sv1
 *   node --import tsx/esm scripts/scrapeMegaEvolutionScrydexPricing.ts --series=Mega Evolution
 */

import nextEnvImport from "@next/env";

import { runMegaEvolutionScrydexCatalogScrape } from "../lib/megaEvolutionScrydexCatalogScrape";

const dryRun = process.argv.includes("--dry-run");
const skipIfTcgdex = process.argv.includes("--skip-if-tcgdex");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodesFromCli = setArg ? [setArg.slice("--set=".length).trim()] : undefined;

const seriesArg = process.argv.find((a) => a.startsWith("--series="));
const seriesNames = seriesArg
  ? seriesArg
      .slice("--series=".length)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  : undefined;

async function main(): Promise<void> {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    console.log(
      `=== Scrydex scrape (${seriesNames?.length ? seriesNames.join(", ") : "all sets / all series"}) ===\n`,
    );
    if (onlySetCodesFromCli) {
      console.log(`Filter: ${onlySetCodesFromCli.join(", ")}\n`);
    }
    if (dryRun) {
      console.log("(dry-run: no database writes)\n");
    }

    const r = await runMegaEvolutionScrydexCatalogScrape(payload, {
      dryRun,
      patchExternalEvenIfTcgdex: !skipIfTcgdex,
      onlySetCodes: onlySetCodesFromCli,
      ...(seriesNames !== undefined ? { seriesNames } : {}),
      onProgress: (line) => console.log(line),
    });

    console.log("\n--- Summary ---");
    console.log(`Series: ${r.seriesNames.join(", ")}`);
    if (r.seriesWarnings?.length) {
      console.log(`Warnings: ${r.seriesWarnings.join(" | ")}`);
    }
    console.log(`Sets: ${r.setCodes.join(", ") || "(none)"}`);
    console.log(`Master rows queued: ${r.masterRows}`);
    console.log(`Skipped — no Scrydex expansion URL: ${r.skippedNoScrydexExpansion}`);
    console.log(`Skipped — no list/detail price: ${r.skippedNoPrice}`);
    console.log(`Skipped — TCGdex catalog guard: ${r.skippedHasTcgdexCatalog}`);
    console.log(`Master no_pricing → false: ${r.masterMarkedPricingOk}, → true: ${r.masterMarkedNoPricing}`);
    if (!dryRun) {
      console.log(`Created: ${r.created}, updated: ${r.updated}`);
    }
    if (r.errors.length > 0) {
      console.log(`Errors (sample): ${r.errors.slice(0, 8).join("; ")}`);
    }
    console.log("\nDone.");
  } finally {
    await payload.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
