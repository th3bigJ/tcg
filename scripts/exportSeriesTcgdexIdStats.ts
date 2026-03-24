/**
 * Generates human-readable reports of master-card-list coverage:
 * total cards vs rows with a non-empty `tcgdex_id`, by **series** and by **set**.
 *
 * Run:
 *   node --import tsx/esm scripts/exportSeriesTcgdexIdStats.ts
 *
 * Outputs:
 *   docs/tcgdex-id-by-series.md
 *   docs/tcgdex-id-by-series.csv
 *   docs/tcgdex-id-by-set.md
 *   docs/tcgdex-id-by-set.csv
 *
 * Shared implementation: `lib/exportTcgdexIdStats.ts` (also used after each set scan).
 */
import nextEnvImport from "@next/env";

import { writeTcgdexIdProgressFiles } from "../lib/exportTcgdexIdStats";

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const result = await writeTcgdexIdProgressFiles(payload, {
      series: true,
      sets: true,
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          generatedAt: result.generatedAt,
          files: result.paths,
        },
        null,
        2,
      ),
    );
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
