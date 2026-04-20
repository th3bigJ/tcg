/**
 * Scrydex English expansion URLs for Scarlet & Violet block (`listPrefix` = card id prefix on Scrydex).
 * @see https://scrydex.com/pokemon/expansions
 */

import type { ScrydexExpansionListConfig } from "@/lib/scrydexMegaEvolutionUrls";

const BASE = "https://scrydex.com/pokemon/expansions";

/** [tcgdex-style set id, scrydex slug segment, list prefix in card URLs] */
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
];

const SV_BY_CODE: Record<string, ScrydexExpansionListConfig> = (() => {
  const out: Record<string, ScrydexExpansionListConfig> = {};
  for (const [code, slug, prefix] of SV_ROWS) {
    out[code.toLowerCase()] = {
      expansionUrl: `${BASE}/${slug}/${prefix}`,
      listPrefix: prefix,
    };
  }
  return out;
})();

/**
 * Alternate Payload / legacy spellings → canonical catalog set key (e.g. `sv02` → `sv2`).
 * Used for price-history keys, Scrydex URL resolution, and pricing lookups.
 */
export const SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES: Readonly<Record<string, string>> = {
  // Zero-padded without dot
  sv01: "sv1",
  sv02: "sv2",
  sv03: "sv3",
  sv04: "sv4",
  sv05: "sv5",
  sv06: "sv6",
  sv07: "sv7",
  sv08: "sv8",
  sv09: "sv9",
  sv10: "sv10",
  // "pt5" half-sets — dot and no-dot, zero-padded and not
  "sv3.5": "sv3pt5",
  "sv03.5": "sv3pt5",
  sv03pt5: "sv3pt5",
  "sv4.5": "sv4pt5",
  "sv04.5": "sv4pt5",
  sv04pt5: "sv4pt5",
  "sv6.5": "sv6pt5",
  "sv06.5": "sv6pt5",
  sv06pt5: "sv6pt5",
  "sv8.5": "sv8pt5",
  "sv08.5": "sv8pt5",
  sv08pt5: "sv8pt5",
  // sv10.5 variants (White Flare / Black Bolt) — dot and no-dot, zero-padded and not
  "sv10.5w": "rsv10pt5",
  "sv10.5b": "zsv10pt5",
  sv10pt5w: "rsv10pt5",
  sv10pt5b: "zsv10pt5",
};

/** Longest first so `sv06.5-1` resolves to prefix `sv06.5`, not `sv06`. */
const SCARLET_VIOLET_CARD_KEY_PREFIXES_LONG_FIRST: readonly string[] = (() => {
  const s = new Set<string>();
  for (const [a, b] of Object.entries(SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES)) {
    s.add(a.toLowerCase());
    s.add(b.toLowerCase());
  }
  return Array.from(s).sort((x, y) => y.length - x.length);
})();

/**
 * Split a card external id into set prefix + remainder (e.g. `sv06.5-099` → `sv06.5`, `099`).
 * Non–Scarlet & Violet ids fall back to the first `-` boundary.
 */
export function partitionPokemonCardExternalId(id: string): { prefix: string; suffix: string } {
  const lower = id.toLowerCase();
  for (const pl of SCARLET_VIOLET_CARD_KEY_PREFIXES_LONG_FIRST) {
    const pat = `${pl}-`;
    if (lower.startsWith(pat)) {
      return { prefix: id.slice(0, pl.length), suffix: id.slice(pl.length + 1) };
    }
  }
  const dash = id.indexOf("-");
  if (dash <= 0) return { prefix: id, suffix: "" };
  return { prefix: id.slice(0, dash), suffix: id.slice(dash + 1) };
}

/** Catalog set key → legacy prefixes still seen in older pricing / price-history JSON. */
export function scarletVioletLegacyPricingPrefixesByCatalogKey(): Record<string, readonly string[]> {
  const byCanon: Record<string, Set<string>> = {};
  for (const [legacy, canon] of Object.entries(SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES)) {
    const c = canon.toLowerCase();
    const l = legacy.toLowerCase();
    if (l === c) continue;
    byCanon[c] ??= new Set();
    byCanon[c].add(legacy);
  }
  const out: Record<string, readonly string[]> = {};
  for (const [c, set] of Object.entries(byCanon)) {
    out[c] = Array.from(set);
  }
  return out;
}

/** Normalize a card id’s set prefix for SV block (`sv02` → `sv2`); elsewhere returns `prefix` lowercased. */
export function normalizeScarletVioletCardKeySetPrefix(prefix: string): string {
  const lower = prefix.toLowerCase();
  return SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES[lower] ?? lower;
}

function resolveSvKey(raw: string): string | null {
  const k = raw.trim().toLowerCase();
  if (SV_BY_CODE[k]) return k;
  const aliased = SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES[k];
  if (aliased && SV_BY_CODE[aliased]) return aliased;
  return null;
}

export function scrydexScarletVioletExpansionConfig(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  const candidates = [canonicalSetCode, legacyCode, setTcgdexId].filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  for (const c of candidates) {
    const key = resolveSvKey(c);
    if (key) return SV_BY_CODE[key];
  }
  return null;
}
