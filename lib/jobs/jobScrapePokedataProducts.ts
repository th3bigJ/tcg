import fs from "fs";
import path from "path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  r2SealedPokedataCatalogKey,
  r2SealedPokedataPricesSnapshotKey,
} from "@/lib/r2BucketLayout";
import { fetchGbpConversionMultipliers } from "../marketPriceExchange";
import { updateSealedPriceHistory } from "../r2SealedPriceHistory";
import { uploadSealedPriceTrends } from "../r2SealedPriceTrends";

export interface ScrapePokedataProductsOptions {
  mode?: "all" | "products" | "prices";
  tcg?: string;
  language?: string;
  imageConcurrency?: number;
  skipExistingImages?: boolean;
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
  live: boolean;
  hot: number;
  image: {
    source_url: string | null;
    r2_key: string | null;
    public_url: string | null;
  };
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
const OUTPUT_DIR = path.join(process.cwd(), "data", "sealed-products");
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

function ensureOutputDir(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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

function filterProducts(
  products: PokedataProduct[],
  requestedLanguage: string | null,
  requestedTcg: string,
): PokedataProduct[] {
  return products
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
    })
    .sort((left, right) => {
      const rightDate = Date.parse(right.release_date ?? "") || 0;
      const leftDate = Date.parse(left.release_date ?? "") || 0;
      if (rightDate !== leftDate) return rightDate - leftDate;
      return left.name.localeCompare(right.name);
    });
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
    products: products.map((product) => {
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
        live: Boolean(product.live),
        hot: product.hot ?? 0,
        image: {
          source_url: product.img_url ?? null,
          r2_key: r2Key,
          public_url: buildPublicUrl(r2Key),
        },
      };
    }),
  };
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
    prices: Object.fromEntries(
      products.map((product) => [
        String(product.id),
        {
          id: product.id,
          market_value: typeof product.market_value === "number" ? product.market_value : null,
          currency: "USD",
          live: Boolean(product.live),
        } satisfies PriceEntry,
      ]),
    ),
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
    const failuresPath = path.join(OUTPUT_DIR, `${slugParts.join("-")}-image-failures.json`);
    writeLocalJson(failuresPath, {
      scrapedAt: new Date().toISOString(),
      sourceApiUrl: SOURCE_API_URL,
      count: failures.length,
      failures,
    });
    console.log(`Wrote image failure report to ${path.relative(process.cwd(), failuresPath)}`);
    const reportKey = `sealed-products/pokedata/${slugParts.join("-")}-image-failures.json`;
    await uploadJson(s3, bucket, reportKey, {
      scrapedAt: new Date().toISOString(),
      sourceApiUrl: SOURCE_API_URL,
      count: failures.length,
      failures,
    });
    console.log(`Uploaded image failure report to R2 ${reportKey}`);
    return { failures, localReportPath: failuresPath, r2ReportKey: reportKey };
  }

  return { failures, localReportPath: null, r2ReportKey: null };
}

// ─── Exported job function ────────────────────────────────────────────────────

export async function runScrapePokedataProducts(opts: ScrapePokedataProductsOptions = {}): Promise<void> {
  const mode = opts.mode ?? "all";
  const requestedTcg = opts.tcg ?? DEFAULT_TCG;
  const requestedLanguage = normalizeFilterValue(opts.language) ?? DEFAULT_LANGUAGE;
  const imageConcurrency = opts.imageConcurrency ?? DEFAULT_IMAGE_CONCURRENCY;
  const skipExistingImages = opts.skipExistingImages ?? true;

  if (!["all", "products", "prices"].includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use "all", "products", or "prices".`);
  }

  ensureOutputDir();

  const allProducts = await fetchProducts();
  const filteredProducts = filterProducts(allProducts, requestedLanguage, requestedTcg);
  const slugParts = buildSlugParts(requestedLanguage, requestedTcg);
  const slug = slugParts.join("-");

  const catalogPayload = buildCatalogPayload(filteredProducts, requestedLanguage, requestedTcg);
  const pricesPayload = buildPricesPayload(filteredProducts, requestedLanguage, requestedTcg);

  const localProductsPath = path.join(OUTPUT_DIR, `${slug}-products.json`);
  const localPricesPath = path.join(OUTPUT_DIR, `${slug}-prices.json`);

  writeLocalJson(localProductsPath, catalogPayload);
  writeLocalJson(localPricesPath, pricesPayload);

  console.log(`Fetched ${allProducts.length} products from ${SOURCE_API_URL}`);
  console.log(`Filtered to ${filteredProducts.length} products`);
  console.log(`Wrote local product catalog to ${path.relative(process.cwd(), localProductsPath)}`);
  console.log(`Wrote local price snapshot to ${path.relative(process.cwd(), localPricesPath)}`);

  const s3 = buildS3Client();
  const bucket = getBucket();

  const productsKey = r2SealedPokedataCatalogKey(slug);
  const pricesKey = r2SealedPokedataPricesSnapshotKey(slug);

  if (mode === "all" || mode === "products") {
    const imageUploadResult = await uploadProductImages(s3, bucket, filteredProducts, imageConcurrency, skipExistingImages, slugParts);
    catalogPayload.imageFailures = imageUploadResult.failures;
    writeLocalJson(localProductsPath, catalogPayload);
    await uploadJson(s3, bucket, productsKey, catalogPayload);
    console.log(`Uploaded product catalog to R2 ${productsKey}`);
  }

  if (mode === "all" || mode === "prices") {
    await uploadJson(s3, bucket, pricesKey, pricesPayload);
    const multipliers = await fetchGbpConversionMultipliers();
    const historyMap = await updateSealedPriceHistory(s3, pricesPayload.prices, multipliers.usdToGbp);
    await uploadSealedPriceTrends(s3, historyMap);
    console.log(`Uploaded price snapshot to R2 ${pricesKey}`);
  }
}
