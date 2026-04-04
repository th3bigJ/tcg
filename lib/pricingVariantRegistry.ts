/**
 * Single place for TCG pricing variant keys used across TCGdex `pricing.tcgplayer`, Scrydex JSON,
 * and `customer_collections.printing` (Postgres enum).
 *
 * @see https://tcgdex.dev/reference/card — TCGPlayer pricing keys
 */

/** TCGdex `pricing.tcgplayer` object keys that may hold `marketPrice` (plus camelCase forms we store). */
export const TCGDEX_TCGPLAYER_MARKET_KEYS_BY_VARIANT_KEY: Record<string, readonly string[]> = {
  normal: ["normal"],
  holofoil: ["holofoil"],
  reverseHolofoil: ["reverseHolofoil", "reverse-holofoil", "reverse"],
  firstEdition: ["1st-edition", "firstEdition"],
  firstEditionHolofoil: ["1st-edition-holofoil", "firstEditionHolofoil"],
  unlimited: ["unlimited"],
  unlimitedHolofoil: ["unlimited-holofoil", "unlimitedHolofoil"],
  shadowless: ["shadowless"],
  pokemonDayStamp: ["pokemonDayStamp"],
  pokemonCenterStamp: ["pokemonCenterStamp"],
  staffStamp: ["staffStamp"],
  /** Price history / Scrydex list “default” row */
  default: ["default"],
};

/** Ordered hint for charts / trends (not exhaustive). */
export const PRICING_VARIANT_DISPLAY_ORDER = [
  "default",
  "normal",
  "holofoil",
  "reverseHolofoil",
  "firstEdition",
  "firstEditionHolofoil",
  "unlimited",
  "unlimitedHolofoil",
  "shadowless",
  "pokemonDayStamp",
  "pokemonCenterStamp",
  "staffStamp",
] as const;
