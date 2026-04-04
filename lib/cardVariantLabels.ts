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

function camelCaseToTitleCase(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function variantLabel(value: string): string {
  const trimmed = value.trim();
  const resolved = resolveCanonicalVariant(trimmed);
  if (resolved) return resolved.label;
  // For unrecognised camelCase variant keys (e.g. energyReverseHolofoil), produce a
  // readable label rather than returning the raw key.
  if (/[a-z][A-Z]/.test(trimmed)) return camelCaseToTitleCase(trimmed);
  return trimmed;
}

export function normalizeVariantForStorage(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (trimmed === "Unlisted") return null;
  return resolveCanonicalVariant(trimmed)?.label ?? trimmed;
}

/**
 * Value persisted on `customer_collections.printing` / wishlist printing fields.
 * Known catalog variants map to stable display labels; any other string (e.g. `energyReverseHolofoil`)
 * is stored **exactly** so distinct pricing variants are not merged into "Reverse Holo" / "Holo".
 */
export function collectionPrintingForStorage(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "Unlisted") return "Standard";

  const resolved = resolveCanonicalVariant(trimmed);
  if (resolved) return resolved.label;

  return trimmed;
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
