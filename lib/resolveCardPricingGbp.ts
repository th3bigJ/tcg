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
type ResolveCardPricingInput =
  | string
  | {
      tcgdexId?: string | null;
      externalId?: string | null;
      legacyExternalId?: string | null;
    };

function normalizeId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function resolveCardPricingGbp(
  payload: Payload,
  input: ResolveCardPricingInput,
): Promise<CardPricingGbpPayload | null> {
  const ids =
    typeof input === "string"
      ? [normalizeId(input)]
      : [
          normalizeId(input.tcgdexId),
          normalizeId(input.externalId),
          normalizeId(input.legacyExternalId),
        ];
  const orderedUniqueIds = [...new Set(ids.filter(Boolean))];
  if (orderedUniqueIds.length === 0) return null;

  for (const id of orderedUniqueIds) {
    const found = await payload.find({
      collection: "catalog-card-pricing",
      where: { externalId: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const doc = found.docs[0] as { pricingGbp?: unknown } | undefined;
    if (doc?.pricingGbp !== undefined && doc.pricingGbp !== null) {
      const parsed = parseStoredPricingGbp(doc.pricingGbp);
      if (parsed) return parsed;
    }
  }

  for (const id of orderedUniqueIds) {
    const live = await fetchLiveCardPricingGbp(id);
    if (live) return live;
  }

  return null;
}
