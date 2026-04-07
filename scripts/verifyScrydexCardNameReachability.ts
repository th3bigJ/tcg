/**
 * Read-only: for every catalog card, resolve the Scrydex card detail URL (via expansion
 * listings), fetch the page, and confirm the dev-pane **name** field is present.
 *
 * Writes a Markdown report (--out). Does not modify catalog or pricing data.
 *
 * Scope matches `scripts/scrapePricing.ts`: optional `--set=` and `--series=` (comma-separated
 * series **names**, same as docs/scraper.md batches).
 *
 * Usage:
 *   node --import tsx/esm scripts/verifyScrydexCardNameReachability.ts --out=docs/scrydex-card-name-verification.md
 *   node --import tsx/esm scripts/verifyScrydexCardNameReachability.ts --set=sv1,mep --out=docs/scrydex-sample.md
 *   node --import tsx/esm scripts/verifyScrydexCardNameReachability.ts --series="Scarlet & Violet" --out=docs/scrydex-sv.md
 *
 *   SCRYDEX_VERIFY_CONCURRENCY=10   (default 10)
 */

import fs from "fs";
import path from "path";
import type { CardJsonEntry, SetJsonEntry, SeriesJsonEntry } from "../lib/staticDataTypes";
import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  resolveScrydexCardPath,
} from "../lib/scrydexExpansionListParsing";
import { fetchScrydexCardPageHtml } from "../lib/scrydexMepCardPagePricing";
import { resolveExpansionConfigsForSet } from "../lib/scrydexExpansionConfigsForSet";
import { getSinglesCatalogSetKey } from "../lib/singlesCatalogSetKey";
import { buildScrydexPrefixCandidates, setRowMatchesAllowedSetCodes } from "../lib/scrydexPrefixCandidatesForSet";
import {
  isScrydexErrorPage,
  parseScrydexDevPaneField,
  parseScrydexCardId,
} from "../lib/scrydexCardPageCardText";

const DATA_DIR = path.join(process.cwd(), "data");
const CARDS_DIR = path.join(DATA_DIR, "cards");

const DEFAULT_REPORT = path.join("docs", "scrydex-card-name-verification.md");

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function parseArg(argv: string[], prefix: string): string | undefined {
  const raw = argv.find((a) => a.startsWith(prefix));
  if (!raw) return undefined;
  return raw.slice(prefix.length).trim();
}

function parseSetFilter(argv: string[]): string[] {
  const raw = parseArg(argv, "--set=");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Same shape as `scripts/scrapePricing.ts` — comma-separated series display names. */
function parseSeriesFilter(argv: string[]): string[] {
  const raw = parseArg(argv, "--series=");
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOutPath(argv: string[]): string {
  const p = parseArg(argv, "--out=") ?? "";
  return p.length ? path.resolve(process.cwd(), p) : path.resolve(process.cwd(), DEFAULT_REPORT);
}

function mdEscapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker),
  );
}

async function fetchCardHtmlBestEffort(cardPath: string): Promise<string> {
  const tryVariants = ["holofoil", "normal"] as const;
  for (const v of tryVariants) {
    try {
      const html = await fetchScrydexCardPageHtml(cardPath, v);
      if (!html || isScrydexErrorPage(html)) continue;
      if (parseScrydexCardId(html)) return html;
    } catch {
      /* try next */
    }
  }
  try {
    const html = await fetchScrydexCardPageHtml(cardPath, "holofoil");
    return isScrydexErrorPage(html) ? "" : html;
  } catch {
    return "";
  }
}

type FailReason =
  | "missing_external_id"
  | "no_expansion_config"
  | "expansion_listing_unavailable"
  | "no_listing_path"
  | "fetch_failed"
  | "error_page"
  | "name_not_found";

type Failure = {
  reason: FailReason;
  setKey: string;
  externalId: string;
  masterCardId: string;
  cardName: string;
  scrydexPath?: string;
  detail?: string;
};

