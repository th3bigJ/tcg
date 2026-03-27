import type { Payload } from "payload";

import { catalogDocToCardPricingGbpPayload } from "@/lib/catalogPricingStorefrontPayload";
import type { CardPricingGbpPayload } from "@/lib/liveCardPricingGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";

/**
 * Storefront pricing: read only from `catalog-card-pricing` (snapshots populated by refresh jobs).
 */
type ResolveCardPricingInput =
  | string
  | {
      /** Prefer this when set: one indexed lookup on `catalog-card-pricing.master_card_id`. */
      masterCardId?: string | null;
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
  const multipliers = await fetchGbpConversionMultipliers();

  async function payloadFromDoc(doc: Record<string, unknown>): Promise<CardPricingGbpPayload | null> {
    return catalogDocToCardPricingGbpPayload(doc, multipliers);
  }

  if (typeof input !== "string") {
    const masterId = normalizeId(input.masterCardId);
    if (masterId) {
      const byMaster = await payload.find({
        collection: "catalog-card-pricing",
        where: { masterCard: { equals: masterId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        pagination: false,
      });
      const masterDoc = byMaster.docs[0] as Record<string, unknown> | undefined;
      if (masterDoc) {
        const parsed = await payloadFromDoc(masterDoc);
        if (parsed) return parsed;
      }
    }
  }

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
      where: {
        or: [{ externalId: { equals: id } }, { tcgdex_id: { equals: id } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      pagination: false,
    });

    const doc = found.docs[0] as Record<string, unknown> | undefined;
    if (doc) {
      const parsed = await payloadFromDoc(doc);
      if (parsed) return parsed;
    }
  }

  return null;
}
