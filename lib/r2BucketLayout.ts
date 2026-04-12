/**
 * Canonical R2 object key prefixes for the `R2_BUCKET` layout.
 * Public URLs are `${R2_PUBLIC_BASE_URL}/${key}` (no leading slash on key).
 */

export const R2_IMAGES = "images" as const;

export const r2GradedImagesPrefix = `${R2_IMAGES}/graded_images`;
/** Default National Dex media prefix (override with `R2_POKEMON_MEDIA_PREFIX`). */
export const r2PokemonMediaPrefixDefault = `${R2_IMAGES}/pokemon`;

/** Set logos / symbols on R2: `images/sets/logo/…`, `images/sets/symbol/…` */
export const r2SetLogoPrefix = `${R2_IMAGES}/sets/logo`;
export const r2SetSymbolPrefix = `${R2_IMAGES}/sets/symbol`;

/** Root folder for singles (Scrydex) pricing JSON + history + trends on R2. */
export const R2_PRICING = "pricing" as const;

/** Per-set pricing map: `pricing/card-pricing/{setCode}.json` */
export const r2SinglesCardPricingPrefix = `${R2_PRICING}/card-pricing`;
/** Per-set price history: `pricing/price-history/{setCode}.json` */
export const r2SinglesPriceHistoryPrefix = `${R2_PRICING}/price-history`;
/** Per-set price trend summaries: `pricing/price-trends/{setCode}.json` */
export const r2SinglesPriceTrendsPrefix = `${R2_PRICING}/price-trends`;

/** Static JSON exports (e.g. sealed Pokedata catalog) under `data/…` */
export const R2_DATA = "data" as const;

/** App brand catalog + logos: `brands/data/…`, `brands/images/…` */
export const R2_BRANDS_DATA = "brands/data" as const;
export const R2_BRANDS_IMAGES = "brands/images" as const;

/** Default slug for English Pokémon sealed scrape (`pokedata-english-pokemon`). */
export const R2_SEALED_POKEDATA_DEFAULT_SLUG = "pokedata-english-pokemon" as const;

/** Sealed Pokedata product catalog: `data/{slug}-products.json` */
export function r2SealedPokedataCatalogKey(slug: string): string {
  return `${R2_DATA}/${slug}-products.json`;
}

/** Sealed Pokedata price snapshot: `pricing/{slug}-prices.json` */
export function r2SealedPokedataPricesSnapshotKey(slug: string): string {
  return `${R2_PRICING}/${slug}-prices.json`;
}

/** Sealed rolling price history blob: `pricing/{slug}-price-history.json` */
export function r2SealedPokedataPriceHistoryKey(slug: string): string {
  return `${R2_PRICING}/${slug}-price-history.json`;
}

/** Sealed price trends blob: `pricing/{slug}-price-trends.json` */
export function r2SealedPokedataPriceTrendsKey(slug: string): string {
  return `${R2_PRICING}/${slug}-price-trends.json`;
}
