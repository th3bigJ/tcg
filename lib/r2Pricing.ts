/**
 * Fetches per-set pricing JSON from R2 (`pricing/card-pricing/{setCode}.json`).
 * Updated by the pricing scrape job (`jobScrapePricing` / `scrape:pricing`).
 *
 * Each file shape: { [externalId]: { scrydex, tcgplayer, cardmarket } } — `scrydex` variant figures are **USD**.
 */

import { r2SinglesCardPricingPrefix } from "@/lib/r2BucketLayout";
import {
  normalizeScarletVioletCardKeySetPrefix,
  partitionPokemonCardExternalId,
  scarletVioletLegacyPricingPrefixesByCatalogKey,
} from "@/lib/scrydexScarletVioletUrls";
import type { CardPricingEntry, SetPricingMap } from "@/lib/staticDataTypes";

export type { CardPricingEntry, SetPricingMap };

/**
 * Older price-history / trend maps (and some R2 blobs) keyed cards with TCGdex-style set prefixes
 * (`me01-…`, `me02-…`, `me02.5-…`) while the catalog uses Scrydex `setKey` (`me1`, `me2`, `me2pt5`).
 * Scarlet & Violet zero-padded / dotted legacy prefixes come from `scrydexScarletVioletUrls`.
 */
const CATALOG_PREFIX_TO_LEGACY_PRICING_PREFIXES: Record<string, readonly string[]> = {
  ...scarletVioletLegacyPricingPrefixesByCatalogKey(),
  me1: ["me01"],
  me2: ["me02"],
  me2pt5: ["me02.5"],
};

export function buildPricingLookupIds(externalId: string): string[] {
  const id = externalId.trim();
  if (!id) return [];

  const ids = new Set<string>([id, id.toLowerCase()]);
  const { prefix: setPrefix, suffix } = partitionPokemonCardExternalId(id);
  if (!suffix) return Array.from(ids);

  const canonSetPrefix = normalizeScarletVioletCardKeySetPrefix(setPrefix);

  ids.add(`${canonSetPrefix}-${suffix}`);
  ids.add(`${canonSetPrefix}-${suffix}`.toLowerCase());

  const legacyPrefixes = CATALOG_PREFIX_TO_LEGACY_PRICING_PREFIXES[canonSetPrefix];
  if (legacyPrefixes) {
    for (const lp of legacyPrefixes) {
      ids.add(`${lp}-${suffix}`);
      ids.add(`${lp}-${suffix}`.toLowerCase());
    }
  }

  if (/^\d+$/u.test(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n)) {
      ids.add(`${setPrefix}-${n}`);
      ids.add(`${setPrefix.toLowerCase()}-${n}`);
      ids.add(`${canonSetPrefix}-${n}`);
      ids.add(`${canonSetPrefix}-${n}`.toLowerCase());
      if (legacyPrefixes) {
        for (const lp of legacyPrefixes) {
          ids.add(`${lp}-${n}`);
          ids.add(`${lp}-${n}`.toLowerCase());
        }
      }
    }
  }

  return Array.from(ids);
}

export function setCodeFromExternalId(id: string): string {
  const parts = id.trim().split("-");
  return parts.length > 1 ? parts.slice(0, -1).join("-") : id.trim();
}

function getPricingBaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
}

/**
 * Fetch pricing map for a set from R2.
 * Cached for 24h at the Next.js fetch layer — revalidates after daily pricing refresh.
 * Returns null if the file doesn't exist yet or the request fails.
 */
export async function getPricingForSet(setCode: string): Promise<SetPricingMap | null> {
  const base = getPricingBaseUrl();
  if (!base) return null;

  const url = `${base}/${r2SinglesCardPricingPrefix}/${setCode}.json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: process.env.NODE_ENV === "development" ? 0 : 86400 },
    });
    if (!res.ok) return null;
    return (await res.json()) as SetPricingMap;
  } catch {
    return null;
  }
}

/**
 * Look up a single card's pricing from a pre-fetched set pricing map.
 * Returns null if no pricing found for this card.
 */
export function getPricingForCard(
  pricingMap: SetPricingMap,
  externalId: string,
  fallbackIds?: string[],
): CardPricingEntry | null {
  for (const id of buildPricingLookupIds(externalId)) {
    const match = pricingMap[id];
    if (match) return match;
  }

  if (fallbackIds) {
    for (const fallbackId of fallbackIds) {
      for (const id of buildPricingLookupIds(fallbackId)) {
        const match = pricingMap[id];
        if (match) return match;
      }
    }
  }

  return null;
}
