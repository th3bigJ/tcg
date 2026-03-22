import type { Payload } from "payload";

import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { fetchLiveCardPricingGbp } from "@/lib/liveCardPricingGbp";

function parseStoredPricingGbp(raw: unknown): CardPricingGbpPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    tcgplayer: o.tcgplayer ?? null,
    cardmarket: o.cardmarket ?? null,
    currency: "GBP",
  };
}

/**
 * Storefront pricing: use `catalog-card-pricing` when present, otherwise live TCGdex + FX (same as before).
 */
export async function resolveCardPricingGbp(
  payload: Payload,
  externalId: string,
): Promise<CardPricingGbpPayload | null> {
  const ext = externalId.trim();
  if (!ext) return null;

  const found = await payload.find({
    collection: "catalog-card-pricing",
    where: { externalId: { equals: ext } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = found.docs[0] as { pricingGbp?: unknown } | undefined;
  if (doc?.pricingGbp !== undefined && doc.pricingGbp !== null) {
    const parsed = parseStoredPricingGbp(doc.pricingGbp);
    if (parsed) return parsed;
  }

  return fetchLiveCardPricingGbp(ext);
}
