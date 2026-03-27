/**
 * Scrape Scrydex pricing for all mapped sets, a specific series, or a specific set.
 * Writes `externalPrice` + `externalPricing` on `catalog-card-pricing`. Self-contained.
 *
 * Usage:
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --dry-run
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --set=sv1
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --set=sv1,sv2,sv3
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --series="Scarlet & Violet"
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --series="Mega Evolution,Scarlet & Violet"
 *   node --import tsx/esm scripts/scrapeScrydexPricing.ts --skip-if-tcgdex
 */

import nextEnvImport from "@next/env";
import type { Payload } from "payload";

// ─── CLI args ────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");
const skipIfTcgdex = process.argv.includes("--skip-if-tcgdex");

const setArg = process.argv.find((a) => a.startsWith("--set="));
const onlySetCodes = setArg
  ? setArg.slice("--set=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const seriesArg = process.argv.find((a) => a.startsWith("--series="));
const seriesNames = seriesArg
  ? seriesArg.slice("--series=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

// ─── Scrydex URL registries ───────────────────────────────────────────────────

type ScrydexExpansionListConfig = { expansionUrl: string; listPrefix: string };

const SCRYDEX_BASE = "https://scrydex.com/pokemon/expansions";

const SV_ROWS: readonly [string, string, string][] = [
  ["sv1", "scarlet-violet", "sv1"],
  ["sv2", "paldea-evolved", "sv2"],
  ["sv3", "obsidian-flames", "sv3"],
  ["sv3pt5", "151", "sv3pt5"],
  ["sv4", "paradox-rift", "sv4"],
  ["sv4pt5", "paldean-fates", "sv4pt5"],
  ["sv5", "temporal-forces", "sv5"],
  ["sv6", "twilight-masquerade", "sv6"],
  ["sv6pt5", "shrouded-fable", "sv6pt5"],
  ["sv7", "stellar-crown", "sv7"],
  ["sv8", "surging-sparks", "sv8"],
  ["sv8pt5", "prismatic-evolutions", "sv8pt5"],
  ["sv9", "journey-together", "sv9"],
  ["sv10", "destined-rivals", "sv10"],
  ["rsv10pt5", "white-flare", "rsv10pt5"],
  ["zsv10pt5", "black-bolt", "zsv10pt5"],
  ["svp", "scarlet-violet-black-star-promos", "svp"],
  ["sve", "scarlet-violet-energies", "sve"],
];

const SV_BY_CODE: Record<string, ScrydexExpansionListConfig> = (() => {
  const out: Record<string, ScrydexExpansionListConfig> = {};
  for (const [code, slug, prefix] of SV_ROWS) {
    out[code] = { expansionUrl: `${SCRYDEX_BASE}/${slug}/${prefix}`, listPrefix: prefix };
  }
  return out;
})();

const SV_ALIASES: Record<string, string> = {
  sv01: "sv1", sv02: "sv2", sv03: "sv3", sv04: "sv4", sv05: "sv5",
  sv06: "sv6", sv07: "sv7", sv08: "sv8", sv09: "sv9", sv10: "sv10",
  "sv3.5": "sv3pt5", "sv03.5": "sv3pt5", sv03pt5: "sv3pt5",
  "sv4.5": "sv4pt5", "sv04.5": "sv4pt5", sv04pt5: "sv4pt5",
  "sv6.5": "sv6pt5", "sv06.5": "sv6pt5", sv06pt5: "sv6pt5",
  "sv8.5": "sv8pt5", "sv08.5": "sv8pt5", sv08pt5: "sv8pt5",
  "sv10.5w": "rsv10pt5", sv10pt5w: "rsv10pt5",
  "sv10.5b": "zsv10pt5", sv10pt5b: "zsv10pt5",
};

function resolveSvConfig(raw: string): ScrydexExpansionListConfig | null {
  const k = raw.trim().toLowerCase();
  if (SV_BY_CODE[k]) return SV_BY_CODE[k];
  const aliased = SV_ALIASES[k];
  if (aliased && SV_BY_CODE[aliased]) return SV_BY_CODE[aliased];
  return null;
}

const BULK_ROWS: readonly [string, string, string][] = [
  ["mcd24", "mcdonalds-collection-2024", "mcd24"],
  ["mcd23", "mcdonalds-collection-2023", "mcd23"],
  ["mcd22", "mcdonalds-collection-2022", "mcd22"],
  ["mcd21", "mcdonalds-collection-2021", "mcd21"],
  ["fut20", "pokmon-futsal-collection", "fut20"],
  ["mcd19", "mcdonalds-collection-2019", "mcd19"],
  ["mcd18", "mcdonalds-collection-2018", "mcd18"],
  ["mcd17", "mcdonalds-collection-2017", "mcd17"],
  ["mcd16", "mcdonalds-collection-2016", "mcd16"],
  ["mcd15", "mcdonalds-collection-2015", "mcd15"],
  ["mcd14", "mcdonalds-collection-2014", "mcd14"],
  ["mcd12", "mcdonalds-collection-2012", "mcd12"],
  ["mcd11", "mcdonalds-collection-2011", "mcd11"],
  ["clv", "pokmon-tcg-classic-venusaur", "clv"],
  ["clc", "pokmon-tcg-classic-charizard", "clc"],
  ["clb", "pokmon-tcg-classic-blastoise", "clb"],
  ["ru1", "pokmon-rumble", "ru1"],
  ["wb1", "pok-card-creator-pack", "wb1"],
  ["bp", "best-of-game", "bp"],
  ["base6", "legendary-collection", "base6"],
  ["si1", "southern-islands", "si1"],
  ["swsh12pt5gg", "crown-zenith-galarian-gallery", "swsh12pt5gg"],
  ["swsh12pt5", "crown-zenith", "swsh12pt5"],
  ["swsh12tg", "silver-tempest-trainer-gallery", "swsh12tg"],
  ["swsh12", "silver-tempest", "swsh12"],
  ["swsh11tg", "lost-origin-trainer-gallery", "swsh11tg"],
  ["swsh11", "lost-origin", "swsh11"],
  ["pgo", "pokmon-go", "pgo"],
  ["swsh10tg", "astral-radiance-trainer-gallery", "swsh10tg"],
  ["swsh10", "astral-radiance", "swsh10"],
  ["swsh9tg", "brilliant-stars-trainer-gallery", "swsh9tg"],
  ["swsh9", "brilliant-stars", "swsh9"],
  ["swsh8", "fusion-strike", "swsh8"],
  ["cel25c", "celebrations-classic-collection", "cel25c"],
  ["cel25", "celebrations", "cel25"],
  ["swsh7", "evolving-skies", "swsh7"],
  ["swsh6", "chilling-reign", "swsh6"],
  ["swsh5", "battle-styles", "swsh5"],
  ["swsh45sv", "shining-fates-shiny-vault", "swsh45sv"],
  ["swsh45", "shining-fates", "swsh45"],
  ["swsh4", "vivid-voltage", "swsh4"],
  ["swsh35", "champions-path", "swsh35"],
  ["swsh3", "darkness-ablaze", "swsh3"],
  ["swsh2", "rebel-clash", "swsh2"],
  ["swsh1", "sword-shield", "swsh1"],
  ["swshp", "swsh-black-star-promos", "swshp"],
  ["sm12", "cosmic-eclipse", "sm12"],
  ["sma", "hidden-fates-shiny-vault", "sma"],
  ["sm115", "hidden-fates", "sm115"],
  ["sm11", "unified-minds", "sm11"],
  ["sm10", "unbroken-bonds", "sm10"],
  ["det1", "detective-pikachu", "det1"],
  ["sm9", "team-up", "sm9"],
  ["sm8", "lost-thunder", "sm8"],
  ["sm75", "dragon-majesty", "sm75"],
  ["sm7", "celestial-storm", "sm7"],
  ["sm6", "forbidden-light", "sm6"],
  ["sm5", "ultra-prism", "sm5"],
  ["sm4", "crimson-invasion", "sm4"],
  ["sm35", "shining-legends", "sm35"],
  ["sm3", "burning-shadows", "sm3"],
  ["sm2", "guardians-rising", "sm2"],
  ["smp", "sm-black-star-promos", "smp"],
  ["sm1", "sun-moon", "sm1"],
  ["xy12", "evolutions", "xy12"],
  ["xy11", "steam-siege", "xy11"],
  ["xy10", "fates-collide", "xy10"],
  ["g1", "generations", "g1"],
  ["xy9", "breakpoint", "xy9"],
  ["xy8", "breakthrough", "xy8"],
  ["xy7", "ancient-origins", "xy7"],
  ["xy6", "roaring-skies", "xy6"],
  ["dc1", "double-crisis", "dc1"],
  ["xy5", "primal-clash", "xy5"],
  ["xy4", "phantom-forces", "xy4"],
  ["xy3", "furious-fists", "xy3"],
  ["xy2", "flashfire", "xy2"],
  ["xy1", "xy", "xy1"],
  ["xy0", "kalos-starter-set", "xy0"],
  ["xyp", "xy-black-star-promos", "xyp"],
  ["bw11", "legendary-treasures", "bw11"],
  ["bw10", "plasma-blast", "bw10"],
  ["bw9", "plasma-freeze", "bw9"],
  ["bw8", "plasma-storm", "bw8"],
  ["bw7", "boundaries-crossed", "bw7"],
  ["dv1", "dragon-vault", "dv1"],
  ["bw6", "dragons-exalted", "bw6"],
  ["bw5", "dark-explorers", "bw5"],
  ["bw4", "next-destinies", "bw4"],
  ["bw3", "noble-victories", "bw3"],
  ["bw2", "emerging-powers", "bw2"],
  ["bw1", "black-white", "bw1"],
  ["bwp", "bw-black-star-promos", "bwp"],
  ["col1", "call-of-legends", "col1"],
  ["hgss4", "hstriumphant", "hgss4"],
  ["hgss3", "hsundaunted", "hgss3"],
  ["hgss2", "hsunleashed", "hgss2"],
  ["hsp", "hgss-black-star-promos", "hsp"],
  ["hgss1", "heartgold-soulsilver", "hgss1"],
  ["pl4", "arceus", "pl4"],
  ["pl3", "supreme-victors", "pl3"],
  ["pl2", "rising-rivals", "pl2"],
  ["pl1", "platinum", "pl1"],
  ["dp7", "stormfront", "dp7"],
  ["dp6", "legends-awakened", "dp6"],
  ["dp5", "majestic-dawn", "dp5"],
  ["dp4", "great-encounters", "dp4"],
  ["dp3", "secret-wonders", "dp3"],
  ["dp2", "mysterious-treasures", "dp2"],
  ["dpp", "dp-black-star-promos", "dpp"],
  ["dp1", "diamond-pearl", "dp1"],
  ["ex16", "power-keepers", "ex16"],
  ["ex15", "dragon-frontiers", "ex15"],
  ["ex14", "crystal-guardians", "ex14"],
  ["ex13", "holon-phantoms", "ex13"],
  ["tk2b", "ex-trainer-kit-2-minun", "tk2b"],
  ["tk2a", "ex-trainer-kit-2-plusle", "tk2a"],
  ["ex12", "legend-maker", "ex12"],
  ["ex11", "delta-species", "ex11"],
  ["ex10", "unseen-forces", "ex10"],
  ["ex9", "emerald", "ex9"],
  ["ex8", "deoxys", "ex8"],
  ["ex7", "team-rocket-returns", "ex7"],
  ["ex6", "firered-leafgreen", "ex6"],
  ["ex5", "hidden-legends", "ex5"],
  ["tk1b", "ex-trainer-kit-latios", "tk1b"],
  ["tk1a", "ex-trainer-kit-latias", "tk1a"],
  ["ex4", "team-magma-vs-team-aqua", "ex4"],
  ["ex3", "dragon", "ex3"],
  ["ex2", "sandstorm", "ex2"],
  ["ex1", "ruby-sapphire", "ex1"],
  ["np", "nintendo-black-star-promos", "np"],
  ["pop9", "pop-series-9", "pop9"],
  ["pop8", "pop-series-8", "pop8"],
  ["pop7", "pop-series-7", "pop7"],
  ["pop6", "pop-series-6", "pop6"],
  ["pop5", "pop-series-5", "pop5"],
  ["pop4", "pop-series-4", "pop4"],
  ["pop3", "pop-series-3", "pop3"],
  ["pop2", "pop-series-2", "pop2"],
  ["pop1", "pop-series-1", "pop1"],
  ["ecard3", "skyridge", "ecard3"],
  ["ecard2", "aquapolis", "ecard2"],
  ["ecard1", "expedition-base-set", "ecard1"],
  ["neo4", "neo-destiny", "neo4"],
  ["neo3", "neo-revelation", "neo3"],
  ["neo2", "neo-discovery", "neo2"],
  ["neo1", "neo-genesis", "neo1"],
  ["gym2", "gym-challenge", "gym2"],
  ["gym1", "gym-heroes", "gym1"],
  ["base5", "team-rocket", "base5"],
  ["base4", "base-set-2", "base4"],
  ["base3", "fossil", "base3"],
  ["basep", "wizards-black-star-promos", "basep"],
  ["base2", "jungle", "base2"],
  ["base1", "base", "base1"],
];

const BULK_BY_CODE: Record<string, ScrydexExpansionListConfig> = (() => {
  const out: Record<string, ScrydexExpansionListConfig> = {};
  for (const [code, slug, prefix] of BULK_ROWS) {
    out[code] = { expansionUrl: `${SCRYDEX_BASE}/${slug}/${prefix}`, listPrefix: prefix };
  }
  return out;
})();

const BULK_ALIASES: Record<string, string> = {
  swsh01: "swsh1", swsh02: "swsh2", swsh03: "swsh3", swsh04: "swsh4", swsh05: "swsh5",
  swsh06: "swsh6", swsh07: "swsh7", swsh08: "swsh8", swsh09: "swsh9",
  sm01: "sm1", sm02: "sm2", sm03: "sm3", sm04: "sm4", sm05: "sm5",
  sm06: "sm6", sm07: "sm7", sm08: "sm8", sm09: "sm9", sm10: "sm10", sm11: "sm11", sm12: "sm12",
  xy01: "xy1", xy02: "xy2", xy03: "xy3", xy04: "xy4", xy05: "xy5",
  xy06: "xy6", xy07: "xy7", xy08: "xy8", xy09: "xy9", xy10: "xy10", xy11: "xy11", xy12: "xy12",
  bw01: "bw1", bw02: "bw2", bw03: "bw3", bw04: "bw4", bw05: "bw5",
  bw06: "bw6", bw07: "bw7", bw08: "bw8", bw09: "bw9", bw10: "bw10", bw11: "bw11",
  hgss01: "hgss1", hgss02: "hgss2", hgss03: "hgss3", hgss04: "hgss4",
  pl01: "pl1", pl02: "pl2", pl03: "pl3", pl04: "pl4",
  dp01: "dp1", dp02: "dp2", dp03: "dp3", dp04: "dp4", dp05: "dp5", dp06: "dp6", dp07: "dp7",
  ex01: "ex1", ex02: "ex2", ex03: "ex3", ex04: "ex4", ex05: "ex5",
  ex06: "ex6", ex07: "ex7", ex08: "ex8", ex09: "ex9", ex10: "ex10",
  ex11: "ex11", ex12: "ex12", ex13: "ex13", ex14: "ex14", ex15: "ex15", ex16: "ex16",
  neo01: "neo1", neo02: "neo2", neo03: "neo3", neo04: "neo4",
  gym01: "gym1", gym02: "gym2",
  base01: "base1", base02: "base2", base03: "base3", base04: "base4", base05: "base5", base06: "base6",
  ecard01: "ecard1", ecard02: "ecard2", ecard03: "ecard3",
  pop01: "pop1", pop02: "pop2", pop03: "pop3", pop04: "pop4", pop05: "pop5",
  pop06: "pop6", pop07: "pop7", pop08: "pop8", pop09: "pop9",
  lc: "base6", legendarycollection: "base6",
  // Sword & Shield dot-notation tcgdex_id variants
  "swsh12.5": "swsh12pt5", "swsh4.5": "swsh45", "swsh3.5": "swsh35",
  "swsh10.5": "pgo",
  // Pokémon Futsal alternate id
  fut2020: "fut20",
  // McDonald's Collection tcgdex_id variants (stored as YYYYera in DB)
  "2011bw": "mcd11",
  "2012bw": "mcd12",
  "2014xy": "mcd14",
  "2015xy": "mcd15",
  "2016xy": "mcd16",
  "2017sm": "mcd17",
  "2018sm": "mcd18",
  "2019sm": "mcd19",
  "2021swsh": "mcd21",
};

function resolveBulkConfig(raw: string): ScrydexExpansionListConfig | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (BULK_BY_CODE[k]) return BULK_BY_CODE[k];
  const aliased = BULK_ALIASES[k];
  if (aliased && BULK_BY_CODE[aliased]) return BULK_BY_CODE[aliased];
  return null;
}

function resolveMegaConfig(raw: string): ScrydexExpansionListConfig | null {
  const k = raw.trim().toLowerCase();
  if (k === "mee") return null;
  if (k === "mep") return { expansionUrl: `${SCRYDEX_BASE}/mega-evolution-black-star-promos/mep`, listPrefix: "mep" };
  if (k === "me02.5" || k === "me2pt5") return { expansionUrl: `${SCRYDEX_BASE}/ascended-heroes/me2pt5`, listPrefix: "me2pt5" };
  if (k === "me02" || k === "me2") return { expansionUrl: `${SCRYDEX_BASE}/phantasmal-flames/me2`, listPrefix: "me2" };
  if (k === "me03" || k === "me3") return { expansionUrl: `${SCRYDEX_BASE}/perfect-order/me3`, listPrefix: "me3" };
  if (k === "me01" || k === "me1") return { expansionUrl: `${SCRYDEX_BASE}/mega-evolution/me1`, listPrefix: "me1" };
  return null;
}

function resolveExpansionConfig(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  for (const c of candidates) {
    const mega = resolveMegaConfig(c);
    if (mega) return mega;
  }
  for (const c of candidates) {
    const sv = resolveSvConfig(c);
    if (sv) return sv;
  }
  for (const c of candidates) {
    const bulk = resolveBulkConfig(c);
    if (bulk) return bulk;
  }
  return null;
}

// ─── FX ──────────────────────────────────────────────────────────────────────

type GbpMultipliers = { usdToGbp: number; eurToGbp: number };

async function fetchGbpMultipliers(): Promise<GbpMultipliers> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD,EUR");
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = (await res.json()) as { rates?: { USD?: number; EUR?: number } };
    const usdPerGbp = data.rates?.USD;
    const eurPerGbp = data.rates?.EUR;
    if (!usdPerGbp || !eurPerGbp) throw new Error("Bad rates");
    return { usdToGbp: 1 / usdPerGbp, eurToGbp: 1 / eurPerGbp };
  } catch {
    const usd = Number.parseFloat(process.env.MARKET_PRICE_FALLBACK_USD_TO_GBP ?? "0.79");
    const eur = Number.parseFloat(process.env.MARKET_PRICE_FALLBACK_EUR_TO_GBP ?? "0.85");
    return {
      usdToGbp: Number.isFinite(usd) && usd > 0 ? usd : 0.79,
      eurToGbp: Number.isFinite(eur) && eur > 0 ? eur : 0.85,
    };
  }
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i]);
    }
  }
  const n = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}

