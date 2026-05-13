import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runCalculateMarketTrends } from "./jobCalculateMarketTrends";

loadEnvFilesFromRepoRoot(import.meta.url);

console.log("=== Backfill: recalculating market trends with corrected baseline-anchor logic ===");

runCalculateMarketTrends()
  .then(() => {
    console.log("Backfill complete — market-trend.json updated.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  });
