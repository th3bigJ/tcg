/**
 * Shared types for static JSON data files.
 * Used by both the export scripts (scripts/) and the read layer (lib/).
 */

export type CardJsonEntry = {
  masterCardId: string;
  externalId: string | null;
  tcgdex_id: string | null;
  localId: string | null;
  setCode: string;
  setTcgdexId: string | null;
  cardNumber: string;
  cardName: string;
  fullDisplayName: string | null;
  rarity: string | null;
  category: string | null;
  stage: string | null;
  hp: number | null;
  elementTypes: string[] | null;
  dexIds: number[] | null;
  subtypes: string[] | null;
  trainerType: string | null;
  energyType: string | null;
  regulationMark: string | null;
  evolveFrom: string | null;
  artist: string | null;
  isActive: boolean;
  noPricing: boolean;
  imageLowSrc: string;
  imageHighSrc: string | null;
};

export type SetJsonEntry = {
  id: string;
  name: string;
  slug: string;
  code: string | null;
  tcgdexId: string | null;
  releaseDate: string | null;
  isActive: boolean;
  cardCountTotal: number | null;
  cardCountOfficial: number | null;
  seriesName: string | null;
  seriesSlug: string | null;
  logoSrc: string;
  symbolSrc: string | null;
};

export type SeriesJsonEntry = {
  id: string;
  name: string;
  slug: string;
  tcgdexSeriesId: string | null;
  isActive: boolean;
};

export type CardPricingEntry = {
  scrydex: ScrydexCardPricing | null;
  tcgplayer: unknown | null;
  cardmarket: unknown | null;
};

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
