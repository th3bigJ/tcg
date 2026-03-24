import config from "@payload-config";
import { getPayload } from "payload";

import { fetchLiveCardPricingGbp } from "@/lib/liveCardPricingGbp";
import { resolveCardPricingGbp } from "@/lib/resolveCardPricingGbp";

export async function GET(
  request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  const { externalId: raw } = await context.params;
  const externalId = decodeURIComponent(raw ?? "").trim();
  const fallbackExternalId =
    new URL(request.url).searchParams.get("fallbackExternalId")?.trim() ?? "";
  if (!externalId) {
    return Response.json(
      { tcgplayer: null, cardmarket: null, currency: "GBP" as const },
      {
        headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
      },
    );
  }

  try {
    const payload = await getPayload({ config });
    const resolved = await resolveCardPricingGbp(payload, {
      tcgdexId: externalId,
      externalId,
      legacyExternalId: fallbackExternalId,
    });
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
    const live = (await fetchLiveCardPricingGbp(externalId)) ??
      (fallbackExternalId ? await fetchLiveCardPricingGbp(fallbackExternalId) : null);
    return Response.json(
      live ?? { tcgplayer: null, cardmarket: null, currency: "GBP" as const },
      {
        headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate" },
      },
    );
  }
}
