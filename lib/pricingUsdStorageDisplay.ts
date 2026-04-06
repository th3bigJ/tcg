/**
 * R2 pricing JSON (singles history/trends, sealed history) stores **USD** amounts.
 * UK UI still expects GBP for charts and labels — multiply by `usdToGbp` at API / server boundaries.
 */

import type {
  CardPriceHistory,
  CardPriceTrendSummary,
  GradeTrendSummary,
  PriceHistoryWindow,
  SealedProductPriceHistory,
  SetPriceTrendMap,
} from "@/lib/staticDataTypes";

function scaleWindowUsdToGbp(window: PriceHistoryWindow, usdToGbp: number): PriceHistoryWindow {
  return {
    daily: window.daily.map(([k, v]) => [k, v * usdToGbp]),
    weekly: window.weekly.map(([k, v]) => [k, v * usdToGbp]),
    monthly: window.monthly.map(([k, v]) => [k, v * usdToGbp]),
  };
}

/** Singles per-card history from R2 (USD) → GBP for client charts. */
export function scaleCardPriceHistoryUsdToGbpForDisplay(
  history: CardPriceHistory,
  usdToGbp: number,
): CardPriceHistory {
  const out: CardPriceHistory = {};
  for (const [variant, grades] of Object.entries(history)) {
    out[variant] = {};
    for (const [grade, window] of Object.entries(grades)) {
      if (!window || typeof window !== "object") continue;
      out[variant][grade] = scaleWindowUsdToGbp(window as PriceHistoryWindow, usdToGbp);
    }
  }
  return out;
}

function scaleGradeTrendUsdToGbp(g: GradeTrendSummary, usdToGbp: number): GradeTrendSummary {
  return {
    ...g,
    current: g.current * usdToGbp,
  };
}

/** Singles trend summary from R2 (USD currents) → GBP for grid/API consumers. */
export function scaleCardPriceTrendSummaryUsdToGbpForDisplay(
  summary: CardPriceTrendSummary,
  usdToGbp: number,
): CardPriceTrendSummary {
  const allVariants = summary.allVariants
    ? Object.fromEntries(
        Object.entries(summary.allVariants).map(([vk, vm]) => [
          vk,
          Object.fromEntries(
            Object.entries(vm).map(([gk, g]) => [gk, scaleGradeTrendUsdToGbp(g, usdToGbp)]),
          ),
        ]),
      )
    : undefined;

  return {
    ...summary,
    current: summary.current * usdToGbp,
    allVariants,
  };
}

export function scaleSetPriceTrendMapUsdToGbpForDisplay(
  map: SetPriceTrendMap,
  usdToGbp: number,
): SetPriceTrendMap {
  const out: SetPriceTrendMap = {};
  for (const [id, summary] of Object.entries(map)) {
    out[id] = scaleCardPriceTrendSummaryUsdToGbpForDisplay(summary, usdToGbp);
  }
  return out;
}

/** Sealed per-product history from R2 (USD) → GBP for client charts. */
export function scaleSealedProductPriceHistoryUsdToGbpForDisplay(
  history: SealedProductPriceHistory,
  usdToGbp: number,
): SealedProductPriceHistory {
  return scaleWindowUsdToGbp(history, usdToGbp);
}
