/** Normalize energy / element type strings the same way filter facets do. */
export function normalizeEnergyTypeToken(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** True if `selectedDisplay` is empty or matches any entry in `elementTypes`. */
export function cardMatchesEnergyTypeSelection(
  elementTypes: string[] | undefined | null,
  selectedDisplay: string,
): boolean {
  const trimmed = selectedDisplay.trim();
  if (!trimmed) return true;
  const want = normalizeEnergyTypeToken(trimmed).toLocaleLowerCase();
  for (const raw of elementTypes ?? []) {
    if (normalizeEnergyTypeToken(String(raw ?? "")).toLocaleLowerCase() === want) return true;
  }
  return false;
}