// ─── Payload ID helpers ───────────────────────────────────────────────────────

function toRelId(value: string | number | undefined | null): string | number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).trim();
  if (!s) return undefined;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) return n;
  }
  return s;
}

function getDocId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string") return id;
    if (typeof id === "number") return String(id);
  }
  return null;
}

function toDocId(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = getDocId(value);
  if (s !== null) {
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (Number.isSafeInteger(n)) return n;
    }
    return s;
  }
  throw new Error(`Invalid Payload document id: ${String(value)}`);
}

// ─── Scrydex HTML fetching ────────────────────────────────────────────────────

const UA = "Mozilla/5.0 (compatible; TCG-CatalogPricing/1.0) AppleWebKit/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

async function fetchExpansionHtml(expansionUrl: string): Promise<string> {
  const base = new URL(expansionUrl);
  const pathname = base.pathname;
  base.searchParams.delete("page");

  const chunks: string[] = [];
  const firstHtml = await fetchHtml(base.toString());
  chunks.push(firstHtml);

  const pageRe = new RegExp(`${pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?page=(\\d+)`, "gi");
  let maxPage = 1;
  let m: RegExpExecArray | null;
  while ((m = pageRe.exec(firstHtml)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) maxPage = Math.max(maxPage, n);
  }

  for (let p = 2; p <= Math.min(maxPage, 100); p++) {
    const u = new URL(base.toString());
    u.searchParams.set("page", String(p));
    chunks.push(await fetchHtml(u.toString()));
  }

  return chunks.join("\n");
}

