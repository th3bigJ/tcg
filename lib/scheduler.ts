import cron from "node-cron";
import { runSnapshotPortfolio } from "./jobs/jobSnapshotPortfolio";
import { runScrapePricing } from "./jobs/jobScrapePricing";
import { runScrapePokedataProducts } from "./jobs/jobScrapePokedataProducts";

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

  // Step 2: scrape fresh card and sealed pricing in parallel (updates history + trends too)
  log("nightly", "starting pricing scrapes in parallel");
  const results = await Promise.allSettled([
    runScrapePricing().then(() => log("scrapePricing", "done")),
    runScrapePokedataProducts({ mode: "prices", tcg: "Pokemon", language: "ENGLISH" }).then(() =>
      log("scrapePokedata", "done"),
    ),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      log("nightly", `pricing job failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    }
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
