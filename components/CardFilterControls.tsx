"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type QueryValue = string | null | undefined;

function useQueryUpdater() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (updates: Record<string, QueryValue>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (normalized) {
          params.set(key, normalized);
        } else {
          params.delete(key);
        }
      });

      params.delete("page");

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );
}

type SearchCardNameInputProps = {
  value: string;
  setValue: string;
  rarityValue: string;
  className?: string;
};

export function SearchCardNameInput({
  value,
  setValue,
  rarityValue,
  className,
}: SearchCardNameInputProps) {
  const updateQuery = useQueryUpdater();
  const [searchText, setSearchText] = useState(value);
  const skipNextDebouncedUpdateRef = useRef(false);

  useEffect(() => {
    setSearchText(value);
  }, [value]);

  useEffect(() => {
    if (skipNextDebouncedUpdateRef.current) {
      skipNextDebouncedUpdateRef.current = false;
      return;
    }

    const timeout = window.setTimeout(() => {
      if (searchText === value) return;
      updateQuery({
        search: searchText,
        set: setValue,
        rarity: rarityValue,
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [rarityValue, searchText, setValue, updateQuery, value]);

  return (
    <div className={`relative ${className ?? ""}`.trim()}>
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
        value={searchText}
        placeholder="Search card name"
        aria-label="Search card name"
        onChange={(event) => setSearchText(event.currentTarget.value)}
        className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-7 py-1.5 pr-8 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_8px_20px_rgba(0,0,0,0.18)] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20"
      />
      {searchText ? (
        <button
          type="button"
          onClick={() => {
            skipNextDebouncedUpdateRef.current = true;
            setSearchText("");
            updateQuery({
              search: "",
              set: setValue,
              rarity: rarityValue,
            });
          }}
          className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--foreground)]/15 text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

type RarityFilterSelectProps = {
  value: string;
  options: string[];
  setValue: string;
  searchValue: string;
  className?: string;
};

export function RarityFilterSelect({
  value,
  options,
  setValue,
  searchValue,
  className,
}: RarityFilterSelectProps) {
  const updateQuery = useQueryUpdater();

  return (
    <div className={`relative ${className ?? ""}`.trim()}>
      <select
        id="rarity"
        name="rarity"
        value={value}
        onChange={(event) =>
          updateQuery({
            rarity: event.currentTarget.value,
            set: setValue,
            search: searchValue,
          })
        }
        className="w-full rounded-md border border-[var(--foreground)]/20 bg-[var(--background)] px-2 py-1.5 pr-7 text-xs shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] outline-none transition focus:border-[var(--foreground)]/40 focus:ring-2 focus:ring-[var(--foreground)]/20 [appearance:none] [-webkit-appearance:none] [background-image:none]"
      >
        <option value="">All rarities</option>
        {options.map((rarity) => (
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
  );
}
