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
  scrydex: unknown | null;
  tcgplayer: unknown | null;
  cardmarket: unknown | null;
};

export type SetPricingMap = Record<string, CardPricingEntry>;

export type PokemonJsonEntry = {
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
  generation: number;
};
