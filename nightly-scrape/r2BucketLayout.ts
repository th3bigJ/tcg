/**
 * Canonical R2 object key prefixes for the `R2_BUCKET` layout.
 * Public URLs are `${R2_PUBLIC_BASE_URL}/${key}` (no leading slash on key).
 */

const R2_IMAGES = "images" as const;

export const r2GradedImagesPrefix = `${R2_IMAGES}/graded_images`;
/** Default National Dex media prefix (override with `R2_POKEMON_MEDIA_PREFIX`). */
export const r2PokemonMediaPrefixDefault = `${R2_IMAGES}/pokemon`;

/** Set logos / symbols on R2: `images/sets/logo/…`, `images/sets/symbol/…` */
const r2SetLogoPrefix = `${R2_IMAGES}/sets/logo`;
const r2SetSymbolPrefix = `${R2_IMAGES}/sets/symbol`;

/** Root folder for all pricing data on R2. */
const R2_NEW_PRICING = "new_pricing" as const;


/** Per-set price trend summaries: `new_pricing/price-trends/{setCode}.json` */
export const r2SinglesPriceTrendsPrefix = `${R2_NEW_PRICING}/price-trends`;

/** Consolidated daily snapshot: `new_pricing/daily/{YYYY-MM-DD}.json` */
export function r2NewPricingDailyKey(dateKey: string): string {
  return `${R2_NEW_PRICING}/daily/${dateKey}.json`;
}
/** Consolidated weekly snapshot: `new_pricing/weekly/{YYYY-Www}.json` */
export function r2NewPricingWeeklyKey(weekKey: string): string {
  return `${R2_NEW_PRICING}/weekly/${weekKey}.json`;
}
/** Consolidated monthly snapshot: `new_pricing/monthly/{YYYY-MM}.json` */
export function r2NewPricingMonthlyKey(monthKey: string): string {
  return `${R2_NEW_PRICING}/monthly/${monthKey}.json`;
}


/** Static JSON exports (e.g. sealed Pokedata catalog) under `data/…` */
const R2_DATA = "data" as const;

/** App brand catalog + logos: `brands/data/…`, `brands/images/…` */
const R2_BRANDS_DATA = "brands/data" as const;
const R2_BRANDS_IMAGES = "brands/images" as const;

/** Sealed Pokedata product catalog: `data/{slug}-products.json` */
export function r2SealedPokedataCatalogKey(slug: string): string {
  return `${R2_DATA}/${slug}-products.json`;
}

const R2_SEALED_PRICING = `${R2_NEW_PRICING}/sealed` as const;

/** Sealed price trends: `new_pricing/sealed/price-trends.json` */
export const r2SealedPriceTrendsKey = `${R2_SEALED_PRICING}/price-trends.json` as const;

/** Sealed daily snapshot: `new_pricing/sealed/daily/{YYYY-MM-DD}.json` */
export function r2SealedDailyKey(dateKey: string): string {
  return `${R2_SEALED_PRICING}/daily/${dateKey}.json`;
}
/** Sealed weekly snapshot: `new_pricing/sealed/weekly/{YYYY-Www}.json` */
export function r2SealedWeeklyKey(weekKey: string): string {
  return `${R2_SEALED_PRICING}/weekly/${weekKey}.json`;
}
/** Sealed monthly snapshot: `new_pricing/sealed/monthly/{YYYY-MM}.json` */
export function r2SealedMonthlyKey(monthKey: string): string {
  return `${R2_SEALED_PRICING}/monthly/${monthKey}.json`;
}

/** Global market trend summary: `new_pricing/market-trend.json` */
export const r2MarketTrendKey = `${R2_NEW_PRICING}/market-trend.json` as const;

/** Pre-computed biggest mover cards per brand, written by the pricing scraper and read by jobCalculateMarketTrends. */
export const r2PokemonMarketMoversKey = `${R2_NEW_PRICING}/pokemon-market-movers.json` as const;
