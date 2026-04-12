/**
 * Maps brand `id`s from `brands/data/brands.json` on R2 to admin JSON APIs.
 * Brands without data APIs yet (e.g. lorcana) return null so the UI shows empty series/sets.
 */

export function adminSetsFetchPath(brandId: string): string | null {
  if (brandId === "pokemon") return "/api/admin/data/pokemon-sets";
  if (brandId === "onepiece") return "/api/admin/data/onepiece-sets";
  return null;
}

export function adminCardsFetchPath(brandId: string, setCode: string): string | null {
  if (brandId === "pokemon") {
    return `/api/admin/data/pokemon-cards/${encodeURIComponent(setCode)}`;
  }
  if (brandId === "onepiece") {
    return `/api/admin/data/onepiece-cards/${encodeURIComponent(setCode)}`;
  }
  return null;
}

export function adminPricingFetchPath(brandId: string, setCode: string): string | null {
  if (brandId === "pokemon" || brandId === "onepiece" || brandId === "lorcana") {
    return `/api/admin/data/card-pricing/${encodeURIComponent(brandId)}/${encodeURIComponent(setCode)}`;
  }
  return null;
}

export function adminBrandSupportsSetCardSave(brandId: string): boolean {
  return brandId === "pokemon" || brandId === "onepiece";
}
