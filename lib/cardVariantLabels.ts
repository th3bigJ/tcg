const VARIANT_LABELS: Record<string, string> = {
  normal: "Standard",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
  pokemonDayStamp: "Pokemon Day Stamp",
  staffStamp: "Staff Stamp",
};

const VARIANT_ALIASES: Record<string, string[]> = {
  normal: ["Standard", "Normal", "normal"],
  holofoil: ["Holo", "Holofoil", "holofoil"],
  reverseHolofoil: ["Reverse Holo", "Reverse Holofoil", "reverseHolofoil"],
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
