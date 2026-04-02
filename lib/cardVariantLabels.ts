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
  pokemonDayStamp: ["Pokemon Day Stamp", "PokemonDayStamp", "pokemonDayStamp"],
  staffStamp: ["Staff Stamp", "Staff", "staffStamp"],
};

export function variantLabel(value: string): string {
  const trimmed = value.trim();
  return VARIANT_LABELS[trimmed] ?? trimmed;
}

export function normalizeVariantForStorage(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  if (trimmed === "Unlisted") return null;
  return variantLabel(trimmed);
}

export function variantStorageCandidates(value: string | null | undefined): (string | null)[] {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || trimmed === "Unlisted") return [null];

  const out = new Set<string>();
  const canonical = normalizeVariantForStorage(trimmed);
  if (canonical) out.add(canonical);

  const knownAliases = VARIANT_ALIASES[trimmed] ?? [];
  for (const candidate of knownAliases) out.add(candidate);

  out.add(trimmed);

  const compact = trimmed.replace(/\s+/g, "");
  if (compact && compact !== trimmed) out.add(compact);

  return [...out, null].filter((value, index, arr) => arr.indexOf(value) === index);
}
