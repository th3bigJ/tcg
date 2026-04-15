/**
 * Parse One Piece set list pages from gumgum.gg (used when Scrydex is not available yet).
 *
 * @see https://gumgum.gg/cards/ST29/egghead
 */

import type { OnePieceCardVariant } from "@/lib/onepiecePricing";

export const GUMGUM_ORIGIN = "https://gumgum.gg";

export type GumgumListRow = {
  /** GumGum `id` query value, e.g. `ST29-001` or `ST29-001_p1`. */
  gumgumCardId: string;
  cardNumber: string;
  name: string;
  variant: OnePieceCardVariant;
  priceUsd: number;
  imageUrl: string | null;
  /** Path + query, e.g. `/card/ST29-001/monkey-d-luffy?src=EN&id=ST29-001`. */
  gumgumPath: string;
};

/** GumGum `_p1` etc. aligns with Scrydex `altArt` for starter parallel art rows. */
export function gumgumVariantFromCardId(gumgumCardId: string): OnePieceCardVariant {
  return /_p\d+$/i.test(gumgumCardId.trim()) ? "altArt" : "normal";
}

/** Printed number (e.g. ST29-001) from a GumGum id (strips `_p1` suffixes). */
export function printedNumberFromGumgumCardId(gumgumCardId: string): string {
  const base = gumgumCardId.trim().replace(/_p\d+$/i, "");
  return base.toUpperCase();
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function firstPriceUsdInCardTile(htmlSlice: string): number | null {
  const m = htmlSlice.match(/z-\[21\][^>]*>\$([\d,]+(?:\.\d{1,2})?)<\/div>/);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstImageUrlInCardTile(htmlSlice: string): string | null {
  const m = htmlSlice.match(/<img[^>]+src="(https:\/\/cdn\.gumgum\.gg[^"]+)"/);
  return m?.[1] ? decodeHtmlAttr(m[1]) : null;
}

function firstAltNameInCardTile(htmlSlice: string): string | null {
  const m = htmlSlice.match(/<img[^>]+alt="([^"]*)"/);
  if (!m?.[1]) return null;
  const t = decodeHtmlAttr(m[1]).trim();
  return t || null;
}

/**
 * Extract card tiles from a GumGum set list HTML document.
 * One `<a href="/card/...">` tile per market row (e.g. base + `_p1` → `altArt`).
 */
export function parseGumgumSetListHtml(html: string): GumgumListRow[] {
  const rows: GumgumListRow[] = [];
  const hrefRe = /<a href="(\/card\/[^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const rawHref = decodeHtmlAttr(m[1]);
    if (!rawHref.startsWith("/card/")) continue;

    let pathWithQuery: string;
    try {
      const u = new URL(rawHref, GUMGUM_ORIGIN);
      pathWithQuery = `${u.pathname}${u.search}`;
      const id = u.searchParams.get("id")?.trim();
      if (!id) continue;

      const slice = html.slice(m.index, m.index + 4000);
      const priceUsd = firstPriceUsdInCardTile(slice);
      if (priceUsd === null) continue;

      const cardNumber = printedNumberFromGumgumCardId(id);
      const name = firstAltNameInCardTile(slice) ?? cardNumber;
      const imageUrl = firstImageUrlInCardTile(slice);
      const variant = gumgumVariantFromCardId(id);

      rows.push({
        gumgumCardId: id,
        cardNumber,
        name,
        variant,
        priceUsd,
        imageUrl,
        gumgumPath: pathWithQuery,
      });
    } catch {
      continue;
    }
  }

  rows.sort((a, b) => {
    const nc = a.cardNumber.localeCompare(b.cardNumber, undefined, { numeric: true });
    if (nc !== 0) return nc;
    return a.gumgumCardId.localeCompare(b.gumgumCardId);
  });

  return rows;
}

/** `id` → last scraped USD (for pricing job). */
export function gumgumPriceByCardIdFromListHtml(html: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of parseGumgumSetListHtml(html)) {
    map[row.gumgumCardId] = row.priceUsd;
  }
  return map;
}

const GUMGUM_FETCH_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** `cardsListPath` is a pathname such as `/cards/ST29/egghead`. */
export async function fetchGumgumSetListHtml(cardsListPath: string): Promise<string> {
  const path = cardsListPath.startsWith("/") ? cardsListPath : `/${cardsListPath}`;
  const url = `${GUMGUM_ORIGIN}${path}`;
  const res = await fetch(url, { headers: { "User-Agent": GUMGUM_FETCH_UA } });
  if (!res.ok) throw new Error(`GumGum list ${url}: HTTP ${res.status}`);
  return res.text();
}
