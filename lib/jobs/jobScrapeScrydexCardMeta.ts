import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry, SeriesJsonEntry } from "../staticDataTypes";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  resolveScrydexCardPath,
} from "../scrydexExpansionListParsing";
import { fetchScrydexCardPageHtml } from "../scrydexMepCardPagePricing";
import { lookupScrydexBulkExpansionConfig } from "../scrydexBulkExpansionUrls";
import { scrydexMegaExpansionConfig, type ScrydexExpansionListConfig } from "../scrydexMegaEvolutionUrls";
import { scrydexScarletVioletExpansionConfig } from "../scrydexScarletVioletUrls";
import {
  isScrydexErrorPage,
  parseScrydexCardAttacks,
  parseScrydexCardId,
  parseScrydexCardRulesFromDetails,
  parseScrydexPrintedNumber,
  parseScrydexSupertype,
} from "../scrydexCardPageCardText";

export interface ScrapeScrydexCardMetaOptions {
  dryRun?: boolean;
  onlySetCodes?: string[];
  onlySeriesNames?: string[];
  /** Label written into the gaps report (e.g. "Batch 1"). */
  batchLabel?: string;
}

// ─── Static data ──────────────────────────────────────────────────────────────

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");
const GAPS_DOC = path.join(process.cwd(), "docs", "scrydex-card-meta-gaps.md");

function loadSets(): SetJsonEntry[] {
  return readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
}

function loadSeries(): SeriesJsonEntry[] {
  return readJson<SeriesJsonEntry[]>(path.join(DATA_DIR, "series.json"));
}

function loadCardsForSet(setCode: string): CardJsonEntry[] {
  const file = path.join(CARDS_DIR, `${setCode}.json`);
  if (!fs.existsSync(file)) return [];
  return readJson<CardJsonEntry[]>(file);
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// ─── Expansion URL resolution (same logic as jobScrapePricing) ────────────────

function resolveExpansionConfig(set: SetJsonEntry): ScrydexExpansionListConfig | null {
  const code = set.code ?? undefined;
  const tcgdexId = set.tcgdexId ?? undefined;
  const candidates = [code, tcgdexId].filter((x): x is string => Boolean(x?.trim()));
  for (const c of candidates) {
    const r = scrydexMegaExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  for (const c of candidates) {
    const r = scrydexScarletVioletExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  for (const c of candidates) {
    const r = lookupScrydexBulkExpansionConfig(c, undefined, undefined);
    if (r) return r;
  }
  return null;
}

function resolveExpansionConfigs(set: SetJsonEntry): ScrydexExpansionListConfig[] {
  const code = (set.code ?? set.tcgdexId ?? "").trim().toLowerCase();
  if (code === "swsh12.5") {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith/swsh12pt5",
        listPrefix: "swsh12pt5",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith-galarian-gallery/swsh12pt5gg",
        listPrefix: "swsh12pt5gg",
      },
    ];
  }
  if (code === "swsh4.5") {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates/swsh45",
        listPrefix: "swsh45",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates-shiny-vault/swsh45sv",
        listPrefix: "swsh45sv",
      },
    ];
  }

  const cfg = resolveExpansionConfig(set);
  return cfg ? [cfg] : [];
}

// ─── Concurrency ─────────────────────────────────────────────────────────────

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
}

type FailureSample = { setCode: string; masterCardId: string; cardName: string; detail: string };

type SetMetaResult = {
  setCode: string;
  cardsInFile: number;
  cardsUpdated: number;
  noPath: FailureSample[];
  fetchFailed: FailureSample[];
  missingPrintedNumber: FailureSample[];
  missingRulesWhereExpected: FailureSample[];
};

async function fetchCardHtmlBestEffort(path: string): Promise<string> {
  const tryVariants = ["holofoil", "normal"] as const;
  for (const v of tryVariants) {
    try {
      const html = await fetchScrydexCardPageHtml(path, v);
      if (!html || isScrydexErrorPage(html)) continue;
      if (parseScrydexCardId(html)) return html;
    } catch {
      /* try next */
    }
  }
  try {
    const html = await fetchScrydexCardPageHtml(path, "holofoil");
    return isScrydexErrorPage(html) ? "" : html;
  } catch {
    return "";
  }
}