// ─── Scrydex HTML parsing ─────────────────────────────────────────────────────

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCardKey(listPrefix: string, cardHrefId: string): string {
  const p = listPrefix.trim().toLowerCase();
  const re = new RegExp(`^${escRe(p)}-([A-Za-z0-9]+)$`, "i");
  const m = cardHrefId.trim().match(re);
  if (!m) return cardHrefId.trim().toLowerCase();
  const suff = m[1];
  const n = Number.parseInt(suff, 10);
  // Numeric suffix: normalise to stripped integer (e.g. "001" → 1)
  if (Number.isFinite(n) && String(n) === String(Number.parseInt(suff, 10))) return `${p}-${n}`;
  // Alphanumeric suffix (e.g. "SWSH001"): keep as-is lowercased
  return `${p}-${suff.toLowerCase()}`;
}

function buildLookupKeys(ext: string, listPrefix: string, tcgPrefixes: string[]): string[] {
  const e = ext.trim().toLowerCase();
  const keys = new Set<string>([e]);
  const di = e.indexOf("-");
  if (di > 0) {
    const suff = e.slice(di + 1);
    const n = Number.parseInt(suff, 10);
    const lp = listPrefix.trim().toLowerCase();
    if (Number.isFinite(n)) {
      // Numeric suffix
      keys.add(`${lp}-${n}`);
      keys.add(`${lp}-${suff}`);
      for (const tp of tcgPrefixes) {
        const t = tp.trim().toLowerCase();
        if (t) { keys.add(`${t}-${n}`); keys.add(`${t}-${suff}`); }
      }
    } else {
      // Alphanumeric suffix (e.g. "swsh001" from "swshp-swsh001")
      keys.add(`${lp}-${suff}`);
      for (const tp of tcgPrefixes) {
        const t = tp.trim().toLowerCase();
        if (t) keys.add(`${t}-${suff}`);
      }
    }
  }
  return [...keys];
}

