"use client";

import Link from "next/link";
import { buildSealedBrowseHref } from "@/lib/r2SealedProducts";

type FilterOption = {
  name: string;
  count: number;
};

type SealedFiltersPanelProps = {
  activeSearch: string;
  activeTcg: string;
  activeType: string;
  activeLanguage: string;
  liveOnly: boolean;
  tcgOptions: FilterOption[];
  typeOptions: FilterOption[];
  languageOptions: FilterOption[];
  onSelection?: () => void;
};

function FilterSection({
  title,
  activeValue,
  allLabel,
  allHref,
  options,
  hrefBuilder,
  onSelection,
}: {
  title: string;
  activeValue: string;
  allLabel: string;
  allHref: string;
  options: FilterOption[];
  hrefBuilder: (value: string) => string;
  onSelection?: () => void;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">{title}</h3>
      <div className="flex flex-wrap gap-2">
        <Link
          href={allHref}
          prefetch={false}
          onClick={onSelection}
          className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
            !activeValue
              ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
              : "border-[var(--foreground)]/18 bg-[var(--foreground)]/6 text-[var(--foreground)]/82 hover:bg-[var(--foreground)]/10"
          }`}
        >
          {allLabel}
        </Link>
        {options.map((option) => {
          const isActive = activeValue === option.name;
          return (
            <Link
              key={option.name}
              href={hrefBuilder(option.name)}
              prefetch={false}
              onClick={onSelection}
              className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
                isActive
                  ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                  : "border-[var(--foreground)]/18 bg-[var(--foreground)]/6 text-[var(--foreground)]/82 hover:bg-[var(--foreground)]/10"
              }`}
            >
              {option.name} ({option.count})
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function SealedFiltersPanel({
  activeSearch,
  activeTcg,
  activeType,
  activeLanguage,
  liveOnly,
  tcgOptions,
  typeOptions,
  languageOptions,
  onSelection,
}: SealedFiltersPanelProps) {
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--foreground)]/55">Status</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href={buildSealedBrowseHref({
              search: activeSearch,
              tcg: activeTcg,
              type: activeType,
              language: activeLanguage,
              liveOnly: false,
            })}
            prefetch={false}
            onClick={onSelection}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              !liveOnly
                ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--foreground)]/18 bg-[var(--foreground)]/6 text-[var(--foreground)]/82 hover:bg-[var(--foreground)]/10"
            }`}
          >
            All products
          </Link>
          <Link
            href={buildSealedBrowseHref({
              search: activeSearch,
              tcg: activeTcg,
              type: activeType,
              language: activeLanguage,
              liveOnly: true,
            })}
            prefetch={false}
            onClick={onSelection}
            className={`inline-flex rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
              liveOnly
                ? "border-[var(--foreground)]/40 bg-[var(--foreground)] text-[var(--background)]"
                : "border-[var(--foreground)]/18 bg-[var(--foreground)]/6 text-[var(--foreground)]/82 hover:bg-[var(--foreground)]/10"
            }`}
          >
            Live only
          </Link>
        </div>
      </section>

      <FilterSection
        title="TCG"
        activeValue={activeTcg}
        allLabel="All TCGs"
        allHref={buildSealedBrowseHref({
          search: activeSearch,
          type: activeType,
          language: activeLanguage,
          liveOnly,
        })}
        options={tcgOptions}
        onSelection={onSelection}
        hrefBuilder={(value) =>
          buildSealedBrowseHref({
            search: activeSearch,
            tcg: value,
            type: activeType,
            language: activeLanguage,
            liveOnly,
          })}
      />

      <FilterSection
        title="Product Type"
        activeValue={activeType}
        allLabel="All types"
        allHref={buildSealedBrowseHref({
          search: activeSearch,
          tcg: activeTcg,
          language: activeLanguage,
          liveOnly,
        })}
        options={typeOptions}
        onSelection={onSelection}
        hrefBuilder={(value) =>
          buildSealedBrowseHref({
            search: activeSearch,
            tcg: activeTcg,
            type: value,
            language: activeLanguage,
            liveOnly,
          })}
      />

      <FilterSection
        title="Language"
        activeValue={activeLanguage}
        allLabel="All languages"
        allHref={buildSealedBrowseHref({
          search: activeSearch,
          tcg: activeTcg,
          type: activeType,
          liveOnly,
        })}
        options={languageOptions}
        onSelection={onSelection}
        hrefBuilder={(value) =>
          buildSealedBrowseHref({
            search: activeSearch,
            tcg: activeTcg,
            type: activeType,
            language: value,
            liveOnly,
          })}
      />
    </div>
  );
}
