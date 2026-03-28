/**
 * Fetches per-set pricing JSON from R2.
 * Files are uploaded by scripts/exportPricingJson.ts and updated daily.
 *
 * Each file shape: { [externalId]: { scrydex, tcgplayer, cardmarket } }
 */

import type { CardPricingEntry, SetPricingMap } from "@/lib/staticDataTypes";

export type { CardPricingEntry, SetPricingMap };

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

  const url = `${base}/pricing/${setCode}.json`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 }, // 24h
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
  const direct = pricingMap[externalId];
  if (direct) return direct;

  if (fallbackIds) {
    for (const id of fallbackIds) {
      const match = pricingMap[id];
      if (match) return match;
    }
  }

  return null;
}
