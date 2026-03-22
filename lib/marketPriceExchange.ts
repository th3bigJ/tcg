/**
 * Convert TCGdex market figures (TCGplayer in USD, Cardmarket in EUR) to GBP for storefront display.
 * Live rates from Frankfurter (ECB); optional env fallbacks if the request fails.
 */

type FrankfurterLatest = {
  rates?: { USD?: number; EUR?: number };
};

function fallbackMultipliers(): { usdToGbp: number; eurToGbp: number } {
  const usd = Number.parseFloat(process.env.MARKET_PRICE_FALLBACK_USD_TO_GBP ?? "0.79");
  const eur = Number.parseFloat(process.env.MARKET_PRICE_FALLBACK_EUR_TO_GBP ?? "0.85");
  const usdToGbp = Number.isFinite(usd) && usd > 0 ? usd : 0.79;
  const eurToGbp = Number.isFinite(eur) && eur > 0 ? eur : 0.85;
  return { usdToGbp, eurToGbp };
}

/**
 * How many GBP per 1 USD / 1 EUR (multiply source amount to get GBP).
 */
export async function fetchGbpConversionMultipliers(): Promise<{ usdToGbp: number; eurToGbp: number }> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=GBP&to=USD,EUR", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
    const data = (await res.json()) as FrankfurterLatest;
    const usdPerGbp = data.rates?.USD;
    const eurPerGbp = data.rates?.EUR;
    if (typeof usdPerGbp !== "number" || typeof eurPerGbp !== "number" || usdPerGbp <= 0 || eurPerGbp <= 0) {
      throw new Error("Invalid Frankfurter rates");
    }
    return { usdToGbp: 1 / usdPerGbp, eurToGbp: 1 / eurPerGbp };
  } catch {
    return fallbackMultipliers();
  }
}

/** Object keys whose numeric values are marketplace IDs, not currency amounts. */
const NUMERIC_LEAF_SKIP_KEYS = new Set(["productId", "idProduct"]);

/** Recursively multiply every finite number in a JSON-like tree (pricing blobs only). */
export function multiplyNumericLeaves(value: unknown, factor: number): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value * factor;
  if (Array.isArray(value)) return value.map((v) => multiplyNumericLeaves(v, factor));
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(o)) {
      const child = o[key];
      if (NUMERIC_LEAF_SKIP_KEYS.has(key)) {
        out[key] = child;
        continue;
      }
      out[key] = multiplyNumericLeaves(child, factor);
    }
    return out;
  }
  return value;
}
