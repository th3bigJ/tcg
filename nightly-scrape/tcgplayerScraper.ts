import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { execSync } from 'child_process';

// @ts-ignore
puppeteer.use(StealthPlugin());

let browserInstance: any = null;

function getExecutablePath(): string | undefined {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && envPath !== 'chromium' && envPath !== 'chromium-browser') {
    return envPath;
  }
  try {
    return execSync('which chromium').toString().trim();
  } catch (e) {
    try {
      return execSync('which chromium-browser').toString().trim();
    } catch (err) {
      return envPath;
    }
  }
}

export async function getBrowser() {
  if (!browserInstance) {
    // @ts-ignore
    browserInstance = await puppeteer.launch({ 
      headless: true,
      executablePath: getExecutablePath(),
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
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    await page.waitForFunction(() => {
      // @ts-ignore
      return document.body.innerText.match(/Market Price\s*\$?([0-9.,]+)/i) !== null;
    }, { timeout: 15000 });

    const price = await page.evaluate(() => {
      // Find the Market Price block
      // @ts-ignore
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
