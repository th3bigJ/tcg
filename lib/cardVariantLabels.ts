import {
  CANONICAL_VARIANT_KEY_TO_DB_PRINTING,
  CUSTOMER_COLLECTION_PRINTING_ENUM_VALUES,
} from "@/lib/customerCollectionPrintingEnum";

const VARIANT_LABELS: Record<string, string> = {
  normal: "Standard",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  firstEdition: "First Edition",
  firstEditionHolofoil: "First Edition Holo",
  unlimited: "Unlimited",
  unlimitedHolofoil: "Unlimited Holo",
  shadowless: "Shadowless",
  pokemonDayStamp: "Pokemon Day Stamp",
  pokemonCenterStamp: "Pokémon Center Stamp",
  staffStamp: "Staff Stamp",
};

const VARIANT_ALIASES: Record<string, string[]> = {
  normal: ["Standard", "Normal", "normal", "default"],
  holofoil: ["Holo", "Holofoil", "holofoil"],
  reverseHolofoil: [
    "Reverse Holo",
    "Reverse Holofoil",
    "reverseHolofoil",
    "reverse",
    "reverse-holofoil",
  ],
  firstEdition: ["1st-edition", "1st Edition", "firstEdition", "first edition"],
  firstEditionHolofoil: [
    "1st-edition-holofoil",
    "1st Edition Holo",
    "firstEditionHolofoil",
    "first edition holo",
    "First Edition Holo",
  ],
  unlimited: ["Unlimited", "unlimited"],
  unlimitedHolofoil: ["Unlimited Holo", "unlimited-holofoil", "unlimitedHolofoil", "unlimited holo"],
  shadowless: ["Shadowless", "shadowless"],
  pokemonDayStamp: [
    "Pokemon Day Stamp",
    "Pokémon Day Stamp",
    "PokemonDayStamp",
    "pokemonDayStamp",
    "pokemon day stamp",
    "pokemon-day-stamp",
    "pokemon_day_stamp",
    "PokémonDayStamp",
  ],
  pokemonCenterStamp: [
    "Pokemon Center Stamp",
    "Pokemon stamp",
    "Pokemon Stamp",
    "PokemonCenterStamp",
    "pokemonCenterStamp",
    "pokemon center stamp",
    "pokemon-center-stamp",
    "pokemon_center_stamp",
    "PokémonCenterStamp",
  ],
  staffStamp: ["Staff Stamp", "Staff", "staffStamp"],
};

function variantLookupKey(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function resolveCanonicalVariant(value: string): { key: string; label: string } | null {
  const lookup = variantLookupKey(value);
  if (!lookup) return null;

  for (const [key, label] of Object.entries(VARIANT_LABELS)) {
    if (variantLookupKey(key) === lookup) return { key, label };
    if (variantLookupKey(label) === lookup) return { key, label };
    for (const alias of VARIANT_ALIASES[key] ?? []) {
      if (variantLookupKey(alias) === lookup) return { key, label };
    }
  }

  return null;
}

export function variantLabel(value: string): string {
  const trimmed = value.trim();
  return resolveCanonicalVariant(trimmed)?.label ?? trimmed;
}

export function normalizeVariantForStorage(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (trimmed === "Unlisted") return null;
  return resolveCanonicalVariant(trimmed)?.label ?? trimmed;
}

const CUSTOMER_COLLECTION_PRINTING_ALLOWED = new Set<string>(CUSTOMER_COLLECTION_PRINTING_ENUM_VALUES);

/**
 * Maps TCG/catalog variant keys (e.g. `pokemonDayStamp`) to values accepted by Postgres
 * `enum_customer_collections_printing`. Requires stamp values added via the Supabase migration
 * `supabase/migrations/20260404120000_extend_customer_collections_printing.sql`.
 */
export function customerCollectionPrintingFromVariant(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "Unlisted") return "Standard";
  if (CUSTOMER_COLLECTION_PRINTING_ALLOWED.has(trimmed)) return trimmed;

  const resolved = resolveCanonicalVariant(trimmed);
  if (resolved) {
    const mapped = CANONICAL_VARIANT_KEY_TO_DB_PRINTING[resolved.key];
    if (mapped && CUSTOMER_COLLECTION_PRINTING_ALLOWED.has(mapped)) return mapped;
  }

  return "other";
}

/**
 * Resolves stored printing / UI labels to catalog keys used in pricing JSON (`tcgplayer`, Scrydex), e.g. `Pokemon Day Stamp` → `pokemonDayStamp`.
 */
export function catalogVariantKeyForPricingLookup(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "Unlisted") return null;
  const resolved = resolveCanonicalVariant(trimmed);
  if (resolved) return resolved.key;
  return trimmed;
}

export function variantStorageCandidates(value: string | null | undefined): (string | null)[] {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "Unlisted") return [null];

  const out = new Set<string>();
  const canonical = resolveCanonicalVariant(trimmed);
  if (canonical) {
    out.add(canonical.label);
    out.add(canonical.key);
    for (const candidate of VARIANT_ALIASES[canonical.key] ?? []) out.add(candidate);
  } else {
    const normalized = normalizeVariantForStorage(trimmed);
    if (normalized) out.add(normalized);
  }

  out.add(trimmed);

  const compact = trimmed.replace(/\s+/g, "");
  if (compact && compact !== trimmed) out.add(compact);

  return [...out, null].filter((value, index, arr) => arr.indexOf(value) === index);
}
