import Link from "next/link";
import { notFound } from "next/navigation";
import { SealedModalCloseHint } from "@/components/SealedModalCloseHint";
import { SealedProductDetailSidebar } from "@/components/SealedProductDetailSidebar";
import { getCurrentCustomer } from "@/lib/auth";
import { buildEbayUkSoldListingsUrl } from "@/lib/ebaySoldSearchUrl";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { fetchSealedProductUserState } from "@/lib/sealedCustomerItemsServer";
import {
  buildSealedBrowseHref,
  findShopSealedProductById,
  getSealedProductCatalog,
  getSealedProductPrices,
  mergeSealedProductsWithPrices,
} from "@/lib/r2SealedProducts";

type SealedProductDetailPageProps = {
  params: Promise<{
    productId: string;
  }>;
};

function formatGbp(value: number | null, usdToGbpMultiplier: number): string {
  if (typeof value !== "number") return "No price";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * usdToGbpMultiplier);
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown date";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Unknown date";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

function formatBadgeLabel(value: string | null | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

function formatProductType(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "Sealed";
  return trimmed
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.06] px-3 py-3">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-medium uppercase tracking-wide text-white/50">{label}</dt>
        <dd className="mt-0.5 text-sm font-medium leading-snug text-white">{value}</dd>
      </div>
    </div>
  );
}

function SealedHeadline({
  product,
}: {
  product: {
    name: string;
    series: string | null;
    type: string | null;
  };
}) {
  return (
    <div className="w-full px-1 py-4 text-center text-white md:px-0 md:py-0">
      <h1 className="text-balance break-words text-xl font-bold leading-tight md:text-xl">
        {product.name}
      </h1>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-sm leading-snug text-white/75 md:mt-1.5">
        {product.series ? (
          <span className="min-w-0 font-medium text-white/85 underline decoration-white/30 underline-offset-2">
            {product.series}
          </span>
        ) : null}
        <span className="font-medium text-white/70">{formatProductType(product.type)}</span>
      </p>
    </div>
  );
}

