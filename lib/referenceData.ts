export type ItemCondition = { id: string; name: string; sortOrder: number };
export type ProductType = { id: string; name: string; slug: string };

export const ITEM_CONDITIONS: ItemCondition[] = [
  { id: "near-mint",          name: "Near Mint",          sortOrder: 1 },
  { id: "lightly-played",     name: "Lightly Played",     sortOrder: 2 },
  { id: "moderately-played",  name: "Moderately Played",  sortOrder: 3 },
  { id: "heavily-played",     name: "Heavily Played",     sortOrder: 4 },
  { id: "damaged",            name: "Damaged",            sortOrder: 5 },
];

export const PRODUCT_TYPES: ProductType[] = [
  { id: "single-card",        name: "Single Card",        slug: "single-card" },
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
