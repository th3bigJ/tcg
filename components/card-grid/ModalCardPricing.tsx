"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CardPriceHistory, PriceHistoryPoint } from "@/lib/staticDataTypes";
import {
  buildEbayUkSoldListingsUrl,
  buildPokemonEbaySoldSearchQuery,
  type EbayPokemonCardSearchParts,
} from "@/lib/ebaySoldSearchUrl";
import { normalizeVariantForStorage, variantLabel } from "@/lib/cardVariantLabels";

const gbpFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

const MARKETPLACE_LOGO_SRC = {
  tcgplayer: "/marketplace-logos/tcgplayer.png",
  cardmarket: "/marketplace-logos/cardmarket.png",
  ebay: "/marketplace-logos/ebay.png",
} as const;

function readUsdMarket(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

function readPsa10(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  return typeof o.psa10 === "number" && Number.isFinite(o.psa10) ? o.psa10 : null;
}

function readAce10(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  return typeof o.ace10 === "number" && Number.isFinite(o.ace10) ? o.ace10 : null;
}

function variantMatches(current: string | null | undefined, target: string): boolean {
  return (normalizeVariantForStorage(current) ?? "Unlisted") === (normalizeVariantForStorage(target) ?? "Unlisted");
}

function formatMoneyGbp(n: number): string {
  return gbpFormatter.format(n);
}

type HistoryWindowKey = "daily" | "weekly" | "monthly";
type GradeKey = "raw" | "psa10" | "ace10";

const HISTORY_WINDOW_LABELS: Record<HistoryWindowKey, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const GRADE_LABELS: Record<GradeKey, string> = {
  raw: "Raw",
  psa10: "PSA 10",
  ace10: "ACE 10",
};

function gradeLabel(grade: GradeKey): string {
  return GRADE_LABELS[grade];
}

function readHistoryWindow(
  history: CardPriceHistory | null,
  variant: string,
  grade: GradeKey,
  window: HistoryWindowKey,
): PriceHistoryPoint[] {
  const points = history?.[variant]?.[grade]?.[window];
  return Array.isArray(points)
    ? points.filter(
        (point): point is PriceHistoryPoint =>
          Array.isArray(point) &&
          point.length === 2 &&
          typeof point[0] === "string" &&
          typeof point[1] === "number" &&
          Number.isFinite(point[1]),
      )
    : [];
}

function formatHistoryDateLabel(key: string, window: HistoryWindowKey): string {
  if (window === "weekly") return key.replace("-", " ");
  if (window === "monthly") return key;
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return key;
  const date = new Date(`${key}T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function computePercentChange(points: PriceHistoryPoint[]): number | null {
  if (points.length < 2) return null;
  const previous = points[points.length - 2]?.[1];
  const current = points[points.length - 1]?.[1];
  if (typeof previous !== "number" || typeof current !== "number" || !Number.isFinite(previous) || !Number.isFinite(current)) {
    return null;
  }
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatPercentChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function changeTone(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "text-white";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-rose-300";
  return "text-sky-200";
}

function PriceHistoryChart({
  points,
  window,
}: {
  points: PriceHistoryPoint[];
  window: HistoryWindowKey;
}) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(points.length - 1, 0));
  const width = 560;
  const height = 264;
  const padding = { top: 14, right: 10, bottom: 32, left: 10 };
  const values = points.map(([, value]) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(max * 0.04, 1);
  const chartMin = Math.max(0, min - range * 0.12);
  const chartMax = max + range * 0.12;
  const chartRange = chartMax - chartMin || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  useEffect(() => {
    setSelectedIndex(Math.max(points.length - 1, 0));
  }, [points]);

  const plottedPoints = points.map(([key, value], index) => {
    const x = padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const normalized = (value - chartMin) / chartRange;
    const y = padding.top + innerHeight - normalized * innerHeight;
    return { key, value, index, x, y };
  });

  const path = plottedPoints
    .map(({ x, y }, index) => {
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  const areaPath = path
    ? `${path} L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`
    : "";

  const lastPoint = points[points.length - 1] ?? null;
  const activePoint = plottedPoints[selectedIndex] ?? plottedPoints[plottedPoints.length - 1] ?? null;
  const startLabel = points[0] ? formatHistoryDateLabel(points[0][0], window) : "";
  const middlePoint = points.length > 2 ? points[Math.floor((points.length - 1) / 2)] : null;
  const middleLabel = middlePoint ? formatHistoryDateLabel(middlePoint[0], window) : "";
  const endLabel = lastPoint ? formatHistoryDateLabel(lastPoint[0], window) : "";
  const yTicks = [chartMax, chartMin + chartRange / 2, chartMin].map((value) => ({
    value,
    label: formatMoneyGbp(value),
    y: padding.top + innerHeight - ((value - chartMin) / chartRange) * innerHeight,
  }));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-2 py-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">{HISTORY_WINDOW_LABELS[window]}</div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {activePoint ? formatMoneyGbp(activePoint.value) : "No data"}
          </div>
          <div className="mt-1 text-xs font-medium text-white/55">
            {activePoint ? formatHistoryDateLabel(activePoint.key, window) : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Range</div>
          <div className="mt-1 text-xs font-medium tabular-nums text-white/80">
            {formatMoneyGbp(min)} to {formatMoneyGbp(max)}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-60 w-full overflow-visible">
        <defs>
          <linearGradient id="price-history-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.38)" />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
          </linearGradient>
        </defs>
        {yTicks.map((tick, index) => (
          <g key={`tick-${index}`}>
            <line
              x1={padding.left}
              y1={tick.y}
              x2={padding.left + innerWidth}
              y2={tick.y}
              stroke={index === yTicks.length - 1 ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.09)"}
              strokeWidth="1"
            />
            <text
              x={2}
              y={tick.y + 4}
              textAnchor="start"
              fontSize="10"
              fill="rgba(255,255,255,0.46)"
            >
              {tick.label}
            </text>
          </g>
        ))}
        {areaPath ? <path d={areaPath} fill="url(#price-history-fill)" /> : null}
        {path ? (
          <path
            d={path}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {activePoint ? (
          <line
            x1={activePoint.x}
            y1={padding.top}
            x2={activePoint.x}
            y2={padding.top + innerHeight}
            stroke="rgba(56,189,248,0.22)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ) : null}
        {plottedPoints.map(({ key, value, index, x, y }) => {
          const isActive = activePoint?.index === index;
          return (
            <g key={`${key}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r={isActive ? 8 : 6}
                fill="transparent"
                className="cursor-pointer"
                onClick={() => setSelectedIndex(index)}
              />
              <circle
                cx={x}
                cy={y}
                r={isActive ? 4.75 : 3}
                fill={isActive ? "#38bdf8" : "#bae6fd"}
                stroke={isActive ? "#e0f2fe" : "rgba(0,0,0,0.45)"}
                strokeWidth={isActive ? 1.5 : 1}
                className="cursor-pointer"
                onClick={() => setSelectedIndex(index)}
              />
            </g>
          );
        })}
        {activePoint ? (
          <g pointerEvents="none">
            <circle cx={activePoint.x} cy={activePoint.y} r={10} fill="rgba(56,189,248,0.10)" />
            <circle cx={activePoint.x} cy={activePoint.y} r={4.75} fill="#38bdf8" stroke="#e0f2fe" strokeWidth={1.5} />
          </g>
        ) : null}
      </svg>

      <div className="mt-2 grid grid-cols-3 items-center gap-3 text-[11px] font-medium tracking-wide text-white/45">
        <span className="truncate">{startLabel}</span>
        <span className="truncate text-center">{middleLabel}</span>
        <span className="truncate text-right">{endLabel}</span>
      </div>

    </div>
  );
}

