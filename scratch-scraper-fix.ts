import { scrapeTcgPlayerPrice, getBrowser, closeBrowser } from "./nightly-scrape/tcgplayerScraper";

async function run() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto("https://www.tcgplayer.com/product/696608/pokemon-me-mega-evolution-promo-mega-gengar-ex---073", { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.waitForFunction(() => {
      return document.body.innerText.match(/Market Price\s*\$?([0-9.,]+)/i) !== null;
    }, { timeout: 15000 });

    const price = await page.evaluate(() => {
      const text = document.body.innerText;
      const match = text.match(/Market Price\s*\$?([0-9.,]+)/i);
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''));
      }
      return null;
    });
    
    console.log("Price:", price);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await page.close();
    await closeBrowser();
  }
}
run();
