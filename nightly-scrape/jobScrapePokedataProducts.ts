import fs from "fs";
import path from "path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  r2SealedPokedataCatalogKey,
  r2SealedDailyKey,
  r2SealedWeeklyKey,
  r2SealedMonthlyKey,
} from "./r2BucketLayout";
import { pokemonLocalDataRoot } from "./localDataPaths";
import {
  updateSealedPriceHistory,
  uploadSealedPriceTrends,
  todayKey,
  currentWeekKey,
  currentMonthKey,
} from "./r2SealedPricing";

interface ScrapePokedataProductsOptions {
  mode?: "all" | "products" | "prices" | "incremental";
  tcg?: string;
  language?: string;
  imageConcurrency?: number;
  skipExistingImages?: boolean;
  /** Inclusive UTC date (YYYY-MM-DD); required for `incremental`. */
  since?: string;
  /** Inclusive UTC date (YYYY-MM-DD); required for `incremental`. */
  until?: string;
}

type PokedataProduct = {
  hot?: number;
  id: number;
  img_url?: string | null;
  language?: string | null;
  live?: boolean;
  market_value?: number | null;
  name: string;
  release_date?: string | null;
  series?: string | null;
  set_id?: number | null;
  stat_url?: string | null;
  tcg?: string | null;
  type?: string | null;
  year?: number | null;
};

type ProductCatalogEntry = {
  id: number;
  name: string;
  tcg: string | null;
  language: string | null;
  type: string | null;
  release_date: string | null;
  year: number | null;
  series: string | null;
  set_id: number | null;
  image: {
    r2_key: string | null;
    public_url: string | null;
  };
  set_name?: string | null;
};

type PriceEntry = {
  id: number;
  market_value: number | null;
  currency: "USD";
  live: boolean;
};

type ProductCatalogPayload = {
  scrapedAt: string;
  sourceUrl: string;
  sourceApiUrl: string;
  filters: {
    language: string | null;
    tcg: string | null;
  };
  count: number;
  imageFailures: Array<{
    id: number;
    source_url: string | null;
    error: string;
  }>;
  products: ProductCatalogEntry[];
};

type PricePayload = {
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
  prices: Record<string, PriceEntry>;
};

const SOURCE_URL = "https://www.pokedata.io/products";
const SOURCE_API_URL = "https://www.pokedata.io/api/products";
/** Image-failure reports only; product catalog lives in `data/pokemon/{slug}-products.json`. */
const SEALED_REPORTS_DIR = path.join(process.cwd(), "data", "sealed-products");
const PRICING_DATA_DIR = path.join(pokemonLocalDataRoot, "pricing");
const DEFAULT_IMAGE_CONCURRENCY = 8;
const DEFAULT_TCG = "Pokemon";
const DEFAULT_LANGUAGE = "ENGLISH";

function normalizeFilterValue(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toUpperCase() === "ALL") return null;
  return trimmed.toUpperCase();
}

function buildS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.R2_ENDPOINT ?? "",
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    forcePathStyle: true,
    region: process.env.R2_REGION ?? "auto",
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("R2_BUCKET env var not set");
  return bucket;
}

function getPublicBaseUrl(): string {
  const base =
    process.env.R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_MEDIA_BASE_URL ??
    "";
  return base.replace(/\/+$/, "");
}

/** When set, JSON mirrors under `data/pokemon/` and local failure reports are skipped (R2 uploads unchanged). */
function scraperSkipLocalDiskMirror(): boolean {
  const v = process.env.SCRAPER_SKIP_LOCAL_DISK?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function ensureOutputDir(): void {
  if (scraperSkipLocalDiskMirror()) return;
  fs.mkdirSync(pokemonLocalDataRoot, { recursive: true });
  fs.mkdirSync(SEALED_REPORTS_DIR, { recursive: true });
  fs.mkdirSync(PRICING_DATA_DIR, { recursive: true });
}

async function fetchProducts(): Promise<PokedataProduct[]> {
  const response = await fetch(SOURCE_API_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_API_URL}: ${response.status} ${response.statusText}`);
  }

  const products = (await response.json()) as unknown;
  if (!Array.isArray(products)) {
    throw new Error("The products API payload was missing or malformed.");
  }

  return products as PokedataProduct[];
}

function parseInclusiveDateKey(value: string, label: string): number {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ${label} date "${value}". Use YYYY-MM-DD.`);
  }
  const parsed = Date.parse(`${trimmed}T00:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label} date "${value}".`);
  }
  return parsed;
}

