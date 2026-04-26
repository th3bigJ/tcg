import fs from 'fs/promises';
import path from 'path';
import { resolveExpansionConfigsForSet } from '../nightly-scrape/scrydexExpansionConfigsForSet';
import { fetchScrydexExpansionMultiPageHtml, parseScrydexExpansionListPaths, resolveScrydexCardPath, SCRYDEX_DEFAULT_UA } from '../nightly-scrape/scrydexExpansionListParsing';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pLimit(concurrency: number) {
  const queue: (() => Promise<void>)[] = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function extractDataField(html: string, fieldName: string): string | null {
  const marker = `data-target-field="${fieldName}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  
  const endDiv = '<div class="overflow-x-auto border border-transparent bg-mono-2/20 p-2 text-body-12 text-mono-4 group-hover:border-primary">';
  const valIdx = html.indexOf(endDiv, idx);
  if (valIdx === -1) return null;
  
  const start = valIdx + endDiv.length;
  const end = html.indexOf('</div>', start);
  const raw = html.substring(start, end).trim();
  if (raw === '' || raw === 'null') return null;
  
  return decodeBasicHtmlEntities(raw);
}

async function processSet(setCode: string, limit: ReturnType<typeof pLimit>) {
  const dataDir = path.join(process.cwd(), 'r2_backup/data/cards');
  const filePath = path.join(dataDir, `${setCode}.json`);

  try {
    await fs.access(filePath);
  } catch {
    console.error(`[${setCode}] Local data file not found: ${filePath}`);
    return;
  }

  const localDataRaw = await fs.readFile(filePath, 'utf-8');
  const localCards = JSON.parse(localDataRaw);

  console.log(`[${setCode}] Loaded ${localCards.length} cards from ${filePath}`);

  // Resolve expansion configs for this set code
  const configs = resolveExpansionConfigsForSet({ setKey: setCode } as any);
  if (configs.length === 0) {
    console.error(`[${setCode}] Could not resolve Scrydex expansion URLs for set code: ${setCode}`);
    return;
  }

  const pathMap = new Map<string, string>();
  for (const config of configs) {
    console.log(`[${setCode}] Fetching expansion listing: ${config.expansionUrl}`);
    const listHtml = await fetchScrydexExpansionMultiPageHtml(config.expansionUrl);
    const parsedPaths = parseScrydexExpansionListPaths(listHtml, config.listPrefix);
    for (const [k, v] of parsedPaths.entries()) {
      pathMap.set(k, v);
    }
  }

  console.log(`[${setCode}] Found ${pathMap.size} card paths on Scrydex for set ${setCode}`);

  let updatedCount = 0;

  const tasks = localCards.map((card: any) => limit(async () => {
    const cardPath = resolveScrydexCardPath(pathMap, card.externalId, configs[0].listPrefix, []);
    if (!cardPath) {
      console.warn(`[${setCode}] Warning: Card ${card.externalId} not found in expansion path map.`);
      return;
    }

    const fullUrl = `https://scrydex.com${cardPath.startsWith('/') ? '' : '/'}${cardPath}`;
    console.log(`[${setCode}] Fetching card: ${card.externalId} -> ${fullUrl}`);
    
    let cardHtml;
    try {
      const res = await fetch(fullUrl, { headers: { "User-Agent": SCRYDEX_DEFAULT_UA }, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cardHtml = await res.text();
    } catch (err) {
      console.error(`[${setCode}] Failed to fetch card ${card.externalId}:`, err);
      return;
    }

    const rulesRaw = extractDataField(cardHtml, 'rules');
    const flavorTextRaw = extractDataField(cardHtml, 'flavorText');
    const abilityType = extractDataField(cardHtml, 'abilities.type');
    const abilityName = extractDataField(cardHtml, 'abilities.name');
    const abilityText = extractDataField(cardHtml, 'abilities.text');

    if (rulesRaw) {
      card.rules = rulesRaw;
    } else if (card.rules === undefined) {
      card.rules = null;
    }

    if (flavorTextRaw) {
      card.flavorText = flavorTextRaw;
    } else if (card.flavorText === undefined) {
      card.flavorText = null;
    }

    if (abilityName || abilityText || abilityType) {
      card.abilities = [{
        type: abilityType || 'Ability',
        name: abilityName || '',
        text: abilityText || ''
      }];
    } else {
      card.abilities = null;
    }

    updatedCount++;
    // Small delay so we don't completely spam their servers within the limit
    await sleep(200); 
  }));

  await Promise.all(tasks);

  await fs.writeFile(filePath, JSON.stringify(localCards, null, 2), 'utf-8');
  console.log(`[${setCode}] Successfully updated ${updatedCount} cards in ${filePath}`);
}

async function main() {
  const setArg = process.argv.find(a => a.startsWith('--set='));
  const seriesArg = process.argv.find(a => a.startsWith('--series='));
  
  if (!setArg && !seriesArg) {
    console.error('Please provide a --set or --series argument.');
    console.error('Example: npx tsx scripts/scrape-scrydex.ts --set=me3');
    console.error('Example: npx tsx scripts/scrape-scrydex.ts --series="Mega Evolution"');
    process.exit(1);
  }

  // 10 concurrent requests globally
  const limit = pLimit(10);
  let setCodes: string[] = [];

  if (seriesArg) {
    const seriesValue = seriesArg.split('=')[1];
    // Remove only leading/trailing quotes if they exist
    const seriesNames = seriesValue.replace(/^["']|["']$/g, '').split(',').map(s => s.trim().toLowerCase());
    
    const setsPath = path.join(process.cwd(), 'r2_backup/data/sets.json');
    const setsData = JSON.parse(await fs.readFile(setsPath, 'utf-8'));
    
    const filteredSets = setsData.filter((s: any) => {
      if (!s.seriesName || !s.setKey) return false;
      const normalizedName = s.seriesName.toLowerCase();
      return seriesNames.includes(normalizedName);
    });

    setCodes = filteredSets.map((s: any) => s.setKey);
      
    if (setCodes.length === 0) {
      console.error(`No sets found for series: ${seriesNames.join(', ')}`);
      process.exit(1);
    }
    console.log(`Found ${setCodes.length} sets for series "${seriesNames.join(', ')}": ${setCodes.join(', ')}`);
  } else if (setArg) {
    setCodes = setArg.split('=')[1].replace(/^["']|["']$/g, '').split(',').map(s => s.trim()).filter(Boolean);
  }

  for (const setCode of setCodes) {
    await processSet(setCode, limit);
  }
}

main();
