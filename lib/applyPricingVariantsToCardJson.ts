import type { CardJsonEntry, SetPricingMap } from "@/lib/staticDataTypes";
import { collectPricingVariantKeys } from "@/lib/catalogPricingExtract";
import { getPricingForCard } from "@/lib/r2Pricing";

function pricingVariantsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

/**
 * Sets `pricingVariants` on each card from a per-set `card-pricing` map (or clears when missing).
 * Mutates the given array in place; returns whether any card changed.
 */
export function applyPricingVariantsToCardsInPlace(cards: CardJsonEntry[], pricingMap: SetPricingMap | null): boolean {
  let changed = false;
  for (const card of cards) {
    const ext = (card.externalId ?? "").trim();
    if (!ext) {
      if (card.pricingVariants != null) {
        card.pricingVariants = null;
        changed = true;
      }
      continue;
    }
    const entry = pricingMap ? getPricingForCard(pricingMap, ext) : null;
    const keys = collectPricingVariantKeys(entry);
    const next = keys.length > 0 ? keys : null;
    if (!pricingVariantsEqual(card.pricingVariants, next)) {
      card.pricingVariants = next;
      changed = true;
    }
  }
  return changed;
}
