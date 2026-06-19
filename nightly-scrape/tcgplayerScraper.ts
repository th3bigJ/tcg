import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

let browserInstance: any = null;

export async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
  }
  return browserInstance;
}

export async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function scrapeTcgPlayerPrice(url: string): Promise<number | null> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    const price = await page.evaluate(() => {
      // Find the Market Price block
      const text = document.body.innerText;
      const match = text.match(/Market Price\s*\$?([0-9.,]+)/i);
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''));
      }
      return null;
    });
    
    return price;
  } catch (err) {
    console.error(`Error scraping ${url}:`, err);
    return null;
  } finally {
    await page.close();
  }
}