function applyCardUpdates(
  card: CardJsonEntry,
  html: string,
  setName: string,
): { updated: boolean; missingPrinted: boolean; missingRules: boolean } {
  const id = parseScrydexCardId(html);
  if (!id) return { updated: false, missingPrinted: false, missingRules: false };

  const printed = parseScrydexPrintedNumber(html);
  const attacks = parseScrydexCardAttacks(html);
  const rules = parseScrydexCardRulesFromDetails(html);

  let changed = false;

  const nextExternal = id;
  if (card.externalId !== nextExternal) {
    card.externalId = nextExternal;
    changed = true;
  }

  if (printed && printed !== card.cardNumber) {
    card.cardNumber = printed;
    card.fullDisplayName = `${card.cardName} ${printed} ${setName}`.trim();
    changed = true;
  }

  const nextAttacks = attacks.length ? attacks : null;
  const attacksJson = JSON.stringify(card.attacks ?? null);
  const nextAttacksJson = JSON.stringify(nextAttacks);
  if (attacksJson !== nextAttacksJson) {
    card.attacks = nextAttacks;
    changed = true;
  }

  const supertype = parseScrydexSupertype(html);
  const nextRules = rules;
  if (supertype === "Trainer" || nextRules !== null) {
    if (card.rules !== nextRules) {
      card.rules = nextRules;
      changed = true;
    }
  }
  const missingPrinted = !printed;
  const missingRules = supertype === "Trainer" && !rules;

  return { updated: changed, missingPrinted, missingRules };
}

async function scrapeSetMeta(
  set: SetJsonEntry,
  cards: CardJsonEntry[],
  dryRun: boolean,
): Promise<SetMetaResult> {
  const setCode = set.code ?? set.tcgdexId;
  const setName = set.name ?? setCode ?? "";
  const out: SetMetaResult = {
    setCode: setCode ?? "",
    cardsInFile: cards.length,
    cardsUpdated: 0,
    noPath: [],
    fetchFailed: [],
    missingPrintedNumber: [],
    missingRulesWhereExpected: [],
  };
  if (!setCode) return out;

  const configs = resolveExpansionConfigs(set);
  if (!configs.length) {
    return out;
  }

  const tcgPrefixes = [set.code, set.tcgdexId].filter((x): x is string => Boolean(x?.trim()));
  const perPrefix = new Map<string, Map<string, string>>();

  for (const cfg of configs) {
    let expansionHtml: string;
    try {
      expansionHtml = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
    } catch {
      continue;
    }
    perPrefix.set(cfg.listPrefix, parseScrydexExpansionListPaths(expansionHtml, cfg.listPrefix));
  }

  if (!perPrefix.size) {
    console.log(`  [${setCode}] warning — expansion listing fetch produced no paths`);
    return out;
  }

  type Work = { card: CardJsonEntry; path: string };
  const workList: Work[] = [];
  const pathSet = new Set<string>();

  for (const card of cards) {
    const ext = (card.externalId ?? card.tcgdex_id ?? "").trim().toLowerCase();
    if (!ext) continue;

    let foundPath: string | undefined;
    for (const cfg of configs) {
      const pathMap = perPrefix.get(cfg.listPrefix);
      if (!pathMap) continue;
      const p = resolveScrydexCardPath(pathMap, ext, cfg.listPrefix, tcgPrefixes);
      if (p) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      out.noPath.push({
        setCode,
        masterCardId: card.masterCardId,
        cardName: card.cardName,
        detail: `lookup: ${ext}`,
      });
      continue;
    }
    workList.push({ card, path: foundPath });
    pathSet.add(foundPath);
  }

  const conc = Number.parseInt(process.env.SCRYDEX_CARD_META_CONCURRENCY ?? "12", 10);
  const pathHtml = new Map<string, string>();
  const paths = [...pathSet];
  let fetched = 0;
  await mapPool(paths, conc, async (p) => {
    const html = await fetchCardHtmlBestEffort(p);
    pathHtml.set(p, html);
    fetched++;
    if (fetched % 40 === 0 || fetched === paths.length) {
      process.stdout.write(`\r  [${setCode}] fetched ${fetched}/${paths.length} card pages…`);
    }
  });
  if (paths.length) console.log();

  const written = new Map<string, CardJsonEntry>();
  for (const { card, path } of workList) {
    const html = pathHtml.get(path) ?? "";
    if (!html || isScrydexErrorPage(html) || !parseScrydexCardId(html)) {
      out.fetchFailed.push({
        setCode,
        masterCardId: card.masterCardId,
        cardName: card.cardName,
        detail: path,
      });
      continue;
    }

    const prev = written.get(card.masterCardId) ?? card;
    const snapshot = { ...prev };
    const { updated, missingPrinted, missingRules } = applyCardUpdates(snapshot, html, setName);

    if (missingPrinted) {
      out.missingPrintedNumber.push({
        setCode,
        masterCardId: card.masterCardId,
        cardName: card.cardName,
        detail: parseScrydexCardId(html) ?? path,
      });
    }
    if (missingRules) {
      out.missingRulesWhereExpected.push({
        setCode,
        masterCardId: card.masterCardId,
        cardName: card.cardName,
        detail: parseScrydexCardId(html) ?? path,
      });
    }

    if (updated) {
      written.set(card.masterCardId, snapshot);
    }
  }

  if (written.size && !dryRun) {
    const nextRows = cards.map((c) => written.get(c.masterCardId) ?? c);
    writeJson(path.join(CARDS_DIR, `${setCode}.json`), nextRows);
  }

  out.cardsUpdated = written.size;
  return out;
}

