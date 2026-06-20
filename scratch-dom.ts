import { scrapeTcgPlayerPrice, getBrowser, closeBrowser } from "./nightly-scrape/tcgplayerScraper";

async function run() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.goto("https://www.tcgplayer.com/product/696608/pokemon-me-mega-evolution-promo-mega-gengar-ex---073", { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // wait a bit for dynamic content
  await new Promise(r => setTimeout(r, 5000));
  
  const text = await page.evaluate(() => document.body.innerText.substring(0, 500));
  console.log("TEXT START:", text);
  
  const price = await page.evaluate(() => {
    const el = document.querySelector('.price-point__data');
    return el ? el.textContent : null;
  });
  console.log("PRICE ELEM:", price);
  await closeBrowser();
}
run();