function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  labelFor,
}: {
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <div className="scrollbar-hide flex gap-2 overflow-x-auto">
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide transition ${
              active
                ? "border-sky-400/60 bg-sky-400/18 text-sky-200"
                : "border-white/10 bg-white/[0.06] text-white/65 hover:bg-white/[0.1]"
            }`}
          >
            {labelFor(option)}
          </button>
        );
      })}
    </div>
  );
}

function CompactSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  labelFor,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
  labelFor: (value: T) => string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="w-full appearance-none bg-transparent pr-7 text-sm font-medium text-white outline-none"
        >
          {options.map((option) => (
            <option key={option} value={option} className="bg-neutral-900 text-white">
              {labelFor(option)}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-white/45">▾</span>
      </div>
    </label>
  );
}

function ChangeCard({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${changeTone(value)}`}>
        {formatPercentChange(value)}
      </div>
    </div>
  );
}

function MarketplacePricingLogo({ which }: { which: keyof typeof MARKETPLACE_LOGO_SRC }) {
  const isVertical = which === "cardmarket";
  return (
    <img
      src={MARKETPLACE_LOGO_SRC[which]}
      alt=""
      aria-hidden
      className={
        isVertical
          ? "h-10 w-auto max-h-10 max-w-[56px] shrink-0 object-contain object-left"
          : "h-8 w-auto max-h-8 max-w-[104px] shrink-0 object-contain object-left"
      }
    />
  );
}

