/**
 * Scrydex card detail pages embed Chartkick line charts per print:
 * - `_Raw_{variant}_history` → series `"NM"` (last point = Near Mint USD for that variant).
 * - `_PSA_{variant}_history` → series `"PSA 10"` (last point = PSA 10 USD for that variant).
 * Some cards omit PSA charts and only show PSA 10 in the price grid HTML; we fall back in that case.
 *
 * @see https://scrydex.com/pokemon/cards/ceruledge/mep-14?variant=holofoil
 * @see https://scrydex.com/pokemon/cards/bosss-orders/me2pt5-256?variant=holofoil
 */

import { SCRYDEX_DEFAULT_UA } from "@/lib/scrydexExpansionListParsing";

function extractNamedSeriesDataBody(chartBlock: string, seriesName: string): string | null {
  const marker = `"name":"${seriesName}","data":`;
  const i = chartBlock.indexOf(marker);
  if (i < 0) return null;
  let j = i + marker.length;
  if (chartBlock[j] !== "[") return null;
  j += 1;
  let depth = 1;
  const start = j;
  while (j < chartBlock.length && depth > 0) {
    const c = chartBlock[j];
    if (c === "[") depth += 1;
    else if (c === "]") depth -= 1;
    j += 1;
  }
  if (depth !== 0) return null;
  return chartBlock.slice(start, j - 1);
}

function extractNmSeriesDataBody(chartBlock: string): string | null {
  return extractNamedSeriesDataBody(chartBlock, "NM");
}

function lastFiniteUsdFromNmDataBody(dataBody: string): number | null {
  let last: number | null = null;
  const re = /\["[^"]*",([\d.]+|null)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dataBody)) !== null) {
    if (m[1] === "null") continue;
    const v = Number.parseFloat(m[1]);
    if (Number.isFinite(v)) last = v;
  }
  return last;
}

/** Map Chartkick Raw slug (holofoil, staffStamp) to a stable external_price key. */
export function scrydexRawVariantSlugToLabel(slug: string): string {
  if (slug === "staffStamp") return "Staff Stamp";
  if (slug === "holofoil") return "Holofoil";
  if (slug === "reverseHolofoil") return "Reverse Holofoil";
  return slug.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/**
 * One label per print type: expansion `?variant=holofoil` and card-page charts both map here
 * so we never store both `holofoil` and `Holofoil`.
 */
export function canonicalScrydexVariantLabel(raw: string): string {
  const t = raw.trim();
  const compact = t.toLowerCase().replace(/[\s-]+/g, "");
  if (compact === "default") return "default";
  if (compact === "holofoil") return "Holofoil";
  if (compact === "staffstamp") return "Staff Stamp";
  if (compact === "reverseholofoil") return "Reverse Holofoil";
  return t;
}

/**
 * Suffix on flat merged keys (`Holofoil PSA 10`) before collation into
 * `{ holofoil: { raw, psa10 } }` for storage.
 */
export const SCRYDEX_FLAT_PSA10_KEY_SUFFIX = " PSA 10";

/** Flat merge key for PSA 10 before `collateFlatExternalScrapeUsdToByVariant`. */
export function scrydexPsa10VariantKey(baseVariantLabel: string): string {
  return `${canonicalScrydexVariantLabel(baseVariantLabel)}${SCRYDEX_FLAT_PSA10_KEY_SUFFIX}`;
}

function inferFirstRawVariantSlugFromHtml(html: string): string | null {
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const idM = part.match(/^"([^"]*Raw_(\w+)_history)"/);
    if (idM) return idM[2];
  }
  return null;
}

/**
 * PSA 10 USD per print from `_PSA_{slug}_history` charts when the chart JSON includes a `"PSA 10"` series.
 * Scrydex sometimes embeds a PSA chart with only PSA 9 (etc.) while PSA 10 exists only in the price grid
 * — in that case we still use the DOM fallback below.
 */
export function parseScrydexCardPagePsa10Usd(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const idM = part.match(/^"([^"]*PSA_(\w+)_history)"/);
    if (!idM) continue;
    const variantSlug = idM[2];
    const dataBody = extractNamedSeriesDataBody(part, "PSA 10");
    if (!dataBody) continue;
    const usd = lastFiniteUsdFromNmDataBody(dataBody);
    if (usd === null) continue;
    const label = scrydexRawVariantSlugToLabel(variantSlug);
    out[scrydexPsa10VariantKey(label)] = usd;
  }

  if (Object.keys(out).length > 0) return out;

  const domRe =
    /font-medium">PSA 10<\/span><\/div><div class="flex flex-col text-body-12"><span class="[^"]*text-heading-20">\$([\d.]+)<\/span>/g;
  const domPrices: number[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = domRe.exec(html)) !== null) {
    const v = Number.parseFloat(dm[1]);
    if (Number.isFinite(v)) domPrices.push(v);
  }
  if (domPrices.length !== 1) return out;

  const slug = inferFirstRawVariantSlugFromHtml(html);
  if (!slug) return out;

  const label = scrydexRawVariantSlugToLabel(slug);
  out[scrydexPsa10VariantKey(label)] = domPrices[0];
  return out;
}

/**
 * Merge expansion-list USD (variant query keys) with card-page USD (title-case labels).
 * Detail entries overwrite list when they refer to the same print (e.g. Holofoil).
 */
export function mergeScrydexExpansionAndDetailUsd(
  listUsd: Record<string, number>,
  detailUsd: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(listUsd)) {
    out[canonicalScrydexVariantLabel(k)] = v;
  }
  for (const [k, v] of Object.entries(detailUsd)) {
    out[canonicalScrydexVariantLabel(k)] = v;
  }
  return out;
}

/**
 * Parse all `*_Raw_*_history` Chartkick charts on a card HTML page → label → last NM USD.
 */
export function parseScrydexCardPageRawNearMintUsd(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const idM = part.match(/^"([^"]*Raw_(\w+)_history)"/);
    if (!idM) continue;
    const variantSlug = idM[2];
    const dataBody = extractNmSeriesDataBody(part);
    if (!dataBody) continue;
    const usd = lastFiniteUsdFromNmDataBody(dataBody);
    if (usd === null) continue;
    const label = scrydexRawVariantSlugToLabel(variantSlug);
    out[label] = usd;
  }
  return out;
}

export async function fetchScrydexCardPageHtml(
  path: string,
  variant = "holofoil",
): Promise<string> {
  const trimmed = path.startsWith("/") ? path : `/${path}`;
  const u = new URL(`https://scrydex.com${trimmed}`);
  u.searchParams.set("variant", variant);
  const res = await fetch(u.toString(), {
    headers: { "User-Agent": SCRYDEX_DEFAULT_UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Scrydex card page ${trimmed}: HTTP ${res.status}`);
  return res.text();
}

/** @deprecated Use fetchScrydexCardPageHtml */
export const fetchScrydexMepCardPageHtml = fetchScrydexCardPageHtml;
