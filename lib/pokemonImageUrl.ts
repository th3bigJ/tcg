/** Normalise Pokémon artwork URLs for `<img src>` (matches filter panel behaviour). */
export function normalizePokemonImageSrc(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  if (/\.[a-z0-9]+$/i.test(trimmed)) {
    return `/api/pokemon-media/file/${encodeURIComponent(trimmed)}`;
  }
  return `/${trimmed}`;
}