function parseExpansionListPrices(html: string, listPrefix: string): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const anchorRe = new RegExp(
    `<a[^>]+href="(\\/pokemon\\/cards\\/[^"]+\\/(${escRe(listPrefix.trim())}-[A-Za-z0-9]+))(\\?[^"]*)?"`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const fullId = m[2];
    const query = (m[3] ?? "").replace(/^\?/, "");
    const norm = normalizeCardKey(listPrefix, fullId);
    const slice = html.slice(m.index, m.index + 2500);
    const priceM = slice.match(/<span class="text-body-12 font-bold text-center">([^<]+)<\/span>/);
    const priceDisplay = priceM ? priceM[1].trim() : "";
    let usd: number | null = null;
    if (priceDisplay && priceDisplay !== "N/A") {
      const numM = priceDisplay.replace(/,/g, "").match(/^\$(-?[\d.]+)$/);
      if (numM) { const n = Number.parseFloat(numM[1]); if (Number.isFinite(n)) usd = n; }
    }
    const sp = new URLSearchParams(query);
    const variantRaw = sp.get("variant");
    const variantKey = variantRaw?.trim() || "default";
    let rec = out.get(norm);
    if (!rec) { rec = {}; out.set(norm, rec); }
    if (usd !== null) rec[variantKey] = usd;
  }
  return out;
}

