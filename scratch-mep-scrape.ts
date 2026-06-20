import { runScrapePricing } from "./nightly-scrape/jobScrapePricing";

runScrapePricing({ onlySetCodes: ["mep"] }).catch(console.error);