export function ModalCardPricing({
  masterCardId,
  externalId,
  legacyExternalId,
  ebayCardContext,
  onVariantsLoaded,
  onAdd,
  onWishlist,
  wishlisted,
  wishlistedVariants,
  /** When true, + / wishlist controls are shown on the card image instead of each variant row. */
  hidePerVariantActions,
}: {
  masterCardId?: string;
  externalId?: string;
  legacyExternalId?: string;
  ebayCardContext: EbayPokemonCardSearchParts;
  onVariantsLoaded?: (variants: string[]) => void;
  onAdd?: (variant: string) => void;
  onWishlist?: (variant: string) => void;
  wishlisted?: boolean;
  wishlistedVariants?: string[] | null;
  hidePerVariantActions?: boolean;
}) {
  const mid = masterCardId?.trim() ?? "";
  const ext = externalId?.trim() ?? "";
  const showDexRows = Boolean(mid || ext);

  const [payload, setPayload] = useState<{ tcgplayer: unknown; cardmarket: unknown } | null>(null);
  const [history, setHistory] = useState<CardPriceHistory | null>(null);
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<HistoryWindowKey>("daily");
  const [selectedVariant, setSelectedVariant] = useState<string>("");
  const [selectedGrade, setSelectedGrade] = useState<GradeKey>("raw");
  const onVariantsLoadedRef = useRef(onVariantsLoaded);
  onVariantsLoadedRef.current = onVariantsLoaded;

  useEffect(() => {
    if (!mid && !ext) return;
    let cancelled = false;

    const load = async () => {
      try {
        setPricingLoaded(false);
        setPayload(null);
        const params = new URLSearchParams();
        const legacy = legacyExternalId?.trim() ?? "";
        if (legacy && !mid) params.set("fallbackExternalId", legacy);
        const url = mid
          ? `/api/card-pricing/by-master/${encodeURIComponent(mid)}`
          : `/api/card-prices/${encodeURIComponent(ext)}${params.size > 0 ? `?${params.toString()}` : ""}`;
        const r = await fetch(url);
        if (cancelled) return;
        let j: { tcgplayer?: unknown; cardmarket?: unknown };
        try {
          j = (await r.json()) as { tcgplayer?: unknown; cardmarket?: unknown };
        } catch {
          j = {};
        }
        if (cancelled) return;
        const tp = j.tcgplayer ?? null;
        setPayload({ tcgplayer: tp, cardmarket: j.cardmarket ?? null });
      } catch {
        if (!cancelled) {
          setPayload({ tcgplayer: null, cardmarket: null });
          onVariantsLoadedRef.current?.(["Unlisted"]);
        }
      } finally {
        if (!cancelled) setPricingLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mid, ext, legacyExternalId]);

  useEffect(() => {
    if (!mid && !ext) {
      setHistory(null);
      setHistoryLoaded(true);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        setHistoryLoaded(false);
        setHistory(null);
        const params = new URLSearchParams();
        const legacy = legacyExternalId?.trim() ?? "";
        if (legacy && !mid) params.set("fallbackExternalId", legacy);
        const url = mid
          ? `/api/card-price-history/by-master/${encodeURIComponent(mid)}`
          : `/api/card-price-history/${encodeURIComponent(ext)}${params.size > 0 ? `?${params.toString()}` : ""}`;
        const response = await fetch(url);
        if (cancelled) return;
        if (!response.ok) {
          setHistory(null);
          return;
        }
        const json = (await response.json()) as CardPriceHistory;
        if (!cancelled) setHistory(json && typeof json === "object" ? json : null);
      } catch {
        if (!cancelled) setHistory(null);
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [ext, legacyExternalId, mid]);

  const ebayQuery = buildPokemonEbaySoldSearchQuery(ebayCardContext);
  const ebayUrl =
    ebayCardContext.cardName.trim().length > 0 && ebayQuery.trim().length > 0
      ? buildEbayUkSoldListingsUrl(ebayQuery)
      : null;

  const tpRoot = payload?.tcgplayer;
  const tpObj = tpRoot && typeof tpRoot === "object" ? (tpRoot as Record<string, unknown>) : null;

  const variantRows = useMemo(() => {
    if (!tpObj) return [];
    return Object.entries(tpObj)
      .map(([key, block]) => ({
        key,
        raw: readUsdMarket(block),
        psa10: readPsa10(block),
        ace10: readAce10(block),
      }))
      .filter(({ raw, psa10, ace10 }) => raw !== null || psa10 !== null || ace10 !== null);
  }, [tpObj]);

  const historyVariantKeys = useMemo(() => Object.keys(history ?? {}), [history]);
  const allVariantKeys = useMemo(() => {
    const seen = new Set<string>();
    if (tpObj) {
      for (const key of Object.keys(tpObj)) seen.add(key);
    }
    for (const key of variantRows.map((row) => row.key)) seen.add(key);
    for (const key of historyVariantKeys) seen.add(key);
    return [...seen];
  }, [historyVariantKeys, tpObj, variantRows]);

  const marketVariantKeys = useMemo(() => {
    return [...allVariantKeys].sort((a, b) => {
      if (a === "normal") return -1;
      if (b === "normal") return 1;
      return a.localeCompare(b);
    });
  }, [allVariantKeys]);

  useEffect(() => {
    const cb = onVariantsLoadedRef.current;
    if (!cb || !pricingLoaded || !showDexRows) return;
    cb(allVariantKeys.length > 0 ? allVariantKeys : ["Unlisted"]);
  }, [allVariantKeys, pricingLoaded, showDexRows]);

  useEffect(() => {
    if (allVariantKeys.length === 0) {
      setSelectedVariant("");
      return;
    }
    if (!selectedVariant || !allVariantKeys.includes(selectedVariant)) {
      setSelectedVariant(allVariantKeys[0]);
    }
  }, [allVariantKeys, selectedVariant]);

  const availableGrades = useMemo(() => {
    if (!selectedVariant) return [] as GradeKey[];
    const row = variantRows.find((entry) => entry.key === selectedVariant);
    const historyBlock = history?.[selectedVariant];
    const grades: GradeKey[] = [];
    if ((row?.raw ?? null) !== null || (historyBlock?.raw && Object.keys(historyBlock.raw).length > 0)) grades.push("raw");
    if ((row?.psa10 ?? null) !== null || (historyBlock?.psa10 && Object.keys(historyBlock.psa10).length > 0)) grades.push("psa10");
    if ((row?.ace10 ?? null) !== null || (historyBlock?.ace10 && Object.keys(historyBlock.ace10).length > 0)) grades.push("ace10");
    return grades;
  }, [history, selectedVariant, variantRows]);

  useEffect(() => {
    if (availableGrades.length === 0) {
      setSelectedGrade("raw");
      return;
    }
    if (!availableGrades.includes(selectedGrade)) {
      setSelectedGrade(availableGrades[0]);
    }
  }, [availableGrades, selectedGrade]);

  const selectedHistoryPoints = useMemo(
    () => readHistoryWindow(history, selectedVariant, selectedGrade, selectedWindow),
    [history, selectedGrade, selectedVariant, selectedWindow],
  );
  const changeSummary = useMemo(
    () => ({
      daily: computePercentChange(readHistoryWindow(history, selectedVariant, selectedGrade, "daily")),
      weekly: computePercentChange(readHistoryWindow(history, selectedVariant, selectedGrade, "weekly")),
      monthly: computePercentChange(readHistoryWindow(history, selectedVariant, selectedGrade, "monthly")),
    }),
    [history, selectedGrade, selectedVariant],
  );

  const showRowActions = !hidePerVariantActions && (onAdd ?? onWishlist);
  const showUnlistedRow = pricingLoaded && allVariantKeys.length === 0 && (onAdd ?? onWishlist);
  const unlistedWishlisted = Boolean(
    showUnlistedRow &&
      wishlisted &&
      (wishlistedVariants ?? []).some((variant) => (normalizeVariantForStorage(variant) ?? "Unlisted") === "Unlisted"),
  );
  const pricingResolved = !showDexRows || pricingLoaded;

  if (!pricingResolved) {
    if (!showDexRows && !ebayUrl) return null;
    return (
      <section className="flex flex-col gap-2">
        <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
        <div className="flex flex-col gap-2">
          {showDexRows ? <div className="h-[52px] animate-pulse rounded-2xl bg-white/10" /> : null}
          {ebayUrl ? (
            <a
              href={ebayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <MarketplacePricingLogo which="ebay" />
                <span className="text-sm font-medium text-white">eBay</span>
              </div>
              <span className="max-w-[55%] shrink-0 text-right text-xs font-medium leading-snug text-white/85">
                Recent sold on eBay
              </span>
            </a>
          ) : null}
        </div>
      </section>
    );
  }

  if (!showDexRows && !ebayUrl) return null;

  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-bold tracking-tight text-white">Market prices</h4>
      <div className="flex flex-col gap-2">
        {showDexRows
          ? marketVariantKeys.map((key) => {
              const row = variantRows.find((r) => r.key === key);
              const raw = row?.raw ?? null;
              const psa10 = row?.psa10 ?? null;
              const ace10 = row?.ace10 ?? null;
              const hasAnyPrice = raw !== null || psa10 !== null || ace10 !== null;
              const isFilled = (wishlistedVariants ?? []).some((variant) => variantMatches(variant, key));
              return (
                <div
                  key={key}
                  className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm font-medium text-white">{variantLabel(key)}</span>
                    {showRowActions && onAdd ? (
                      <button
                        type="button"
                        onClick={() => onAdd(key)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[1.25rem] font-semibold text-white transition hover:bg-white/20"
                        aria-label={`Add ${variantLabel(key)} to collection`}
                      >
                        +
                      </button>
                    ) : null}
                    {showRowActions && onWishlist ? (
                      <button
                        type="button"
                        onClick={() => onWishlist(key)}
                        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 transition hover:bg-white/20 ${isFilled ? "" : "text-white"}`}
                        aria-label={isFilled ? "Remove from wishlist" : `Add ${variantLabel(key)} to wishlist`}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill={isFilled ? "currentColor" : "none"}
                          stroke={isFilled ? "none" : "currentColor"}
                          strokeWidth={isFilled ? undefined : 2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={isFilled ? "text-red-500" : "text-white"}
                          aria-hidden
                        >
                          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                  {hasAnyPrice ? (
                    <div className="grid grid-cols-3 divide-x divide-white/10">
                      {raw !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Raw</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(raw)}</span>
                        </div>
                      ) : (
                        <div />
                      )}
                      {psa10 !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">PSA 10</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(psa10)}</span>
                        </div>
                      ) : (
                        <div />
                      )}
                      {ace10 !== null ? (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">ACE 10</span>
                          <span className="text-sm font-semibold tabular-nums text-white">{formatMoneyGbp(ace10)}</span>
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-white/45">No market price</p>
                  )}
                </div>
              );
            })
          : null}
        {showUnlistedRow ? (
          <div className="flex min-h-[52px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3">
            <span className="shrink-0 text-sm font-medium text-white">Unlisted</span>
            <div className="flex flex-1 items-center justify-evenly">
              <span className="text-xs text-white/40">No price data</span>
            </div>
            {showRowActions && onAdd ? (
              <button
                type="button"
                onClick={() => onAdd("Unlisted")}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[1.25rem] font-semibold text-white transition hover:bg-white/20"
                aria-label="Add unlisted variant to collection"
              >
                +
              </button>
            ) : null}
            {showRowActions && onWishlist ? (
              <button
                type="button"
                onClick={() => onWishlist("Unlisted")}
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 transition hover:bg-white/20 ${unlistedWishlisted ? "" : "text-white"}`}
                aria-label={unlistedWishlisted ? "Remove from wishlist" : "Add unlisted variant to wishlist"}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill={unlistedWishlisted ? "currentColor" : "none"}
                  stroke={unlistedWishlisted ? "none" : "currentColor"}
                  strokeWidth={unlistedWishlisted ? undefined : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={unlistedWishlisted ? "text-red-500" : "text-white"}
                  aria-hidden
                >
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
        {showDexRows ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">Price history</div>
              </div>
            </div>

            {historyLoaded && allVariantKeys.length > 0 && availableGrades.length > 0 ? (
              <div className="flex flex-col gap-3">
                <SegmentedTabs
                  options={(["daily", "weekly", "monthly"] satisfies HistoryWindowKey[])}
                  value={selectedWindow}
                  onChange={setSelectedWindow}
                  labelFor={(value) => HISTORY_WINDOW_LABELS[value]}
                />
                <div className="grid grid-cols-2 gap-2">
                  <CompactSelect
                    label="Variant"
                    options={allVariantKeys}
                    value={selectedVariant}
                    onChange={setSelectedVariant}
                    labelFor={(value) => variantLabel(value)}
                  />
                  <CompactSelect
                    label="Grade"
                    options={availableGrades}
                    value={selectedGrade}
                    onChange={setSelectedGrade}
                    labelFor={gradeLabel}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <ChangeCard label="Daily" value={changeSummary.daily} />
                  <ChangeCard label="Weekly" value={changeSummary.weekly} />
                  <ChangeCard label="Monthly" value={changeSummary.monthly} />
                </div>
                {selectedHistoryPoints.length > 0 ? (
                  <PriceHistoryChart points={selectedHistoryPoints} window={selectedWindow} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-8 text-center text-sm text-white/55">
                    No {HISTORY_WINDOW_LABELS[selectedWindow].toLowerCase()} history yet for {variantLabel(selectedVariant)} {gradeLabel(selectedGrade)}.
                  </div>
                )}
              </div>
            ) : historyLoaded ? (
              <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-8 text-center text-sm text-white/55">
                No price history available yet for this card.
              </div>
            ) : (
              <div className="h-[220px] animate-pulse rounded-2xl bg-white/10" />
            )}
          </div>
        ) : null}
        {ebayUrl ? (
          <a
            href={ebayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3 transition hover:bg-white/[0.12]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <MarketplacePricingLogo which="ebay" />
              <span className="text-sm font-medium text-white">eBay</span>
            </div>
            <span className="max-w-[55%] shrink-0 text-right text-xs font-medium leading-snug text-white/85">
              Recent sold on eBay
            </span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
