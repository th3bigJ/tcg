import config from "@payload-config";
import { getPayload } from "payload";

import { resolveCardPricingGbp } from "@/lib/resolveCardPricingGbp";

/** Catalog pricing for a master card (single lookup on `catalog_card_pricing.master_card_id`). */
export async function GET(
  _request: Request,
  context: { params: Promise<{ masterCardId: string }> },
) {
  const { masterCardId: raw } = await context.params;
  const masterCardId = decodeURIComponent(raw ?? "").trim();
  if (!masterCardId) {
    return Response.json(
      { tcgplayer: null, cardmarket: null, currency: "GBP" as const },
      {
        headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
      },
    );
  }

  try {
    const payload = await getPayload({ config });
    const resolved = await resolveCardPricingGbp(payload, { masterCardId });
    if (!resolved) {
      return Response.json(
        { tcgplayer: null, cardmarket: null, currency: "GBP" as const },
        {
          headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
        },
      );
    }
    return Response.json(resolved, {
      headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
    });
  } catch {
    return Response.json(
      { tcgplayer: null, cardmarket: null, currency: "GBP" as const },
      {
        headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
      },
    );
  }
}
