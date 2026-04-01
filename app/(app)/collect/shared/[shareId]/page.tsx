import Link from "next/link";
import { Suspense } from "react";

import { AppLoadingScreen } from "@/app/(app)/AppLoadingScreen";
import { SharedCollectionDetailClient } from "@/app/(app)/collect/shared/[shareId]/SharedCollectionDetailClient";
import { loadSharedCollectionData } from "@/app/(app)/collect/shared/[shareId]/loadSharedCollectionData";
import { getCurrentCustomer } from "@/lib/auth";

type PageProps = {
  params: Promise<{ shareId: string }>;
};

export default async function SharedCollectionDetailPage({ params }: PageProps) {
  const { shareId } = await params;
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-2 text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Shared collection</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">Sign in to view shared collections.</p>
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
    <Suspense
      fallback={
        <div className="flex min-h-full flex-col bg-[var(--background)]">
          <AppLoadingScreen label="Loading friends" />
        </div>
      }
    >
      <SharedCollectionDetailClient
        shareId={data.shareId}
        viewerCustomerId={data.viewerCustomerId}
        counterpartyDisplayName={data.counterpartyDisplayName}
        viewerCollectionEntries={data.viewerCollectionEntries}
        counterpartyCollectionEntries={data.counterpartyCollectionEntries}
        pageTitle={data.pageTitle}
        ownerDisplayName={data.ownerDisplayName}
        collectionCards={data.collectionCards}
        wishlistCards={data.wishlistCards}
        setLogosByCode={data.setLogosByCode}
        setSymbolsByCode={data.setSymbolsByCode}
        itemConditions={data.itemConditions}
        wishlistEntryIdsByMasterCardId={data.wishlistEntryIdsByMasterCardId}
        collectionLinesByMasterCardId={data.collectionLinesByMasterCardId}
        collectionCardPricesByMasterCardId={data.collectionCardPricesByMasterCardId}
        wishlistCardPricesByMasterCardId={data.wishlistCardPricesByMasterCardId}
        collectionManualPriceMasterCardIds={data.collectionManualPriceMasterCardIds}
        wishlistManualPriceMasterCardIds={data.wishlistManualPriceMasterCardIds}
        gradingByMasterCardId={data.gradingByMasterCardId}
        viewerOwnedMasterCardIds={data.viewerOwnedMasterCardIds}
      />
    </Suspense>
  );
}
