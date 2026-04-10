/**
 * Shared types for static JSON data files.
 * Used by both the export scripts (scripts/) and the read layer (lib/).
 */

/** Pokémon attacks from Scrydex card pages. */
export type CardAttackJson = {
  name: string;
  /** Empty string on Scrydex is stored as null. */
  damage: string | null;
  /** Energy cost e.g. ["Fire", "Colorless"]. */
  cost: string[];
  /** Attack effect text. */
  effect: string | null;
};

/** Pokémon abilities from Scrydex card pages. */
export type CardAbilityJson = {
  /** e.g. "Ability", "Poké-Power", "Poké-Body". */
  type: string | null;
  name: string;
  text: string | null;
};

export type CardJsonEntry = {
  masterCardId: string;
  /** Scrydex card id (e.g. `me2-130`, `rsv10pt5-173`) — primary id for pricing and scrapers. */
  externalId: string | null;
  localId: string | null;
  setCode: string;
  /** Display/collector number; may be overwritten from Scrydex `printed_number` when scraped. */
  cardNumber: string;
  cardName: string;
  fullDisplayName: string | null;
  rarity: string | null;
  category: string | null;
  hp: number | null;
  elementTypes: string[] | null;
  dexIds: number[] | null;
  trainerType: string | null;
  energyType: string | null;
  regulationMark: string | null;
  artist: string | null;
  imageLowSrc: string;
  imageHighSrc: string | null;
  /** Populated by `scrape:scrydex-card-meta` from Scrydex. */
  attacks?: CardAttackJson[] | null;
  /** Abilities (Poké-Power, Poké-Body, Ability, etc.) from Scrydex. */
  abilities?: CardAbilityJson[] | null;
  /** Trainer / stadium rules text from Scrydex; usually only present for Trainer cards. */
  rules?: string | null;
  /** e.g. "Basic", "Stage 1", "Stage 2", "VMAX", "ex". Comma-separated when multiple. */
  subtype?: string | null;
  /** e.g. "Water ×2". Null when none. */
  weakness?: string | null;
  /** e.g. "Fire -30". Null when none. */
  resistance?: string | null;
  /** Number of Colorless energy in retreat cost. */
  retreatCost?: number | null;
  /** Flavor text printed on the card. */
  flavorText?: string | null;
  /**
   * Variant keys present in `pricing/card-pricing` for this card (Scrydex slugs + TCGPlayer market keys).
   * Sorted lexicographically. Populated by `scrape:pricing` / `backfill:pricing-variants`.
   */
  pricingVariants?: string[] | null;
};

export type SetJsonEntry = {
  id: string;
  name: string;
  /**
   * Single catalog id for this set: Scrydex main `listPrefix` (e.g. `me2`, `swsh12pt5`, `swsh45`).
   * Multi-list sets use the primary id on disk; scrapers follow all Scrydex listings (e.g. Crown Zenith + GG,
   * Shining Fates + Shiny Vault, SWSH `swsh10` + `swsh10tg` Trainer Gallery).
   * Drives `data/cards/{setKey}.json`, R2 singles pricing, scrapers.
   */
  setKey: string;
  releaseDate: string | null;
  cardCountTotal: number | null;
  cardCountOfficial: number | null;
  seriesName: string | null;
  logoSrc: string;
  symbolSrc: string | null;
};

export type SeriesJsonEntry = {
  id: string;
  name: string;
  /** TCGdex/API series slug (e.g. `swsh`, `sv`). */
  seriesId: string | null;
};

export type CardPricingEntry = {
  scrydex: ScrydexCardPricing | null;
  tcgplayer: unknown | null;
  cardmarket: unknown | null;
};

/** Keys are catalog `externalId` strings (exact Scrydex spelling, case-sensitive). */
export type SetPricingMap = Record<string, CardPricingEntry>;

/** Near Mint / graded estimates from Scrydex scrape — stored on R2 in **USD**. */
export type ScrydexVariantPricing = {
  raw?: number;
  psa10?: number;
  ace10?: number;
};

export type ScrydexCardPricing = Record<string, ScrydexVariantPricing>;

/** Date bucket key and price — R2 singles + sealed history store **USD** amounts. */
export type PriceHistoryPoint = [string, number];

export type PriceHistoryWindow = {
  daily: PriceHistoryPoint[];
  weekly: PriceHistoryPoint[];
  monthly: PriceHistoryPoint[];
};

export type CardPriceHistory = Record<string, Record<string, PriceHistoryWindow>>;

export type SetPriceHistoryMap = Record<string, CardPriceHistory>;

export type PriceTrendDirection = "up" | "down" | "flat";

export type PriceTrendWindowSummary = {
  changePct: number | null;
  direction: PriceTrendDirection;
};

export type GradeTrendSummary = {
  current: number;
  daily: PriceTrendWindowSummary;
  weekly: PriceTrendWindowSummary;
  monthly: PriceTrendWindowSummary;
};

export type CardPriceTrendSummary = {
  variant: string;
  grade: string;
  current: number;
  daily: PriceTrendWindowSummary;
  weekly: PriceTrendWindowSummary;
  monthly: PriceTrendWindowSummary;
  /** Full breakdown of trends per variant → grade */
  allVariants?: Record<string, Record<string, GradeTrendSummary>>;
};

export type SetPriceTrendMap = Record<string, CardPriceTrendSummary>;

export type SealedProductPriceHistory = PriceHistoryWindow;

export type SealedProductPriceHistoryMap = Record<string, SealedProductPriceHistory>;

export type SealedProductPriceTrendSummary = {
  current: number;
  daily: PriceTrendWindowSummary;
  weekly: PriceTrendWindowSummary;
  monthly: PriceTrendWindowSummary;
};

export type SealedProductPriceTrendMap = Record<string, SealedProductPriceTrendSummary>;

export type PokemonJsonEntry = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
  generation: number;
};
