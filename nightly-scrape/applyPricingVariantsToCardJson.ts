import type { CardJsonEntry } from "./staticDataTypes";

function pricingVariantsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

/**
 * Sets `pricingVariants` on each card from a daily bucket pricing map.
 * Mutates the given array in place; returns whether any card changed.
 */
export function applyPricingVariantsToCardsInPlace(
  cards: CardJsonEntry[],
  dailyPricingMap: Record<string, Record<string, Record<string, number>>> | null,
): boolean {
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
    const variants = dailyPricingMap?.[ext];
    const keys = variants ? Object.keys(variants).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [];
    const next = keys.length > 0 ? keys : null;

    if (!pricingVariantsEqual(card.pricingVariants, next)) {
      card.pricingVariants = next;
      changed = true;
    }
  }
  return changed;
}
