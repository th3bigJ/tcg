import { resolveMediaURL } from "@/lib/media";
import type { SealedProductPriceTrendSummary } from "@/lib/staticDataTypes";

export type SealedProductCatalogEntry = {
  id: number;
  name: string;
  tcg: string | null;
  language: string | null;
  type: string | null;
  release_date: string | null;
  year: number | null;
  series: string | null;
  set_id: number | null;
  live: boolean;
  hot: number;
  image: {
    source_url: string | null;
    r2_key: string | null;
    public_url: string | null;
  };
};

export type SealedProductCatalogPayload = {
  scrapedAt: string;
  sourceUrl: string;
  sourceApiUrl: string;
  filters: {
    language: string | null;
    tcg: string | null;
  };
  count: number;
  imageFailures?: Array<{
    id: number;
    source_url: string | null;
    error: string;
  }>;
  products: SealedProductCatalogEntry[];
};

export type SealedProductPriceEntry = {
  id: number;
  market_value: number | null;
  currency: "USD";
  live: boolean;
};

export type SealedProductPricesPayload = {
  scrapedAt: string;
  sourceUrl: string;
  sourceApiUrl: string;
  priceSource: "blended_market_value";
  priceField: "market_value";
  filters: {
    language: string | null;
    tcg: string | null;
  };
  count: number;
  prices: Record<string, SealedProductPriceEntry>;
};

export type ShopSealedProduct = SealedProductCatalogEntry & {
  imageUrl: string;
  marketValue: number | null;
  marketValueCurrency: "USD";
  trend?: SealedProductPriceTrendSummary | null;
};

export type ShopSealedProductFilters = {
  search?: string;
  type?: string;
  series?: string;
  sort?: string;
};

export const DEFAULT_SEALED_SORT = "random";

export function normalizeSealedSortValue(value: string | null | undefined): string {
  switch ((value ?? "").trim()) {
    case "":
    case "featured":
    case DEFAULT_SEALED_SORT:
      return DEFAULT_SEALED_SORT;
    case "price-desc":
    case "change-desc":
    case "change-asc":
    case "release-desc":
    case "name-asc":
      return value!.trim();
    default:
      return DEFAULT_SEALED_SORT;
  }
}

export function normalizeSealedSeriesValue(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  return trimmed.toLocaleLowerCase();
}

export function suggestedProductTypeIdForSealedProduct(product: Pick<SealedProductCatalogEntry, "type">): string {
  switch ((product.type ?? "").toUpperCase()) {
    case "BOOSTERPACK":
    case "BLISTERPACK":
      return "booster-pack";
    case "ELITETRAINERBOX":
      return "elite-trainer-box";
    case "BOOSTERBOX":
      return "booster-box";
    case "COLLECTIONBOX":
    case "COLLECTIONCHEST":
    case "PINCOLLECTION":
      return "collection-box";
    case "TIN":
      return "tin";
    case "PREMIUMTRAINERBOX":
    case "SPECIALBOX":
      return "premium-collection";
    default:
      return "other";
  }
}

export function buildCollectionTransactionHref(product: ShopSealedProduct): string {
  const searchParams = new URLSearchParams();
  searchParams.set("direction", "purchase");
  searchParams.set("description", product.name);
  searchParams.set("productTypeId", suggestedProductTypeIdForSealedProduct(product));
  searchParams.set("sealedState", "sealed");
  searchParams.set("quantity", "1");
  if (typeof product.marketValue === "number") {
    searchParams.set("unitPrice", product.marketValue.toFixed(2));
  }
  searchParams.set("sourceReference", `sealed-product:${product.id}`);
  return `/account/transactions?${searchParams.toString()}`;
}

