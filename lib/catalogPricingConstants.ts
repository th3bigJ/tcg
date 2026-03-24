/** Series name used to scope catalog pricing refresh jobs. */
export const MEGA_EVOLUTION_SERIES_NAME = "Mega Evolution";

/** Must match Payload `series.name` exactly. */
export const SCARLET_VIOLET_SERIES_NAME = "Scarlet & Violet";

/** TCGdex set id for Ascended Heroes (Mega Evolution block). */
export const ASCENDED_HEROES_TCGDEX_SET_ID = "me02.5";

/**
 * Optional CLI / future use: limit a job to these Payload series names.
 * The account Scrydex refresh runs **all sets** (all series) by default.
 */
export const CATALOG_PRICING_REFRESH_SERIES_NAMES: readonly string[] = [
  MEGA_EVOLUTION_SERIES_NAME,
  SCARLET_VIOLET_SERIES_NAME,
];
