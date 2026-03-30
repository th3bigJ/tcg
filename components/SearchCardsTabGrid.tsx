"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CardGrid, type CardEntry } from "@/components/CardGrid";
import {
  FilterChipButton,
  FilterClearChip,
  FilterChipRow,
  FilterChipSelect,
  FilterControlsShell,
  FilterSearchInput,
} from "@/components/card-filters/FilterPrimitives";
import type { CollectionLineSummary } from "@/lib/storefrontCardMaps";

type SearchCardData = {
  itemConditions: { id: string; name: string }[];
  wishlistMap: Record<string, { id: string; printing?: string }>;
  collectionLines: Record<string, CollectionLineSummary[]>;
};

type Props = {
  cards: CardEntry[];
  setLogosByCode?: Record<string, string>;
  setSymbolsByCode?: Record<string, string>;
  customerLoggedIn: boolean;
  formAction: string;
  extraHiddenFields?: Record<string, string>;
  activeSearch: string;
  activeSet: string;
  activePokemon: string;
  activeRarity: string;
  activeCategory: string;
  excludeCommonUncommon: boolean;
  rarityOptions: string[];
  categoryOptions: string[];
  resetHref: string;
};

export function SearchCardsTabGrid({
  cards,
  setLogosByCode,
  setSymbolsByCode,
  customerLoggedIn,
  formAction,
  extraHiddenFields,
  activeSearch,
  activeSet,
  activePokemon,
  activeRarity,
  activeCategory,
  excludeCommonUncommon,
  rarityOptions,
  categoryOptions,
  resetHref,
}: Props) {
  const router = useRouter();
  const [cardData, setCardData] = useState<SearchCardData | null>(null);
  const [notOwnedOnly, setNotOwnedOnly] = useState(false);
  const hasActiveFilters = Boolean(
    activeRarity || activeCategory || excludeCommonUncommon || notOwnedOnly,
  );

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

  const visibleCards = useMemo(() => {
    if (!notOwnedOnly) return cards;
    return cards.filter((card) => {
      if (!card.masterCardId) return true;
      return (cardData?.collectionLines[card.masterCardId]?.length ?? 0) === 0;
    });
  }, [cards, notOwnedOnly, cardData]);

  const clearFilters = () => {
    setNotOwnedOnly(false);
    router.push(resetHref);
  };

  return (
    <>
      <FilterControlsShell>
        <form method="get" action={formAction} className="flex items-center gap-2">
          {extraHiddenFields
            ? Object.entries(extraHiddenFields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))
            : null}
          {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
          {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
          {activeRarity ? <input type="hidden" name="rarity" value={activeRarity} /> : null}
          {excludeCommonUncommon ? <input type="hidden" name="exclude_cu" value="1" /> : null}
          {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
          <FilterSearchInput defaultValue={activeSearch} />
          <Link
            href="/scan"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/40"
            aria-label="Open browser scan lab"
            title="Open browser scan lab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </Link>
        </form>
        <FilterChipRow>
          {hasActiveFilters ? <FilterClearChip onClick={clearFilters} /> : null}
          <FilterChipSelect
            value={activeRarity}
            onChange={(value) => {
              const params = new URLSearchParams();
              if (extraHiddenFields) {
                for (const [k, v] of Object.entries(extraHiddenFields)) params.set(k, v);
              }
              if (activeSearch) params.set("search", activeSearch);
              if (activeSet) params.set("set", activeSet);
              if (activePokemon) params.set("pokemon", activePokemon);
              if (value) params.set("rarity", value);
              if (excludeCommonUncommon) params.set("exclude_cu", "1");
              if (activeCategory) params.set("category", activeCategory);
              router.push(`${formAction}?${params.toString()}`);
            }}
            options={[{ value: "", label: "Rarity" }, ...rarityOptions.map((v) => ({ value: v, label: v }))]}
            ariaLabel="Filter by rarity"
            widthClass="w-auto"
          />
          <FilterChipSelect
            value={activeCategory}
            onChange={(value) => {
              const params = new URLSearchParams();
              if (extraHiddenFields) {
                for (const [k, v] of Object.entries(extraHiddenFields)) params.set(k, v);
              }
              if (activeSearch) params.set("search", activeSearch);
              if (activeSet) params.set("set", activeSet);
              if (activePokemon) params.set("pokemon", activePokemon);
              if (activeRarity) params.set("rarity", activeRarity);
              if (excludeCommonUncommon) params.set("exclude_cu", "1");
              if (value) params.set("category", value);
              router.push(`${formAction}?${params.toString()}`);
            }}
            options={[{ value: "", label: "Card type" }, ...categoryOptions.map((v) => ({ value: v, label: v }))]}
            ariaLabel="Filter by card type"
            widthClass="w-36"
          />
          <FilterChipButton
            label="Rare+ only"
            active={excludeCommonUncommon}
            onClick={() => {
              const params = new URLSearchParams();
              if (extraHiddenFields) {
                for (const [k, v] of Object.entries(extraHiddenFields)) params.set(k, v);
              }
              if (activeSearch) params.set("search", activeSearch);
              if (activeSet) params.set("set", activeSet);
              if (activePokemon) params.set("pokemon", activePokemon);
              if (activeRarity) params.set("rarity", activeRarity);
              if (!excludeCommonUncommon) params.set("exclude_cu", "1");
              if (activeCategory) params.set("category", activeCategory);
              router.push(`${formAction}?${params.toString()}`);
            }}
          />
          <FilterChipButton
            label="Not owned"
            active={notOwnedOnly}
            onClick={() => setNotOwnedOnly((value) => !value)}
          />
        </FilterChipRow>
      </FilterControlsShell>
      <CardGrid
        cards={visibleCards}
        setLogosByCode={setLogosByCode}
        setSymbolsByCode={setSymbolsByCode}
        customerLoggedIn={customerLoggedIn}
        itemConditions={cardData?.itemConditions}
        wishlistEntryIdsByMasterCardId={cardData?.wishlistMap}
        collectionLinesByMasterCardId={cardData?.collectionLines}
        groupBySet={false}
      />
    </>
  );
}
