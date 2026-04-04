import { getProductTypeById } from "@/lib/referenceData";

export type FourWayCategory = "single" | "graded" | "sealed" | "ripped";

/**
 * Spend/sold by transaction line. Opened sealed inventory counts as Ripped.
 * Single/graded card lines ignore sealed state.
 */
export function transactionFourWayCategoryFromProductTypeSlug(
  productTypeSlug: string,
  sealedState: "sealed" | "opened" | null | undefined,
): FourWayCategory {
  const slug = productTypeSlug.trim();
  if (slug === "graded-card") return "graded";
  if (slug === "single-card") return "single";
  if (sealedState === "opened") return "ripped";
  return "sealed";
}

export function transactionFourWayCategoryFromProductTypeId(
  productTypeId: string | null | undefined,
  sealedState: "sealed" | "opened" | null | undefined,
): FourWayCategory {
  const pt = productTypeId ? getProductTypeById(productTypeId) : undefined;
  const slug = pt?.slug ?? "";
  return transactionFourWayCategoryFromProductTypeSlug(slug, sealedState);
}
