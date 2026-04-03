"use client";

import Link from "next/link";
import { buildSealedBrowseHref } from "@/lib/r2SealedProducts";

type FilterOption = {
  name: string;
  count: number;
};

type SealedFiltersPanelProps = {
  activeSearch: string;
  activeType: string;
  activeSeries: string;
  activeSort: string;
  typeOptions: FilterOption[];
  seriesOptions: FilterOption[];
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
  activeType,
  activeSeries,
  activeSort,
  typeOptions,
  seriesOptions,
  onSelection,
}: SealedFiltersPanelProps) {
  return (
    <div className="space-y-4">
      <FilterSection
        title="Product Type"
        activeValue={activeType}
        allLabel="All types"
        allHref={buildSealedBrowseHref({
          search: activeSearch,
          series: activeSeries,
          sort: activeSort,
        })}
        options={typeOptions}
        onSelection={onSelection}
        hrefBuilder={(value) =>
          buildSealedBrowseHref({
            search: activeSearch,
            type: value,
            series: activeSeries,
            sort: activeSort,
          })}
      />

      <FilterSection
        title="Series"
        activeValue={activeSeries}
        allLabel="All series"
        allHref={buildSealedBrowseHref({
          search: activeSearch,
          type: activeType,
          sort: activeSort,
        })}
        options={seriesOptions}
        onSelection={onSelection}
        hrefBuilder={(value) =>
          buildSealedBrowseHref({
            search: activeSearch,
            type: activeType,
            series: value,
            sort: activeSort,
          })}
      />
    </div>
  );
}
