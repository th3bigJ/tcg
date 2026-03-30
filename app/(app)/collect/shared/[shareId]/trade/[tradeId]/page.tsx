import Link from "next/link";

import { loadSharedCollectionData } from "@/app/(app)/collect/shared/[shareId]/loadSharedCollectionData";
import { SharedTradeDetailClient } from "@/app/(app)/collect/shared/[shareId]/trade/[tradeId]/SharedTradeDetailClient";
import { getCurrentCustomer } from "@/lib/auth";

type PageProps = {
  params: Promise<{ shareId: string; tradeId: string }>;
};

export default async function SharedTradeDetailPage({ params }: PageProps) {
  const { shareId, tradeId } = await params;
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-[var(--mobile-page-top-offset)] text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Trade</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">Sign in to view this trade.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const data = await loadSharedCollectionData(shareId, customer.id);

  return (
    <SharedTradeDetailClient
      shareId={data.shareId}
      tradeId={tradeId}
      viewerCustomerId={data.viewerCustomerId}
      counterpartyDisplayName={data.counterpartyDisplayName}
      viewerCollectionEntries={data.viewerCollectionEntries}
      counterpartyCollectionEntries={data.counterpartyCollectionEntries}
      viewerTradeCardPricesByMasterCardId={data.viewerTradeCardPricesByMasterCardId}
      counterpartyTradeCardPricesByMasterCardId={data.counterpartyTradeCardPricesByMasterCardId}
      setLogosByCode={data.setLogosByCode}
      setSymbolsByCode={data.setSymbolsByCode}
      itemConditions={data.itemConditions}
      viewerTradeCollectionLinesByMasterCardId={data.viewerTradeCollectionLinesByMasterCardId}
      counterpartyTradeCollectionLinesByMasterCardId={data.counterpartyTradeCollectionLinesByMasterCardId}
      viewerTradeManualPriceMasterCardIds={data.viewerTradeManualPriceMasterCardIds}
      counterpartyTradeManualPriceMasterCardIds={data.counterpartyTradeManualPriceMasterCardIds}
      viewerTradeGradingByMasterCardId={data.viewerTradeGradingByMasterCardId}
      counterpartyTradeGradingByMasterCardId={data.counterpartyTradeGradingByMasterCardId}
    />
  );
}
