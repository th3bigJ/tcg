import type { GbpConversionMultipliers } from "@/lib/marketPriceExchange";
import type { CardPricingEntry } from "@/lib/staticDataTypes";
import { canonicalVariantSlugFromCompactLabel } from "@/lib/pricingVariantCompactAliases";
import {
  canonicalScrydexVariantLabel,
  SCRYDEX_FLAT_PSA10_KEY_SUFFIX,
  SCRYDEX_FLAT_ACE10_KEY_SUFFIX,
} from "@/lib/scrydexMepCardPagePricing";

/** Non-variant keys on TCGdex `tcgplayer` objects. */
const TCGPLAYER_SKIP_KEYS = new Set(["updated", "unit"]);

/**
 * TCGPlayer: `marketPrice` per variant key (USD → GBP).
 * Keys are API variant names (e.g. `normal`, `reverse`, `holofoil`).
 */
export function extractTcgplayerMarketPricesGbp(
  tcgplayerRaw: unknown,
  multipliers: GbpConversionMultipliers,
): Record<string, number> | null {
  if (!tcgplayerRaw || typeof tcgplayerRaw !== "object") return null;
  const o = tcgplayerRaw as Record<string, unknown>;
  const out: Record<string, number> = {};
  const { usdToGbp } = multipliers;
  for (const [key, val] of Object.entries(o)) {
    if (TCGPLAYER_SKIP_KEYS.has(key)) continue;
    if (!val || typeof val !== "object") continue;
    const block = val as Record<string, unknown>;
    const mp = block.marketPrice ?? block.market;
    if (typeof mp === "number" && Number.isFinite(mp)) {
      out[key] = mp * usdToGbp;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Cardmarket: `avg` and `avg-holo` only (EUR → GBP).
 */
/**
 * Variant keys available for a `card-pricing` row — union of Scrydex variant slugs and TCGPlayer
 * `marketPrice` / `market` rows (same keys the `/api/card-pricing/*` payload exposes after merging).
 */
export function collectPricingVariantKeys(entry: CardPricingEntry | null | undefined): string[] {
  if (!entry) return [];
  const set = new Set<string>();
  if (entry.scrydex && typeof entry.scrydex === "object") {
    for (const k of Object.keys(entry.scrydex)) {
      if (k) set.add(k);
    }
  }
  if (entry.tcgplayer && typeof entry.tcgplayer === "object") {
    const o = entry.tcgplayer as Record<string, unknown>;
    for (const [key, val] of Object.entries(o)) {
      if (TCGPLAYER_SKIP_KEYS.has(key)) continue;
      if (!val || typeof val !== "object") continue;
      const block = val as Record<string, unknown>;
      const mp = block.marketPrice ?? block.market;
      if (typeof mp === "number" && Number.isFinite(mp)) {
        set.add(key);
      }
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function extractCardmarketAvgsGbp(
  cardmarketRaw: unknown,
  multipliers: GbpConversionMultipliers,
): Record<string, number> | null {
  if (!cardmarketRaw || typeof cardmarketRaw !== "object") return null;
  const o = cardmarketRaw as Record<string, unknown>;
  const out: Record<string, number> = {};
  const { eurToGbp } = multipliers;
  const avg = o.avg;
  if (typeof avg === "number" && Number.isFinite(avg)) {
    out.avg = avg * eurToGbp;
  }
  const avgHolo = o["avg-holo"];
  if (typeof avgHolo === "number" && Number.isFinite(avgHolo)) {
    out["avg-holo"] = avgHolo * eurToGbp;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Per-variant Scrydex scrape: raw (NM/list), PSA 10, and ACE 10 in **USD** (R2 storage). */
type ExternalScrapeVariantNumbers = {
  raw?: number;
  psa10?: number;
  ace10?: number;
};

/**
 * Stable variant slug for JSON storage (e.g. `holofoil`, `reverseHolofoil`, `staffStamp`),
 * aligned with common TCGdex `tcgplayer` keys where possible.
 */
function externalScrapeVariantSlugFromFlatKey(flatKey: string): string {
  const c = canonicalScrydexVariantLabel(flatKey.trim());
  const compact = c.toLowerCase().replace(/[\s-_]+/g, "");
  const canon = canonicalVariantSlugFromCompactLabel(compact);
  if (canon !== null) return canon;
  const parts = c.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return flatKey.trim().toLowerCase();
  return (
    parts[0].toLowerCase() +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join("")
  );
}