function parseExpansionListPaths(html: string, listPrefix: string): Map<string, string> {
  const out = new Map<string, string>();
  const anchorRe = new RegExp(
    `<a[^>]+href="(\\/pokemon\\/cards\\/[^"]+\\/(${escRe(listPrefix.trim())}-[A-Za-z0-9]+))(\\?[^"]*)?"`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const norm = normalizeCardKey(listPrefix, m[2]);
    if (!out.has(norm)) out.set(norm, m[1]);
  }
  return out;
}

function resolveFromMap<T>(map: Map<string, T>, ext: string, listPrefix: string, tcgPrefixes: string[]): T | undefined {
  for (const k of buildLookupKeys(ext, listPrefix, tcgPrefixes)) {
    const v = map.get(k);
    if (v !== undefined) return v;
  }
  return undefined;
}

// ─── Card page parsing ────────────────────────────────────────────────────────

const PSA10_SUFFIX = " PSA 10";

function canonicalVariantLabel(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/[\s-]+/g, "");
  if (compact === "default") return "default";
  if (compact === "holofoil") return "Holofoil";
  if (compact === "staffstamp") return "Staff Stamp";
  if (compact === "reverseholofoil") return "Reverse Holofoil";
  return raw.trim();
}

function slugFromLabel(label: string): string {
  const compact = label.toLowerCase().replace(/[\s-_]+/g, "");
  if (compact === "default") return "default";
  if (compact === "holofoil") return "holofoil";
  if (compact === "reverseholofoil") return "reverseHolofoil";
  if (compact === "staffstamp") return "staffStamp";
  const parts = label.split(/\s+/).filter(Boolean);
  if (!parts.length) return label.toLowerCase();
  return parts[0].toLowerCase() + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join("");
}

function rawSlugToLabel(slug: string): string {
  if (slug === "staffStamp") return "Staff Stamp";
  if (slug === "holofoil") return "Holofoil";
  if (slug === "reverseHolofoil") return "Reverse Holofoil";
  return slug.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function extractNamedSeriesLast(chartBlock: string, seriesName: string): number | null {
  const marker = `"name":"${seriesName}","data":`;
  const i = chartBlock.indexOf(marker);
  if (i < 0) return null;
  let j = i + marker.length;
  if (chartBlock[j] !== "[") return null;
  j++;
  let depth = 1;
  const start = j;
  while (j < chartBlock.length && depth > 0) {
    if (chartBlock[j] === "[") depth++;
    else if (chartBlock[j] === "]") depth--;
    j++;
  }
  if (depth !== 0) return null;
  const body = chartBlock.slice(start, j - 1);
  let last: number | null = null;
  const re = /\["[^"]*",([\d.]+|null)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] === "null") continue;
    const v = Number.parseFloat(m[1]);
    if (Number.isFinite(v)) last = v;
  }
  return last;
}

