"use client";

import { useEffect, useMemo, useState } from "react";
import type { PriceHistoryPoint, SealedProductPriceHistory } from "@/lib/staticDataTypes";

const gbpFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type HistoryWindowKey = "daily" | "weekly" | "monthly";

const HISTORY_WINDOW_LABELS: Record<HistoryWindowKey, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function formatMoneyGbp(n: number): string {
  return gbpFormatter.format(n);
}

function readHistoryWindow(
  history: SealedProductPriceHistory | null,
  window: HistoryWindowKey,
): PriceHistoryPoint[] {
  const points = history?.[window];
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
  if (
    typeof previous !== "number" ||
    typeof current !== "number" ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current) ||
    previous === 0
  ) {
    return null;
  }
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

function ChangeCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/45">{label}</div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${changeTone(value)}`}>
        {formatPercentChange(value)}
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
    const x =
      padding.left + (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
    const normalized = (value - chartMin) / chartRange;
    const y = padding.top + innerHeight - normalized * innerHeight;
    return { key, value, index, x, y };
  });

  const path = plottedPoints
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
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
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
            {HISTORY_WINDOW_LABELS[window]}
          </div>
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
          <linearGradient id="sealed-price-history-fill" x1="0" x2="0" y1="0" y2="1">
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
            <text x={2} y={tick.y + 4} textAnchor="start" fontSize="10" fill="rgba(255,255,255,0.46)">
              {tick.label}
            </text>
          </g>
        ))}
        {areaPath ? <path d={areaPath} fill="url(#sealed-price-history-fill)" /> : null}
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
        {plottedPoints.map(({ key, index, x, y }) => {
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

export function SealedPriceHistoryPanel({ productId }: { productId: number }) {
  const [history, setHistory] = useState<SealedProductPriceHistory | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<HistoryWindowKey>("daily");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setHistoryLoaded(false);
        setHistory(null);
        const response = await fetch(`/api/sealed-price-history/${encodeURIComponent(String(productId))}`);
        if (cancelled) return;
        if (!response.ok) {
          setHistory(null);
          return;
        }
        const json = (await response.json()) as SealedProductPriceHistory;
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
  }, [productId]);

  const selectedHistoryPoints = useMemo(
    () => readHistoryWindow(history, selectedWindow),
    [history, selectedWindow],
  );
  const changeSummary = useMemo(
    () => ({
      daily: computePercentChange(readHistoryWindow(history, "daily")),
      weekly: computePercentChange(readHistoryWindow(history, "weekly")),
      monthly: computePercentChange(readHistoryWindow(history, "monthly")),
    }),
    [history],
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold tracking-tight text-white">Price history</div>
      </div>

      {historyLoaded && history ? (
        <div className="flex flex-col gap-3">
          <SegmentedTabs
            options={(["daily", "weekly", "monthly"] satisfies HistoryWindowKey[])}
            value={selectedWindow}
            onChange={setSelectedWindow}
            labelFor={(value) => HISTORY_WINDOW_LABELS[value]}
          />
          <div className="grid grid-cols-3 gap-2">
            <ChangeCard label="Daily" value={changeSummary.daily} />
            <ChangeCard label="Weekly" value={changeSummary.weekly} />
            <ChangeCard label="Monthly" value={changeSummary.monthly} />
          </div>
          {selectedHistoryPoints.length > 0 ? (
            <PriceHistoryChart points={selectedHistoryPoints} window={selectedWindow} />
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-8 text-center text-sm text-white/55">
              No {HISTORY_WINDOW_LABELS[selectedWindow].toLowerCase()} history yet for this product.
            </div>
          )}
        </div>
      ) : historyLoaded ? (
        <div className="rounded-2xl border border-dashed border-white/12 bg-black/20 px-4 py-8 text-center text-sm text-white/55">
          No price history available yet for this product.
        </div>
      ) : (
        <div className="h-[220px] animate-pulse rounded-2xl bg-white/10" />
      )}
    </div>
  );
}
