import { scrapeTcgPlayerPrice, closeBrowser } from "./nightly-scrape/tcgplayerScraper";

async function run() {
  const price = await scrapeTcgPlayerPrice("https://www.tcgplayer.com/product/696608/pokemon-me-mega-evolution-promo-mega-gengar-ex---073");
  console.log("Price:", price);
  await closeBrowser();
}
run();
