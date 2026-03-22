import type { TcgPriceVariant } from "@/lib/tcgdexTcgplayerVariants";

/** TCGdex variant blocks use `reverse-holofoil`; our UI uses `reverseHolofoil`. */
export const TCGPLAYER_VARIANT_BLOCK_KEYS: Record<TcgPriceVariant, readonly string[]> = {
  normal: ["normal"],
  holofoil: ["holofoil"],
  reverseHolofoil: ["reverseHolofoil", "reverse-holofoil"],
};

export function getTcgplayerVariantBlock(
  tpObj: Record<string, unknown>,
  variant: TcgPriceVariant,
): unknown {
  for (const key of TCGPLAYER_VARIANT_BLOCK_KEYS[variant]) {
    if (key in tpObj) return tpObj[key];
  }
  return undefined;
}

export function tcgVariantHasMarketPrice(tpObj: Record<string, unknown>, variant: TcgPriceVariant): boolean {
  const block = getTcgplayerVariantBlock(tpObj, variant);
  return readUsdMarketFromBlock(block) !== null;
}

function readUsdMarketFromBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}

export function readTcgplayerProductIdFromBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const pid = (block as Record<string, unknown>).productId;
  return typeof pid === "number" && Number.isFinite(pid) ? pid : null;
}

export function buildTcgplayerProductUrl(productId: number): string {
  return `https://www.tcgplayer.com/product/${productId}`;
}

export function readCardmarketIdProduct(cardmarket: unknown): number | null {
  if (!cardmarket || typeof cardmarket !== "object") return null;
  const id = (cardmarket as Record<string, unknown>).idProduct;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

/**
 * Browser link for a Pokémon singles product. Cardmarket’s public URLs are mostly slug-based;
 * `idProduct` as a query param is widely used for deep links and matches the ID from TCGdex.
 */
export function buildCardmarketPokemonSinglesUrl(idProduct: number): string {
  const q = new URLSearchParams({ idProduct: String(idProduct) });
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles?${q.toString()}`;
}
