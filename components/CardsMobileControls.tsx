"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  activeSearch: string;
  rarityOptions: string[];
  resetFiltersHref: string;
  setFilterOptions: SetFilterOption[];
  pokemonFilterOptions: PokemonFilterOption[];
};

export function CardsMobileControls({
  activeSet,
  activePokemon,
  activeRarity,
  activeSearch,
  rarityOptions,
  resetFiltersHref,
  setFilterOptions,
  pokemonFilterOptions,
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
        <form method="get" action="/cards" className="flex items-center gap-2">
          {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
          {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
          <input type="hidden" name="rarity" value={activeRarity} />
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
            href="/cards"
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

        <form method="get" action="/cards">
          {activeSet ? <input type="hidden" name="set" value={activeSet} /> : null}
          {activePokemon ? <input type="hidden" name="pokemon" value={activePokemon} /> : null}
          {activeSearch ? <input type="hidden" name="search" value={activeSearch} /> : null}
          <div className="relative">
            <select
              id="rarity-mobile"
              name="rarity"
              defaultValue={activeRarity}
              className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2.5 py-2 pr-8 text-sm shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20 [appearance:none] [-webkit-appearance:none] [background-image:none]"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
            >
              <option value="">All rarities</option>
              {rarityOptions.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity}
                </option>
              ))}
            </select>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground)]/55"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </form>
      </div>

      {isFilterModalOpen ? (
        <div
          className="fixed inset-0 z-[110] flex flex-col bg-[var(--background)] p-3 text-[var(--foreground)] lg:hidden"
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
            activeSet={activeSet}
            activePokemonDex={activePokemon}
            activeRarity={activeRarity}
            activeSearch={activeSearch}
            onSelection={() => setIsFilterModalOpen(false)}
          />
        </div>
      ) : null}
    </>
  );
}
