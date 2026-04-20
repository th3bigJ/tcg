import type { TcgPriceVariant } from "@/lib/tcgdexTcgplayerVariants";

/** TCGdex variant blocks use `reverse-holofoil`; our UI uses `reverseHolofoil`. */
const TCGPLAYER_VARIANT_BLOCK_KEYS: Record<TcgPriceVariant, readonly string[]> = {
  normal: ["normal"],
  holofoil: ["holofoil"],
  /** TCGdex uses `reverse` on many English cards; `reverse-holofoil` appears in API docs. */
  reverseHolofoil: ["reverseHolofoil", "reverse-holofoil", "reverse"],
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

function readUsdMarketFromBlock(block: unknown): number | null {
  if (!block || typeof block !== "object") return null;
  const o = block as Record<string, unknown>;
  const m = o.market ?? o.marketPrice;
  return typeof m === "number" && Number.isFinite(m) ? m : null;
}
