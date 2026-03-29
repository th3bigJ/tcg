"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CollectCardGridWithTags } from "@/components/CollectCardGridWithTags";
import type { CardEntry } from "@/components/CardGrid";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";
import type { StorefrontCardExtras } from "@/lib/storefrontCardMaps";

type Tab = "collection" | "wishlist";

type Props = {
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

export function SharedCollectionDetailClient({
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
  const [tab, setTab] = useState<Tab>("collection");
  const collectionManualSet = useMemo(() => new Set(collectionManualIds), [collectionManualIds]);
  const wishlistManualSet = useMemo(() => new Set(wishlistManualIds), [wishlistManualIds]);
  const viewerOwnedSet = useMemo(() => new Set(viewerOwnedIds), [viewerOwnedIds]);

  const cards = tab === "collection" ? collectionCards : wishlistCards;
  const cardPricesByMasterCardId =
    tab === "collection" ? collectionCardPricesByMasterCardId : wishlistCardPricesByMasterCardId;
  const manualPriceMasterCardIds = tab === "collection" ? collectionManualSet : wishlistManualSet;

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
      <div className="shrink-0 px-4 pt-[var(--mobile-page-top-offset)]">
        <Link
          href="/collect/shared"
          className="text-sm font-medium text-[var(--foreground)]/65 transition hover:text-[var(--foreground)]"
        >
          ← Shared collections
        </Link>
        <h1 className="mt-4 text-xl font-semibold leading-snug">{ownerDisplayName}&apos;s collection</h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/60">Shared with you · read-only</p>

        <div
          role="tablist"
          aria-label="View"
          className="mt-5 flex gap-1 rounded-lg border border-[var(--foreground)]/15 bg-[var(--foreground)]/5 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "collection"}
            onClick={() => setTab("collection")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === "collection"
                ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
                : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
            }`}
          >
            Collection
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "wishlist"}
            onClick={() => setTab("wishlist")}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              tab === "wishlist"
                ? "bg-[var(--foreground)]/15 text-[var(--foreground)]"
                : "text-[var(--foreground)]/55 hover:text-[var(--foreground)]/85"
            }`}
          >
            Wishlist
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
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
            itemConditions={itemConditions}
            wishlistEntryIdsByMasterCardId={wishlistEntryIdsByMasterCardId}
            collectionLinesByMasterCardId={collectionLinesByMasterCardId}
            cardPricesByMasterCardId={cardPricesByMasterCardId}
            manualPriceMasterCardIds={manualPriceMasterCardIds}
            gradingByMasterCardId={gradingByMasterCardId}
            readOnly
            collectionSectionTitle="Their collection"
            viewerOwnedMasterCardIds={tab === "wishlist" ? viewerOwnedSet : undefined}
            sharedWishlistOwnedFilter={tab === "wishlist"}
          />
        </div>
      )}
    </div>
  );
}