function parseCardPageRawNearMintUsd(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of html.split(/new Chartkick\[["']LineChart["']\]\(/)) {
    const idM = part.match(/^"([^"]*Raw_(\w+)_history)"/);
    if (!idM) continue;
    const usd = extractNamedSeriesLast(part, "NM");
    if (usd !== null) out[rawSlugToLabel(idM[2])] = usd;
  }
  return out;
}

function parseCardPagePsa10Usd(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of html.split(/new Chartkick\[["']LineChart["']\]\(/)) {
    const idM = part.match(/^"([^"]*PSA_(\w+)_history)"/);
    if (!idM) continue;
    const usd = extractNamedSeriesLast(part, "PSA 10");
    if (usd !== null) out[`${rawSlugToLabel(idM[2])}${PSA10_SUFFIX}`] = usd;
  }
  if (Object.keys(out).length > 0) return out;
  // DOM fallback
  const domRe = /font-medium">PSA 10<\/span><\/div><div class="flex flex-col text-body-12"><span class="[^"]*text-heading-20">\$([\d.]+)<\/span>/g;
  const prices: number[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = domRe.exec(html)) !== null) {
    const v = Number.parseFloat(dm[1]);
    if (Number.isFinite(v)) prices.push(v);
  }
  if (prices.length !== 1) return out;
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const m = part.match(/^"([^"]*Raw_(\w+)_history)"/);
    if (m) { out[`${rawSlugToLabel(m[2])}${PSA10_SUFFIX}`] = prices[0]; break; }
  }
  return out;
}

function mergeExpansionAndDetailUsd(listUsd: Record<string, number>, detailUsd: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(listUsd)) out[canonicalVariantLabel(k)] = v;
  for (const [k, v] of Object.entries(detailUsd)) out[canonicalVariantLabel(k)] = v;
  return out;
}

function collateFlatToByVariant(flatUsd: Record<string, number>): Record<string, { raw?: number; psa10?: number }> {
  const out: Record<string, { raw?: number; psa10?: number }> = {};
  for (const [k, v] of Object.entries(flatUsd)) {
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    if (k.endsWith(PSA10_SUFFIX)) {
      const slug = slugFromLabel(k.slice(0, -PSA10_SUFFIX.length));
      out[slug] = { ...out[slug], psa10: v };
    } else {
      const slug = slugFromLabel(k);
      out[slug] = { ...out[slug], raw: v };
    }
  }
  return out;
}

function convertByVariantUsdToGbp(
  byVariantUsd: Record<string, { raw?: number; psa10?: number }>,
  m: GbpMultipliers,
): Record<string, { raw?: number; psa10?: number }> {
  const out: Record<string, { raw?: number; psa10?: number }> = {};
  for (const [slug, rec] of Object.entries(byVariantUsd)) {
    const next: { raw?: number; psa10?: number } = {};
    if (typeof rec.raw === "number" && Number.isFinite(rec.raw)) next.raw = rec.raw * m.usdToGbp;
    if (typeof rec.psa10 === "number" && Number.isFinite(rec.psa10)) next.psa10 = rec.psa10 * m.usdToGbp;
    if (Object.keys(next).length > 0) out[slug] = next;
  }
  return out;
}

async function fetchCardPageHtml(path: string): Promise<string> {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const u = new URL(`https://scrydex.com${trimmed}`);
  u.searchParams.set("variant", "holofoil");
  return fetchHtml(u.toString());
}

// ─── Catalog shape check ──────────────────────────────────────────────────────

function hasTcgdexOrCardmarket(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const o = doc as Record<string, unknown>;
  const ep = o.externalPricing ?? o.external_pricing;
  if (!ep || typeof ep !== "object") return false;
  const row = ep as Record<string, unknown>;
  if (row.source === "scrydex") return false;
  const tp = row.tcgplayer;
  const cm = row.cardmarket;
  if (tp && typeof tp === "object" && Object.keys(tp as object).length > 0) return true;
  if (cm && typeof cm === "object" && Object.keys(cm as object).length > 0) return true;
  return false;
}

// ─── Main scrape ──────────────────────────────────────────────────────────────

function cardPageConcurrency(): number {
  const raw = process.env.SCRYDEX_CARD_PAGE_CONCURRENCY;
  const n = raw ? Number.parseInt(raw, 10) : 20;
  return Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 20;
}

type WorkItem = {
  setCode: string;
  expansionUrl: string;
  listPrefix: string;
  tcgPrefixes: string[];
  masterRel: string | number;
  masterDocId: string | number;
  catalogExternalId: string;
  extStored: string;
  tcgdexIdField: string;
};

