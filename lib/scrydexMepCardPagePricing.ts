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

/**
 * Suffix on flat merged keys (`Holofoil ACE 10`) before collation into
 * `{ holofoil: { raw, psa10, ace10 } }` for storage.
 */
export const SCRYDEX_FLAT_ACE10_KEY_SUFFIX = " ACE 10";

/** Flat merge key for ACE 10 before `collateFlatExternalScrapeUsdToByVariant`. */
export function scrydexAce10VariantKey(baseVariantLabel: string): string {
  return `${canonicalScrydexVariantLabel(baseVariantLabel)}${SCRYDEX_FLAT_ACE10_KEY_SUFFIX}`;
}

function inferFirstRawVariantSlugFromHtml(html: string): string | null {
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const idM = part.match(/^"([^"]*Raw_(\w+)_history)"/);
    if (idM) return idM[2];
  }
  return null;
}

function extractSingleDomGradePriceUsd(html: string, company: "PSA" | "ACE", grade: 10): number | null {
  // Scrydex grade blocks have changed markup a few times; match by visible label and
  // then capture the first nearby dollar amount, independent of CSS class names.
  const labelRe = new RegExp(`>\\s*${company}\\s*${grade}\\s*<\\/span>[\\s\\S]{0,500}?\\$([\\d.,]+)`, "g");
  const prices: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(html)) !== null) {
    const v = Number.parseFloat(m[1].replace(/,/g, ""));
    if (Number.isFinite(v)) prices.push(v);
  }
  if (prices.length !== 1) return null;
  return prices[0];
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

  const domPrice = extractSingleDomGradePriceUsd(html, "PSA", 10);
  if (domPrice === null) return out;

  const slug = inferFirstRawVariantSlugFromHtml(html);
  if (!slug) return out;

  const label = scrydexRawVariantSlugToLabel(slug);
  out[scrydexPsa10VariantKey(label)] = domPrice;
  return out;
}

/**
 * ACE 10 USD per print from `_ACE_{slug}_history` charts with `"ACE 10"` series.
 */
export function parseScrydexCardPageAce10Usd(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  const parts = html.split(/new Chartkick\[["']LineChart["']\]\(/);
  for (const part of parts) {
    const idM = part.match(/^"([^"]*ACE_(\w+)_history)"/);
    if (!idM) continue;
    const variantSlug = idM[2];
    const dataBody = extractNamedSeriesDataBody(part, "ACE 10");
    if (!dataBody) continue;
    const usd = lastFiniteUsdFromNmDataBody(dataBody);
    if (usd === null) continue;
    const label = scrydexRawVariantSlugToLabel(variantSlug);
    out[scrydexAce10VariantKey(label)] = usd;
  }

  if (Object.keys(out).length > 0) return out;

  // Compatibility fallback: some Scrydex cards currently expose ACE 9 but not ACE 10.
  // Use the highest available ACE grade series so callers still receive an ACE value.
  for (const part of parts) {
    const idM = part.match(/^"([^"]*ACE_(\w+)_history)"/);
    if (!idM) continue;
    const variantSlug = idM[2];
    const gradeMatches = [...part.matchAll(/"name":"ACE (\d+)"/g)];
    let bestGrade = -1;
    let bestUsd: number | null = null;
    for (const gm of gradeMatches) {
      const grade = Number.parseInt(gm[1], 10);
      if (!Number.isFinite(grade)) continue;
      const dataBody = extractNamedSeriesDataBody(part, `ACE ${grade}`);
      if (!dataBody) continue;
      const usd = lastFiniteUsdFromNmDataBody(dataBody);
      if (usd === null) continue;
      if (grade > bestGrade) {
        bestGrade = grade;
        bestUsd = usd;
      }
    }
    if (bestUsd === null) continue;
    const label = scrydexRawVariantSlugToLabel(variantSlug);
    out[scrydexAce10VariantKey(label)] = bestUsd;
  }
  if (Object.keys(out).length > 0) return out;

  const domPrice = extractSingleDomGradePriceUsd(html, "ACE", 10);
  const domFallback = domPrice ?? extractSingleDomGradePriceUsd(html, "ACE", 9);
  if (domFallback === null) return out;

  const slug = inferFirstRawVariantSlugFromHtml(html);
  if (!slug) return out;

  const label = scrydexRawVariantSlugToLabel(slug);
  out[scrydexAce10VariantKey(label)] = domFallback;
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
