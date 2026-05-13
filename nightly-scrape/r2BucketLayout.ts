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

/** Per-set daily snapshot: `new_pricing/daily/{YYYY-MM-DD}/{setCode}.json` */
export function r2NewPricingDailyKey(dateKey: string, setCode: string): string {
  return `${R2_NEW_PRICING}/daily/${dateKey}/${setCode}.json`;
}
/** Per-set weekly snapshot: `new_pricing/weekly/{YYYY-Www}/{setCode}.json` */
export function r2NewPricingWeeklyKey(weekKey: string, setCode: string): string {
  return `${R2_NEW_PRICING}/weekly/${weekKey}/${setCode}.json`;
}
/** Per-set monthly snapshot: `new_pricing/monthly/{YYYY-MM}/{setCode}.json` */
export function r2NewPricingMonthlyKey(monthKey: string, setCode: string): string {
  return `${R2_NEW_PRICING}/monthly/${monthKey}/${setCode}.json`;
}

/** Folder prefix for all set files under a given date: `new_pricing/daily/{YYYY-MM-DD}/` */
export function r2NewPricingDailyPrefix(dateKey: string): string {
  return `${R2_NEW_PRICING}/daily/${dateKey}/`;
}

/** Static JSON exports (e.g. sealed Pokedata catalog) under `data/…` */
const R2_DATA = "data" as const;

/** App brand catalog + logos: `brands/data/…`, `brands/images/…` */
const R2_BRANDS_DATA = "brands/data" as const;
const R2_BRANDS_IMAGES = "brands/images" as const;

/** Default slug for English Pokémon sealed scrape (`pokedata-english-pokemon`). */
export const R2_SEALED_POKEDATA_DEFAULT_SLUG = "pokedata-english-pokemon" as const;

/** Sealed Pokedata product catalog: `data/{slug}-products.json` */
export function r2SealedPokedataCatalogKey(slug: string): string {
  return `${R2_DATA}/${slug}-products.json`;
}

/** Sealed Pokedata price snapshot: `new_pricing/{slug}-prices.json` */
export function r2SealedPokedataPricesSnapshotKey(slug: string): string {
  return `${R2_NEW_PRICING}/${slug}-prices.json`;
}

/** Sealed rolling price history blob: `new_pricing/{slug}-price-history.json` */
export function r2SealedPokedataPriceHistoryKey(slug: string): string {
  return `${R2_NEW_PRICING}/${slug}-price-history.json`;
}

/** Sealed price trends blob: `new_pricing/{slug}-price-trends.json` */
export function r2SealedPokedataPriceTrendsKey(slug: string): string {
  return `${R2_NEW_PRICING}/${slug}-price-trends.json`;
}

/** Global market trend summary: `new_pricing/market-trend.json` */
export const r2MarketTrendKey = `${R2_NEW_PRICING}/market-trend.json` as const;
