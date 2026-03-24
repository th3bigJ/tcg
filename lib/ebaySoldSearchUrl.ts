export type EbayPokemonCardSearchParts = {
  /** Full set name from catalog when available. */
  setName?: string;
  /** Set code (e.g. `sv8`) if `setName` is missing. */
  setCode: string;
  /** Payload `sets.slug` (kebab-case); used to build Cardmarket `/Singles/{Set}/…` paths. */
  setSlug?: string;
  /** Payload `sets.tcgdexId` (e.g. `me02.5`) — used for TCGPlayer product URL slug prefix (`me`). */
  setTcgdexId?: string;
  /** Payload `sets.cardCountOfficial` — denominator in TCGPlayer slug when card number has no `/`. */
  setCardCountOfficial?: number;
  cardName: string;
  cardNumber?: string;
};

/**
 * Builds a search string like: `Pokemon Ascended Heroes Mega Dragonite ex 271`
 * for eBay UK sold listings (TCG singles).
 */
export function buildPokemonEbaySoldSearchQuery(parts: EbayPokemonCardSearchParts): string {
  const set =
    (typeof parts.setName === "string" && parts.setName.trim()) ||
    (typeof parts.setCode === "string" && parts.setCode.trim()) ||
    "";
  const name = typeof parts.cardName === "string" ? parts.cardName.trim() : "";
  let num = typeof parts.cardNumber === "string" ? parts.cardNumber.trim() : "";
  if (num.includes("/")) {
    num = num.split("/")[0]?.trim() ?? num;
  }
  const segments = ["Pokemon", set, name, num].filter((s) => s.length > 0);
  return segments.join(" ");
}

/** eBay UK search with completed + sold filters (LH_Complete, LH_Sold). */
export function buildEbayUkSoldListingsUrl(searchQuery: string): string {
  const params = new URLSearchParams({
    _nkw: searchQuery.trim(),
    LH_Complete: "1",
    LH_Sold: "1",
  });
  return `https://www.ebay.co.uk/sch/i.html?${params.toString()}`;
}
