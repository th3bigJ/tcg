import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

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
 * POST /api/card-pricing/bulk
 * Body: { masterCardIds: string[] }
 * Returns: { prices: Record<string, number> }  — masterCardId → GBP price (only priced cards included)
 */
export async function POST(request: NextRequest) {
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
          .slice(0, 300) // safety cap
      : [];

  if (ids.length === 0) {
    return Response.json({ prices: {} });
  }

  const payload = await getPayload({ config });

  const CONCURRENCY = 8;
  const prices: Record<string, number> = {};
  let i = 0;

  async function worker() {
    while (i < ids.length) {
      const idx = i++;
      const masterCardId = ids[idx];
      try {
        const resolved = await resolveCardPricingGbp(payload, { masterCardId });
        if (resolved) {
          const price = readMarketGbp(resolved.tcgplayer, resolved.cardmarket);
          if (price !== null) prices[masterCardId] = price;
        }
      } catch {
        // skip unpriceable cards
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  return Response.json({ prices }, {
    headers: { "Cache-Control": "s-maxage=3600, stale-while-revalidate" },
  });
}