async function scrape(payload: Payload): Promise<void> {
  const patchAll = !skipIfTcgdex;
  const multipliers = await fetchGbpMultipliers();
  const work: WorkItem[] = [];
  let skippedNoUrl = 0;
  const processedSets: string[] = [];
  const seriesApplied: string[] = [];

  const processSet = async (setRow: Record<string, unknown>, seriesLabel: string): Promise<void> => {
    const legacyCode = typeof setRow.code === "string" && setRow.code.trim() ? setRow.code.trim() : undefined;
    const setTcgdexId = typeof setRow.tcgdexId === "string" && setRow.tcgdexId.trim() ? setRow.tcgdexId.trim() : undefined;
    const canonicalSetCode = setTcgdexId ?? legacyCode;
    if (!canonicalSetCode) return;

    if (onlySetCodes) {
      const allowed = new Set(onlySetCodes.map((s) => s.trim().toLowerCase()));
      const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter((x): x is string => Boolean(x));
      if (!candidates.some((c) => allowed.has(c.trim().toLowerCase()))) return;
    }

    const setId = getDocId(setRow.id) ?? String(setRow.id);
    const setRelId = toRelId(setId);
    if (setRelId === undefined) return;

    const cfg = resolveExpansionConfig(canonicalSetCode, legacyCode, setTcgdexId);
    const cardsResult = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setRelId } },
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });

    if (!cfg) {
      skippedNoUrl += cardsResult.docs.length;
      console.log(`[Scrydex · ${seriesLabel}] skip set ${canonicalSetCode} (no Scrydex expansion URL in registry)`);
      return;
    }

    processedSets.push(canonicalSetCode);
    const tcgPrefixes = [canonicalSetCode, legacyCode, setTcgdexId].filter((x): x is string => Boolean(x?.trim()));

    for (const doc of cardsResult.docs) {
      const row = doc as Record<string, unknown>;
      const tcgdexIdField = typeof row.tcgdex_id === "string" ? row.tcgdex_id.trim() : "";
      const extStored = typeof row.externalId === "string" ? row.externalId.trim() : "";
      const ext = (tcgdexIdField || extStored).trim().toLowerCase();
      const masterId = getDocId(row.id) ?? "";
      const masterRel = toRelId(masterId);
      if (!ext || masterRel === undefined) continue;
      work.push({
        setCode: canonicalSetCode,
        expansionUrl: cfg.expansionUrl,
        listPrefix: cfg.listPrefix,
        tcgPrefixes,
        masterRel,
        masterDocId: toDocId(row.id),
        catalogExternalId: ext,
        extStored,
        tcgdexIdField,
      });
    }
  };

  const allSeriesMode = !seriesNames || seriesNames.length === 0;

  if (allSeriesMode) {
    const setsResult = await payload.find({ collection: "sets", limit: 2000, depth: 0, overrideAccess: true, sort: "name" });
    if (!setsResult.docs.length) throw new Error("No sets found in database.");
    seriesApplied.push("all series");
    console.log(`[Scrydex] all-series mode: ${setsResult.docs.length} sets…`);
    for (const setDoc of setsResult.docs) await processSet(setDoc as Record<string, unknown>, "all series");
  } else {
    for (const seriesName of seriesNames) {
      const seriesResult = await payload.find({
        collection: "series",
        where: { name: { equals: seriesName } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });
      const seriesDoc = seriesResult.docs[0];
      if (!seriesDoc) { console.log(`[Scrydex] skip series "${seriesName}" (not found in Payload)`); continue; }
      const seriesRelId = toRelId(getDocId(seriesDoc.id) ?? "");
      if (seriesRelId === undefined) continue;
      const setsResult = await payload.find({
        collection: "sets",
        where: { serieName: { equals: seriesRelId } },
        limit: 200,
        depth: 0,
        overrideAccess: true,
      });
      if (!setsResult.docs.length) { console.log(`[Scrydex] skip series "${seriesName}" (no sets)`); continue; }
      seriesApplied.push(seriesName);
      console.log(`[Scrydex] series "${seriesName}": ${setsResult.docs.length} set(s)…`);
      for (const setDoc of setsResult.docs) await processSet(setDoc as Record<string, unknown>, seriesName);
    }
    if (!seriesApplied.length) throw new Error("No matching series found in Payload.");
  }

  if (!work.length) {
    console.log("[Scrydex] No cards queued — check set codes / Scrydex URL registry.");
    return;
  }

  // Fetch expansion listing pages
  const uniqueUrls = [...new Set(work.map((w) => w.expansionUrl))];
  console.log(`\n[Scrydex] fetching ${uniqueUrls.length} expansion listing(s)…`);
  const parsedByUrl = new Map<string, { priceMap: Map<string, Record<string, number>>; pathMap: Map<string, string> }>();
  for (const url of uniqueUrls) {
    try {
      const html = await fetchExpansionHtml(url);
      const listPrefix = work.find((w) => w.expansionUrl === url)!.listPrefix;
      parsedByUrl.set(url, {
        priceMap: parseExpansionListPrices(html, listPrefix),
        pathMap: parseExpansionListPaths(html, listPrefix),
      });
      console.log(`[Scrydex] ${url.split("/").at(-1)}: ${parsedByUrl.get(url)!.priceMap.size} tiles`);
    } catch (e) {
      console.log(`[Scrydex] expansion failed ${url}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  // Collect card detail page paths
  const pathsNeeded = new Set<string>();
  for (const w of work) {
    const parsed = parsedByUrl.get(w.expansionUrl);
    if (!parsed) continue;
    const path = resolveFromMap(parsed.pathMap, w.catalogExternalId, w.listPrefix, w.tcgPrefixes);
    if (path) pathsNeeded.add(path);
  }

  const conc = cardPageConcurrency();
  console.log(`\n[Scrydex] fetching ${pathsNeeded.size} card detail page(s) (concurrency=${conc})…`);
  const pathHtml = new Map<string, string>();
  let fetched = 0;
  const total = pathsNeeded.size;
  await mapPool([...pathsNeeded], conc, async (path) => {
    try { pathHtml.set(path, await fetchCardPageHtml(path)); }
    catch { pathHtml.set(path, ""); }
    fetched++;
    if (fetched % 50 === 0 || fetched === total) {
      process.stdout.write(`\r[Scrydex] fetched ${fetched}/${total} card pages…`);
    }
  });
  console.log();

  // Apply pricing
  let skippedNoPrice = 0, skippedTcgdex = 0, markedOk = 0, markedNo = 0, created = 0, updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < work.length; i++) {
    const w = work[i];
    const parsed = parsedByUrl.get(w.expansionUrl);
    if (!parsed) { skippedNoPrice++; continue; }

    const listUsd = resolveFromMap(parsed.priceMap, w.catalogExternalId, w.listPrefix, w.tcgPrefixes) ?? {};
    const path = resolveFromMap(parsed.pathMap, w.catalogExternalId, w.listPrefix, w.tcgPrefixes);
    const pageHtml = path ? (pathHtml.get(path) ?? "") : "";
    const detailUsd = pageHtml ? parseCardPageRawNearMintUsd(pageHtml) : {};
    const psa10Usd = pageHtml ? parseCardPagePsa10Usd(pageHtml) : {};
    const flatUsd = { ...mergeExpansionAndDetailUsd(listUsd, detailUsd), ...psa10Usd };
    const variantsUsd = collateFlatToByVariant(flatUsd);
    const hasPrice = Object.values(variantsUsd).some((r) => Number.isFinite(r.raw) || Number.isFinite(r.psa10));

    // Look up existing catalog row
    const existingResult = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: w.catalogExternalId } },
      limit: 1, depth: 0, overrideAccess: true,
    });
    let existingDoc = existingResult.docs[0];
    if (!existingDoc && w.extStored && w.extStored !== w.catalogExternalId) {
      const r2 = await payload.find({
        collection: "catalog-card-pricing",
        where: { externalId: { equals: w.extStored.toLowerCase() } },
        limit: 1, depth: 0, overrideAccess: true,
      });
      existingDoc = r2.docs[0];
    }

    if (existingDoc && !patchAll && hasTcgdexOrCardmarket(existingDoc)) {
      skippedTcgdex++;
      continue;
    }

    if ((i + 1) % 50 === 0 || i === 0 || i === work.length - 1) {
      console.log(`[Scrydex] apply ${i + 1}/${work.length}…`);
    }

    if (!hasPrice) {
      skippedNoPrice++;
      if (!dryRun) {
        try {
          await payload.update({ collection: "master-card-list", id: w.masterDocId, data: { no_pricing: true }, overrideAccess: true });
          markedNo++;
        } catch (e) { errors.push(`${w.catalogExternalId} master: ${e instanceof Error ? e.message : "error"}`); }
      }
      continue;
    }

    const externalPrice = convertByVariantUsdToGbp(variantsUsd, multipliers);
    const externalPricing = {
      source: "scrydex" as const,
      expansionUrl: w.expansionUrl,
      cardPath: path ?? null,
      detailParsed: Object.keys(detailUsd).length > 0 || Object.keys(psa10Usd).length > 0,
      variantsUsd,
      fetchedAt: new Date().toISOString(),
    };

    if (dryRun) continue;

    try {
      const data = {
        masterCard: w.masterRel,
        externalId: w.catalogExternalId,
        setCode: w.setCode,
        ...(w.tcgdexIdField ? { tcgdex_id: w.tcgdexIdField } : {}),
        tcgplayerPrice: null,
        cardmarketPrice: null,
        externalPricing,
        externalPrice,
      };
      if (existingDoc) {
        await payload.update({ collection: "catalog-card-pricing", id: getDocId(existingDoc.id)!, data, overrideAccess: true });
        updated++;
      } else {
        await payload.create({ collection: "catalog-card-pricing", data: data as never, overrideAccess: true });
        created++;
      }
      try {
        await payload.update({ collection: "master-card-list", id: w.masterDocId, data: { no_pricing: false }, overrideAccess: true });
        markedOk++;
      } catch (e) { errors.push(`${w.catalogExternalId} master: ${e instanceof Error ? e.message : "error"}`); }
    } catch (e) {
      errors.push(`${w.catalogExternalId}: ${e instanceof Error ? e.message : "error"}`);
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Series: ${seriesApplied.join(", ") || "(all)"}`);
  console.log(`Sets scraped: ${[...new Set(processedSets)].join(", ") || "(none)"}`);
  console.log(`Master rows queued: ${work.length}`);
  console.log(`Skipped — no Scrydex expansion URL: ${skippedNoUrl}`);
  console.log(`Skipped — no price found: ${skippedNoPrice}`);
  console.log(`Skipped — TCGdex guard: ${skippedTcgdex}`);
  console.log(`Master no_pricing → false: ${markedOk}, → true: ${markedNo}`);
  if (!dryRun) console.log(`Created: ${created}, updated: ${updated}`);
  if (errors.length) console.log(`Errors (first 8): ${errors.slice(0, 8).join("; ")}`);
  console.log("\nDone.");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { loadEnvConfig } = nextEnvImport as { loadEnvConfig: (dir: string, dev: boolean) => unknown };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  const scopeLabel = seriesNames?.length
    ? `series: ${seriesNames.join(", ")}`
    : onlySetCodes?.length
      ? `sets: ${onlySetCodes.join(", ")}`
      : "all sets / all series";

  console.log(`=== Scrydex scrape (${scopeLabel}) ===\n`);
  if (dryRun) console.log("(dry-run: no database writes)\n");
  if (skipIfTcgdex) console.log("(skip-if-tcgdex: rows with existing TCGdex data skipped)\n");

  try {
    await scrape(payload);
  } finally {
    await payload.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
