const EXCLUDED_BASIC_RARITIES = new Set(["common", "uncommon"]);

export function normalizeRarityToken(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function isBasicRarity(value: string | null | undefined): boolean {
  return EXCLUDED_BASIC_RARITIES.has(normalizeRarityToken(value));
}
