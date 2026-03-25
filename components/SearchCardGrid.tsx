"use client";

import { useEffect, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";

type SearchCardData = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: Record<string, string>;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
};

export function SearchCardGrid({ cards, setLogosByCode, setSymbolsByCode, customerLoggedIn }: Props) {
  const [cardData, setCardData] = useState<SearchCardData | null>(null);

  useEffect(() => {
    if (!customerLoggedIn) return;
    const controller = new AbortController();
    fetch("/api/search-card-data", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SearchCardData | null) => {
        if (data) setCardData(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [customerLoggedIn]);

  return (
    <CardGrid
      cards={cards}
      setLogosByCode={setLogosByCode}
      setSymbolsByCode={setSymbolsByCode}
      customerLoggedIn={customerLoggedIn}
      itemConditions={cardData?.itemConditions}
      wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
      collectionLinesByMasterCardId={cardData?.collectionLines}
    />
  );
}
