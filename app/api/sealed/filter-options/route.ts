import { getSealedProductCatalog, normalizeSealedSeriesValue } from "@/lib/r2SealedProducts";

type FilterOption = {
  value: string;
  label: string;
};

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

export async function GET() {
  const catalog = await getSealedProductCatalog();
  const products = catalog?.products ?? [];

  const typeGrouped = new Map<string, number>();
  const seriesGrouped = new Map<string, number>();

  for (const product of products) {
    const type = product.type?.trim();
    if (type) typeGrouped.set(type, (typeGrouped.get(type) ?? 0) + 1);

    const series = normalizeSealedSeriesValue(product.series);
    if (series) seriesGrouped.set(series, (seriesGrouped.get(series) ?? 0) + 1);
  }

  const typeOptions: FilterOption[] = Array.from(typeGrouped.entries())
    .sort((left, right) => (right[1] !== left[1] ? right[1] - left[1] : left[0].localeCompare(right[0])))
    .map(([value]) => ({ value, label: value }));

  const seriesOptions: FilterOption[] = Array.from(seriesGrouped.entries())
    .sort((left, right) =>
      right[1] !== left[1]
        ? right[1] - left[1]
        : canonicalSeriesLabel(left[0]).localeCompare(canonicalSeriesLabel(right[0])),
    )
    .map(([value]) => ({ value, label: canonicalSeriesLabel(value) }));

  return Response.json({
    typeOptions,
    seriesOptions,
  });
}
