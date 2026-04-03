import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import {
  buildSealedBrowseHref,
  buildCollectionTransactionHref,
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

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3">
      <dt className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/45">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function ActionIcon({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const isExternal = href.startsWith("http://") || href.startsWith("https://");
  const className =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20";

  if (isExternal) {
    return (
      <a aria-label={label} className={className} href={href} rel="noreferrer" target="_blank">
        {children}
      </a>
    );
  }

  return (
    <Link aria-label={label} className={className} href={href}>
      {children}
    </Link>
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
  const browseMoreHref = buildSealedBrowseHref(
    {
      series: product.series ?? undefined,
      type: product.type ?? undefined,
    },
    { basePath: "/search", tab: "sealed" },
  );

  return (
    <div className="min-h-full bg-[#050608] text-white">
      <div className="mx-auto flex w-full max-w-[34rem] flex-col px-4 pb-[calc(var(--bottom-nav-offset,0px)+2rem)] pt-[var(--mobile-page-top-offset)]">
        <div className="flex flex-wrap items-center gap-2 text-sm text-white/55">
          <Link className="transition hover:text-white" href="/sealed">
            Sealed Prices
          </Link>
          <span>/</span>
          <span className="text-white/72">{product.name}</span>
        </div>

        <div className="mt-6 flex justify-center">
          <div className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="relative aspect-[5/4] bg-white">
              {product.imageUrl ? (
                <Image
                  alt={product.name}
                  className="h-full w-full object-contain"
                  fill
                  sizes="(max-width: 640px) 100vw, 34rem"
                  src={product.imageUrl}
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">No mirrored image</div>
              )}
            </div>
          </div>
        </div>

        <section className="mt-5 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/78">
              {formatBadgeLabel(product.tcg, "Pokemon")}
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/78">
              {formatProductType(product.type)}
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                product.live
                  ? "bg-emerald-500/18 text-emerald-300"
                  : "border border-white/12 bg-white/[0.08] text-white/65"
              }`}
            >
              {product.live ? "Live" : "Archived"}
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">{product.name}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/58">
            Track mirrored sealed pricing, keep a clean record of this product in your collection, and jump straight into logging a purchase.
          </p>
        </section>

        <div className="mt-6 rounded-[1.9rem] border border-white/12 bg-black/35 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <section className="flex flex-col gap-2" aria-label="Your collection">
            <h2 className="text-sm font-bold tracking-tight text-white">Your collection</h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3">
              <p className="text-xs leading-relaxed text-white/60">
                No sealed entries saved for this product yet. Use add to collection to log a sealed purchase with its own details.
              </p>
            </div>
          </section>

          <section className="mt-6 flex flex-col gap-2" aria-label="Market prices">
            <h2 className="text-sm font-bold tracking-tight text-white">Market prices</h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">Sealed</div>
                  <div className="mt-1 text-[11px] text-white/48">Mirrored blended market value</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <ActionIcon href={buildCollectionTransactionHref(product)} label="Add sealed product to collection">
                    <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                    </svg>
                  </ActionIcon>
                  {product.image.source_url ? (
                    <ActionIcon href={product.image.source_url} label="Open source image">
                      <svg aria-hidden="true" className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h9v9" />
                      </svg>
                    </ActionIcon>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 divide-x divide-white/10">
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Market</span>
                  <span className="text-sm font-semibold tabular-nums text-white">
                    {formatGbp(product.marketValue, multipliers.usdToGbp)}
                  </span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Release</span>
                  <span className="text-center text-sm font-semibold text-white">{formatDate(product.release_date)}</span>
                </div>
                <div className="flex flex-col items-center px-2">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-white/50">Status</span>
                  <span className="text-sm font-semibold text-white">{product.live ? "Live" : "Archived"}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 flex flex-col gap-2" aria-label="Product details">
            <h2 className="text-sm font-bold tracking-tight text-white">Product details</h2>
            <dl className="grid gap-2 sm:grid-cols-2">
              <DetailStat label="Product ID" value={String(product.id)} />
              <DetailStat label="Language" value={formatBadgeLabel(product.language, "Unknown")} />
              <DetailStat label="Series" value={formatBadgeLabel(product.series, "Unknown")} />
              <DetailStat label="Set ID" value={product.set_id ? String(product.set_id) : "Unknown"} />
              <DetailStat label="Type" value={formatProductType(product.type)} />
              <DetailStat label="Browse more" value={product.tcg ? `${product.tcg} sealed` : "Sealed prices"} />
            </dl>
            <div className="pt-1">
              <Link
                className="inline-flex rounded-full border border-white/18 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white/82 transition hover:bg-white/[0.12]"
                href={browseMoreHref}
              >
                More sealed prices
              </Link>
            </div>
          </section>

          {imageFailure && (
            <div className="mt-6 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm text-amber-100">
              This product had a mirrored image fetch failure during the last sync. The current page is falling back to the source image URL when available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
