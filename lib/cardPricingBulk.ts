import { getCardMapById } from "@/lib/staticCardIndex";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getPricingForCard, getPricingForSet } from "@/lib/r2Pricing";
import type { CardJsonEntry } from "@/lib/staticDataTypes";

export function readMarketGbp(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
  multipliers: { usdToGbp: number; eurToGbp: number },
): number | null {
  const tp =
    tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tp) {
    for (const block of Object.values(tp)) {
      if (!block || typeof block !== "object") continue;
      const value = block as Record<string, unknown>;
      const market = value.market ?? value.marketPrice;
      if (typeof market === "number" && Number.isFinite(market)) {
        return market * multipliers.usdToGbp;
      }
    }
  }

  const cm =
    cardmarket && typeof cardmarket === "object"
      ? (cardmarket as Record<string, unknown>)
      : null;
  if (cm) {
    for (const key of ["trendPrice", "trend", "avg30", "averageSellPrice"]) {
      const value = cm[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value * multipliers.eurToGbp;
      }
    }
  }

  const sc =
    scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;
  if (sc) {
    for (const block of Object.values(sc)) {
      if (!block || typeof block !== "object") continue;
      const value = block as Record<string, unknown>;
      if (typeof value.raw === "number" && Number.isFinite(value.raw)) {
        return value.raw;
      }
    }
  }

  return null;
}

export async function fetchPricesForMasterCardIds(
  masterCardIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(masterCardIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return {};

  const cardMap = getCardMapById();
  const multipliers = await fetchGbpConversionMultipliers();
  const bySet = new Map<string, string[]>();

  for (const masterCardId of ids) {
    const card = cardMap.get(masterCardId);
    if (!card?.setCode) continue;
    const existing = bySet.get(card.setCode) ?? [];
    existing.push(masterCardId);
    bySet.set(card.setCode, existing);
  }

  const prices: Record<string, number> = {};
  await Promise.all(
    [...bySet.entries()].map(async ([setCode, setIds]) => {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) return;

      for (const masterCardId of setIds) {
        const card = cardMap.get(masterCardId);
        const externalId = resolvePricingExternalId(card);
        if (!card || !externalId) continue;
        const pricing = getPricingForCard(
          pricingMap,
          externalId,
          resolvePricingFallbackIds(card, externalId),
        );
        if (!pricing) continue;
        const price = readMarketGbp(
          pricing.tcgplayer,
          pricing.cardmarket,
          pricing.scrydex,
          multipliers,
        );
        if (price !== null) prices[masterCardId] = price;
      }
    }),
  );

  return prices;
}

function resolvePricingExternalId(card: CardJsonEntry | undefined): string | null {
  if (!card) return null;
  const explicit = typeof card.externalId === "string" ? card.externalId.trim() : "";
  if (explicit) return explicit;
  const tcgdex = typeof card.tcgdex_id === "string" ? card.tcgdex_id.trim() : "";
  if (tcgdex) return tcgdex;

  const setTcgdexId = typeof card.setTcgdexId === "string" ? card.setTcgdexId.trim() : "";
  const localId = typeof card.localId === "string" ? card.localId.trim() : "";
  if (setTcgdexId && localId) {
    const normalizedLocalId = /^\d+$/u.test(localId) ? localId.padStart(3, "0") : localId;
    return `${setTcgdexId}-${normalizedLocalId}`;
  }

  return null;
}

function resolvePricingFallbackIds(card: CardJsonEntry, externalId: string): string[] | undefined {
  const candidates = [
    typeof card.tcgdex_id === "string" ? card.tcgdex_id.trim() : "",
    typeof card.externalId === "string" ? card.externalId.trim() : "",
    typeof card.localId === "string" ? card.localId.trim() : "",
  ].filter((value) => value.length > 0 && value !== externalId);

  return candidates.length > 0 ? [...new Set(candidates)] : undefined;
}
