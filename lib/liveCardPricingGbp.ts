import TCGdex from "@tcgdex/sdk";

import { fetchGbpConversionMultipliers, multiplyNumericLeaves } from "@/lib/marketPriceExchange";

const tcgdex = new TCGdex("en");

const TCGDEX_SET_PREFIX_NORMALIZATION: Record<string, string> = {
  me1: "me01",
  me2: "me02",
  me2pt5: "me02.5",
};

function buildPricingLookupIds(externalId: string): string[] {
  const id = externalId.trim();
  if (!id) return [];

  const ids = new Set<string>([id]);
  const dashIndex = id.indexOf("-");
  if (dashIndex <= 0) return Array.from(ids);

  const setPrefix = id.slice(0, dashIndex);
  const suffix = id.slice(dashIndex + 1);
  const normalizedPrefix = TCGDEX_SET_PREFIX_NORMALIZATION[setPrefix];
  if (normalizedPrefix && suffix) {
    ids.add(`${normalizedPrefix}-${suffix}`);
  }

  // Older English sets use unpadded card numbers on TCGdex (e.g. base1-1 not base1-001).
  if (/^\d+$/.test(suffix)) {
    const n = Number.parseInt(suffix, 10);
    if (Number.isFinite(n)) {
      const unpadded = `${setPrefix}-${n}`;
      if (unpadded !== id) {
        ids.add(unpadded);
      }
      if (normalizedPrefix) {
        const alt = `${normalizedPrefix}-${n}`;
        ids.add(alt);
      }
    }
  }

  return Array.from(ids);
}

type PricingLookupInput = {
  externalId: string;
  setTcgdexId?: string | null;
  localId?: string | null;
};

function buildCanonicalExternalIdFromSet(input: PricingLookupInput): string | null {
  const setId = typeof input.setTcgdexId === "string" ? input.setTcgdexId.trim() : "";
  if (!setId) return null;

  const ext = input.externalId.trim();
  const extDashIndex = ext.indexOf("-");
  const extSuffix = extDashIndex > 0 ? ext.slice(extDashIndex + 1).trim() : "";
  if (extSuffix) {
    return `${setId}-${extSuffix}`;
  }

  const localId = typeof input.localId === "string" ? input.localId.trim() : "";
  if (!localId) return null;
  return `${setId}-${localId}`;
}

export function extractTcgdexCardPricing(card: unknown): { tcgplayer: unknown; cardmarket: unknown } {
  if (!card || typeof card !== "object" || !("pricing" in card)) {
    return { tcgplayer: null, cardmarket: null };
  }
  const p = (card as { pricing?: unknown }).pricing;
  if (!p || typeof p !== "object") {
    return { tcgplayer: null, cardmarket: null };
  }
  const pr = p as { tcgplayer?: unknown; cardmarket?: unknown };
  return {
    tcgplayer: pr.tcgplayer ?? null,
    cardmarket: pr.cardmarket ?? null,
  };
}

export type CardPricingGbpPayload = {
  tcgplayer: unknown;
  cardmarket: unknown;
  currency: "GBP";
};

/**
 * Fetches the card from TCGdex and returns TCGPlayer + Cardmarket pricing with numbers converted to GBP.
 */
export async function fetchLiveCardPricingGbp(externalId: string): Promise<CardPricingGbpPayload | null> {
  const lookupIds = buildPricingLookupIds(externalId);
  if (lookupIds.length === 0) return null;

  for (const id of lookupIds) {
    try {
      const card = await tcgdex.fetch("cards", id);
      const { tcgplayer, cardmarket } = extractTcgdexCardPricing(card);

      // Treat records with no market payloads as unavailable pricing.
      if (tcgplayer === null && cardmarket === null) {
        continue;
      }

      const { usdToGbp, eurToGbp } = await fetchGbpConversionMultipliers();
      const tcgplayerGbp =
        tcgplayer !== null && tcgplayer !== undefined
          ? multiplyNumericLeaves(tcgplayer, usdToGbp)
          : tcgplayer;
      const cardmarketGbp =
        cardmarket !== null && cardmarket !== undefined
          ? multiplyNumericLeaves(cardmarket, eurToGbp)
          : cardmarket;

      return {
        tcgplayer: tcgplayerGbp,
        cardmarket: cardmarketGbp,
        currency: "GBP",
      };
    } catch {
      // Try next lookup id variant.
    }
  }

  return null;
}

/**
 * Prefer canonical ids built from `sets.tcgdexId` + card suffix/localId, then fall back to legacy ids.
 */
export async function fetchLiveCardPricingGbpForCard(
  input: PricingLookupInput,
): Promise<CardPricingGbpPayload | null> {
  const canonicalFromSet = buildCanonicalExternalIdFromSet(input);
  const lookupIds = new Set<string>();

  if (canonicalFromSet) {
    for (const id of buildPricingLookupIds(canonicalFromSet)) {
      lookupIds.add(id);
    }
  }
  for (const id of buildPricingLookupIds(input.externalId)) {
    lookupIds.add(id);
  }

  const resolvedLookupIds = Array.from(lookupIds);
  if (resolvedLookupIds.length === 0) return null;

  for (const id of resolvedLookupIds) {
    try {
      const card = await tcgdex.fetch("cards", id);
      const { tcgplayer, cardmarket } = extractTcgdexCardPricing(card);

      // Treat records with no market payloads as unavailable pricing.
      if (tcgplayer === null && cardmarket === null) {
        continue;
      }

      const { usdToGbp, eurToGbp } = await fetchGbpConversionMultipliers();
      const tcgplayerGbp =
        tcgplayer !== null && tcgplayer !== undefined
          ? multiplyNumericLeaves(tcgplayer, usdToGbp)
          : tcgplayer;
      const cardmarketGbp =
        cardmarket !== null && cardmarket !== undefined
          ? multiplyNumericLeaves(cardmarket, eurToGbp)
          : cardmarket;

      return {
        tcgplayer: tcgplayerGbp,
        cardmarket: cardmarketGbp,
        currency: "GBP",
      };
    } catch {
      // Try next lookup id variant.
    }
  }

  return null;
}
