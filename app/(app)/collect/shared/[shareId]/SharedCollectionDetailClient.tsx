"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { SharedCollectionTradesClient } from "@/app/(app)/collect/shared/[shareId]/SharedCollectionTradesClient";
import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import type { CardEntry } from "@/components/CardGrid";
import type { CollectionLineSummary, StorefrontCardEntry, StorefrontCardExtras } from "@/lib/storefrontCardMaps";

type Tab = "collection" | "wishlist" | "trade";

type Props = {
  shareId: string;
  viewerCustomerId: string;
  counterpartyDisplayName: string;
  viewerCollectionEntries: StorefrontCardEntry[];
  counterpartyCollectionEntries: StorefrontCardEntry[];
  pageTitle: string;
  ownerDisplayName: string;
  collectionCards: (CardEntry & Pick<StorefrontCardExtras, "addedAt">)[];
  wishlistCards: (CardEntry & Pick<StorefrontCardExtras, "addedAt">)[];
  setLogosByCode: Record<string, string>;
  setSymbolsByCode: Record<string, string>;
  itemConditions: { id: string; name: string }[];
  wishlistEntryIdsByMasterCardId: Record<string, { id: string; printing?: string }>;
  collectionLinesByMasterCardId: Record<string, CollectionLineSummary[]>;
  collectionCardPricesByMasterCardId: Record<string, number>;
  wishlistCardPricesByMasterCardId: Record<string, number>;
  collectionManualPriceMasterCardIds: string[];
  wishlistManualPriceMasterCardIds: string[];
  gradingByMasterCardId: Record<string, { company: string; grade: string; imageUrl?: string }>;
  viewerOwnedMasterCardIds: string[];
};

function tabFromSearchParams(value: string | null): Tab | null {
  if (value === "collection" || value === "wishlist" || value === "trade") return value;
  return null;
}

export function SharedCollectionDetailClient({
  shareId,
  viewerCustomerId,
  counterpartyDisplayName,
  viewerCollectionEntries,
  counterpartyCollectionEntries,
  pageTitle,
  ownerDisplayName,
  collectionCards,
  wishlistCards,
  setLogosByCode,
  setSymbolsByCode,
  itemConditions,
  wishlistEntryIdsByMasterCardId,
  collectionLinesByMasterCardId,
  collectionCardPricesByMasterCardId,
  wishlistCardPricesByMasterCardId,
  collectionManualPriceMasterCardIds: collectionManualIds,
  wishlistManualPriceMasterCardIds: wishlistManualIds,
  gradingByMasterCardId,
  viewerOwnedMasterCardIds: viewerOwnedIds,
}: Props) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromSearchParams(searchParams.get("tab")) ?? "collection");

  useEffect(() => {
    const t = tabFromSearchParams(searchParams.get("tab"));
    if (t) setTab(t);
  }, [searchParams]);

  const collectionManualSet = useMemo(() => new Set(collectionManualIds), [collectionManualIds]);
  const wishlistManualSet = useMemo(() => new Set(wishlistManualIds), [wishlistManualIds]);
  const viewerOwnedSet = useMemo(() => new Set(viewerOwnedIds), [viewerOwnedIds]);

  const cards = tab === "collection" ? collectionCards : tab === "wishlist" ? wishlistCards : [];
  const cardPricesByMasterCardId =
    tab === "collection" ? collectionCardPricesByMasterCardId : wishlistCardPricesByMasterCardId;
  const manualPriceMasterCardIds = tab === "collection" ? collectionManualSet : wishlistManualSet;

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="shrink-0 px-4 pt-2">
        <Link
          href="/collect/shared"
          className="text-sm font-medium text-[var(--foreground)]/65 transition hover:text-[var(--foreground)]"
        >
          ← Shared collections
        </Link>
        <h1 className="mt-4 text-xl font-semibold leading-snug">{pageTitle}</h1>

        <div
          role="tablist"
          aria-label="View"
          className="mt-6 flex gap-1 border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-1"
          style={{ borderRadius: "999px" }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "collection"}
            onClick={() => setTab("collection")}
            className={`flex-1 px-3 py-2 text-sm font-medium transition ${
              tab === "collection"
                ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
                : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
            }`}
            style={{ borderRadius: "999px" }}
          >
            Collection
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "wishlist"}
            onClick={() => setTab("wishlist")}
            className={`flex-1 px-3 py-2 text-sm font-medium transition ${
              tab === "wishlist"
                ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
                : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
            }`}
            style={{ borderRadius: "999px" }}
          >
            Wishlist
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "trade"}
            onClick={() => setTab("trade")}
            className={`flex-1 px-3 py-2 text-sm font-medium transition ${
              tab === "trade"
                ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
                : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
            }`}
            style={{ borderRadius: "999px" }}
          >
            Trade
          </button>
        </div>
      </div>

      {tab === "trade" ? (
        <SharedCollectionTradesClient
          shareId={shareId}
          viewerCustomerId={viewerCustomerId}
          counterpartyDisplayName={counterpartyDisplayName}
          viewerCollectionEntries={viewerCollectionEntries}
          counterpartyCollectionEntries={counterpartyCollectionEntries}
        />
      ) : cards.length === 0 ? (
        <p className="mt-6 px-4 text-sm text-[var(--foreground)]/65">
          {tab === "collection" ? "Their collection is empty." : "Their wishlist is empty."}
        </p>
      ) : (
        <div className="mt-6">
          <CollectCardGridWithTags
            cards={cards}
            setLogosByCode={setLogosByCode}
            setSymbolsByCode={setSymbolsByCode}
            variant={tab === "collection" ? "collection" : "wishlist"}
            filterScope="friends"
            itemConditions={itemConditions}
            wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
            collectionLinesByMasterCardId={collectionLinesByMasterCardId}
            cardPricesByMasterCardId={cardPricesByMasterCardId}
            manualPriceMasterCardIds={manualPriceMasterCardIds}
            gradingByMasterCardId={gradingByMasterCardId}
            readOnly
            collectionSectionTitle={ownerDisplayName ? `${ownerDisplayName}'s collection` : "Their collection"}
            viewerOwnedMasterCardIds={viewerOwnedSet}
            sharedWishlistOwnedFilter={tab === "wishlist"}
          />
        </div>
      )}
    </div>
  );
}