function filterProductsByReleaseDate(
  products: PokedataProduct[],
  since: string,
  until: string,
): PokedataProduct[] {
  const start = parseInclusiveDateKey(since, "since");
  const end = Date.parse(`${until.trim()}T23:59:59Z`);
  if (!Number.isFinite(end)) {
    throw new Error(`Invalid until date "${until}".`);
  }
  if (start > end) {
    throw new Error(`since (${since}) must be on or before until (${until}).`);
  }

  return products.filter((product) => {
    const releaseMs = Date.parse(product.release_date ?? "");
    if (!Number.isFinite(releaseMs)) return false;
    return releaseMs >= start && releaseMs <= end;
  });
}

function sortProductsByReleaseDate(products: PokedataProduct[]): PokedataProduct[] {
  return [...products].sort((left, right) => {
    const rightDate = Date.parse(right.release_date ?? "") || 0;
    const leftDate = Date.parse(left.release_date ?? "") || 0;
    if (rightDate !== leftDate) return rightDate - leftDate;
    return left.name.localeCompare(right.name);
  });
}

function sortCatalogEntries(entries: ProductCatalogEntry[]): ProductCatalogEntry[] {
  return [...entries].sort((left, right) => {
    const rightDate = Date.parse(right.release_date ?? "") || 0;
    const leftDate = Date.parse(left.release_date ?? "") || 0;
    if (rightDate !== leftDate) return rightDate - leftDate;
    return left.name.localeCompare(right.name);
  });
}

function filterProducts(
  products: PokedataProduct[],
  requestedLanguage: string | null,
  requestedTcg: string,
): PokedataProduct[] {
  return sortProductsByReleaseDate(
    products
    .filter((product) => {
      if (!requestedLanguage) return true;
      return (product.language ?? "").toUpperCase() === requestedLanguage;
    })
    .filter((product) => {
      if (!requestedTcg) return true;
      return (product.tcg ?? "").toLowerCase() === requestedTcg.toLowerCase();
    })
    .filter((product) => {
      const name = product.name.trim();
      if (/\bcase\b/i.test(name)) return false;
      if (/\bdisplay$/i.test(name)) return false;
      return true;
    }),
  );
}

function resolveSeries(product: PokedataProduct): string | null {
  const name = product.name.trim();
  if (name.toLocaleLowerCase().includes("perfect order")) {
    return "Mega Evolution";
  }
  return product.series ?? null;
}

function buildSlugParts(requestedLanguage: string | null, requestedTcg: string): string[] {
  const parts = ["pokedata"];
  parts.push(requestedLanguage ? requestedLanguage.toLowerCase() : "all-languages");
  if (requestedTcg) {
    parts.push(requestedTcg.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  } else {
    parts.push("all-tcgs");
  }
  return parts;
}

function inferContentType(ext: string): string {
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function inferExtFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return ext || ".jpg";
}

function buildImageR2Key(product: PokedataProduct): string | null {
  const imageUrl = product.img_url?.trim();
  if (!imageUrl) return null;
  const ext = inferExtFromUrl(imageUrl);
  return `sealed-products/pokedata/images/${product.id}${ext}`;
}

function buildPublicUrl(r2Key: string | null): string | null {
  if (!r2Key) return null;
  const base = getPublicBaseUrl();
  if (!base) return null;
  return `${base}/${r2Key}`;
}

async function fetchSnapshot(s3: S3Client, bucket: string, key: string): Promise<Record<string, number>> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const raw = await res.Body?.transformToString();
    if (!raw?.trim()) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch (e: unknown) {
    const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    const name = (e as { name?: string }).name;
    if (status === 404 || name === "NoSuchKey") return {};
    throw e;
  }
}

