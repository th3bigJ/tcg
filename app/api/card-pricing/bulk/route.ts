import { getCardMapById } from "@/lib/staticCardIndex";
import { getPricingForSet, getPricingForCard } from "@/lib/r2Pricing";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";

function readMarketGbp(
  tcgplayer: unknown,
  cardmarket: unknown,
  scrydex: unknown,
  multipliers: { usdToGbp: number; eurToGbp: number },
): number | null {
  const tp = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tp) {
    for (const block of Object.values(tp)) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const m = b.market ?? b.marketPrice;
      if (typeof m === "number" && Number.isFinite(m)) return m * multipliers.usdToGbp;
    }
  }
  const cm = cardmarket && typeof cardmarket === "object" ? (cardmarket as Record<string, unknown>) : null;
  if (cm) {
    for (const key of ["trendPrice", "trend", "avg30", "averageSellPrice"]) {
      const v = cm[key];
      if (typeof v === "number" && Number.isFinite(v)) return v * multipliers.eurToGbp;
    }
  }
  // Fall back to Scrydex: { [variant]: { raw: number } } — raw is already GBP
  const sc = scrydex && typeof scrydex === "object" ? (scrydex as Record<string, unknown>) : null;
  if (sc) {
    for (const block of Object.values(sc)) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (typeof b.raw === "number" && Number.isFinite(b.raw)) return b.raw;
    }
  }
  return null;
}

/**
 * POST /api/card-pricing/bulk
 * Body: { masterCardIds: string[] }
 * Returns: { prices: Record<string, number> }  — masterCardId → GBP price (only priced cards included)
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: string[] =
    Array.isArray((body as Record<string, unknown>)?.masterCardIds)
      ? ((body as Record<string, unknown>).masterCardIds as unknown[])
          .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          .map((v) => v.trim())
          .slice(0, 300)
      : [];

  if (ids.length === 0) {
    return Response.json({ prices: {} });
  }

  const cardMap = getCardMapById();
  const multipliers = await fetchGbpConversionMultipliers();

  // Group by set to minimise R2 fetches
  const bySet = new Map<string, string[]>(); // setCode → masterCardIds
  for (const mid of ids) {
    const card = cardMap.get(mid);
    if (!card) continue;
    const setCode = card.setCode;
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode)!.push(mid);
  }

  const prices: Record<string, number> = {};
  await Promise.all(
    [...bySet.entries()].map(async ([setCode, mids]) => {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) return;
      for (const mid of mids) {
        const card = cardMap.get(mid);
        if (!card?.externalId) continue;
        const entry = getPricingForCard(pricingMap, card.externalId, card.tcgdex_id ? [card.tcgdex_id] : undefined);
        if (!entry) continue;
        const price = readMarketGbp(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers);
        if (price !== null) prices[mid] = price;
      }
    }),
  );

  return Response.json({ prices }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}
