import cron from "node-cron";
import { runSnapshotPortfolio } from "./jobs/jobSnapshotPortfolio";
import { runScrapePricing } from "./jobs/jobScrapePricing";
import { runScrapePokedataProducts } from "./jobs/jobScrapePokedataProducts";
import { runScrapeOnePiecePricing } from "./jobs/jobScrapeOnePiecePricing";

let initialised = false;

function log(tag: string, msg: string) {
  console.log(`[cron:${tag}] ${new Date().toISOString()} ${msg}`);
}

async function runNightlyJobs() {
  // Step 1: snapshot portfolio using yesterday's prices already in R2
  log("portfolioSnapshot", "starting");
  try {
    await runSnapshotPortfolio();
    log("portfolioSnapshot", "done");
  } catch (e) {
    log("portfolioSnapshot", `failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Step 2: scrape Pokemon singles + sealed pricing in parallel.
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

  // Step 3: once Pokemon has finished, update One Piece pricing/history/trends on R2.
  log("onePiecePricing", "starting");
  try {
    await runScrapeOnePiecePricing({ source: "r2" });
    log("onePiecePricing", "done");
  } catch (e) {
    log("onePiecePricing", `failed: ${e instanceof Error ? e.message : String(e)}`);
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

  log("init", "nightly cron registered (00:05 UTC)");
}
