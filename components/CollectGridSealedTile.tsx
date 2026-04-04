"use client";

import Link from "next/link";

import type { CollectGridSealedRow } from "@/lib/collectGridSealed";
import type { PriceTrendDirection } from "@/lib/staticDataTypes";

function trendTone(direction: PriceTrendDirection | null | undefined): string {
  switch (direction) {
    case "up":
      return "border-emerald-400/22 bg-emerald-400/8 text-emerald-200";
    case "down":
      return "border-rose-400/22 bg-rose-400/8 text-rose-200";
    default:
      return "border-white/10 bg-white/[0.04] text-[var(--foreground)]/58";
  }
}

function formatTrendPercent(changePct: number | null | undefined): string {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) return "";
  if (Math.abs(changePct) < 1) return "Flat";
  return `${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%`;
}

function TrendGlyph({ direction }: { direction: PriceTrendDirection | null | undefined }) {
  if (direction === "up") return <span aria-hidden="true">↑</span>;
  if (direction === "down") return <span aria-hidden="true">↓</span>;
  return <span aria-hidden="true">→</span>;
}

export function CollectGridSealedTile({
  row,
  variant,
  visualIndex,
}: {
  row: CollectGridSealedRow;
  variant: "collection" | "wishlist";
  visualIndex: number;
}) {
  const showWishlistHeart = variant === "wishlist";
  const showQty = variant === "collection" && row.totalQuantity > 1;
  const weeklyChange = row.trend?.weekly.changePct ?? null;
  const weeklyDirection = row.trend?.weekly.direction ?? null;

  return (
    <li className="card-grid-item flex flex-col">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-white shadow-sm">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {row.imageUrl ? (
            <img
              src={row.imageUrl}
              alt=""
              className="h-full w-full object-cover object-center"
              loading={visualIndex < 12 ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={visualIndex < 6 ? "high" : "auto"}
              draggable={false}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-white text-[10px] text-[var(--foreground)]/40">
              No image
            </div>
          )}
        </div>
        {showWishlistHeart ? (
          <span
            className="pointer-events-none absolute z-20 flex h-6 w-6 items-center justify-center rounded-full"
            style={{
              background: "#ef4444",
              bottom: "6px",
              right: "6px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.28)",
              outline: "2px solid var(--background)",
            }}
            title="On your wishlist"
            aria-hidden
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="white" aria-hidden>
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.29 1.51 4.04 3 5.5l7 7Z" />
            </svg>
          </span>
        ) : null}
        <Link
          href={`/sealed/${row.sealedProductId}`}
          className="absolute inset-0 z-10"
          aria-label={`View ${row.name}`}
        />
      </div>
      <div className="relative mt-1 min-h-[2.9rem]">
        {showQty ? (
          <span className="absolute left-0 top-0 inline-flex rounded bg-[var(--foreground)]/85 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[var(--background)]">
            ×{row.totalQuantity}
          </span>
        ) : null}
        <div className="min-w-0 w-full px-1 text-center">
          <span className="block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/85">{row.name}</span>
          {row.series ? (
            <span className="mt-0.5 block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/68">
              {row.series}
            </span>
          ) : null}
          <span className="mt-0.5 block text-[10px] font-medium tabular-nums text-[var(--foreground)]/70">
            {row.priceLabel ?? <span aria-hidden="true">&nbsp;</span>}
            {typeof weeklyChange === "number" && Number.isFinite(weeklyChange) ? (
              <span
                className={`ml-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-[3px] align-middle text-[8px] font-semibold tracking-[0.02em] leading-none ${trendTone(
                  weeklyDirection,
                )}`}
                title={`Weekly trend: ${weeklyChange > 0 ? "+" : ""}${weeklyChange.toFixed(1)}%`}
              >
                <TrendGlyph direction={weeklyDirection} />
                <span>{formatTrendPercent(weeklyChange) || "Flat"}</span>
              </span>
            ) : null}
          </span>
          {variant === "collection" && (row.openedQuantity > 0 || row.sealedQuantity > 0) ? (
            <span className="mt-0.5 block text-[9px] font-medium text-[var(--foreground)]/52">
              {row.sealedQuantity > 0 ? `${row.sealedQuantity} sealed` : null}
              {row.sealedQuantity > 0 && row.openedQuantity > 0 ? " · " : null}
              {row.openedQuantity > 0 ? `${row.openedQuantity} opened` : null}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
