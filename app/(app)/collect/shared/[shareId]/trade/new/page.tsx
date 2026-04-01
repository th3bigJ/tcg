import Link from "next/link";

import { NewTradeWizardClient } from "@/app/(app)/collect/shared/[shareId]/trade/new/NewTradeWizardClient";
import { loadSharedCollectionData } from "@/app/(app)/collect/shared/[shareId]/loadSharedCollectionData";
import { getCurrentCustomer } from "@/lib/auth";

type PageProps = {
  params: Promise<{ shareId: string }>;
  searchParams?: Promise<{ amend?: string }>;
};

export default async function SharedCollectionNewTradePage({ params, searchParams }: PageProps) {
  const { shareId } = await params;
  const sp = (await searchParams) ?? {};
  const amendRaw = typeof sp.amend === "string" ? sp.amend.trim() : "";
  const amendTradeId = amendRaw.length > 0 ? amendRaw : null;
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-2 text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">New trade</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">Sign in to start a trade.</p>
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
    <NewTradeWizardClient
      shareId={data.shareId}
      counterpartyDisplayName={data.counterpartyDisplayName}
      viewerCollectionEntries={data.viewerCollectionEntries}
      counterpartyCollectionEntries={data.counterpartyCollectionEntries}
      setLogosByCode={data.setLogosByCode}
      setSymbolsByCode={data.setSymbolsByCode}
      itemConditions={data.itemConditions}
      viewerTradeGridCards={data.viewerTradeGridCards}
      viewerTradeCardPricesByMasterCardId={data.viewerTradeCardPricesByMasterCardId}
      viewerTradeCollectionLinesByMasterCardId={data.viewerTradeCollectionLinesByMasterCardId}
      viewerTradeManualPriceMasterCardIds={data.viewerTradeManualPriceMasterCardIds}
      viewerTradeGradingByMasterCardId={data.viewerTradeGradingByMasterCardId}
      counterpartyTradeGridCards={data.counterpartyTradeGridCards}
      counterpartyTradeCardPricesByMasterCardId={data.counterpartyTradeCardPricesByMasterCardId}
      counterpartyTradeCollectionLinesByMasterCardId={data.counterpartyTradeCollectionLinesByMasterCardId}
      counterpartyTradeManualPriceMasterCardIds={data.counterpartyTradeManualPriceMasterCardIds}
      counterpartyTradeGradingByMasterCardId={data.counterpartyTradeGradingByMasterCardId}
      viewerCustomerId={data.viewerCustomerId}
      amendTradeId={amendTradeId}
    />
  );
}
