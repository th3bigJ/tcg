/**
 * Run-on Scrydex labels (lowercase, no spaces) → canonical camelCase variant slugs.
 * Used by `jobScrapePricing` / `externalScrapeVariantSlugFromFlatKey` and data migrations.
 */

export const PRICING_VARIANT_COMPACT_TO_CANONICAL: Record<string, string> = {
  default: "default",
  holofoil: "holofoil",
  reverseholofoil: "reverseHolofoil",
  staffstamp: "staffStamp",
  cosmosholofoil: "cosmosHolofoil",
  firstedition: "firstEdition",
  firsteditionholofoil: "firstEditionHolofoil",
  firsteditionshadowless: "firstEditionShadowless",
  firsteditionshadowlessholofoil: "firstEditionShadowlessHolofoil",
  playpokemonstamp: "playPokemonStamp",
  worldchampionshipsstaffstamp: "worldChampionshipsStaffStamp",
};

export function canonicalVariantSlugFromCompactLabel(compact: string): string | null {
  return PRICING_VARIANT_COMPACT_TO_CANONICAL[compact] ?? null;
}

/** Run-on duplicate keys → canonical (for one-shot JSON migrations). Order: longer `bad` keys first avoids partial overlaps. */
export const PRICING_VARIANT_RUN_ON_MIGRATIONS: readonly { bad: string; good: string }[] = [
  { bad: "firsteditionshadowlessholofoil", good: "firstEditionShadowlessHolofoil" },
  { bad: "firsteditionshadowless", good: "firstEditionShadowless" },
  { bad: "firsteditionholofoil", good: "firstEditionHolofoil" },
  { bad: "worldchampionshipsstaffstamp", good: "worldChampionshipsStaffStamp" },
  { bad: "playpokemonstamp", good: "playPokemonStamp" },
  { bad: "cosmosholofoil", good: "cosmosHolofoil" },
  { bad: "firstedition", good: "firstEdition" },
];
