import type { SupabaseClient } from "@supabase/supabase-js";

import { estimateCardCollectionBucketsGbp } from "@/lib/collectionMarketValueGbp";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import type { PortfolioSnapshotPoint } from "@/lib/portfolioSnapshotTypes";
import { mergeSealedCollectionForGrid } from "@/lib/sealedCustomerItems";
import {
  fetchSealedCollectionLinesWithSupabase,
  resolveSealedProductsByIds,
} from "@/lib/sealedCustomerItemsServer";
import { estimateSealedMarketValueGbp } from "@/lib/sealedMarketValueGbp";
import { fetchCollectionCardEntriesWithSupabase } from "@/lib/storefrontCardMapsServer";
import { transactionFourWayCategoryFromProductTypeId } from "@/lib/transactionFourWay";

const TXN_PAGE = 1000;

function utcDateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

type TxnRow = {
  direction: string;
  quantity: number;
  unit_price: number;
  product_type_id: string | null;
  sealed_state: string | null;
};

async function fetchAllTransactionsForCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<TxnRow[]> {
  const out: TxnRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("account_transactions")
      .select("direction, quantity, unit_price, product_type_id, sealed_state")
      .eq("customer_id", customerId)
      .order("id", { ascending: true })
      .range(from, from + TXN_PAGE - 1);

    if (error || !data?.length) break;
    for (const row of data) {
      out.push({
        direction: String(row.direction ?? ""),
        quantity:
          typeof row.quantity === "number" && Number.isFinite(row.quantity) && row.quantity >= 1
            ? Math.floor(row.quantity)
            : 1,
        unit_price:
          typeof row.unit_price === "number" && Number.isFinite(row.unit_price) && row.unit_price >= 0
            ? row.unit_price
            : 0,
        product_type_id: row.product_type_id != null ? String(row.product_type_id) : null,
        sealed_state: row.sealed_state != null ? String(row.sealed_state) : null,
      });
    }
    if (data.length < TXN_PAGE) break;
    from += TXN_PAGE;
  }
  return out;
}

function aggregateSpentSold(rows: TxnRow[]): {
  spent: Record<"single" | "graded" | "sealed" | "ripped", number>;
  sold: Record<"single" | "graded" | "sealed" | "ripped", number>;
} {
  const spent = { single: 0, graded: 0, sealed: 0, ripped: 0 };
  const sold = { single: 0, graded: 0, sealed: 0, ripped: 0 };

  for (const row of rows) {
    const line = row.unit_price * row.quantity;
    const sealedState =
      row.sealed_state === "opened" || row.sealed_state === "sealed" ? row.sealed_state : null;
    const cat = transactionFourWayCategoryFromProductTypeId(row.product_type_id, sealedState);
    if (row.direction === "purchase") {
      spent[cat] += line;
    } else if (row.direction === "sale") {
      sold[cat] += line;
    }
  }
  return { spent, sold };
}

/**
 * Computes one daily snapshot: market value by bucket (from inventory) and lifetime spent/sold by bucket (from transactions).
 */
export async function computePortfolioSnapshotPoint(
  supabase: SupabaseClient,
  customerId: string,
  capturedAt: Date = new Date(),
): Promise<PortfolioSnapshotPoint> {
  const date = utcDateKey(capturedAt);

  const [collectionEntries, sealedLines, multipliers, txnRows] = await Promise.all([
    fetchCollectionCardEntriesWithSupabase(supabase, customerId),
    fetchSealedCollectionLinesWithSupabase(supabase, customerId),
    fetchGbpConversionMultipliers(),
    fetchAllTransactionsForCustomer(supabase, customerId),
  ]);

  const { spent, sold } = aggregateSpentSold(txnRows);

  const cardBuckets =
    collectionEntries.length > 0
      ? await estimateCardCollectionBucketsGbp(collectionEntries)
      : { singleCardsGbp: 0, gradedCardsGbp: 0, rippedGbp: 0 };

  const sealedProductIds = [...new Set(sealedLines.map((l) => l.sealedProductId))];
  const sealedProductMap = await resolveSealedProductsByIds(sealedProductIds);
  const sealedForGrid = mergeSealedCollectionForGrid(sealedLines, sealedProductMap);

  const sealedValueGbp =
    sealedForGrid.length > 0
      ? await estimateSealedMarketValueGbp(
          sealedForGrid.map((g) => ({ product: g.product, quantity: g.sealedQuantity })),
          multipliers.usdToGbp,
        )
      : 0;

  const totalValueGbp =
    cardBuckets.singleCardsGbp + cardBuckets.gradedCardsGbp + cardBuckets.rippedGbp + sealedValueGbp;

  return {
    date,
    capturedAt: capturedAt.toISOString(),
    totalValueGbp,
    groups: {
      single: {
        valueGbp: cardBuckets.singleCardsGbp,
        spentGbp: spent.single,
        soldGbp: sold.single,
      },
      graded: {
        valueGbp: cardBuckets.gradedCardsGbp,
        spentGbp: spent.graded,
        soldGbp: sold.graded,
      },
      sealed: {
        valueGbp: sealedValueGbp,
        spentGbp: spent.sealed,
        soldGbp: sold.sealed,
      },
      ripped: {
        valueGbp: cardBuckets.rippedGbp,
        spentGbp: spent.ripped,
        soldGbp: sold.ripped,
      },
    },
  };
}
