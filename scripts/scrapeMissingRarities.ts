import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry } from "../lib/staticDataTypes";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  resolveScrydexCardPath,
} from "../lib/scrydexExpansionListParsing";
import { fetchScrydexCardPageHtml, parseScrydexCardPageRarity } from "../lib/scrydexMepCardPagePricing";
import { resolveExpansionConfigsForSet } from "../lib/scrydexExpansionConfigsForSet";
import { getSinglesCatalogSetKey } from "../lib/singlesCatalogSetKey";
import { buildScrydexPrefixCandidates, setRowMatchesAllowedSetCodes } from "../lib/scrydexPrefixCandidatesForSet";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const dryRun = process.argv.includes("--dry-run");
const includeNone = process.argv.includes("--include-none");
const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? new Set(setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean))
  : null;

const CARDS_DIR = path.join(pokemonLocalDataRoot, "cards");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function loadSets(): SetJsonEntry[] {
  return readJson<SetJsonEntry[]>(path.join(pokemonLocalDataRoot, "sets.json"));
}

function loadCardsForSet(setCode: string): CardJsonEntry[] {
  const filePath = path.join(CARDS_DIR, `${setCode}.json`);
  return readJson<CardJsonEntry[]>(filePath);
}

function shouldBackfill(card: CardJsonEntry): boolean {
  if (card.rarity == null) return true;
  if (includeNone && card.rarity === "None") return true;
  return false;
}

type SetSummary = {
  setCode: string;
  updated: number;
  unresolved: number;
  missingPath: number;
};

async function main(): Promise<void> {
  const sets = loadSets();
  const summaries: SetSummary[] = [];

  for (const set of sets) {
    const setCode = getSinglesCatalogSetKey(set);
    if (!setCode) continue;
    if (onlySetCodes && !setRowMatchesAllowedSetCodes(set, [...onlySetCodes])) continue;

    const filePath = path.join(CARDS_DIR, `${setCode}.json`);
    if (!fs.existsSync(filePath)) continue;

    const cards = loadCardsForSet(setCode);
    const targets = cards.filter(shouldBackfill);
    if (!targets.length) continue;

    const configs = resolveExpansionConfigsForSet(set);
    if (!configs.length) {
      console.log(`[${setCode}] skip: no Scrydex mapping`);
      summaries.push({ setCode, updated: 0, unresolved: targets.length, missingPath: targets.length });
      continue;
    }

    const cfg = configs[0]!;
    console.log(`[${setCode}] fetching expansion listing ${cfg.expansionUrl}`);
    const listHtml = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
    const pathMap = parseScrydexExpansionListPaths(listHtml, cfg.listPrefix);
    const tcgPrefixes = buildScrydexPrefixCandidates(set);

    let updated = 0;
    let unresolved = 0;
    let missingPath = 0;

    for (const card of targets) {
      const externalKey = (card.externalId ?? "").trim();
      if (!externalKey) {
        unresolved += 1;
        console.log(`  - ${card.cardName} ${card.cardNumber}: no external id`);
        continue;
      }

      const pagePath = resolveScrydexCardPath(pathMap, externalKey, cfg.listPrefix, tcgPrefixes);
      if (!pagePath) {
        missingPath += 1;
        unresolved += 1;
        console.log(`  - ${card.cardName} ${card.cardNumber}: no Scrydex path for ${externalKey}`);
        continue;
      }

      try {
        const html = await fetchScrydexCardPageHtml(pagePath);
        const rarity = parseScrydexCardPageRarity(html);
        if (!rarity) {
          unresolved += 1;
          console.log(`  - ${card.cardName} ${card.cardNumber}: no rarity found at ${pagePath}`);
          continue;
        }

        card.rarity = rarity;
        updated += 1;
        console.log(`  + ${card.cardName} ${card.cardNumber}: ${rarity}`);
      } catch (error) {
        unresolved += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.log(`  - ${card.cardName} ${card.cardNumber}: ${message}`);
      }
    }

    if (!dryRun && updated > 0) {
      writeJson(filePath, cards);
    }

    summaries.push({ setCode, updated, unresolved, missingPath });
  }

  console.log("\nSummary");
  for (const summary of summaries) {
    console.log(
      `[${summary.setCode}] updated=${summary.updated} unresolved=${summary.unresolved} missingPath=${summary.missingPath}`,
    );
  }
}

await main();
