const STORAGE_KEY = "tcg-recent-searches";
const MAX_RECENT = 5;

export const RECENT_SEARCHES_UPDATED_EVENT = "tcg:recent-searches-updated";

export function readRecentSearches(): string[] {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/** Dedupes case-insensitively, most recent first, max 5. */
export function pushRecentSearch(query: string): void {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  try {
    if (typeof window === "undefined") return;
    const prev = readRecentSearches();
    const next = [
      trimmed,
      ...prev.filter((q) => q.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(RECENT_SEARCHES_UPDATED_EVENT));
  } catch {}
}
