import { CardsResultsScroll } from "@/components/CardsResultsScroll";
import { SealedProductGrid } from "@/components/SealedProductGrid";
import { SealedTagFilterRow } from "@/components/SealedTagFilterRow";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { getSealedPriceTrends } from "@/lib/r2SealedPriceTrends";
import {
  DEFAULT_SEALED_SORT,
  buildSealedBrowseHref,
  filterShopSealedProducts,
  getSealedProductCatalog,
  getSealedProductPrices,
  mergeSealedProductsWithPrices,
  normalizeSealedSeriesValue,
  normalizeSealedSortValue,
  type ShopSealedProduct,
} from "@/lib/r2SealedProducts";
import type { SealedProductPriceTrendMap } from "@/lib/staticDataTypes";

type SealedBrowseContentProps = {
  params: {
    take?: string;
    page?: string;
    search?: string;
    q?: string;
    type?: string;
    series?: string;
    sort?: string;
  };
  basePath?: string;
  tab?: string;
  showFilterRow?: boolean;
};

const SEALED_LOAD_MORE_STEP = 60;
const SEALED_INITIAL_TAKE = 60;

function createSeededRandom(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function seededRandom() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffleProductsWithSeed(products: readonly ShopSealedProduct[], seed: string): ShopSealedProduct[] {
  const shuffled = [...products];
  const random = createSeededRandom(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

function parseSealedTake(value: string | undefined, pageValue: string | undefined): number {
  const parsedTake = Number.parseInt(value ?? "", 10);
  if (Number.isFinite(parsedTake) && parsedTake > 0) return parsedTake;
  const parsedPage = Number.parseInt(pageValue ?? "", 10);
  if (Number.isFinite(parsedPage) && parsedPage > 1) return parsedPage * SEALED_LOAD_MORE_STEP;
  return SEALED_INITIAL_TAKE;
}

function normalizeSelection(value: string | undefined, allowedValues: Set<string>): string {
  const trimmed = (value ?? "").trim();
  return allowedValues.has(trimmed) ? trimmed : "";
}

function buildFilterOptions(values: Array<string | null>): Array<{ name: string; count: number }> {
  return Array.from(
    values.reduce((map, value) => {
      const normalized = value?.trim();
      if (!normalized) return map;
      map.set(normalized, (map.get(normalized) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0]);
    })
    .map(([name, count]) => ({ name, count }));
}

function toTitleCaseWords(value: string): string {
  return value
    .split(/\s+/u)
    .map((part) => {
      const lower = part.toLocaleLowerCase();
      if (!lower) return lower;
      return lower[0]!.toLocaleUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function canonicalSeriesLabel(value: string): string {
  const normalized = normalizeSealedSeriesValue(value);
  if (!normalized) return "";

  switch (normalized) {
    case "bw":
      return "Black & White";
    case "dp":
      return "Diamond & Pearl";
    case "xy":
      return "XY";
    case "neo":
      return "Neo";
    case "base":
      return "Base";
    case "ecard":
    case "e-card":
      return "e-Card";
    default:
      return toTitleCaseWords(normalized);
  }
}

function buildSeriesOptions(products: ShopSealedProduct[]): Array<{ value: string; label: string }> {
  const grouped = new Map<string, number>();
  for (const product of products) {
    const key = normalizeSealedSeriesValue(product.series);
    if (!key) continue;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return canonicalSeriesLabel(left[0]).localeCompare(canonicalSeriesLabel(right[0]));
    })
    .map(([value]) => ({
      value,
      label: canonicalSeriesLabel(value),
    }));
}

function sortVisibleProducts(
  products: ShopSealedProduct[],
  sort: string,
  trendMap: SealedProductPriceTrendMap | null,
): ShopSealedProduct[] {
  if (sort === DEFAULT_SEALED_SORT) {
    const seed = products.map((product) => String(product.id)).join("|");
    return shuffleProductsWithSeed(products, seed);
  }

  return [...products].sort((left, right) => {
    if (sort === "price-desc") {
      return (right.marketValue ?? -1) - (left.marketValue ?? -1);
    }
    if (sort === "change-desc" || sort === "change-asc") {
      const leftTrend = trendMap?.[String(left.id)]?.weekly.changePct;
      const rightTrend = trendMap?.[String(right.id)]?.weekly.changePct;
      const leftValue =
        typeof leftTrend === "number" && Number.isFinite(leftTrend)
          ? leftTrend
          : sort === "change-desc"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY;
      const rightValue =
        typeof rightTrend === "number" && Number.isFinite(rightTrend)
          ? rightTrend
          : sort === "change-desc"
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY;
      return sort === "change-desc" ? rightValue - leftValue : leftValue - rightValue;
    }
    if (sort === "release-desc") {
      const rightRelease = Date.parse(right.release_date ?? "");
      const leftRelease = Date.parse(left.release_date ?? "");
      const normalizedRightRelease = Number.isFinite(rightRelease) ? rightRelease : -1;
      const normalizedLeftRelease = Number.isFinite(leftRelease) ? leftRelease : -1;
      if (normalizedRightRelease !== normalizedLeftRelease) {
        return normalizedRightRelease - normalizedLeftRelease;
      }
      return right.name.localeCompare(left.name);
    }
    if (sort === "name-asc") {
      return left.name.localeCompare(right.name);
    }
    return 0;
  });
}

export async function SealedBrowseContent({
  params,
  basePath = "/sealed",
  tab,
  showFilterRow = true,
}: SealedBrowseContentProps) {
  const requestedSearch = (params.search ?? params.q ?? "").trim();
  const requestedTake = parseSealedTake(params.take, params.page);
  const activeSort = normalizeSealedSortValue(params.sort);

  const [catalog, prices, multipliers, trendMap] = await Promise.all([
    getSealedProductCatalog(),
    getSealedProductPrices(),
    fetchGbpConversionMultipliers(),
    getSealedPriceTrends(),
  ]);
  const mergedProducts = mergeSealedProductsWithPrices(catalog, prices).map((product) => ({
    ...product,
    trend: trendMap?.[String(product.id)] ?? null,
  }));

  const typeOptions = buildFilterOptions(mergedProducts.map((product) => product.type)).map((option) => ({
    value: option.name,
    label: option.name,
  }));
  const seriesOptions = buildSeriesOptions(mergedProducts);

  const activeType = normalizeSelection(params.type, new Set(typeOptions.map((option) => option.value)));
  const activeSeries = normalizeSealedSeriesValue(params.series);

  const filteredProducts = sortVisibleProducts(
    filterShopSealedProducts(mergedProducts, {
      search: requestedSearch,
      type: activeType,
      series: activeSeries,
    }),
    activeSort,
    trendMap,
  );

  const visibleProducts = filteredProducts.slice(0, requestedTake);
  const canLoadMore = visibleProducts.length > 0 && visibleProducts.length < filteredProducts.length;
  const nextTake = Math.min(filteredProducts.length, visibleProducts.length + SEALED_LOAD_MORE_STEP);
  const loadMoreHref = buildSealedBrowseHref(
    {
      search: requestedSearch,
      type: activeType,
      series: activeSeries,
      sort: activeSort,
      take: nextTake,
    },
    { basePath, tab },
  );
  const scrollRestoreKey = [String(requestedTake), requestedSearch, activeType, activeSeries, activeSort].join("|");
  const resetHref = buildSealedBrowseHref({}, { basePath, tab });

  return (
    <>
      {showFilterRow ? (
        <SealedTagFilterRow
          activeSeries={activeSeries}
          activeType={activeType}
          activeSort={activeSort}
          resetHref={resetHref}
          seriesOptions={seriesOptions}
          typeOptions={typeOptions}
          basePath={basePath}
          tab={tab}
        />
      ) : null}

      {!catalog ? (
        <div className="rounded-lg border border-dashed border-[var(--foreground)]/18 bg-[var(--foreground)]/[0.03] px-5 py-10 text-sm text-[var(--foreground)]/72">
          The sealed catalog could not be loaded from R2. Check `R2_PUBLIC_BASE_URL` and confirm the mirrored
          product JSON is available.
        </div>
      ) : (
        <CardsResultsScroll
          canLoadMore={canLoadMore}
          loadMoreHref={loadMoreHref}
          loadMoreStep={SEALED_LOAD_MORE_STEP}
          scrollRestoreKey={scrollRestoreKey}
        >
          <SealedProductGrid products={visibleProducts} usdToGbpMultiplier={multipliers.usdToGbp} />
        </CardsResultsScroll>
      )}
    </>
  );
}
