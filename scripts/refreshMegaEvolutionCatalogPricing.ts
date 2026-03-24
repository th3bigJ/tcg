/**
 * CLI: same Scrydex-only flow as POST /api/catalog-pricing/refresh (all sets by default).
 *
 *   node --import tsx/esm scripts/refreshMegaEvolutionCatalogPricing.ts
 *   node --import tsx/esm scripts/refreshMegaEvolutionCatalogPricing.ts --dry-run
 *   node --import tsx/esm scripts/refreshMegaEvolutionCatalogPricing.ts --set=me02.5
 *   node --import tsx/esm scripts/refreshMegaEvolutionCatalogPricing.ts --series=Mega Evolution,Scarlet & Violet
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

async function main() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    console.log(
      `=== Scrydex catalog pricing (${seriesNames?.length ? seriesNames.join(", ") : "all sets / all series"}) ===\n`,
    );

    if (onlySetCodesFromCli) {
      console.log(`Filtering to set code(s): ${onlySetCodesFromCli.join(", ")}\n`);
    }
    if (dryRun) {
      console.log("(dry-run: no database writes)\n");
    }

    const scrydex = await runMegaEvolutionScrydexCatalogScrape(payload, {
      dryRun,
      patchExternalEvenIfTcgdex: !skipIfTcgdex,
      onlySetCodes: onlySetCodesFromCli,
      ...(seriesNames !== undefined ? { seriesNames } : {}),
      onProgress: (line) => console.log(line),
    });

    console.log("\n--- Summary ---");
    console.log(`Series: ${scrydex.seriesNames.join(", ")}`);
    if (scrydex.seriesWarnings?.length) {
      console.log(`Warnings: ${scrydex.seriesWarnings.join(" | ")}`);
    }
    console.log(`Sets: ${scrydex.setCodes.join(", ") || "(none)"}`);
    console.log(`Master rows queued: ${scrydex.masterRows}`);
    console.log(`Skipped — no Scrydex expansion URL: ${scrydex.skippedNoScrydexExpansion}`);
    console.log(`Skipped — no list/detail price: ${scrydex.skippedNoPrice}`);
    console.log(`Skipped — TCGdex catalog guard (--skip-if-tcgdex): ${scrydex.skippedHasTcgdexCatalog}`);
    console.log(`Master no_pricing → false: ${scrydex.masterMarkedPricingOk}, → true: ${scrydex.masterMarkedNoPricing}`);
    if (!dryRun) {
      console.log(`Catalog created: ${scrydex.created}, updated: ${scrydex.updated}`);
    }
    if (scrydex.errors.length > 0) {
      console.log(`Errors (sample): ${scrydex.errors.slice(0, 8).join("; ")}`);
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
