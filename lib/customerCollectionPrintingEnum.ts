/**
 * Values accepted by Postgres `enum_customer_collections_printing` on `customer_collections.printing`.
 * Base set matches the product UI; extensions require
 * `supabase/migrations/20260404120000_extend_customer_collections_printing.sql` (and follow-up alters).
 */
export const CUSTOMER_COLLECTION_PRINTING_BASE = [
  "Standard",
  "Reverse Holo",
  "Holo",
  "First Edition",
  "Shadowless",
  "other",
] as const;

/**
 * Not in the original UI list but required for TCGdex / WOTC / stamp variants.
 * Must match `ALTER TYPE ... ADD VALUE` in the migration file(s).
 */
export const CUSTOMER_COLLECTION_PRINTING_EXTRA = [
  "Pokemon Day Stamp",
  "Pokemon Center Stamp",
  "Staff Stamp",
  "First Edition Holo",
  "Unlimited",
  "Unlimited Holo",
] as const;

export const CUSTOMER_COLLECTION_PRINTING_ENUM_VALUES = [
  ...CUSTOMER_COLLECTION_PRINTING_BASE,
  ...CUSTOMER_COLLECTION_PRINTING_EXTRA,
] as const;

/**
 * Maps canonical variant keys (see `cardVariantLabels`) to exact Postgres enum labels (ASCII for DB).
 */
export const CANONICAL_VARIANT_KEY_TO_DB_PRINTING: Record<string, string> = {
  normal: "Standard",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  firstEdition: "First Edition",
  firstEditionHolofoil: "First Edition Holo",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited Holo",
  shadowless: "Shadowless",
  pokemonDayStamp: "Pokemon Day Stamp",
  pokemonCenterStamp: "Pokemon Center Stamp",
  staffStamp: "Staff Stamp",
};

const ALLOWED = new Set<string>(CUSTOMER_COLLECTION_PRINTING_ENUM_VALUES);

export function isCustomerCollectionPrintingEnumValue(value: string): boolean {
  return ALLOWED.has(value);
}
