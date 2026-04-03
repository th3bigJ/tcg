export type ItemCondition = { id: string; name: string; sortOrder: number };
export type ProductType = { id: string; name: string; slug: string };

export const ITEM_CONDITIONS: ItemCondition[] = [
  { id: "near-mint",          name: "Near Mint",          sortOrder: 1 },
  { id: "lightly-played",     name: "Lightly Played",     sortOrder: 2 },
  { id: "moderately-played",  name: "Moderately Played",  sortOrder: 3 },
  { id: "heavily-played",     name: "Heavily Played",     sortOrder: 4 },
  { id: "damaged",            name: "Damaged",            sortOrder: 5 },
  { id: "graded-card",        name: "Graded",             sortOrder: 6 },
];

export const PRODUCT_TYPES: ProductType[] = [
  { id: "single-card",        name: "Single Card",        slug: "single-card" },
  { id: "graded-card",        name: "Graded card",        slug: "graded-card" },
  { id: "booster-pack",       name: "Booster Pack",       slug: "booster-pack" },
  { id: "elite-trainer-box",  name: "Elite Trainer Box",  slug: "elite-trainer-box" },
  { id: "booster-box",        name: "Booster Box",        slug: "booster-box" },
  { id: "collection-box",     name: "Collection Box",     slug: "collection-box" },
  { id: "tin",                name: "Tin",                slug: "tin" },
  { id: "premium-collection", name: "Premium Collection", slug: "premium-collection" },
  { id: "other",              name: "Other",              slug: "other" },
];

export function getItemConditionName(id: string | null | undefined): string {
  if (!id) return "";
  return ITEM_CONDITIONS.find((c) => c.id === id)?.name ?? id;
}

export function getProductTypeBySlug(slug: string): ProductType | undefined {
  return PRODUCT_TYPES.find((pt) => pt.slug === slug);
}

export function getProductTypeById(id: string): ProductType | undefined {
  return PRODUCT_TYPES.find((pt) => pt.id === id);
}

/** Legacy DB value `graded` and current `graded-card` both mean a slabbed copy. */
export function isGradedConditionId(id: string | null | undefined): boolean {
  const t = (id?.trim() ?? "").toLowerCase();
  return t === "graded" || t === "graded-card";
}

export function isGradedConditionLabel(label: string | null | undefined): boolean {
  const t = (label?.trim() ?? "").toLowerCase();
  return t === "graded" || t === "graded-card";
}

/** Sealed vs opened applies to sealed products only — not raw singles or graded slabs. */
export function productTypeSupportsSealedState(productTypeSlug: string): boolean {
  const s = productTypeSlug.trim();
  if (!s) return false;
  return s !== "single-card" && s !== "graded-card";
}

export function normalizeSealedStateForProductType(
  productTypeSlug: string,
  sealedState: "sealed" | "opened" | null | undefined,
): "sealed" | "opened" | null {
  const s = productTypeSlug.trim();
  if (!s || !productTypeSupportsSealedState(s)) return null;
  return sealedState === "sealed" || sealedState === "opened" ? sealedState : null;
}