function capSamples<T>(arr: T[], max: number): T[] {
  return arr.slice(0, max);
}

function appendGapsReport(
  batchLabel: string | undefined,
  seriesFilter: string | undefined,
  results: SetMetaResult[],
  setsSkippedNoMapping: string[],
): void {
  const iso = new Date().toISOString();
  const label = batchLabel?.trim() || "run";

  let setsProcessed = 0;
  let cardsInScope = 0;
  let cardsUpdated = 0;
  let noPath = 0;
  let fetchFailed = 0;
  let missingPrinted = 0;
  let missingRules = 0;

  const noPathSamples: FailureSample[] = [];
  const fetchSamples: FailureSample[] = [];
  const printedSamples: FailureSample[] = [];
  const rulesSamples: FailureSample[] = [];

  for (const r of results) {
    setsProcessed += 1;
    cardsInScope += r.cardsInFile;
    cardsUpdated += r.cardsUpdated;
    noPath += r.noPath.length;
    fetchFailed += r.fetchFailed.length;
    missingPrinted += r.missingPrintedNumber.length;
    missingRules += r.missingRulesWhereExpected.length;
    noPathSamples.push(...r.noPath);
    fetchSamples.push(...r.fetchFailed);
    printedSamples.push(...r.missingPrintedNumber);
    rulesSamples.push(...r.missingRulesWhereExpected);
  }

  const maxLines = 40;
  const lines: string[] = [];
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## ${label} — ${iso}`);
  lines.push("");
  if (seriesFilter) {
    lines.push(`**Series filter:** ${seriesFilter}`);
    lines.push("");
  }
  lines.push("| Metric | Count |");
  lines.push("| --- | ---: |");
  lines.push(`| Sets with card files processed | ${setsProcessed} |`);
  lines.push(`| Sets skipped (no Scrydex expansion mapping) | ${setsSkippedNoMapping.length} |`);
  lines.push(`| Total card rows in those files | ${cardsInScope} |`);
  lines.push(`| Card rows with ≥1 field change (written unless dry-run) | ${cardsUpdated} |`);
  lines.push(`| Cards with no list path (could not resolve URL) | ${noPath} |`);
  lines.push(`| Cards with fetch/parse failure (no Scrydex id in HTML) | ${fetchFailed} |`);
  lines.push(`| Cards where \`printed_number\` was empty after parse | ${missingPrinted} |`);
  lines.push(`| Trainer cards where Rules text was empty (unexpected) | ${missingRules} |`);
  lines.push("");

  if (setsSkippedNoMapping.length) {
    lines.push("### Sets skipped — no expansion mapping");
    lines.push("");
    for (const s of capSamples(setsSkippedNoMapping, maxLines)) {
      lines.push(`- \`${s}\``);
    }
    if (setsSkippedNoMapping.length > maxLines) {
      lines.push(`- … ${setsSkippedNoMapping.length - maxLines} more`);
    }
    lines.push("");
  }

  const fmt = (title: string, samples: FailureSample[]) => {
    if (!samples.length) return;
    lines.push(`### ${title} (sample, up to ${maxLines})`);
    lines.push("");
    for (const s of capSamples(samples, maxLines)) {
      lines.push(`- **${s.setCode}** ${s.cardName} (\`${s.masterCardId}\`) — ${s.detail}`);
    }
    if (samples.length > maxLines) {
      lines.push(`- … ${samples.length - maxLines} more`);
    }
    lines.push("");
  };

  fmt("No list path", noPathSamples);
  fmt("Fetch / parse failure", fetchSamples);
  fmt("Missing printed_number", printedSamples);
  fmt("Trainer missing rules", rulesSamples);

  fs.appendFileSync(GAPS_DOC, `${lines.join("\n")}\n`, "utf-8");
}

