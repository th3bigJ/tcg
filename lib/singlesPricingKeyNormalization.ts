/**
 * Normalize legacy singles pricing / history keys for **alias matching only** during
 * migration (lowercased intermediate form). Merged output keys use the catalog’s exact
 * `externalId` strings (see `migrateSinglesPricingKeysToCanonical.ts`).
 */

import {
  bulkLegacyMultiDashCardKeyToCatalogForm,
  bulkLegacySetPrefixToCatalogKey,
} from "@/lib/scrydexBulkExpansionUrls";
import { SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES } from "@/lib/scrydexScarletVioletUrls";

/** Inverse of legacy prefixes listed in `CATALOG_PREFIX_TO_LEGACY` in `r2Pricing.ts`. */
const ME_LEGACY_PREFIX_TO_CATALOG: Readonly<Record<string, string>> = {
  me01: "me1",
  me02: "me2",
  "me02.5": "me2pt5",
  me02pt5: "me2pt5",
};

function splitFirstDash(id: string): { pre: string; suf: string } {
  const i = id.indexOf("-");
  if (i <= 0) return { pre: id, suf: "" };
  return { pre: id.slice(0, i), suf: id.slice(i + 1) };
}

function normalizeSetPrefix(pre: string): string {
  let p = pre;
  for (let iter = 0; iter < 6; iter += 1) {
    const lower = p.toLowerCase();
    const me = ME_LEGACY_PREFIX_TO_CATALOG[lower];
    const bulk = bulkLegacySetPrefixToCatalogKey(lower);
    const sv = SCARLET_VIOLET_CARD_KEY_PREFIX_ALIASES[lower];
    const next = me ?? (bulk !== lower ? bulk : undefined) ?? (sv !== undefined && sv !== lower ? sv : undefined);
    if (!next) break;
    p = next;
  }
  return p;
}

function normalizeNumericSuffix(suf: string): string {
  if (/^\d+$/u.test(suf)) {
    const n = Number.parseInt(suf, 10);
    return Number.isFinite(n) ? String(n) : suf;
  }
  return suf;
}

/** e.g. `H09` / `h09` → `h9` (matches lowered catalog `ecard3-h9`). */
function normalizeEcardHoloSuffix(suf: string): string {
  const m = /^h0+(\d+)$/iu.exec(suf);
  if (m) return `h${Number.parseInt(m[1], 10)}`;
  return suf;
}

function normalizeTgGgSvSuffix(preLower: string, suf: string): string {
  const tg = /^tg(\d+)$/iu.exec(suf);
  if (tg && preLower.endsWith("tg")) return `tg${tg[1]}`;

  const gg = /^gg(\d+)$/iu.exec(suf);
  if (gg && preLower.endsWith("gg")) return `gg${gg[1]}`;

  const sv = /^sv(\d+)$/iu.exec(suf);
  if (sv && preLower.endsWith("sv")) return `sv${sv[1]}`;

  return suf;
}

/**
 * Returns a **lowercase** card key comparable to `buildPricingLookupIds` / scraper map keys.
 */
export function normalizeSinglesPricingCardKey(rawKey: string): string {
  let trimmed = rawKey.trim();
  const bulkMulti = bulkLegacyMultiDashCardKeyToCatalogForm(trimmed);
  if (bulkMulti) trimmed = bulkMulti;

  const { pre, suf } = splitFirstDash(trimmed);
  if (!suf) return trimmed.toLowerCase();

  let preNorm = normalizeSetPrefix(pre);
  let preLower = preNorm.toLowerCase();
  let sufNorm = suf;

  if (preLower === "swsh12pt5") {
    const m = /^gg(\d+)$/iu.exec(sufNorm);
    if (m) return `swsh12pt5gg-gg${m[1]}`;
  }
  if (preLower === "swsh45") {
    const m = /^sv(\d+)$/iu.exec(sufNorm);
    if (m) return `swsh45sv-sv${m[1]}`;
  }

  sufNorm = normalizeNumericSuffix(sufNorm);
  if (/^ecard\d+$/iu.test(preLower)) {
    sufNorm = normalizeEcardHoloSuffix(sufNorm.toLowerCase());
  }
  sufNorm = normalizeTgGgSvSuffix(preLower, sufNorm);
  sufNorm = sufNorm.toLowerCase();

  return `${preNorm}-${sufNorm}`.toLowerCase();
}
