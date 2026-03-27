import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "@/lib/relationshipId";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";
import { resolveCardPricingGbp } from "@/lib/resolveCardPricingGbp";

function readMarketGbp(tcgplayer: unknown, cardmarket: unknown): number | null {
  const tp = tcgplayer && typeof tcgplayer === "object" ? (tcgplayer as Record<string, unknown>) : null;
  if (tp) {
    for (const block of Object.values(tp)) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const m = b.market ?? b.marketPrice;
      if (typeof m === "number" && Number.isFinite(m)) return m;
    }
  }
  const cm = cardmarket && typeof cardmarket === "object" ? (cardmarket as Record<string, unknown>) : null;
  if (cm) {
    for (const key of ["trendPrice", "trend", "avg30", "averageSellPrice"]) {
      const v = cm[key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

/**
 * GET /api/collection-value
 * Returns the total market value of the authenticated customer's collection.
 * { totalValue: number, cardCount: number }
 */
export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const payload = await getPayload({ config });
  const customerRelId = toPayloadRelationshipId(customer.id) ?? customer.id;

  // Fetch all collection entries with masterCard ids and quantities
  const result = await payload.find({
    collection: "customer-collections",
    where: { customer: { equals: customerRelId } },
    depth: 0,
    limit: 2000,
    overrideAccess: true,
    select: { masterCard: true, quantity: true },
  });

  // Aggregate quantities per masterCardId
  const qtyByMasterCardId: Record<string, number> = {};
  for (const doc of result.docs) {
    const mid = getRelationshipDocumentId((doc as { masterCard?: unknown }).masterCard);
    const qty = typeof (doc as { quantity?: unknown }).quantity === "number"
      ? (doc as { quantity: number }).quantity
      : 1;
    if (mid) {
      qtyByMasterCardId[mid] = (qtyByMasterCardId[mid] ?? 0) + qty;
    }
  }

  const masterCardIds = Object.keys(qtyByMasterCardId);
  if (masterCardIds.length === 0) {
    return jsonResponseWithAuthCookies({ totalValue: 0, cardCount: 0 }, authCookieResponse);
  }

  // Price each card concurrently
  const CONCURRENCY = 8;
  const prices: Record<string, number> = {};
  let i = 0;

  async function worker() {
    while (i < masterCardIds.length) {
      const idx = i++;
      const masterCardId = masterCardIds[idx];
      try {
        const resolved = await resolveCardPricingGbp(payload, { masterCardId });
        if (resolved) {
          const price = readMarketGbp(resolved.tcgplayer, resolved.cardmarket);
          if (price !== null) prices[masterCardId] = price;
        }
      } catch {
        // unpriceable — skip
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Sum: price × quantity for each priced card
  let totalValue = 0;
  let cardCount = 0;
  for (const [mid, qty] of Object.entries(qtyByMasterCardId)) {
    cardCount += qty;
    const price = prices[mid];
    if (price !== undefined) totalValue += price * qty;
  }

  return jsonResponseWithAuthCookies(
    { totalValue, cardCount },
    authCookieResponse,
    // Cache briefly — pricing calls are expensive
  );
}