export async function runScrapeScrydexCardMeta(opts: ScrapeScrydexCardMetaOptions = {}): Promise<void> {
  const { dryRun = false, onlySetCodes, onlySeriesNames, batchLabel } = opts;

  const allSets = loadSets();
  let sets = allSets;
  let seriesFilter: string | undefined;

  if (onlySetCodes?.length) {
    const allowed = new Set(onlySetCodes.map((s) => s.toLowerCase()));
    sets = allSets.filter(
      (s) =>
        (s.code && allowed.has(s.code.toLowerCase())) ||
        (s.tcgdexId && allowed.has(s.tcgdexId.toLowerCase())),
    );
    if (!sets.length) throw new Error(`No sets found matching: ${onlySetCodes.join(", ")}`);
  } else if (onlySeriesNames?.length) {
    const allSeries = loadSeries();
    const matchedSeries = new Set(
      allSeries
        .filter((sr) => onlySeriesNames.some((n) => n.toLowerCase() === sr.name.toLowerCase()))
        .map((sr) => sr.name),
    );
    if (!matchedSeries.size) throw new Error(`No series found matching: ${onlySeriesNames.join(", ")}`);
    sets = allSets.filter((s) => s.seriesName && matchedSeries.has(s.seriesName));
    if (!sets.length) throw new Error(`No sets found in series: ${[...matchedSeries].join(", ")}`);
    seriesFilter = onlySeriesNames.join(", ");
  }

  const scopeLabel = onlySetCodes?.length
    ? `sets: ${onlySetCodes.join(", ")}`
    : onlySeriesNames?.length
      ? `series: ${onlySeriesNames.join(", ")}`
      : "all sets";

  console.log(`=== Scrydex card metadata scrape (${scopeLabel}) ===`);
  if (dryRun) console.log("(dry-run: no writes to data/cards)\n");

  const results: SetMetaResult[] = [];
  const setsSkippedNoMapping: string[] = [];

  for (const set of sets) {
    const setCode = set.code ?? set.tcgdexId;
    if (!setCode) continue;
    const cards = loadCardsForSet(setCode);
    if (!cards.length) {
      console.log(`  [${setCode}] skip — no cards in data/cards/${setCode}.json`);
      continue;
    }
    const configs = resolveExpansionConfigs(set);
    if (!configs.length) {
      setsSkippedNoMapping.push(setCode);
      console.log(`  [${setCode}] skip — no Scrydex URL mapped`);
      continue;
    }

    console.log(`  [${setCode}] ${cards.length} cards…`);
    const r = await scrapeSetMeta(set, cards, dryRun);
    results.push(r);
    console.log(
      `  [${setCode}] done — updated ${r.cardsUpdated} rows (${dryRun ? "dry-run" : "disk"}) · no-path ${r.noPath.length} · fetch ${r.fetchFailed.length}`,
    );
  }

  appendGapsReport(batchLabel, seriesFilter, results, setsSkippedNoMapping);

  console.log(`\nGaps appended to: docs/scrydex-card-meta-gaps.md`);
  console.log("Done.");
}
