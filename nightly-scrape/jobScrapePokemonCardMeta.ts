import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "./staticDataTypes.js";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  resolveScrydexCardPath,
} from "./scrydexExpansionListParsing.js";
import { fetchScrydexCardPageHtml } from "./scrydexMepCardPagePricing.js";
import { resolveExpansionConfigsForSet } from "./scrydexExpansionConfigsForSet.js";
import { buildScrydexPrefixCandidates } from "./scrydexPrefixCandidatesForSet.js";
import {
  applyScrydexTerminalDataToCard,
  isScrydexErrorPage,
  parseScrydexCardId,
} from "./scrydexCardPageCardText.js";

export interface ScrapePokemonCardMetaOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  /** Repo root for `r2_backup/data` (defaults to cwd/r2_backup). */
  dataRoot?: string;
}

const DEFAULT_DATA_ROOT = path.join(process.cwd(), "r2_backup", "data");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

function variantCandidates(card: CardJsonEntry): string[] {
  const fromPricing = card.pricingVariants?.filter(Boolean) ?? [];
  const ordered = [...fromPricing, "holofoil", "normal", "reverseHolofoil", "default"];
  return [...new Set(ordered.map((v) => v.trim()).filter(Boolean))];
}

async function fetchCardHtmlBestEffort(path: string, card: CardJsonEntry): Promise<string> {
  for (const v of variantCandidates(card)) {
    try {
      const html = await fetchScrydexCardPageHtml(path, v);
      if (!html || isScrydexErrorPage(html)) continue;
      if (parseScrydexCardId(html) || html.includes("data-terminal-trigger-json-value")) return html;
    } catch {
      /* next */
    }
  }
  return "";
}

export async function runScrapePokemonCardMeta(opts: ScrapePokemonCardMetaOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes, dataRoot = DEFAULT_DATA_ROOT } = opts;
  const cardsDir = path.join(dataRoot, "cards");
  const setsFile = path.join(dataRoot, "sets.json");
  const sets = readJson<SetJsonEntry[]>(setsFile);

  let targets = sets;
  if (onlySetCodes?.length) {
    const allowed = new Set(onlySetCodes.map((s) => s.trim().toLowerCase()));
    targets = sets.filter((s) => allowed.has(s.setKey.trim().toLowerCase()));
    if (!targets.length) throw new Error(`No sets in sets.json for: ${onlySetCodes.join(", ")}`);
  }

  const concurrency = Number(process.env.SCRYDEX_CARD_META_CONCURRENCY ?? "8");
  console.log(`=== Pokémon card metadata pass (${onlySetCodes?.join(", ") ?? "all"}) ===`);
  if (dryRun) console.log("(dry-run)\n");

  for (const set of targets) {
    const setKey = set.setKey.trim();
    const cardsPath = path.join(cardsDir, `${setKey}.json`);
    if (!fs.existsSync(cardsPath)) {
      console.log(`  [${setKey}] skip — missing ${cardsPath}`);
      continue;
    }

    const configs = resolveExpansionConfigsForSet(set);
    if (!configs.length) {
      console.log(`  [${setKey}] skip — no Scrydex URL mapped`);
      continue;
    }

    const cards = readJson<CardJsonEntry[]>(cardsPath);
    const tcgPrefixes = buildScrydexPrefixCandidates(set);
    const pathMaps = new Map<string, Map<string, string>>();

    for (const cfg of configs) {
      try {
        const html = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
        pathMaps.set(cfg.listPrefix, parseScrydexExpansionListPaths(html, cfg.listPrefix));
      } catch (e) {
        console.warn(`  [${setKey}] listing failed (${cfg.listPrefix}): ${e instanceof Error ? e.message : e}`);
      }
    }

    if (!pathMaps.size) {
      console.log(`  [${setKey}] skip — no expansion paths`);
      continue;
    }

    type Work = { card: CardJsonEntry; path: string };
    const work: Work[] = [];
    const seenPaths = new Set<string>();

    for (const card of cards) {
      const ext = (card.externalId ?? "").trim().toLowerCase();
      if (!ext) continue;
      let cardPath: string | undefined;
      for (const cfg of configs) {
        const pmap = pathMaps.get(cfg.listPrefix);
        if (!pmap) continue;
        cardPath = resolveScrydexCardPath(pmap, ext, cfg.listPrefix, tcgPrefixes);
        if (cardPath) break;
      }
      if (!cardPath || seenPaths.has(cardPath)) continue;
      seenPaths.add(cardPath);
      work.push({ card, path: cardPath });
    }

    console.log(`  [${setKey}] enriching ${work.length} unique card pages (${cards.length} rows)…`);

    let updatedRows = 0;
    let fetchFailed = 0;
    const byMasterId = new Map(cards.map((c) => [c.masterCardId, { ...c }]));

    await mapPool(work, concurrency, async ({ card, path: cardPath }, index) => {
      if (index > 0 && index % 25 === 0) {
        console.log(`  [${setKey}] ${index}/${work.length}…`);
      }
      const html = await fetchCardHtmlBestEffort(cardPath, card);
      if (!html) {
        fetchFailed++;
        return;
      }
      const row = byMasterId.get(card.masterCardId);
      if (!row) return;
      if (applyScrydexTerminalDataToCard(row, html, set.name)) {
        updatedRows++;
      }
    });

    const nextCards = cards.map((c) => byMasterId.get(c.masterCardId) ?? c);
    if (!dryRun) {
      writeJson(cardsPath, nextCards);
    }

    console.log(
      `  [${setKey}] done — ${updatedRows} rows updated${dryRun ? " (dry-run)" : ""}, ${fetchFailed} fetch failures`,
    );
  }

  console.log("\nDone.");
}