export function parsePositivePage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function buildSealedBrowseHref(
  filters: ShopSealedProductFilters & { take?: number | null },
  options?: { basePath?: string; tab?: string },
): string {
  const searchParams = new URLSearchParams();
  if (options?.tab?.trim()) searchParams.set("tab", options.tab.trim());
  if (filters.type?.trim()) searchParams.set("type", filters.type.trim());
  if (filters.series?.trim()) searchParams.set("series", filters.series.trim());
  if (filters.search?.trim()) searchParams.set("search", filters.search.trim());
  if (filters.sort?.trim() && filters.sort.trim() !== DEFAULT_SEALED_SORT) {
    searchParams.set("sort", filters.sort.trim());
  }
  if (filters.take && filters.take > 0) searchParams.set("take", String(filters.take));
  const queryString = searchParams.toString();
  const basePath = options?.basePath?.trim() || "/sealed";
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export function searchShopSealedProducts(products: ShopSealedProduct[], query: string): ShopSealedProduct[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return products;

  return products.filter((product) => {
    const haystack = [
      product.name,
      product.tcg,
      product.type,
      product.series,
      product.language,
      product.year ? String(product.year) : null,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function filterShopSealedProducts(
  products: ShopSealedProduct[],
  filters: ShopSealedProductFilters,
): ShopSealedProduct[] {
  const activeSearch = filters.search?.trim() ?? "";
  const activeSeries = normalizeSealedSeriesValue(filters.series);

  return searchShopSealedProducts(
    products.filter((product) => {
      if (filters.type?.trim() && product.type !== filters.type.trim()) return false;
      if (activeSeries && normalizeSealedSeriesValue(product.series) !== activeSeries) return false;
      return true;
    }),
    activeSearch,
  );
}

export function sortShopSealedProducts(products: ShopSealedProduct[]): ShopSealedProduct[] {
  return [...products].sort((left, right) => {
    if (left.live !== right.live) return Number(right.live) - Number(left.live);
    if (left.hot !== right.hot) return right.hot - left.hot;
    const rightPrice = typeof right.marketValue === "number" ? right.marketValue : -1;
    const leftPrice = typeof left.marketValue === "number" ? left.marketValue : -1;
    if (leftPrice !== rightPrice) return rightPrice - leftPrice;
    const rightRelease = right.release_date ?? "";
    const leftRelease = left.release_date ?? "";
    if (leftRelease !== rightRelease) return rightRelease.localeCompare(leftRelease);
    return left.name.localeCompare(right.name);
  });
}

export function findShopSealedProductById(products: ShopSealedProduct[], id: number): ShopSealedProduct | null {
  return products.find((product) => product.id === id) ?? null;
}

function getR2BaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
}

function getSealedProductsUrl(fileName: string): string | null {
  const base = getR2BaseUrl();
  if (!base) return null;
  return `${base}/sealed-products/pokedata/${fileName}`;
}

export function getSealedProductsPublicUrl(fileName: string): string | null {
  return getSealedProductsUrl(fileName);
}

type CacheEntry<T> = { value: T; expiresAt: number };

let _catalogCache: CacheEntry<SealedProductCatalogPayload | null> | null = null;
let _pricesCache: CacheEntry<SealedProductPricesPayload | null> | null = null;

export async function getSealedProductCatalog(): Promise<SealedProductCatalogPayload | null> {
  if (_catalogCache && Date.now() < _catalogCache.expiresAt) return _catalogCache.value;

  const url = getSealedProductsUrl("pokedata-english-pokemon-products.json");
  if (!url) return null;

  const ttlMs = process.env.NODE_ENV === "development" ? 0 : 7 * 24 * 60 * 60 * 1000;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const value = (await res.json()) as SealedProductCatalogPayload;
    _catalogCache = { value, expiresAt: Date.now() + ttlMs };
    return value;
  } catch {
    return null;
  }
}

export async function getSealedProductPrices(): Promise<SealedProductPricesPayload | null> {
  if (_pricesCache && Date.now() < _pricesCache.expiresAt) return _pricesCache.value;

  const url = getSealedProductsUrl("pokedata-english-pokemon-prices.json");
  if (!url) return null;

  const ttlMs = process.env.NODE_ENV === "development" ? 0 : 24 * 60 * 60 * 1000;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const value = (await res.json()) as SealedProductPricesPayload;
    _pricesCache = { value, expiresAt: Date.now() + ttlMs };
    return value;
  } catch {
    return null;
  }
}

export function mergeSealedProductsWithPrices(
  catalog: SealedProductCatalogPayload | null,
  prices: SealedProductPricesPayload | null,
): ShopSealedProduct[] {
  if (!catalog) return [];

  return catalog.products.map((product) => {
    const price = prices?.prices[String(product.id)] ?? null;
    const imageUrl = resolveMediaURL(product.image.public_url ?? product.image.r2_key ?? product.image.source_url ?? "");

    return {
      ...product,
      imageUrl,
      marketValue: price?.market_value ?? null,
      marketValueCurrency: "USD",
    };
  });
}
