import TCGdex from "@tcgdex/sdk";

import { fetchGbpConversionMultipliers, multiplyNumericLeaves } from "@/lib/marketPriceExchange";

const tcgdex = new TCGdex("en");

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
  const id = externalId.trim();
  if (!id) return null;
  try {
    const card = await tcgdex.fetch("cards", id);
    const { tcgplayer, cardmarket } = extractTcgdexCardPricing(card);
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
    return null;
  }
}
