"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FilterChipButton,
  FilterChipRow,
  FilterChipSelect,
  FilterClearChip,
  FilterControlsShell,
  FilterRoundIconButton,
  FilterSearchInput,
} from "@/components/card-filters/FilterPrimitives";

// ── Main component ────────────────────────────────────────────────────────────

export type CardTagFilterRowProps = {
  /** Toggled locally — no URL involvement */
  groupBySet: boolean;
  onGroupBySetChange: (value: boolean) => void;
  showGroupBySetTag?: boolean;

  /** Random order toggle — only shown when provided */
  randomOrder?: boolean;
  onRandomOrderChange?: (value: boolean) => void;

  /** Local search (collect/wishlist) — filters cards in-memory, no URL changes */
  localSearch?: {
    value: string;
    onChange: (value: string) => void;
  };

  /** Local filters (collect/wishlist) — filters cards in-memory, no URL changes */
  localFilters?: {
    rarity: string;
    onRarityChange: (value: string) => void;
    rarityOptions: string[];
    energy: string;
    onEnergyChange: (value: string) => void;
    energyOptions: string[];
    category: string;
    onCategoryChange: (value: string) => void;
    categoryOptions: string[];
    excludeCommonUncommon: boolean;
    onExcludeCommonUncommonChange: (value: boolean) => void;
    duplicatesOnly?: boolean;
    onDuplicatesOnlyChange?: (value: boolean) => void;
  };

  /** Sort control — works for both local and URL-driven pages */
  sortControl?: {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    /** When set, inverted “active” styling only applies if `value` differs (default order is not highlighted). */
    defaultValue?: string;
  };

  /** Shared wishlist: “Cards I own” as first tag in the filter row */
  ownedFilterTag?: {
    active: boolean;
    onToggle: () => void;
  };

  /** URL-driven filter props. Omit entirely on pages that don't use URL filters (collect/wishlist). */
  searchFilter?: {
    formAction: string;
    /** Extra hidden inputs to carry through form submissions (e.g. tab=cards) */
    extraHiddenFields?: Record<string, string>;
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
  };
};

