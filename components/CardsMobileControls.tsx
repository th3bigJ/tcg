"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { CardFiltersPanel } from "@/components/CardFiltersPanel";

type SetFilterOption = {
  code: string;
  name: string;
  logoSrc: string;
  releaseYear: number | null;
  seriesName: string;
};

type PokemonFilterOption = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
};

type CardsMobileControlsProps = {
  activeSet: string;
  activePokemon: string;
  activeRarity: string;
  activeEnergy: string;
  activeSearch: string;
  rarityOptions: string[];
  energyOptions: string[];
  categoryOptions: string[];
  excludeCommonUncommon: boolean;
  excludeOwned: boolean;
  duplicatesOnly?: boolean;
  activeCategory: string;
  resetFiltersHref: string;
  setFilterOptions: SetFilterOption[];
  pokemonFilterOptions: PokemonFilterOption[];
  formAction?: string;
  extraHiddenInputs?: React.ReactNode;
  showSetPokemonFilter?: boolean;
};

export function CardsMobileControls({
  activeSet,
  activePokemon,
  activeRarity,
  activeEnergy,
  activeSearch,
  rarityOptions,
  energyOptions,
  categoryOptions,
  excludeCommonUncommon,
  excludeOwned,
  duplicatesOnly = false,
  activeCategory,
  resetFiltersHref,
  setFilterOptions,
  pokemonFilterOptions,
  formAction = "/cards",
  extraHiddenInputs,
  showSetPokemonFilter = true,
}: CardsMobileControlsProps) {
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  useEffect(() => {
    if (!isFilterModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isFilterModalOpen]);

  return (
    <>
      <div className="mb-4 flex shrink-0 flex-col gap-2 lg:hidden">
        <form method="get" action={formAction} className="flex items-center gap-2">
          {extraHiddenInputs}
          {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
          {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
          {activeRarity ? <input type="hidden" name="rarity" value={activeRarity} /> : null}
          {activeEnergy ? <input type="hidden" name="energy" value={activeEnergy} /> : null}
          {excludeCommonUncommon ? <input type="hidden" name="exclude_cu" value="1" /> : null}
          {excludeOwned ? <input type="hidden" name="exclude_owned" value="1" /> : null}
          {duplicatesOnly ? <input type="hidden" name="duplicates_only" value="1" /> : null}
          {activeCategory ? <input type="hidden" name="category" value={activeCategory} /> : null}
          <input
            type="search"
            name="search"
            defaultValue={activeSearch}
            placeholder="Search card name"
            aria-label="Search card name"
            className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2.5 py-2 text-sm shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_20px_rgba(0,0,0,0.18)] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20"
          />
          <button
            type="submit"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 transition hover:bg-[var(--foreground)]/20"
            aria-label="Search"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </button>
          <Link
            href={resetFiltersHref}
            prefetch={false}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-red-400/50 bg-red-500/15 text-red-300 transition hover:bg-red-500/25 hover:text-red-200"
            aria-label="Reset filters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 3v4h4" />
            </svg>
          </Link>
          <button
            type="button"
            onClick={() => setIsFilterModalOpen(true)}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 transition hover:bg-[var(--foreground)]/20"
            aria-label="Open filters"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M3 5h18" />
              <path d="M7 12h10" />
              <path d="M10 19h4" />
            </svg>
          </button>
        </form>
      </div>

      {isFilterModalOpen ? (
        <div
          className="fixed inset-0 z-[1100] flex flex-col bg-[var(--background)] p-3 text-[var(--foreground)] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filter cards"
        >
          <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-2">
            <h2 className="text-sm font-semibold">Filters</h2>
            <div className="flex items-center gap-2">
              {(activeSet || activePokemon) && (
                <Link
                  href={resetFiltersHref}
                  prefetch={false}
                  className="inline-flex rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-2 py-1 text-xs font-medium transition hover:bg-[var(--foreground)]/18"
                >
                  Clear
                </Link>
              )}
              <button
                type="button"
                onClick={() => setIsFilterModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 transition hover:bg-[var(--foreground)]/20"
                aria-label="Close filters"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </div>
          <CardFiltersPanel
            sets={setFilterOptions}
            pokemon={pokemonFilterOptions}
            rarityOptions={rarityOptions}
            energyOptions={energyOptions}
            categoryOptions={categoryOptions}
            activeSet={activeSet}
            activePokemonDex={activePokemon}
            activeRarity={activeRarity}
            activeEnergy={activeEnergy}
            activeSearch={activeSearch}
            excludeCommonUncommon={excludeCommonUncommon}
            excludeOwned={excludeOwned}
            activeCategory={activeCategory}
            onSelection={() => setIsFilterModalOpen(false)}
            showSetPokemonFilter={showSetPokemonFilter}
          />
        </div>
      ) : null}
    </>
  );
}