export default async function SealedProductDetailPage({ params }: SealedProductDetailPageProps) {
  const { productId: rawProductId } = await params;
  const productId = Number.parseInt(rawProductId, 10);

  if (!Number.isFinite(productId)) {
    notFound();
  }

  const [catalog, prices, multipliers] = await Promise.all([
    getSealedProductCatalog(),
    getSealedProductPrices(),
    fetchGbpConversionMultipliers(),
  ]);
  const mergedProducts = mergeSealedProductsWithPrices(catalog, prices);
  const product = findShopSealedProductById(mergedProducts, productId);

  if (!product) {
    notFound();
  }

  const imageFailure = catalog?.imageFailures?.find((failure) => failure.id === product.id) ?? null;
  const closeHref = buildSealedBrowseHref(
    {
      series: product.series ?? undefined,
      type: product.type ?? undefined,
    },
    { basePath: "/search", tab: "sealed" },
  );
  const ebaySearchParts = ["Pokemon", product.series ?? "", product.name, formatProductType(product.type)]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const ebayUrl = ebaySearchParts.length > 0 ? buildEbayUkSoldListingsUrl(ebaySearchParts.join(" ")) : null;

  const customer = await getCurrentCustomer();
  const sealedUserState = customer ? await fetchSealedProductUserState(customer.id, product.id) : null;

  return (
    <div className="card-viewer-overlay fixed inset-0 z-[10050] isolate overflow-x-hidden overflow-y-auto overscroll-y-contain text-white md:overflow-hidden">
      <div className="relative mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-[1460px] flex-col overflow-x-hidden px-3 pb-14 pt-[max(1rem,calc(env(safe-area-inset-top,0px)+0.75rem))] sm:px-6 md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:overflow-hidden md:px-8 md:pb-5 md:pt-6">
        <div className="md:hidden">
          <SealedModalCloseHint fallbackHref={closeHref} />
        </div>

        <div className="grid w-full min-w-0 max-w-full gap-3 md:grid-cols-[1fr_minmax(18rem,26rem)_minmax(9rem,13rem)] md:flex-1 md:min-h-0 md:items-stretch md:gap-4 md:overflow-hidden">
          <div className="flex w-full min-w-0 max-w-full flex-col items-center gap-3 overflow-x-hidden md:min-h-0 md:items-stretch md:gap-2 md:self-stretch">
            <div className="w-full min-w-0 max-w-full overflow-x-hidden md:flex md:min-h-0 md:flex-1 md:flex-col">
              <div className="flex md:min-h-0 md:flex-1 md:items-stretch">
                <div className="flex shrink-0 flex-col items-center gap-3 md:h-full md:min-h-0 md:gap-2" style={{ width: "100%", minWidth: "100%", maxWidth: "100%" }}>
                  <div className="relative flex min-h-[33vh] w-full items-start justify-center pb-0 pt-1 sm:min-h-[38vh] md:min-h-0 md:max-h-[min(78vh,calc(100dvh-8.5rem))] md:flex-1 md:items-center md:justify-center md:pb-0 md:pt-0">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="block max-h-[min(64vh,640px)] w-auto max-w-full rounded-[var(--card-viewer-image-radius)] object-contain shadow-2xl md:mx-auto md:max-h-full md:max-w-full md:self-center"
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="aspect-[3/4] max-h-[min(64vh,640px)] w-[min(85%,240px)] rounded-[var(--card-viewer-image-radius)] bg-white/[0.06] md:mx-auto md:max-h-full md:max-w-full md:self-center"
                        aria-hidden
                      />
                    )}
                  </div>
                  <div className="w-full min-w-0 max-w-full md:hidden">
                    <SealedHeadline product={product} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-span-1 flex min-w-0 max-w-full flex-col gap-6 overflow-x-hidden rounded-xl border border-white/15 bg-black/35 p-4 pt-2 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md sm:gap-8 sm:p-5 sm:pt-5 md:contents md:overflow-visible md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none md:backdrop-blur-none">
            <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8 md:min-h-0 md:gap-3 md:overflow-y-auto md:rounded-xl md:border md:border-white/15 md:bg-black/35 md:p-4 md:shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:backdrop-blur-md">
              <div className="hidden md:block">
                <SealedHeadline product={product} />
              </div>
              <SealedProductDetailSidebar
                key={product.id}
                product={product}
                typeLabel={formatProductType(product.type)}
                marketValueLabel={formatGbp(product.marketValue, multipliers.usdToGbp)}
                releaseLabel={formatDate(product.release_date)}
                ebayUrl={ebayUrl}
                loggedIn={Boolean(customer)}
                initialWishlistEntryId={sealedUserState?.wishlistEntryId ?? null}
                initialCollectionEntryIds={sealedUserState?.collectionEntryIds ?? []}
                initialTotalQuantity={sealedUserState?.totalQuantity ?? 0}
              />

              {imageFailure && (
                <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                  This product had a mirrored image fetch failure during the last sync. The current page is falling back to the source image URL when available.
                </div>
              )}
            </div>

            <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8 md:min-h-0 md:gap-2 md:overflow-y-auto md:rounded-xl md:border md:border-white/15 md:bg-black/35 md:p-4 md:shadow-[0_20px_60px_rgba(0,0,0,0.45)] md:backdrop-blur-md">
              <section className="flex flex-col gap-2" aria-label="Attributes">
                <h2 className="text-base font-bold tracking-tight text-white md:text-sm">Attributes</h2>
                <dl className="flex flex-col gap-2 md:gap-1.5">
                  <DetailStat label="Product ID" value={String(product.id)} />
                  <DetailStat label="Language" value={formatBadgeLabel(product.language, "Unknown")} />
                  <DetailStat label="Series" value={formatBadgeLabel(product.series, "Unknown")} />
                  <DetailStat label="Set ID" value={product.set_id ? String(product.set_id) : "Unknown"} />
                  <DetailStat label="Type" value={formatProductType(product.type)} />
                </dl>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
