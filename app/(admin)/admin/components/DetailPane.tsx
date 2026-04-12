"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { FieldEditor } from "./FieldEditor";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMediaUrl(base: string) {
  return function mediaUrl(path: string | null | undefined): string | null {
    if (!path) return null;
    if (/^https?:\/\//i.test(path)) return path;
    const b = base.replace(/\/+$/, "");
    if (!b) return null;
    return `${b}/${path.replace(/^\/+/, "")}`;
  };
}

const PRIORITY_FIELDS = [
  "id", "masterCardId", "priceKey", "name", "cardName", "setCode", "setKey",
  "seriesName", "releaseDate", "cardNumber", "rarity", "category",
];

function sortedEntries(item: Record<string, unknown>): [string, unknown][] {
  const priority = PRIORITY_FIELDS.filter((f) => f in item);
  const rest = Object.keys(item).filter((k) => !PRIORITY_FIELDS.includes(k)).sort();
  return [...priority, ...rest].map((k) => [k, item[k]]);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function ReadonlyValue({ value }: { value: unknown }) {
  if (value === null || value === undefined)
    return <span className="italic text-neutral-400">null</span>;
  if (Array.isArray(value))
    return (
      <span className="font-mono text-xs">
        [{value.map((v, i) => (
          <span key={i}>{i > 0 ? ", " : ""}{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        ))}]
      </span>
    );
  if (typeof value === "object")
    return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

function SafeImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) return <div className="flex h-full items-center justify-center text-xs text-neutral-400">Image unavailable</div>;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className ?? "object-contain"}
      onError={() => setErrored(true)}
      unoptimized
    />
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

export type SelectedItemKind = "brand" | "series" | "set" | "card";

type PricingData = { pricing: unknown; history: unknown; trends: unknown } | null;

type DetailPaneProps = {
  item: Record<string, unknown> | null;
  kind: SelectedItemKind | null;
  draft: Record<string, unknown> | null;
  saving: boolean;
  saveError: string | null;
  cardPricing: PricingData;
  pricingLoading: boolean;
  mediaBaseUrl: string;
  onFieldChange: (field: string, value: unknown) => void;
  onSave: () => void;
  onCancelEdit: () => void;
};

// ── Tab definitions ────────────────────────────────────────────────────────

type Tab = "details" | "pricing" | "history" | "trends" | "images";

function getAvailableTabs(kind: SelectedItemKind | null): Tab[] {
  if (kind === "card") return ["details", "pricing", "history", "trends", "images"];
  if (kind === "set") return ["details", "images"];
  if (kind === "brand") return ["details", "images"];
  return ["details"];
}

const TAB_LABELS: Record<Tab, string> = {
  details: "Details",
  pricing: "Pricing",
  history: "History",
  trends:  "Trends",
  images:  "Images",
};

// ── Main component ─────────────────────────────────────────────────────────

export function DetailPane({
  item,
  kind,
  draft,
  saving,
  saveError,
  cardPricing,
  pricingLoading,
  mediaBaseUrl,
  onFieldChange,
  onSave,
  onCancelEdit,
}: DetailPaneProps) {
  const mediaUrl = makeMediaUrl(mediaBaseUrl);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("details");

  const itemKey = item ? Object.keys(item).slice(0, 3).join(",") : null;
  useEffect(() => {
    setEditMode(false);
    setActiveTab("details");
  }, [itemKey]);

  if (!item || !kind) {
    return (
      <div style={{ flex: 1 }} className="flex items-center justify-center text-sm text-neutral-400">
        Select an item to view its details
      </div>
    );
  }

  const canEdit = kind === "set" || kind === "card";
  const effectiveItem = draft ? { ...item, ...draft } : item;
  const hasDraft = draft && Object.keys(draft).length > 0;
  const tabs = getAvailableTabs(kind);

  function handleCancel() {
    setEditMode(false);
    onCancelEdit();
  }

  // ── Tab content ──────────────────────────────────────────────────────────

  function renderDetails() {
    return (
      <div className="space-y-3">
        {sortedEntries(effectiveItem).map(([field, value]) => (
          <div key={field}>
            <label className="mb-0.5 block text-xs font-medium uppercase tracking-wide text-neutral-400">
              {field}
              {draft && field in draft && editMode && (
                <span className="ml-1 text-yellow-500">*</span>
              )}
            </label>
            {!canEdit || !editMode ? (
              <div className="min-h-[28px] rounded px-2 py-1 text-sm">
                <ReadonlyValue value={value} />
              </div>
            ) : (
              <FieldEditor fieldName={field} value={value} onChange={(v) => onFieldChange(field, v)} />
            )}
          </div>
        ))}
      </div>
    );
  }

  function renderPricing() {
    if (pricingLoading) return <div className="text-xs text-neutral-400">Loading pricing…</div>;
    if (!cardPricing?.pricing) return <div className="text-xs text-neutral-400">No market price data for this card</div>;
    return (
      <pre className="overflow-auto rounded border border-neutral-200 p-3 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
        {JSON.stringify(cardPricing.pricing, null, 2)}
      </pre>
    );
  }

  function renderHistory() {
    if (pricingLoading) return <div className="text-xs text-neutral-400">Loading history…</div>;
    if (!cardPricing?.history) return <div className="text-xs text-neutral-400">No price history for this card</div>;
    return (
      <pre className="overflow-auto rounded border border-neutral-200 p-3 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
        {JSON.stringify(cardPricing.history, null, 2)}
      </pre>
    );
  }

  function renderTrends() {
    if (pricingLoading) return <div className="text-xs text-neutral-400">Loading trends…</div>;
    if (!cardPricing?.trends) return <div className="text-xs text-neutral-400">No price trends for this card</div>;
    return (
      <pre className="overflow-auto rounded border border-neutral-200 p-3 font-mono text-xs text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
        {JSON.stringify(cardPricing.trends, null, 2)}
      </pre>
    );
  }

  function renderImages() {
    if (kind === "card") {
      const hi  = mediaUrl(effectiveItem.imageHighSrc as string);
      const lo  = mediaUrl(effectiveItem.imageLowSrc as string ?? effectiveItem.imageUrl as string ?? effectiveItem.imagePath as string);
      const src = hi ?? lo;
      if (!src) return <div className="text-xs text-neutral-400">No image available</div>;
      return (
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-80 w-56 overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
            <SafeImage src={src} alt={effectiveItem.cardName as string ?? effectiveItem.name as string ?? "Card"} className="object-contain p-1" />
          </div>
          {hi && lo && hi !== lo && (
            <div className="w-full">
              <div className="mb-1 text-xs uppercase tracking-wide text-neutral-400">Low res</div>
              <div className="relative h-48 w-36 overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
                <SafeImage src={lo} alt="Low res card" className="object-contain p-1" />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (kind === "set") {
      const logo   = mediaUrl(effectiveItem.logoSrc as string ?? effectiveItem.imageUrl as string ?? effectiveItem.imagePath as string);
      const symbol = mediaUrl(effectiveItem.symbolSrc as string);
      if (!logo && !symbol) return <div className="text-xs text-neutral-400">No images available</div>;
      return (
        <div className="flex flex-col gap-6">
          {logo && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Logo</div>
              <div className="relative h-32 w-full overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
                <SafeImage src={logo} alt="Set logo" className="object-contain p-3" />
              </div>
            </div>
          )}
          {symbol && (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Symbol</div>
              <div className="relative h-20 w-20 overflow-hidden rounded border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900">
                <SafeImage src={symbol} alt="Set symbol" className="object-contain p-2" />
              </div>
            </div>
          )}
        </div>
      );
    }

    if (kind === "brand") {
      const logoObj = effectiveItem.logo as { r2ObjectKey?: string } | undefined;
      const key =
        logoObj?.r2ObjectKey ??
        (typeof effectiveItem.logoSrc === "string" ? effectiveItem.logoSrc : undefined) ??
        (typeof effectiveItem.imageUrl === "string" ? effectiveItem.imageUrl : undefined);
      const logo = mediaUrl(key);
      const label = (effectiveItem.name as string | undefined) ?? (effectiveItem.brand as string | undefined) ?? "Brand";
      if (!logo) {
        return (
          <div className="text-xs text-neutral-400">
            No logo in brand catalog. Add <span className="font-mono">logo.r2ObjectKey</span> in{" "}
            <span className="font-mono">brands/data/brands.json</span> on R2.
          </div>
        );
      }
      return (
        <div className="flex flex-col gap-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Logo</div>
            <div className="relative h-40 w-full max-w-sm overflow-hidden rounded-xl border border-neutral-200/80 bg-neutral-50/80 shadow-sm backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/50">
              <SafeImage src={logo} alt={label} className="object-contain p-4" />
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // ── Layout ───────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* Top bar: title + edit controls */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-2 dark:border-neutral-700">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          {effectiveItem.cardName as string ?? effectiveItem.name as string ?? kind}
        </span>
        <div className="flex items-center gap-2">
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
          {canEdit && !editMode && (
            <button
              onClick={() => { setActiveTab("details"); setEditMode(true); }}
              className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Edit
            </button>
          )}
          {canEdit && editMode && (
            <>
              <button
                onClick={handleCancel}
                className="rounded border border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={!hasDraft || saving}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save to R2"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-neutral-200 dark:border-neutral-700">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: "auto" }} className="px-4 py-3">
        {activeTab === "details" && renderDetails()}
        {activeTab === "pricing" && renderPricing()}
        {activeTab === "history" && renderHistory()}
        {activeTab === "trends"  && renderTrends()}
        {activeTab === "images"  && renderImages()}
      </div>

    </div>
  );
}
