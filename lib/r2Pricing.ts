/**
 * Fetches per-set pricing JSON from R2 (`pricing/card-pricing/{setCode}.json`).
 * Updated by the pricing scrape job (`jobScrapePricing` / `scrape:pricing`).
 *
 * Each file shape: { [externalId]: { scrydex, tcgplayer, cardmarket } } — `scrydex` variant figures are **USD**.
 */

import { r2SinglesCardPricingPrefix } from "@/lib/r2BucketLayout";
import type { CardPricingEntry, SetPricingMap } from "@/lib/staticDataTypes";

export type { CardPricingEntry, SetPricingMap };

const TCGDEX_SET_PREFIX_NORMALIZATION: Record<string, string> = {
  me1: "me01",
  me2: "me02",
  me2pt5: "me02.5",
  me3: "me03",
};

export function buildPricingLookupIds(externalId: string): string[] {
  const id = externalId.trim();
  if (!id) return [];

  const ids = new Set<string>([id, id.toLowerCase()]);
  const dashIndex = id.indexOf("-");
  if (dashIndex <= 0) return Array.from(ids);

  const setPrefix = id.slice(0, dashIndex);
  const suffix = id.slice(dashIndex + 1);
  const normalizedPrefix = TCGDEX_SET_PREFIX_NORMALIZATION[setPrefix];

  if (normalizedPrefix && suffix) {
    ids.add(`${normalizedPrefix}-${suffix}`);
    ids.add(`${normalizedPrefix}-${suffix.toLowerCase()}`);
  }

  if (/^\d+$/u.test(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n)) {
      ids.add(`${setPrefix}-${n}`);
      if (normalizedPrefix) {
        ids.add(`${normalizedPrefix}-${n}`);
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
