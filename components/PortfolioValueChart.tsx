"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";

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
  const svgRef = useRef<SVGSVGElement>(null);
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

  // Map a clientX position to the nearest data index
  const indexFromClientX = useCallback((clientX: number): number => {
    const svg = svgRef.current;
    if (!svg || plotted.length === 0) return lastIndex;
    const rect = svg.getBoundingClientRect();
    const relX = clientX - rect.left;
    const svgX = (relX / rect.width) * width;
    let nearest = 0;
    let nearestDist = Infinity;
    for (const p of plotted) {
      const dist = Math.abs(p.x - svgX);
      if (dist < nearestDist) { nearestDist = dist; nearest = p.index; }
    }
    return nearest;
  }, [plotted, lastIndex, width]);

  const handleScrub = useCallback((clientX: number) => {
    const i = indexFromClientX(clientX);
    setSelection({ mode: "index", i });
  }, [indexFromClientX]);

  const active = plotted[selectedIndex] ?? plotted[plotted.length - 1];
  const yTicks = [chartMax, chartMin + chartRange / 2, chartMin].map((value) => ({
    value,
    label: formatMoneyGbp(value),
    y: padding.top + innerHeight - ((value - chartMin) / chartRange) * innerHeight,
  }));

  const startDateLabel = sorted[0] ? formatDateLabel(sorted[0].date) : "";
  const endDateLabel = sorted.length ? formatDateLabel(sorted[sorted.length - 1].date) : "";
  const middleDateLabel =
    sorted.length > 2
      ? formatDateLabel(sorted[Math.floor((sorted.length - 1) / 2)].date)
      : "";

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

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block h-56 w-full touch-none overflow-visible"
        onMouseMove={(e) => handleScrub(e.clientX)}
        onMouseLeave={() => setSelection({ mode: "end" })}
        onTouchStart={(e) => { e.preventDefault(); handleScrub(e.touches[0]!.clientX); }}
        onTouchMove={(e) => { e.preventDefault(); handleScrub(e.touches[0]!.clientX); }}
        onTouchEnd={() => setSelection({ mode: "end" })}
      >
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

        {/* Inactive data points */}
        {plotted.map((p) => p.index !== selectedIndex && (
          <circle
            key={p.date}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="rgba(56, 189, 248, 0.55)"
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="1"
            style={{ pointerEvents: "none" }}
          />
        ))}

        {/* Active point — vertical crosshair + highlighted dot */}
        {active ? (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={active.x}
              y1={padding.top}
              x2={active.x}
              y2={padding.top + innerHeight}
              stroke="rgba(125, 211, 252, 0.35)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle
              cx={active.x}
              cy={active.y}
              r={5}
              fill="rgba(125, 211, 252, 0.95)"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="1"
            />
          </g>
        ) : null}

        {/* Full-height invisible hit strips — one per data point */}
        {plotted.map((p, i) => {
          const prev = plotted[i - 1];
          const next = plotted[i + 1];
          const halfLeft = prev ? (p.x - prev.x) / 2 : 0;
          const halfRight = next ? (next.x - p.x) / 2 : 0;
          const stripX = p.x - halfLeft;
          const stripW = halfLeft + halfRight;
          return (
            <rect
              key={`hit-${p.date}`}
              x={stripX}
              y={padding.top}
              width={stripW || innerWidth}
              height={innerHeight}
              fill="transparent"
              style={{ cursor: "crosshair" }}
            />
          );
        })}
      </svg>

      {sorted.length === 1 ? (
        <div className="mt-2 px-1 text-center text-[11px] font-medium tracking-wide text-white/45">
          {startDateLabel}
        </div>
      ) : sorted.length === 2 ? (
        <div className="mt-2 grid grid-cols-2 items-center gap-2 px-1 text-[11px] font-medium tracking-wide text-white/45">
          <span className="truncate">{startDateLabel}</span>
          <span className="truncate text-right">{endDateLabel}</span>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-3 items-center gap-2 px-1 text-[11px] font-medium tracking-wide text-white/45">
          <span className="truncate">{startDateLabel}</span>
          <span className="truncate text-center">{middleDateLabel}</span>
          <span className="truncate text-right">{endDateLabel}</span>
        </div>
      )}
    </div>
  );
}
