/** True when `externalPricing` holds TCGdex API tcgplayer/cardmarket blocks (not Scrydex-only metadata). */
export function catalogRowHasTcgdexOrCardmarket(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const o = doc as Record<string, unknown>;
  const ep = o.externalPricing ?? o.external_pricing;
  if (!ep || typeof ep !== "object") return false;
  const row = ep as Record<string, unknown>;
  if (row.source === "scrydex") return false;
  const tp = row.tcgplayer;
  const cm = row.cardmarket;
  if (tp && typeof tp === "object" && Object.keys(tp as object).length > 0) return true;
  if (cm && typeof cm === "object" && Object.keys(cm as object).length > 0) return true;
  return false;
}

/** True if the catalog row has any stored pricing (TCGdex raw in externalPricing, and/or scrape GBP in externalPrice). */
export function catalogRowHasPricingData(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  if (catalogRowHasTcgdexOrCardmarket(doc)) return true;
  const o = doc as Record<string, unknown>;
  const ex = o.externalPrice ?? o.external_price;
  if (ex && typeof ex === "object" && Object.keys(ex as object).length > 0) return true;
  return false;
}

/** @deprecated Use catalogRowHasPricingData. */
export function catalogHasUsableMarkets(doc: unknown): boolean {
  return catalogRowHasPricingData(doc);
}
