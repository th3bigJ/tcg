import cron from "node-cron";
import { runScrapePricing } from "./jobScrapePricing.js";
import { runScrapePokedataProducts } from "./jobScrapePokedataProducts.js";
import { runCalculateMarketTrends } from "./jobCalculateMarketTrends.js";

let initialised = false;

function log(tag: string, msg: string) {
  console.log(`[cron:${tag}] ${new Date().toISOString()} ${msg}`);
}

export async function runNightlyJobs() {
  // Step 1: scrape Pokemon singles + sealed pricing in parallel.
  log("nightly", "starting pokemon pricing scrapes in parallel");
  const pokemonResults = await Promise.allSettled([
    runScrapePricing().then(() => log("scrapePricing", "done")),
    runScrapePokedataProducts({ mode: "prices", tcg: "Pokemon", language: "ENGLISH" }).then(() =>
      log("scrapePokedata", "done"),
    ),
  ]);

  for (const result of pokemonResults) {
    if (result.status === "rejected") {
      log("nightly", `pokemon pricing job failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
  }

  // Step 3: calculate global market trends.
  log("marketTrends", "starting");
  try {
    await runCalculateMarketTrends();
    log("marketTrends", "done");
  } catch (e) {
    log("marketTrends", `failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  log("nightly", "all jobs complete");
}

export function initScheduler() {
  if (initialised) return;
  initialised = true;

  // 00:05 UTC nightly
  cron.schedule(
    "5 0 * * *",
    () => {
      runNightlyJobs().catch((e) => {
        console.error("[cron:nightly] unhandled error:", e);
      });
    },
    { timezone: "UTC" },
  );

  // Temporary run for today at 7am local time (6am UTC on June 22nd)
  cron.schedule(
    "0 6 22 6 *",
    () => {
      runNightlyJobs().catch((e) => {
        console.error("[cron:nightly] unhandled error:", e);
      });
    },
    { timezone: "UTC" },
  );

  log("init", "nightly cron registered (00:05 UTC), extra run scheduled for 06:00 UTC today");
}
