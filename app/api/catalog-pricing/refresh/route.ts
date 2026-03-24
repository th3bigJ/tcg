import config from "@payload-config";
import { type NextRequest } from "next/server";
import { getPayload } from "payload";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { runMegaEvolutionScrydexCatalogScrape } from "@/lib/megaEvolutionScrydexCatalogScrape";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

/**
 * Scrape Scrydex for **every** Payload set whose tcgdx id maps to a known expansion URL (all series).
 * Writes `externalPrice` / `externalPricing` and updates `master-card-list.no_pricing`.
 */
export async function POST(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, {
      status: 401,
    });
  }

  const payload = await getPayload({ config });

  try {
    const scrydex = await runMegaEvolutionScrydexCatalogScrape(payload, {
      patchExternalEvenIfTcgdex: true,
    });

    return jsonResponseWithAuthCookies(
      {
        ok: true,
        seriesNames: scrydex.seriesNames,
        ...(scrydex.seriesWarnings && scrydex.seriesWarnings.length > 0
          ? { seriesWarnings: scrydex.seriesWarnings }
          : {}),
        scrydex,
      },
      authCookieResponse,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "refresh failed";
    if (message.startsWith("Series not found") || message.includes("No sets found")) {
      return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 404 });
    }
    return jsonResponseWithAuthCookies({ error: message }, authCookieResponse, { status: 500 });
  }
}
