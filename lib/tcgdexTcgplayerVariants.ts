/** Labels match TCGPlayer-style finishes; TCGdex API keys may use e.g. `reverse-holofoil`. */
export const TCG_PRICE_VARIANTS = ["normal", "holofoil", "reverseHolofoil"] as const;
export type TcgPriceVariant = (typeof TCG_PRICE_VARIANTS)[number];
