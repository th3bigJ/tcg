"use client";

import React, { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ── Tag button ────────────────────────────────────────────────────────────────

type TagButtonProps = {
  label: string;
  active: boolean;
  icon?: React.ReactNode;
  onClick: () => void;
};

function TagButton({ label, active, icon, onClick }: TagButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
        active
          ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
          : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12 hover:text-[var(--foreground)]"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Chevron icon (shared by selects) ─────────────────────────────────────────

function ChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-55"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export type CardTagFilterRowProps = {
  /** Toggled locally — no URL involvement */
  groupBySet: boolean;
  onGroupBySetChange: (value: boolean) => void;

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
    activeCategory: string;
    excludeCommonUncommon: boolean;
    rarityOptions: string[];
    categoryOptions: string[];
    resetHref: string;
  };
};

export function CardTagFilterRow({
  groupBySet,
  onGroupBySetChange,
  localSearch,
  localFilters,
  sortControl,
  ownedFilterTag,
  searchFilter,
}: CardTagFilterRowProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const sf = searchFilter
    ? { ...searchFilter, rarityOptions: searchFilter.rarityOptions ?? [], categoryOptions: searchFilter.categoryOptions ?? [] }
    : undefined;
  const hasActiveFilters = sf
    ? Boolean(sf.activeRarity || sf.activeCategory || sf.excludeCommonUncommon)
    : localFilters
      ? Boolean(
          localFilters.rarity ||
          localFilters.category ||
          localFilters.excludeCommonUncommon ||
          localFilters.duplicatesOnly,
        )
      : false;

  return (
    <div className="flex flex-col gap-6">
      {/* Local search bar (collect/wishlist) */}
      {localSearch ? (
        <div className="relative flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--foreground)]/45"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={localSearch.value}
            onChange={(e) => localSearch.onChange(e.currentTarget.value)}
            placeholder="Search cards…"
            aria-label="Search cards"
            className="w-full rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/6 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[var(--foreground)]/35 focus:ring-2 focus:ring-[var(--foreground)]/15"
          />
          {localSearch.value ? (
            <button
              type="button"
              onClick={() => localSearch.onChange("")}
              className="absolute right-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--foreground)]/20 text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/30"
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
        <form ref={formRef} method="get" action={sf.formAction} className="flex items-center gap-2">
          {sf.extraHiddenFields
            ? Object.entries(sf.extraHiddenFields).map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))
            : null}
          {sf.activeSet ? <input type="hidden" name="set" value={sf.activeSet} /> : null}
          {sf.activePokemon ? <input type="hidden" name="pokemon" value={sf.activePokemon} /> : null}
          {sf.activeRarity ? <input type="hidden" name="rarity" value={sf.activeRarity} /> : null}
          {sf.excludeCommonUncommon ? <input type="hidden" name="exclude_cu" value="1" /> : null}
          {sf.activeCategory ? <input type="hidden" name="category" value={sf.activeCategory} /> : null}

          <div className="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--foreground)]/45"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              name="search"
              defaultValue={sf.activeSearch}
              placeholder="Search cards…"
              aria-label="Search cards"
              className="w-full rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/6 py-2 pl-8 pr-3 text-sm outline-none transition focus:border-[var(--foreground)]/35 focus:ring-2 focus:ring-[var(--foreground)]/15"
            />
          </div>

          {sf.activeSearch ? (
            <button
              type="button"
              onClick={() => {
                const params = new URLSearchParams();
                if (sf.extraHiddenFields) {
                  for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                }
                if (sf.activeSet) params.set("set", sf.activeSet);
                if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/14"
              aria-label="Clear search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}

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
      ) : null}

      {/* Tag row */}
      <div className="scrollbar-hide flex items-center gap-2 overflow-x-auto pb-0.5">
        {ownedFilterTag ? (
          <TagButton
            label="Cards I own"
            active={ownedFilterTag.active}
            onClick={ownedFilterTag.onToggle}
          />
        ) : null}

        {/* Clear filters — leftmost when active */}
        {hasActiveFilters && localFilters ? (
          <button
            type="button"
            onClick={() => {
              localFilters.onRarityChange("");
              localFilters.onCategoryChange("");
              localFilters.onExcludeCommonUncommonChange(false);
              localFilters.onDuplicatesOnlyChange?.(false);
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-400/40 bg-red-500/12 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
            Clear filters
          </button>
        ) : hasActiveFilters && sf ? (
          <button
            type="button"
            onClick={() => router.push(sf.resetHref)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-400/40 bg-red-500/12 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
            Clear filters
          </button>
        ) : null}

        {/* Group by set toggle */}
        <TagButton
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

        {/* Sort dropdown */}
        {sortControl ? (
          <div className="relative shrink-0">
            <select
              value={sortControl.value}
              onChange={(e) => sortControl.onChange(e.currentTarget.value)}
              aria-label="Sort order"
              className={`h-8 w-28 rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
                (sortControl.defaultValue !== undefined
                  ? sortControl.value !== sortControl.defaultValue
                  : Boolean(sortControl.value))
                  ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
              }`}
            >
              {sortControl.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown />
          </div>
        ) : null}

        {/* Local filter tags (collect/wishlist) */}
        {localFilters ? (
          <>
            <div className="relative shrink-0">
              <select
                value={localFilters.rarity}
                onChange={(e) => localFilters.onRarityChange(e.currentTarget.value)}
                aria-label="Filter by rarity"
                className={`h-8 w-28 rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
                  localFilters.rarity
                    ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
                }`}
              >
                <option value="">Rarity</option>
                {localFilters.rarityOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown />
            </div>

            <div className="relative shrink-0">
              <select
                value={localFilters.category}
                onChange={(e) => localFilters.onCategoryChange(e.currentTarget.value)}
                aria-label="Filter by card type"
                className={`h-8 w-28 rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
                  localFilters.category
                    ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
                }`}
              >
                <option value="">Card type</option>
                {localFilters.categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown />
            </div>

            <TagButton
              label="Rare+ only"
              active={localFilters.excludeCommonUncommon}
              onClick={() => localFilters.onExcludeCommonUncommonChange(!localFilters.excludeCommonUncommon)}
            />

            {typeof localFilters.duplicatesOnly === "boolean" && localFilters.onDuplicatesOnlyChange ? (
              <TagButton
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
            <div className="relative shrink-0">
              <select
                name="rarity-select"
                value={sf.activeRarity}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  const params = new URLSearchParams();
                  if (sf.extraHiddenFields) {
                    for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                  }
                  if (sf.activeSearch) params.set("search", sf.activeSearch);
                  if (sf.activeSet) params.set("set", sf.activeSet);
                  if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                  if (val) params.set("rarity", val);
                  if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                  if (sf.activeCategory) params.set("category", sf.activeCategory);
                  router.push(`${sf.formAction}?${params.toString()}`);
                }}
                aria-label="Filter by rarity"
                className={`h-8 w-28 rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
                  sf.activeRarity
                    ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
                }`}
              >
                <option value="">Rarity</option>
                {sf.rarityOptions.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown />
            </div>

            {/* Card type dropdown */}
            <div className="relative shrink-0">
              <select
                name="category-select"
                value={sf.activeCategory}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  const params = new URLSearchParams();
                  if (sf.extraHiddenFields) {
                    for (const [k, v] of Object.entries(sf.extraHiddenFields)) params.set(k, v);
                  }
                  if (sf.activeSearch) params.set("search", sf.activeSearch);
                  if (sf.activeSet) params.set("set", sf.activeSet);
                  if (sf.activePokemon) params.set("pokemon", sf.activePokemon);
                  if (sf.activeRarity) params.set("rarity", sf.activeRarity);
                  if (sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                  if (val) params.set("category", val);
                  router.push(`${sf.formAction}?${params.toString()}`);
                }}
                aria-label="Filter by card type"
                className={`h-8 w-28 rounded-full border py-0 pl-3 pr-7 text-xs font-medium transition [appearance:none] [-webkit-appearance:none] [background-image:none] outline-none ${
                  sf.activeCategory
                    ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                    : "border-[var(--foreground)]/20 bg-[var(--foreground)]/8 text-[var(--foreground)]/75 hover:border-[var(--foreground)]/30 hover:bg-[var(--foreground)]/12"
                }`}
              >
                <option value="">Card type</option>
                {sf.categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <ChevronDown />
            </div>

            {/* Exclude C/U toggle */}
            <TagButton
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
                if (sf.activeCategory) params.set("category", sf.activeCategory);
                if (!sf.excludeCommonUncommon) params.set("exclude_cu", "1");
                router.push(`${sf.formAction}?${params.toString()}`);
              }}
            />

          </>
        ) : null}
      </div>
    </div>
  );
}
