/**
 * Scrydex expansion listing config(s) for a catalog set row — shared by pricing scrape,
 * card-meta scrape, and migration tooling.
 */

import type { SetJsonEntry } from "@/lib/staticDataTypes";
import { scrydexMegaExpansionConfig } from "@/lib/scrydexMegaEvolutionUrls";
import { scrydexScarletVioletExpansionConfig } from "@/lib/scrydexScarletVioletUrls";
import {
  lookupScrydexBulkExpansionConfig,
  resolveSwshTrainerGalleryExpansionPair,
} from "@/lib/scrydexBulkExpansionUrls";
import type { ScrydexExpansionListConfig } from "@/lib/scrydexMegaEvolutionUrls";

export type { ScrydexExpansionListConfig };

function candidateStrings(set: SetJsonEntry): string[] {
  const k = set.setKey?.trim();
  return k ? [k] : [];
}

export function resolveExpansionConfigForSet(set: SetJsonEntry): ScrydexExpansionListConfig | null {
  const sk = set.setKey?.trim();
  for (const c of candidateStrings(set)) {
    const r = scrydexMegaExpansionConfig(c, sk, sk);
    if (r) return r;
  }
  for (const c of candidateStrings(set)) {
    const r = scrydexScarletVioletExpansionConfig(c, sk, sk);
    if (r) return r;
  }
  for (const c of candidateStrings(set)) {
    const r = lookupScrydexBulkExpansionConfig(c, sk, sk);
    if (r) return r;
  }
  return null;
}

/**
 * All Scrydex listing configs for this set (two entries e.g. Crown Zenith main + Galarian Gallery).
 */
function isCrownZenithDualList(primary: string): boolean {
  return primary === "swsh12pt5" || primary === "swsh12.5";
}

function isShiningFatesDualList(primary: string): boolean {
  return primary === "swsh45" || primary === "swsh4.5";
}

export function resolveExpansionConfigsForSet(set: SetJsonEntry): ScrydexExpansionListConfig[] {
  const primary = (set.setKey ?? "").trim().toLowerCase();
  /** Canonical `setKey` is the main Scrydex `listPrefix`; second expansion is scraped alongside. */
  if (isCrownZenithDualList(primary)) {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith/swsh12pt5",
        listPrefix: "swsh12pt5",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/crown-zenith-galarian-gallery/swsh12pt5gg",
        listPrefix: "swsh12pt5gg",
      },
    ];
  }
  if (isShiningFatesDualList(primary)) {
    return [
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates/swsh45",
        listPrefix: "swsh45",
      },
      {
        expansionUrl: "https://scrydex.com/pokemon/expansions/shining-fates-shiny-vault/swsh45sv",
        listPrefix: "swsh45sv",
      },
    ];
  }

  const swshTgPair = resolveSwshTrainerGalleryExpansionPair(primary);
  if (swshTgPair) return swshTgPair;

  const cfg = resolveExpansionConfigForSet(set);
  return cfg ? [cfg] : [];
}
