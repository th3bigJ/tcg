"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import {
  PERSISTED_FILTERS_UPDATED_EVENT,
  readPersistedFilters,
} from "@/lib/persistedFilters";
import type { SearchCardDataPayload } from "@/lib/searchCardDataServer";

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  initialVisibleCount: number;
  loadMoreStep: number;
  revealAll?: boolean;
  activeSearch: string;
  activeSet: string;
  activePokemon: string;
  activeRarity: string;
  activeEnergy: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  excludeOwned?: boolean;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
  resetHref: string;
  initialSearchCardData?: SearchCardDataPayload | null;
};

export function SearchCardsTabGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  initialSearchCardData,
  initialVisibleCount,
  loadMoreStep,
  revealAll = false,
}: Props) {
  const initialRenderCards = useMemo(
    () => (revealAll ? cards : cards.slice(0, Math.min(cards.length, initialVisibleCount))),
    [cards, initialVisibleCount, revealAll],
  );
  const hasMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [groupBySet, setGroupBySet] = useState(false);
  const cardData = customerLoggedIn ? initialSearchCardData ?? null : null;
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const [visibleCount, setVisibleCount] = useState(initialRenderCards.length);

  useEffect(() => {
    const applyPersisted = () => {
      const persisted = readPersistedFilters("search");
      setGroupBySet(persisted.groupBySet ?? false);
    };
    applyPersisted();
    window.addEventListener("storage", applyPersisted);
    window.addEventListener(PERSISTED_FILTERS_UPDATED_EVENT, applyPersisted);
    return () => {
      window.removeEventListener("storage", applyPersisted);
      window.removeEventListener(PERSISTED_FILTERS_UPDATED_EVENT, applyPersisted);
    };
  }, []);

  useEffect(() => {
    if (revealAll || visibleCount >= cards.length) return;
    const button = loadMoreRef.current;
    if (!button) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((current) => Math.min(cards.length, current + loadMoreStep));
        }
      },
      { rootMargin: "0px 0px 200px 0px", threshold: 0 },
    );

    observer.observe(button);
    return () => observer.disconnect();
  }, [cards.length, loadMoreStep, revealAll, visibleCount]);

  const visibleCards = useMemo(
    () => (revealAll ? cards : cards.slice(0, visibleCount)),
    [cards, revealAll, visibleCount],
  );
  const canLoadMore = !revealAll && visibleCount < cards.length;
  const renderedCards = hasMounted ? visibleCards : initialRenderCards;
  const renderedGroupBySet = hasMounted ? groupBySet : false;
  const renderedCanLoadMore = hasMounted ? canLoadMore : false;

  return (
    <>
      <CardGrid
        cards={renderedCards}
        setLogosByCode={setLogosByCode}
        setSymbolsByCode={setSymbolsByCode}
        customerLoggedIn={customerLoggedIn}
        itemConditions={cardData?.itemConditions}
        wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
        collectionLinesByMasterCardId={cardData?.collectionLines}
        groupBySet={renderedGroupBySet}
      />
      {renderedCanLoadMore ? (
        <div className="flex items-center justify-center pb-[var(--bottom-nav-offset,0px)] pt-6">
          <button
            ref={loadMoreRef}
            type="button"
            onClick={() => setVisibleCount((current) => Math.min(cards.length, current + loadMoreStep))}
            className="rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
          >
            Load {Math.min(loadMoreStep, cards.length - visibleCount)} more
          </button>
        </div>
      ) : null}
    </>
  );
}
