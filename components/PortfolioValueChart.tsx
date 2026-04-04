"use client";

import { useId, useMemo, useState } from "react";

import type { PortfolioSnapshotPoint } from "@/lib/portfolioSnapshotTypes";

const gbpFormatter = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

function formatMoneyGbp(n: number): string {
  return gbpFormatter.format(n);
}

function formatDateLabel(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type PortfolioValueChartProps = {
  points: Pick<PortfolioSnapshotPoint, "date" | "totalValueGbp">[];
};

export function PortfolioValueChart({ points }: PortfolioValueChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  );

  const lastIndex = Math.max(sorted.length - 1, 0);
  const [selection, setSelection] = useState<{ mode: "end" } | { mode: "index"; i: number }>({
    mode: "end",
  });
  const selectedIndex =
    selection.mode === "end" ? lastIndex : Math.min(Math.max(selection.i, 0), lastIndex);

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-8 text-center text-sm text-white/50">
        No history yet. After prices update, run the batch job (one JSON file per user in R2) or POST{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-sky-200">/api/portfolio-snapshot</code>{" "}
        while signed in.
      </div>
    );
  }

  const width = 560;
  const height = 240;
  const padding = { top: 14, right: 10, bottom: 28, left: 8 };
  const values = sorted.map((p) => p.totalValueGbp);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(max * 0.04, 1);
  const chartMin = Math.max(0, min - range * 0.1);
  const chartMax = max + range * 0.1;
  const chartRange = chartMax - chartMin || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const plotted = sorted.map((p, index) => {
    const value = p.totalValueGbp;
    const x =
      padding.left + (sorted.length === 1 ? innerWidth / 2 : (index / (sorted.length - 1)) * innerWidth);
    const normalized = (value - chartMin) / chartRange;
    const y = padding.top + innerHeight - normalized * innerHeight;
    return { ...p, index, x, y, value };
  });

  const path = plotted.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const areaPath = path
    ? `${path} L ${padding.left + innerWidth} ${padding.top + innerHeight} L ${padding.left} ${padding.top + innerHeight} Z`
    : "";

  const active = plotted[selectedIndex] ?? plotted[plotted.length - 1];
  const yTicks = [chartMax, chartMin + chartRange / 2, chartMin].map((value) => ({
    value,
    label: formatMoneyGbp(value),
    y: padding.top + innerHeight - ((value - chartMin) / chartRange) * innerHeight,
  }));

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-2 py-3">
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">
            Collection value
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-white">
            {active ? formatMoneyGbp(active.value) : "—"}
          </div>
          <div className="mt-1 text-xs font-medium text-white/55">{active ? formatDateLabel(active.date) : ""}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-white/45">Range</div>
          <div className="mt-1 text-xs font-medium tabular-nums text-white/80">
            {formatMoneyGbp(min)} to {formatMoneyGbp(max)}
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto block h-56 w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(56, 189, 248, 0.35)" />
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
        {areaPath ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        {path ? (
          <path d={path} fill="none" stroke="rgba(56, 189, 248, 0.95)" strokeWidth="2.5" strokeLinejoin="round" />
        ) : null}
        {plotted.map((p) => (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={p.index === selectedIndex ? 5 : 3.5}
            fill={p.index === selectedIndex ? "rgba(125, 211, 252, 0.95)" : "rgba(56, 189, 248, 0.55)"}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
            className="cursor-pointer"
            onClick={() => setSelection({ mode: "index", i: p.index })}
          />
        ))}
      </svg>
    </div>
  );
}