function writeReportMd(
  outPath: string,
  startedAt: string,
  finishedAt: string,
  totalRows: number,
  cardsOk: number,
  failures: Failure[],
  uniquePaths: number,
  workListLength: number,
  concurrency: number,
  scopeLines: string[],
): void {
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const byReason: Record<string, Failure[]> = {};
  for (const f of failures) {
    byReason[f.reason] = byReason[f.reason] ?? [];
    byReason[f.reason].push(f);
  }

  const lines: string[] = [
    "# Scrydex card name verification",
    "",
    `Generated: **${finishedAt}** (run started ${startedAt})`,
    "",
    "## Scope",
    "",
    ...scopeLines,
    "",
    "## Summary",
    "",
    "| Metric | Value |",
    "| --- | --- |",
    "| Concurrency | " + concurrency + " |",
    "| Catalog rows (this run) | " + totalRows + " |",
    "| Unique Scrydex card pages fetched | " + uniquePaths + " |",
    "| Catalog rows mapped to a page | " + workListLength + " |",
    "| OK (name field present) | " + cardsOk + " |",
    "| Failed | " + failures.length + " |",
    "",
  ];

  if (failures.length) {
    lines.push("## Failures by reason", "");
    for (const r of Object.keys(byReason).sort()) {
      lines.push(`- **${r}**: ${byReason[r].length}`);
    }
    lines.push("", "## All failures", "");
    lines.push(
      "| Reason | Set | externalId | masterCardId | Scrydex path | Catalog name | Notes |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const f of failures) {
      lines.push(
        [
          f.reason,
          f.setKey,
          f.externalId || "—",
          f.masterCardId,
          f.scrydexPath ? `\`https://scrydex.com${f.scrydexPath}\`` : "—",
          mdEscapeCell(f.cardName),
          mdEscapeCell(f.detail ?? ""),
        ].join(" | "),
      );
    }
  } else {
    lines.push("## Failures", "", "None — every checked card had a readable **name** on its Scrydex page.", "");
  }

  lines.push("");
  fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
}

