import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { estimateCardCollectionBucketsGbp } from "@/lib/collectionMarketValueGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getItemConditionName } from "@/lib/referenceData";
import { mergeSealedCollectionForGrid } from "@/lib/sealedCustomerItems";
import { fetchSealedCollectionLines, resolveSealedProductsByIds } from "@/lib/sealedCustomerItemsServer";
import { estimateSealedMarketValueGbp } from "@/lib/sealedMarketValueGbp";
import { mapCustomerCollectionRow, type StorefrontCardEntry } from "@/lib/storefrontCardMaps";
import { createSupabaseRouteHandlerClient, jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  if (!customer) {
    return jsonResponseWithAuthCookies({ error: "Unauthorized" }, authCookieResponse, { status: 401 });
  }

  const { supabase } = createSupabaseRouteHandlerClient(request);

  const [collectionsRes, sealedLines, multipliers] = await Promise.all([
    supabase
      .from("customer_collections")
      .select(
        "id, master_card_id, quantity, printing, language, added_at, condition_id, purchase_type, price_paid, unlisted_price, grading_company, grade_value, graded_image, graded_serial",
      )
      .eq("customer_id", customer.id)
      .limit(2000),
    fetchSealedCollectionLines(customer.id),
    fetchGbpConversionMultipliers(),
  ]);

  const entries: StorefrontCardEntry[] = (collectionsRes.data ?? [])
    .map((row) => {
      const conditionName = getItemConditionName(row.condition_id as string | null);
      return mapCustomerCollectionRow(row as unknown as Record<string, unknown>, conditionName);
    })
    .filter((entry): entry is StorefrontCardEntry => Boolean(entry));

  const cardCount = entries.reduce((sum, entry) => {
    const quantity =
      typeof entry.quantity === "number" && Number.isFinite(entry.quantity) && entry.quantity >= 1
        ? Math.floor(entry.quantity)
        : 1;
    return sum + quantity;
  }, 0);

  const sealedProductIds = [...new Set(sealedLines.map((l) => l.sealedProductId))];
  const sealedProductMap = await resolveSealedProductsByIds(sealedProductIds);
  const sealedForGrid = mergeSealedCollectionForGrid(sealedLines, sealedProductMap);
  const sealedCopyCount = sealedForGrid.reduce((sum, g) => sum + g.sealedQuantity, 0);

  const [cardBuckets, sealedValueGbp] = await Promise.all([
    entries.length > 0 ? estimateCardCollectionBucketsGbp(entries) : Promise.resolve({
        singleCardsGbp: 0,
        gradedCardsGbp: 0,
        rippedGbp: 0,
      }),
    sealedForGrid.length > 0
      ? estimateSealedMarketValueGbp(
          sealedForGrid.map((g) => ({ product: g.product, quantity: g.sealedQuantity })),
          multipliers.usdToGbp,
        )
      : Promise.resolve(0),
  ]);

  const cardsValueGbp =
    cardBuckets.singleCardsGbp + cardBuckets.gradedCardsGbp + cardBuckets.rippedGbp;
  const totalValue = cardsValueGbp + sealedValueGbp;

  return jsonResponseWithAuthCookies(
    {
      totalValue,
      cardCount,
      cardsValueGbp,
      singleCardsValueGbp: cardBuckets.singleCardsGbp,
      gradedCardsValueGbp: cardBuckets.gradedCardsGbp,
      rippedValueGbp: cardBuckets.rippedGbp,
      sealedValueGbp,
      sealedCopyCount,
    },
    authCookieResponse,
  );
}
