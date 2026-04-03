import Image from "next/image";
import Link from "next/link";
import { type ShopSealedProduct } from "@/lib/r2SealedProducts";

type SealedProductGridProps = {
  products: ShopSealedProduct[];
  usdToGbpMultiplier: number;
};

function formatGbp(value: number | null, usdToGbpMultiplier: number): string {
  if (typeof value !== "number") return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value * usdToGbpMultiplier);
}

function buildMeta(product: ShopSealedProduct): string {
  return product.series ?? product.type ?? (product.release_date ? String(new Date(product.release_date).getUTCFullYear()) : "");
}

export function SealedProductGrid({ products, usdToGbpMultiplier }: SealedProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--foreground)]/18 bg-[var(--foreground)]/[0.03] px-5 py-10 text-sm text-[var(--foreground)]/72">
        No sealed products matched this view yet.
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {products.map((product) => {
        const meta = buildMeta(product);
        const priceLabel = formatGbp(product.marketValue, usdToGbpMultiplier);

        return (
          <li key={product.id} className="card-grid-item flex flex-col">
            <div className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--foreground)]/10 bg-white shadow-sm transition hover:border-[var(--foreground)]/20 hover:shadow-md">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-2">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, (max-width: 1536px) 20vw, 14vw"
                    className="scale-[1.3] object-contain object-center p-1 transition-transform duration-200 group-hover:scale-[1.34]"
                  />
                ) : (
                  <span className="text-[11px] text-[var(--foreground)]/45">No image</span>
                )}
              </div>
              <Link
                href={`/sealed/${product.id}`}
                className="absolute inset-0 z-10"
                aria-label={`View ${product.name}`}
              />
            </div>
            <div className="relative mt-1 min-h-[2.9rem]">
              <div className="min-w-0 w-full px-1 text-center">
                <span className="block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/85">
                  {product.name}
                </span>
                {meta ? (
                  <span className="mt-0.5 block line-clamp-1 text-[10px] font-medium text-[var(--foreground)]/52">
                    {meta}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-[10px] font-medium tabular-nums text-[var(--foreground)]/70">
                  {priceLabel || <span aria-hidden="true">&nbsp;</span>}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