async function main(): Promise<void> {
  const setFilter = parseSetFilter(process.argv);
  const onlySeriesNames = parseSeriesFilter(process.argv);
  const outPath = parseOutPath(process.argv);
  const conc = Number.parseInt(process.env.SCRYDEX_VERIFY_CONCURRENCY ?? "10", 10);
  const startedAt = new Date().toISOString();

  const sets = readJson<SetJsonEntry[]>(path.join(DATA_DIR, "sets.json"));
  const allSeries = readJson<SeriesJsonEntry[]>(path.join(DATA_DIR, "series.json"));

  let setsToWalk = sets;
  const scopeLines: string[] = [];

  if (setFilter.length) {
    setsToWalk = sets.filter((s) => setRowMatchesAllowedSetCodes(s, setFilter));
    if (!setsToWalk.length) {
      console.error(`No sets found matching: ${setFilter.join(", ")}`);
      process.exit(1);
    }
    scopeLines.push(`- **Sets**: \`${setFilter.join(", ")}\``);
  } else if (onlySeriesNames.length) {
    const matchedSeries = new Set(
      allSeries
        .filter((sr) => onlySeriesNames.some((n) => n.toLowerCase() === sr.name.toLowerCase()))
        .map((sr) => sr.name),
    );
    if (!matchedSeries.size) {
      console.error(`No series found matching: ${onlySeriesNames.join(", ")}`);
      process.exit(1);
    }
    setsToWalk = sets.filter((s) => s.seriesName && matchedSeries.has(s.seriesName));
    if (!setsToWalk.length) {
      console.error(`No sets found in series: ${[...matchedSeries].join(", ")}`);
      process.exit(1);
    }
    scopeLines.push(`- **Series** (same as scrape:pricing): ${onlySeriesNames.join(", ")}`);
  } else {
    scopeLines.push("- **Scope**: all sets");
  }

  const failures: Failure[] = [];
  let totalRows = 0;
  let cardsOk = 0;

  type Work = {
    setKey: string;
    externalId: string;
    masterCardId: string;
    cardName: string;
    path: string;
  };

  const workList: Work[] = [];

  const setsWithCards = setsToWalk.filter((set) => {
    const setCode = getSinglesCatalogSetKey(set);
    if (!setCode) return false;
    return fs.existsSync(path.join(CARDS_DIR, `${setCode}.json`));
  });

  let expansionIdx = 0;
  for (const set of setsToWalk) {
    const setCode = getSinglesCatalogSetKey(set);
    if (!setCode) continue;

    const cardsPath = path.join(CARDS_DIR, `${setCode}.json`);
    if (!fs.existsSync(cardsPath)) continue;

    expansionIdx += 1;
    const cards = readJson<CardJsonEntry[]>(cardsPath);
    const configs = resolveExpansionConfigsForSet(set);

    process.stdout.write(
      `\r[expansions ${expansionIdx}/${setsWithCards.length}] ${setCode} (${cards.length} cards)…`,
    );

    if (!configs.length) {
      for (const card of cards) {
        totalRows += 1;
        const ext = (card.externalId ?? "").trim();
        if (!ext) {
          failures.push({
            reason: "missing_external_id",
            setKey: setCode,
            externalId: "",
            masterCardId: card.masterCardId,
            cardName: card.cardName,
            detail: "cannot resolve Scrydex URL without externalId",
          });
          continue;
        }
        failures.push({
          reason: "no_expansion_config",
          setKey: setCode,
          externalId: ext,
          masterCardId: card.masterCardId,
          cardName: card.cardName,
          detail: "no Scrydex expansion mapping for this set",
        });
      }
      continue;
    }

    const tcgPrefixes = buildScrydexPrefixCandidates(set);
    const perPrefix = new Map<string, Map<string, string>>();
    let anyListing = false;

    for (const cfg of configs) {
      try {
        const expansionHtml = await fetchScrydexExpansionMultiPageHtml(cfg.expansionUrl);
        perPrefix.set(cfg.listPrefix, parseScrydexExpansionListPaths(expansionHtml, cfg.listPrefix));
        anyListing = true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`\n  [${setCode}] expansion fetch failed (${cfg.listPrefix}): ${msg}`);
      }
    }

    if (!anyListing) {
      for (const card of cards) {
        totalRows += 1;
        const ext = (card.externalId ?? "").trim();
        failures.push({
          reason: "expansion_listing_unavailable",
          setKey: setCode,
          externalId: ext,
          masterCardId: card.masterCardId,
          cardName: card.cardName,
          detail: "all expansion listing fetches failed",
        });
      }
      continue;
    }

    for (const card of cards) {
      totalRows += 1;
      const ext = (card.externalId ?? "").trim().toLowerCase();
      if (!ext) {
        failures.push({
          reason: "missing_external_id",
          setKey: setCode,
          externalId: "",
          masterCardId: card.masterCardId,
          cardName: card.cardName,
          detail: "cannot resolve Scrydex URL without externalId",
        });
        continue;
      }

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
        failures.push({
          reason: "no_listing_path",
          setKey: setCode,
          externalId: ext,
          masterCardId: card.masterCardId,
          cardName: card.cardName,
          detail: "card id not found on expansion listing",
        });
        continue;
      }

      workList.push({
        setKey: setCode,
        externalId: ext,
        masterCardId: card.masterCardId,
        cardName: card.cardName,
        path: foundPath,
      });
    }
  }
  if (setsWithCards.length) console.log("\n");

  const pathToWorkers = new Map<string, Work[]>();
  for (const w of workList) {
    const arr = pathToWorkers.get(w.path) ?? [];
    arr.push(w);
    pathToWorkers.set(w.path, arr);
  }
  const uniquePaths = [...pathToWorkers.keys()];
  console.log(
    `Fetching ${uniquePaths.length} unique Scrydex card pages (${workList.length} catalog rows) at concurrency ${conc}…`,
  );

  const pathHtml = new Map<string, string>();
  let done = 0;
  const progressEvery = 50;
  await mapPool(uniquePaths, conc, async (p) => {
    const html = await fetchCardHtmlBestEffort(p);
    pathHtml.set(p, html);
    done += 1;
    if (done % progressEvery === 0 || done === uniquePaths.length) {
      const pct = uniquePaths.length ? Math.round((100 * done) / uniquePaths.length) : 100;
      process.stdout.write(`\r  card pages ${done}/${uniquePaths.length} (${pct}%)`);
    }
  });
  if (uniquePaths.length) console.log();

  for (const w of workList) {
    const html = pathHtml.get(w.path) ?? "";
    if (!html) {
      failures.push({
        reason: "fetch_failed",
        setKey: w.setKey,
        externalId: w.externalId,
        masterCardId: w.masterCardId,
        cardName: w.cardName,
        scrydexPath: w.path,
        detail: "HTTP error or empty response after variant retries",
      });
      continue;
    }
    if (isScrydexErrorPage(html)) {
      failures.push({
        reason: "error_page",
        setKey: w.setKey,
        externalId: w.externalId,
        masterCardId: w.masterCardId,
        cardName: w.cardName,
        scrydexPath: w.path,
        detail: "Scrydex error / maintenance HTML",
      });
      continue;
    }
    const name = parseScrydexDevPaneField(html, "name");
    if (!name) {
      failures.push({
        reason: "name_not_found",
        setKey: w.setKey,
        externalId: w.externalId,
        masterCardId: w.masterCardId,
        cardName: w.cardName,
        scrydexPath: w.path,
        detail: "dev-pane name field missing or empty",
      });
      continue;
    }
    cardsOk += 1;
  }

  const finishedAt = new Date().toISOString();

  writeReportMd(
    outPath,
    startedAt,
    finishedAt,
    totalRows,
    cardsOk,
    failures,
    uniquePaths.length,
    workList.length,
    conc,
    scopeLines,
  );

  console.log("\n=== Scrydex card name reachability (read-only) ===");
  console.log(`Report: ${outPath}`);
  console.log(`Catalog card rows (this run): ${totalRows}`);
  console.log(`OK (name readable on Scrydex): ${cardsOk}`);
  console.log(`Failed: ${failures.length}`);

  if (failures.length) {
    const byReason: Record<string, number> = {};
    for (const f of failures) {
      byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;
    }
    console.log("\nBy reason:");
    for (const r of Object.keys(byReason).sort()) {
      console.log(`  ${r}: ${byReason[r]}`);
    }
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
