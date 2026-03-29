import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
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
      const r = (block as Record<string, unknown>).raw;
      if (typeof r === "number" && Number.isFinite(r)) return r;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);
  const { data } = await supabase
    .from("customer_collections")
    .select("master_card_id, quantity, graded_market_price, unlisted_price")
    .eq("customer_id", customer.id)
    .limit(2000);

  const qtyByMasterCardId: Record<string, number> = {};
  const manualPriceByMasterCardId: Record<string, number> = {};
  for (const row of data ?? []) {
    const mid = typeof row.master_card_id === "string" ? row.master_card_id.trim() : "";
    const qty = typeof row.quantity === "number" ? row.quantity : 1;
    if (!mid) continue;
    qtyByMasterCardId[mid] = (qtyByMasterCardId[mid] ?? 0) + qty;
    const manual =
      typeof row.graded_market_price === "number" && Number.isFinite(row.graded_market_price)
        ? row.graded_market_price
        : typeof row.unlisted_price === "number" && Number.isFinite(row.unlisted_price)
          ? row.unlisted_price
          : null;
    if (manual !== null) manualPriceByMasterCardId[mid] = manual;
  }

  const masterCardIds = Object.keys(qtyByMasterCardId);
  if (masterCardIds.length === 0) {
    return jsonResponseWithAuthCookies({ totalValue: 0, cardCount: 0 }, authCookieResponse);
  }

  const cardMap = getCardMapById();
  const multipliers = await fetchGbpConversionMultipliers();

  const bySet = new Map<string, string[]>();
  for (const mid of masterCardIds) {
    const card = cardMap.get(mid);
    if (!card) continue;
    if (!bySet.has(card.setCode)) bySet.set(card.setCode, []);
    bySet.get(card.setCode)!.push(mid);
  }

  const prices: Record<string, number> = {};
  await Promise.all(
    [...bySet.entries()].map(async ([setCode, mids]) => {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) return;
      for (const mid of mids) {
        const card = cardMap.get(mid);
        if (!card) continue;
        // Mirror the same ID resolution as mapMasterCardId: tcgdex_id ?? externalId ?? derived
        const tcgdexId = card.tcgdex_id?.trim() || undefined;
        const extId = card.externalId?.trim() || undefined;
        const primaryId = tcgdexId ?? extId;
        if (!primaryId) continue;
        const fallbackIds = tcgdexId && extId ? [extId] : undefined;
        const entry = getPricingForCard(pricingMap, primaryId, fallbackIds);
        if (!entry) continue;
        const price = readMarketGbp(entry.tcgplayer, entry.cardmarket, entry.scrydex, multipliers);
        if (price !== null) prices[mid] = price;
      }
    }),
  );

  let totalValue = 0;
  let cardCount = 0;
  for (const [mid, qty] of Object.entries(qtyByMasterCardId)) {
    cardCount += qty;
    const price = prices[mid] ?? manualPriceByMasterCardId[mid];
    if (price !== undefined) totalValue += price * qty;
  }

  return jsonResponseWithAuthCookies({ totalValue, cardCount }, authCookieResponse);
}
