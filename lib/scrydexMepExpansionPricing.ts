/**
 * MEP expansion URL on Scrydex (shared list/card parsers are generic — see `scrydexExpansionListParsing`).
 */

import {
  fetchScrydexExpansionMultiPageHtml,
  parseScrydexExpansionListPaths,
  parseScrydexExpansionListPrices,
  SCRYDEX_DEFAULT_UA,
} from "@/lib/scrydexExpansionListParsing";

export const SCRYDEX_MEP_EXPANSION_URL =
  "https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep";

export { SCRYDEX_DEFAULT_UA };

/** Normalise master/catalog ids like mep-011 → mep-11 */
export function normalizeMepExternalId(raw: string): string | null {
  const m = raw.trim().toLowerCase().match(/^mep-(\d+)$/);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n)) return null;
  return `mep-${n}`;
}

export function parseScrydexMepExpansionPrices(html: string): Map<string, Record<string, number>> {
  return parseScrydexExpansionListPrices(html, "mep");
}

export function parseScrydexMepExpansionCardPaths(html: string): Map<string, string> {
  return parseScrydexExpansionListPaths(html, "mep");
}

export async function fetchScrydexMepExpansionHtml(url = SCRYDEX_MEP_EXPANSION_URL): Promise<string> {
  return fetchScrydexExpansionMultiPageHtml(url);
}
