"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FilterChipRow, FilterClearChip, FilterControlsShell } from "@/components/card-filters/FilterPrimitives";
import { buildSealedBrowseHref } from "@/lib/r2SealedProducts";

type FilterOption = {
  value: string;
  label: string;
};

type SealedTagFilterRowProps = {
  activeSeries: string;
  activeType: string;
  activeSort: string;
  resetHref: string;
  seriesOptions: FilterOption[];
  typeOptions: FilterOption[];
  basePath?: string;
  tab?: string;
};

type SheetKey = "sort" | "type" | "series";

const SORT_OPTIONS = [
  { value: "", label: "Featured" },
  { value: "price-desc", label: "Price" },
  { value: "release-desc", label: "Newest" },
  { value: "name-asc", label: "Name" },
];

function IconSort() {
  return (
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
      <path d="M11 5h10" />
      <path d="M11 9h7" />
      <path d="M11 13h4" />
      <path d="M4 17V7" />
      <path d="m1 10 3-3 3 3" />
      <path d="M20 17v-6" />
      <path d="m17 14 3 3 3-3" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TopChromeChipSelect({
  label,
  active = false,
  clearable = false,
  count,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  clearable?: boolean;
  count?: number;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  const hasLeadingIcon = Boolean(icon);
  const displayLabel = count && count > 0 ? `${label} (${count})` : label;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-8 shrink-0 items-center rounded-full border ${hasLeadingIcon ? "pl-8" : "pl-3"} pr-7 text-[12px] font-medium outline-none transition ${
        active
          ? "border-2 border-white bg-black text-white"
          : "border-white/24 bg-black text-white/88 hover:border-white/40 hover:bg-white/[0.06]"
      }`}
    >
      <span className="whitespace-nowrap opacity-0" aria-hidden="true">
        {displayLabel}
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 flex items-center whitespace-nowrap">
        <span className={hasLeadingIcon ? "pl-8 pr-7" : "pl-3 pr-7"}>{displayLabel}</span>
      </span>
      {icon ? (
        <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${active ? "text-white" : "text-white/78"}`}>
          {icon}
        </span>
      ) : null}
      {active && clearable ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-white/70">×</span>
      ) : (
        <span className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${active ? "text-white" : "text-white/60"}`}>
          <IconChevronDown />
        </span>
      )}
    </button>
  );
}

function FilterSheetModal({
  title,
  value,
  options,
  onClose,
  onApply,
}: {
  title: string;
  value: string;
  options: { value: string; label: string }[];
  onClose: () => void;
  onApply: (value: string) => void;
}) {
  const [draftValue, setDraftValue] = useState(value);

  useEffect(() => {
    setDraftValue(value);
  }, [value]);

  const selectedCount = draftValue ? 1 : 0;

  return (
    <div
      className="fixed inset-0 z-[1004] flex items-end justify-center bg-[var(--foreground)]/45"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pointer-events-auto w-full max-w-[34rem] rounded-t-[2rem] border border-[var(--foreground)]/15 bg-[var(--background)] text-[var(--foreground)] shadow-[0_-18px_60px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex justify-center pt-3">
          <span className="h-1.5 w-14 rounded-full bg-[var(--foreground)]/20" />
        </div>
        <div className="flex items-center justify-between border-b border-[var(--foreground)]/12 px-6 pb-5 pt-4">
          <h2 className="text-xl font-semibold">
            {title}
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--foreground)]/70 transition hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)]"
            aria-label={`Close ${title}`}
          >
            ×
          </button>
        </div>

        <div className="max-h-[50dvh] overflow-y-auto px-6 py-3">
          <div className="flex flex-col">
            {options.map((option) => {
              const selected = draftValue === option.value;
              return (
                <button
                  key={option.value || "__empty"}
                  type="button"
                  onClick={() => setDraftValue(option.value)}
                  className="flex items-center gap-4 rounded-xl px-1 py-3 text-left transition hover:bg-[var(--foreground)]/6"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                      selected
                        ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                        : "border-[var(--foreground)]/35 text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                  </span>
                  <span className="text-base text-[var(--foreground)]">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pb-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+1rem))] pt-3">
          <button
            type="button"
            onClick={() => onApply(draftValue)}
            className="w-full rounded-full border border-[var(--foreground)]/20 bg-[var(--foreground)] px-5 py-4 text-lg font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}

export function SealedTagFilterRow({
  activeSeries,
  activeType,
  activeSort,
  resetHref,
  seriesOptions = [],
  typeOptions = [],
  basePath = "/sealed",
  tab,
}: SealedTagFilterRowProps) {
  const router = useRouter();
  const [activeSheet, setActiveSheet] = useState<SheetKey | null>(null);
  const hasActiveFilters = Boolean(activeSeries || activeType || activeSort);

  useEffect(() => {
    if (!activeSheet) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [activeSheet]);

  const pushFilters = (next: {
    type?: string;
    series?: string;
    sort?: string;
  }) => {
    router.push(
      buildSealedBrowseHref({
        type: next.type ?? activeType,
        series: next.series ?? activeSeries,
        sort: next.sort ?? activeSort,
      }, {
        basePath,
        tab,
      }),
    );
  };

  const sheetConfig: Record<SheetKey, { title: string; value: string; options: { value: string; label: string }[]; onApply: (value: string) => void }> = {
    sort: {
      title: "Sort",
      value: activeSort,
      options: SORT_OPTIONS,
      onApply: (value) => pushFilters({ sort: value }),
    },
    type: {
      title: "Type",
      value: activeType,
      options: [{ value: "", label: "All types" }, ...typeOptions],
      onApply: (value) => pushFilters({ type: value }),
    },
    series: {
      title: "Series",
      value: activeSeries,
      options: [{ value: "", label: "All series" }, ...seriesOptions],
      onApply: (value) => pushFilters({ series: value }),
    },
  };

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-white/8 bg-black/95 px-4 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-black/80">
        <FilterControlsShell>
          <FilterChipRow>
            {hasActiveFilters ? <FilterClearChip onClick={() => router.push(resetHref)} /> : null}
            <TopChromeChipSelect
              label="Sort"
              active
              clearable={Boolean(activeSort)}
              count={activeSort ? 1 : 0}
              icon={<IconSort />}
              onClick={() => {
                if (activeSort) {
                  pushFilters({ sort: "" });
                  return;
                }
                setActiveSheet("sort");
              }}
            />
            <TopChromeChipSelect
              label="Type"
              active={Boolean(activeType)}
              clearable={Boolean(activeType)}
              count={activeType ? 1 : 0}
              onClick={() => {
                if (activeType) {
                  pushFilters({ type: "" });
                  return;
                }
                setActiveSheet("type");
              }}
            />
            <TopChromeChipSelect
              label="Series"
              active={Boolean(activeSeries)}
              clearable={Boolean(activeSeries)}
              count={activeSeries ? 1 : 0}
              onClick={() => {
                if (activeSeries) {
                  pushFilters({ series: "" });
                  return;
                }
                setActiveSheet("series");
              }}
            />
          </FilterChipRow>
        </FilterControlsShell>
      </div>

      {activeSheet && typeof document !== "undefined"
        ? createPortal(
            <FilterSheetModal
              title={sheetConfig[activeSheet].title}
              value={sheetConfig[activeSheet].value}
              options={sheetConfig[activeSheet].options}
              onClose={() => setActiveSheet(null)}
              onApply={(value) => {
                sheetConfig[activeSheet].onApply(value);
                setActiveSheet(null);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
