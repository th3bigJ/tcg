/**
 * Canonical set id for singles: equals `SetJsonEntry.setKey` (Scrydex-scrape key / card file basename).
 */

import type { SetJsonEntry } from "@/lib/staticDataTypes";

export function getSinglesCatalogSetKey(set: SetJsonEntry): string | null {
  const k = typeof set.setKey === "string" ? set.setKey.trim() : "";
  return k || null;
}
