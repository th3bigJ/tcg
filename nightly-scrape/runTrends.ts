import { loadEnvFilesFromRepoRoot } from "./loadEnvFromRepoRoot";
import { runCalculateMarketTrends } from "./jobCalculateMarketTrends";

loadEnvFilesFromRepoRoot(import.meta.url);

runCalculateMarketTrends()
  .then(() => {
    console.log("Market trend calculation finished successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error calculating market trends:", err);
    process.exit(1);
  });
