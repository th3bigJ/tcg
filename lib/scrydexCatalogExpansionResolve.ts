import type { ScrydexExpansionListConfig } from "@/lib/scrydexMegaEvolutionUrls";
import { lookupScrydexBulkExpansionConfig } from "@/lib/scrydexBulkExpansionUrls";
import { scrydexMegaExpansionConfig } from "@/lib/scrydexMegaEvolutionUrls";
import { scrydexScarletVioletExpansionConfig } from "@/lib/scrydexScarletVioletUrls";

/**
 * Resolve Scrydex listing + list prefix from set identifiers (tcgdex id / code).
 * Order: Mega Evolution specials → Scarlet & Violet → bulk table (SWSH, SM, XY, …).
 */
export function resolveScrydexExpansionBySetIdentifiers(
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  const mega = scrydexMegaExpansionConfig(canonicalSetCode, legacyCode, setTcgdexId);
  if (mega) return mega;
  const sv = scrydexScarletVioletExpansionConfig(canonicalSetCode, legacyCode, setTcgdexId);
  if (sv) return sv;
  return lookupScrydexBulkExpansionConfig(canonicalSetCode, legacyCode, setTcgdexId);
}

/** @deprecated Use `resolveScrydexExpansionBySetIdentifiers`. */
export function resolveScrydexExpansionForSeries(
  _seriesName: string,
  canonicalSetCode: string,
  legacyCode: string | undefined,
  setTcgdexId: string | undefined,
): ScrydexExpansionListConfig | null {
  return resolveScrydexExpansionBySetIdentifiers(
    canonicalSetCode,
    legacyCode,
    setTcgdexId,
  );
}