export function CardTagFilterRow({
  groupBySet,
  onGroupBySetChange,
  showGroupBySetTag = true,
  randomOrder,
  onRandomOrderChange,
  localSearch,
  localFilters,
  sortControl,
  ownedFilterTag,
  searchFilter,
}: CardTagFilterRowProps) {
  const router = useRouter();

  const sf = searchFilter
    ? {
        ...searchFilter,
        rarityOptions: searchFilter.rarityOptions ?? [],
        energyOptions: searchFilter.energyOptions ?? [],
        categoryOptions: searchFilter.categoryOptions ?? [],
      }
    : undefined;
  const hasActiveFilters = sf
    ? Boolean(sf.activeRarity || sf.activeEnergy || sf.activeCategory || sf.excludeCommonUncommon || sf.excludeOwned)
    : localFilters
      ? Boolean(
          localFilters.rarity ||
          localFilters.energy ||
          localFilters.category ||
          localFilters.excludeCommonUncommon ||
          localFilters.duplicatesOnly,
        )
      : false;

  return (
    <FilterControlsShell>
      {/* Local search bar (collect/wishlist) */}
      {localSearch ? (
        <div className="relative">
          <FilterSearchInput
            value={localSearch.value}
            onChange={localSearch.onChange}
            inputClassName={localSearch.value ? "pr-8" : undefined}
          />
          {localSearch.value ? (
            <button
              type="button"
              onClick={() => localSearch.onChange("")}
              className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--foreground)]/20 text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/30"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* URL search bar — only when URL filters are enabled */}
      {sf ? (
        <form method="get" action={sf.formAction} className="flex items-center gap-2">
          {sf.extraHiddenFields
            ? Object.entries(sf.extraHiddenFields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))
            : null}
          {sf.activeSet ? <input type="hidden" name="set" value={sf.activeSet} /> : null}
          {sf.activePokemon ? <input type="hidden" name="pokemon" value={sf.activePokemon} /> : null}
          {sf.activeRarity ? <input type="hidden" name="rarity" value={sf.activeRarity} /> : null}
          {sf.activeEnergy ? <input type="hidden" name="energy" value={sf.activeEnergy} /> : null}
          {sf.excludeCommonUncommon ? <input type="hidden" name="exclude_cu" value="1" /> : null}
          {sf.activeCategory ? <input type="hidden" name="category" value={sf.activeCategory} /> : null}

          <FilterSearchInput defaultValue={sf.activeSearch} />

          {sf.activeSearch ? (
            <FilterRoundIconButton
              label="Clear search"
              onClick={() => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.activeEnergy) params.set("energy", sf.activeEnergy);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </FilterRoundIconButton>
          ) : null}

          <Link
            href="/scan"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/40 transition hover:bg-[var(--foreground)]/14"
            aria-label="Open browser scan lab"
            title="Open browser scan lab"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </Link>
        </form>
      ) : null}

      {/* Tag row */}
      <FilterChipRow>
        {ownedFilterTag ? (
          <FilterChipButton
            label="Cards I own"
            active={ownedFilterTag.active}
            onClick={ownedFilterTag.onToggle}
          />
        ) : null}

        {/* Clear filters — leftmost when active */}
        {hasActiveFilters && localFilters ? (
          <FilterClearChip
            onClick={() => {
              localFilters.onRarityChange("");
              localFilters.onEnergyChange("");
              localFilters.onCategoryChange("");
              localFilters.onExcludeCommonUncommonChange(false);
              localFilters.onDuplicatesOnlyChange?.(false);
            }}
          />
        ) : hasActiveFilters && sf ? (
          <FilterClearChip onClick={() => router.push(sf.resetHref)} />
        ) : null}

        {/* Group by set toggle */}
        {showGroupBySetTag ? (
          <FilterChipButton
            label="Group by set"
            active={groupBySet}
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
              </svg>
            }
            onClick={() => onGroupBySetChange(!groupBySet)}
          />
        ) : null}

        {/* Random order toggle — only shown when provided */}
        {onRandomOrderChange !== undefined ? (
          <FilterChipButton
            label="Random"
            active={randomOrder ?? false}
            icon={
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22" />
                <path d="m18 2 4 4-4 4" />
                <path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2" />
                <path d="M22 18h-5.9c-1.3 0-2.5-.7-3.1-1.8l-.3-.5" />
                <path d="m18 14 4 4-4 4" />
              </svg>
            }
            onClick={() => onRandomOrderChange(!randomOrder)}
          />
        ) : null}

        {/* Sort dropdown */}
        {sortControl ? (
          <FilterChipSelect
            value={sortControl.value}
            onChange={sortControl.onChange}
            options={sortControl.options}
            ariaLabel="Sort order"
            defaultValue={sortControl.defaultValue}
          />
        ) : null}

        {/* Local filter tags (collect/wishlist) */}
        {localFilters ? (
          <>
            <FilterChipSelect
              value={localFilters.rarity}
              onChange={localFilters.onRarityChange}
              options={[{ value: "", label: "Rarity" }, ...localFilters.rarityOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by rarity"
            />

            <FilterChipSelect
              value={localFilters.energy}
              onChange={localFilters.onEnergyChange}
              options={[{ value: "", label: "Energy" }, ...localFilters.energyOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by energy type"
            />

            <FilterChipSelect
              value={localFilters.category}
              onChange={localFilters.onCategoryChange}
              options={[{ value: "", label: "Card type" }, ...localFilters.categoryOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by card type"
              widthClass="w-36"
            />

            <FilterChipButton
              label="Rare+ only"
              active={localFilters.excludeCommonUncommon}
              onClick={() => localFilters.onExcludeCommonUncommonChange(!localFilters.excludeCommonUncommon)}
            />

            {typeof localFilters.duplicatesOnly === "boolean" && localFilters.onDuplicatesOnlyChange ? (
              <FilterChipButton
                label="Duplicates only"
                active={localFilters.duplicatesOnly}
                onClick={() => {
                  const fn = localFilters.onDuplicatesOnlyChange;
                  if (fn) fn(!localFilters.duplicatesOnly);
                }}
              />
            ) : null}
          </>
        ) : null}

        {/* URL-driven filter tags */}
        {sf ? (
          <>
            {/* Rarity dropdown */}
            <FilterChipSelect
              value={sf.activeRarity}
              onChange={(val) => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSearch) params.set("search", sf.activeSearch);
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (val) params.set("rarity", val);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (sf.excludeOwned) params.set("exclude_owned", "1");
                if (sf.activeEnergy) params.set("energy", sf.activeEnergy);
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
              options={[{ value: "", label: "Rarity" }, ...sf.rarityOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by rarity"
            />

            {/* Energy type dropdown */}
            <FilterChipSelect
              value={sf.activeEnergy}
              onChange={(val) => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSearch) params.set("search", sf.activeSearch);
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (sf.excludeOwned) params.set("exclude_owned", "1");
                if (val) params.set("energy", val);
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
              options={[{ value: "", label: "Energy" }, ...sf.energyOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by energy type"
            />

            {/* Card type dropdown */}
            <FilterChipSelect
              value={sf.activeCategory}
              onChange={(val) => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSearch) params.set("search", sf.activeSearch);
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (sf.excludeOwned) params.set("exclude_owned", "1");
                if (sf.activeEnergy) params.set("energy", sf.activeEnergy);
                if (val) params.set("category", val);
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
              options={[{ value: "", label: "Card type" }, ...sf.categoryOptions.map((value) => ({ value, label: value }))]}
              ariaLabel="Filter by card type"
              widthClass="w-36"
            />

            {/* Exclude C/U toggle */}
            <FilterChipButton
              label="Rare+ only"
              active={sf.excludeCommonUncommon}
              onClick={() => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSearch) params.set("search", sf.activeSearch);
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.activeEnergy) params.set("energy", sf.activeEnergy);
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                if (sf.excludeOwned) params.set("exclude_owned", "1");
                if (!sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
            />

            <FilterChipButton
              label="Hide owned"
              active={sf.excludeOwned ?? false}
              onClick={() => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSearch) params.set("search", sf.activeSearch);
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.activeEnergy) params.set("energy", sf.activeEnergy);
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (!sf.excludeOwned) params.set("exclude_owned", "1");
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
            />

          </>
        ) : null}
      </FilterChipRow>
    </FilterControlsShell>
  );
}