async function uploadJson(s3: S3Client, bucket: string, key: string, payload: unknown): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: `${JSON.stringify(payload, null, 2)}\n`,
      ContentType: "application/json",
    }),
  );
}

async function objectExists(s3: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: unknown) {
    const details = error as { $metadata?: { httpStatusCode?: number }; name?: string };
    if (details.$metadata?.httpStatusCode === 404 || details.name === "NotFound") return false;
    throw error;
  }
}

async function uploadImageForProduct(
  s3: S3Client,
  bucket: string,
  product: PokedataProduct,
  skipExistingImages: boolean,
): Promise<{ uploaded: boolean; skipped: boolean }> {
  const imageUrl = product.img_url?.trim();
  const r2Key = buildImageR2Key(product);
  if (!imageUrl || !r2Key) return { uploaded: false, skipped: true };

  if (skipExistingImages && (await objectExists(s3, bucket, r2Key))) {
    return { uploaded: false, skipped: true };
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image for ${product.id} from ${imageUrl}: HTTP ${response.status}`);
  }

  const ext = inferExtFromUrl(imageUrl);
  const contentType = (response.headers.get("content-type") || inferContentType(ext)).split(";")[0].trim();
  const body = Buffer.from(await response.arrayBuffer());

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { uploaded: true, skipped: false };
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex++;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function productToCatalogEntry(product: PokedataProduct): ProductCatalogEntry {
  const r2Key = buildImageR2Key(product);
  return {
    id: product.id,
    name: product.name,
    tcg: product.tcg ?? null,
    language: product.language ?? null,
    type: product.type ?? null,
    release_date: product.release_date ?? null,
    year: product.year ?? null,
    series: resolveSeries(product),
    set_id: product.set_id ?? null,
    image: {
      r2_key: r2Key,
      public_url: buildPublicUrl(r2Key),
    },
  };
}

function buildCatalogPayload(
  products: PokedataProduct[],
  requestedLanguage: string | null,
  requestedTcg: string,
): ProductCatalogPayload {
  return {
    scrapedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    sourceApiUrl: SOURCE_API_URL,
    filters: {
      language: requestedLanguage,
      tcg: requestedTcg || null,
    },
    count: products.length,
    imageFailures: [],
    products: products.map((product) => productToCatalogEntry(product)),
  };
}

function buildPricesMap(products: PokedataProduct[]): Record<string, PriceEntry> {
  return Object.fromEntries(
    products.map((product) => [
      String(product.id),
      {
        id: product.id,
        market_value: typeof product.market_value === "number" ? product.market_value : null,
        currency: "USD",
        live: Boolean(product.live),
      } satisfies PriceEntry,
    ]),
  );
}

function buildPricesPayload(
  products: PokedataProduct[],
  requestedLanguage: string | null,
  requestedTcg: string,
): PricePayload {
  return {
    scrapedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    sourceApiUrl: SOURCE_API_URL,
    priceSource: "blended_market_value",
    priceField: "market_value",
    filters: {
      language: requestedLanguage,
      tcg: requestedTcg || null,
    },
    count: products.length,
    prices: buildPricesMap(products),
  };
}

async function fetchCatalogFromR2(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<ProductCatalogPayload> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const raw = await res.Body?.transformToString();
  if (!raw?.trim()) {
    throw new Error(`Catalog at R2 ${key} was empty.`);
  }
  const payload = JSON.parse(raw) as ProductCatalogPayload;
  if (!Array.isArray(payload.products)) {
    throw new Error(`Catalog at R2 ${key} was missing a products array.`);
  }
  return payload;
}

function mergeCatalogPayload(
  existing: ProductCatalogPayload,
  newEntries: ProductCatalogEntry[],
  requestedLanguage: string | null,
  requestedTcg: string,
  imageFailures: ProductCatalogPayload["imageFailures"],
): ProductCatalogPayload {
  const mergedProducts = sortCatalogEntries([...existing.products, ...newEntries]);
  return {
    ...existing,
    scrapedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    sourceApiUrl: SOURCE_API_URL,
    filters: {
      language: requestedLanguage,
      tcg: requestedTcg || null,
    },
    count: mergedProducts.length,
    imageFailures: [...(existing.imageFailures ?? []), ...imageFailures],
    products: mergedProducts,
  };
}

function writeLocalJson(filePath: string, payload: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function uploadProductImages(
  s3: S3Client,
  bucket: string,
  products: PokedataProduct[],
  imageConcurrency: number,
  skipExistingImages: boolean,
  slugParts: string[],
): Promise<{
  failures: ProductCatalogPayload["imageFailures"];
  localReportPath: string | null;
  r2ReportKey: string | null;
}> {
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures: ProductCatalogPayload["imageFailures"] = [];

  await mapPool(products, imageConcurrency, async (product, index) => {
    try {
      const result = await uploadImageForProduct(s3, bucket, product, skipExistingImages);
      if (result.uploaded) uploaded += 1;
      if (result.skipped) skipped += 1;
    } catch (error: unknown) {
      failed += 1;
      failures.push({
        id: product.id,
        source_url: product.img_url ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const processed = index + 1;
    if (processed % 100 === 0 || processed === products.length) {
      console.log(`images: ${processed}/${products.length} processed (${uploaded} uploaded, ${skipped} skipped, ${failed} failed)`);
    }
  });

  if (failures.length > 0) {
    const failuresPath = path.join(SEALED_REPORTS_DIR, `${slugParts.join("-")}-image-failures.json`);
    if (!scraperSkipLocalDiskMirror()) {
      writeLocalJson(failuresPath, {
        scrapedAt: new Date().toISOString(),
        sourceApiUrl: SOURCE_API_URL,
        count: failures.length,
        failures,
      });
      console.log(`Wrote image failure report to ${path.relative(process.cwd(), failuresPath)}`);
    }
    const reportKey = `sealed-products/pokedata/${slugParts.join("-")}-image-failures.json`;
    await uploadJson(s3, bucket, reportKey, {
      scrapedAt: new Date().toISOString(),
      sourceApiUrl: SOURCE_API_URL,
      count: failures.length,
      failures,
    });
    console.log(`Uploaded image failure report to R2 ${reportKey}`);
    return {
      failures,
      localReportPath: scraperSkipLocalDiskMirror() ? null : failuresPath,
      r2ReportKey: reportKey,
    };
  }

  return { failures, localReportPath: null, r2ReportKey: null };
}

// ─── Exported job function ────────────────────────────────────────────────────

async function runIncrementalScrapePokedataProducts(opts: ScrapePokedataProductsOptions): Promise<void> {
  const since = opts.since?.trim();
  const until = opts.until?.trim();
  if (!since || !until) {
    throw new Error('incremental mode requires --since=YYYY-MM-DD and --until=YYYY-MM-DD');
  }

  const requestedTcg = opts.tcg ?? DEFAULT_TCG;
  const requestedLanguage = normalizeFilterValue(opts.language) ?? DEFAULT_LANGUAGE;
  const imageConcurrency = opts.imageConcurrency ?? DEFAULT_IMAGE_CONCURRENCY;
  const skipExistingImages = opts.skipExistingImages ?? true;

  ensureOutputDir();

  const allProducts = await fetchProducts();
  const languageFiltered = filterProducts(allProducts, requestedLanguage, requestedTcg);
  const dateFiltered = filterProductsByReleaseDate(languageFiltered, since, until);

  const slugParts = buildSlugParts(requestedLanguage, requestedTcg);
  const slug = slugParts.join("-");
  const s3 = buildS3Client();
  const bucket = getBucket();
  const productsKey = r2SealedPokedataCatalogKey(slug);

  const existingCatalog = await fetchCatalogFromR2(s3, bucket, productsKey);
  const existingIds = new Set(existingCatalog.products.map((product) => product.id));
  const newProducts = dateFiltered.filter((product) => !existingIds.has(product.id));

  console.log(`Fetched ${allProducts.length} products from ${SOURCE_API_URL}`);
  console.log(`Release window ${since} → ${until}: ${dateFiltered.length} after language/tcg/name filters`);
  console.log(`Existing catalog: ${existingCatalog.products.length} products`);
  console.log(`New products to add: ${newProducts.length}`);

  if (newProducts.length === 0) {
    console.log("No new products to merge. Skipping catalog and image upload.");
  } else {
    for (const product of newProducts) {
      console.log(`  + ${product.id} ${product.name}`);
    }
  }

  const skipLocal = scraperSkipLocalDiskMirror();
  const localProductsPath = path.join(pokemonLocalDataRoot, `${slug}-products.json`);
  const backupProductsPath = path.join(process.cwd(), "r2_backup", "data", `${slug}-products.json`);

  let mergedCatalog = existingCatalog;

  if (newProducts.length > 0) {
    const imageUploadResult = await uploadProductImages(
      s3,
      bucket,
      newProducts,
      imageConcurrency,
      skipExistingImages,
      slugParts,
    );
    const newEntries = newProducts.map((product) => productToCatalogEntry(product));
    mergedCatalog = mergeCatalogPayload(
      existingCatalog,
      newEntries,
      requestedLanguage,
      requestedTcg,
      imageUploadResult.failures,
    );

    if (!skipLocal) {
      writeLocalJson(localProductsPath, mergedCatalog);
      fs.mkdirSync(path.dirname(backupProductsPath), { recursive: true });
      writeLocalJson(backupProductsPath, mergedCatalog);
    }

    await uploadJson(s3, bucket, productsKey, mergedCatalog);
    console.log(
      `Merged catalog uploaded to R2 ${productsKey} (${existingCatalog.products.length} → ${mergedCatalog.count})`,
    );
    if (!skipLocal) {
      console.log(`Wrote local mirrors: ${path.relative(process.cwd(), localProductsPath)}`);
      console.log(`Wrote local mirrors: ${path.relative(process.cwd(), backupProductsPath)}`);
    }
  }

  const pricedProducts = newProducts.filter(
    (product) => typeof product.market_value === "number" && Number.isFinite(product.market_value),
  );
  console.log(`Merging prices for ${pricedProducts.length} new product(s) with finite market_value`);

  if (pricedProducts.length > 0) {
    const dailyKey = todayKey();
    const weekKey = currentWeekKey();
    const monthKey = currentMonthKey();

    const [prevDaily, prevWeekly, prevMonthly] = await Promise.all([
      fetchSnapshot(s3, bucket, r2SealedDailyKey(dailyKey)),
      fetchSnapshot(s3, bucket, r2SealedWeeklyKey(weekKey)),
      fetchSnapshot(s3, bucket, r2SealedMonthlyKey(monthKey)),
    ]);

    await updateSealedPriceHistory(s3, buildPricesMap(pricedProducts));

    const [daily, weekly, monthly] = await Promise.all([
      fetchSnapshot(s3, bucket, r2SealedDailyKey(dailyKey)),
      fetchSnapshot(s3, bucket, r2SealedWeeklyKey(weekKey)),
      fetchSnapshot(s3, bucket, r2SealedMonthlyKey(monthKey)),
    ]);

    await uploadSealedPriceTrends(s3, daily, weekly, monthly, prevDaily, prevWeekly, prevMonthly);
    console.log(
      `Updated sealed pricing: ${r2SealedDailyKey(dailyKey)}, weekly, monthly, and price-trends.json`,
    );

    const backupDailyPath = path.join(process.cwd(), "r2_backup", r2SealedDailyKey(dailyKey));
    if (!skipLocal) {
      fs.mkdirSync(path.dirname(backupDailyPath), { recursive: true });
      writeLocalJson(backupDailyPath, daily);
    }
  } else if (newProducts.length > 0) {
    console.log("No priced new products; sealed snapshots unchanged.");
  }
}

export async function runScrapePokedataProducts(opts: ScrapePokedataProductsOptions = {}): Promise<void> {
  const mode = opts.mode ?? "all";
  const requestedTcg = opts.tcg ?? DEFAULT_TCG;
  const requestedLanguage = normalizeFilterValue(opts.language) ?? DEFAULT_LANGUAGE;
  const imageConcurrency = opts.imageConcurrency ?? DEFAULT_IMAGE_CONCURRENCY;
  const skipExistingImages = opts.skipExistingImages ?? true;

  if (mode === "incremental") {
    await runIncrementalScrapePokedataProducts(opts);
    return;
  }

  if (!["all", "products", "prices"].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use "all", "products", "prices", or "incremental".`);
  }

  ensureOutputDir();

  const allProducts = await fetchProducts();
  const filteredProducts = filterProducts(allProducts, requestedLanguage, requestedTcg);
  const slugParts = buildSlugParts(requestedLanguage, requestedTcg);
  const slug = slugParts.join("-");

  const catalogPayload = buildCatalogPayload(filteredProducts, requestedLanguage, requestedTcg);
  const pricesPayload = buildPricesPayload(filteredProducts, requestedLanguage, requestedTcg);

  const skipLocal = scraperSkipLocalDiskMirror();
  const localProductsPath = path.join(pokemonLocalDataRoot, `${slug}-products.json`);

  if (!skipLocal) {
    writeLocalJson(localProductsPath, catalogPayload);
  }

  console.log(`Fetched ${allProducts.length} products from ${SOURCE_API_URL}`);
  console.log(`Filtered to ${filteredProducts.length} products`);
  if (!skipLocal) {
    console.log(`Wrote local product catalog to ${path.relative(process.cwd(), localProductsPath)}`);
  } else {
    console.log(`SCRAPER_SKIP_LOCAL_DISK: skipping local JSON mirrors — uploads go to R2 only`);
  }

  const s3 = buildS3Client();
  const bucket = getBucket();

  const productsKey = r2SealedPokedataCatalogKey(slug);

  if (mode === "all" || mode === "products") {
    const imageUploadResult = await uploadProductImages(s3, bucket, filteredProducts, imageConcurrency, skipExistingImages, slugParts);
    catalogPayload.imageFailures = imageUploadResult.failures;
    if (!skipLocal) {
      writeLocalJson(localProductsPath, catalogPayload);
    }
    await uploadJson(s3, bucket, productsKey, catalogPayload);
    console.log(`Uploaded product catalog to R2 ${productsKey}`);
  }

  if (mode === "all" || mode === "prices") {
    const dailyKey = todayKey();
    const weekKey = currentWeekKey();
    const monthKey = currentMonthKey();

    // Load current period snapshots before update (used as "previous" for trend deltas)
    const [prevDaily, prevWeekly, prevMonthly] = await Promise.all([
      fetchSnapshot(s3, bucket, r2SealedDailyKey(dailyKey)),
      fetchSnapshot(s3, bucket, r2SealedWeeklyKey(weekKey)),
      fetchSnapshot(s3, bucket, r2SealedMonthlyKey(monthKey)),
    ]);

    await updateSealedPriceHistory(s3, pricesPayload.prices);

    // Load updated snapshots to build trends from
    const [daily, weekly, monthly] = await Promise.all([
      fetchSnapshot(s3, bucket, r2SealedDailyKey(dailyKey)),
      fetchSnapshot(s3, bucket, r2SealedWeeklyKey(weekKey)),
      fetchSnapshot(s3, bucket, r2SealedMonthlyKey(monthKey)),
    ]);

    await uploadSealedPriceTrends(s3, daily, weekly, monthly, prevDaily, prevWeekly, prevMonthly);
    console.log(`Updated sealed pricing snapshots and trends`);
  }
}
