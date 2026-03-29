/**
 * Scrydex expansion listing pages: card tiles link to `/pokemon/cards/{slug}/{listPrefix}-{n}?variant=…`.
 */

export const SCRYDEX_DEFAULT_UA =
  "Mozilla/5.0 (compatible; TCG-CatalogPricing/1.0; +https://scrydex.com) AppleWebKit/537.36";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Normalise `me1-001` / `ME1-1` → `me1-1` for map keys (matches Scrydex href ids). */
export function normalizeScrydexListCardKey(listPrefix: string, cardHrefId: string): string {
  const p = listPrefix.trim().toLowerCase();
  const re = new RegExp(`^${escapeRegExp(p)}-([a-z0-9]+)$`, "i");
  const m = cardHrefId.trim().match(re);
  if (!m) return cardHrefId.trim().toLowerCase();
  const suffix = m[1].trim().toLowerCase();
  const n = Number.parseInt(suffix, 10);
  if (!Number.isFinite(n) || /[a-z]/i.test(suffix)) return `${p}-${suffix}`;
  return `${p}-${n}`;
}

/**
 * Variant → USD from expansion grid tiles (same markup as MEP).
 */
export function parseScrydexExpansionListPrices(
  html: string,
  listPrefix: string,
): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  const escaped = escapeRegExp(listPrefix.trim());
  const anchorRe = new RegExp(
    `<a[^>]+href="(\\/pokemon\\/cards\\/[^"]+\\/(${escaped}-[a-z0-9]+))(\\?[^"]*)?"`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const fullId = m[2];
    const query = (m[3] ?? "").replace(/^\?/, "");
    const norm = normalizeScrydexListCardKey(listPrefix, fullId);

    const slice = html.slice(m.index, m.index + 2500);
    const priceM = slice.match(
      /<span class="text-body-12 font-bold text-center">([^<]+)<\/span>/,
    );
    const priceDisplay = priceM ? priceM[1].trim() : "";
    let marketPriceUsd: number | null = null;
    if (priceDisplay && priceDisplay !== "N/A") {
      const numM = priceDisplay.replace(/,/g, "").match(/^\$(-?[\d.]+)$/);
      if (numM) {
        const n = Number.parseFloat(numM[1]);
        marketPriceUsd = Number.isFinite(n) ? n : null;
      }
    }

    const sp = new URLSearchParams(query);
    const variantRaw = sp.get("variant");
    const variantKey =
      variantRaw && variantRaw.trim().length > 0 ? variantRaw.trim() : "default";

    let rec = out.get(norm);
    if (!rec) {
      rec = {};
      out.set(norm, rec);
    }

    if (marketPriceUsd !== null) {
      rec[variantKey] = marketPriceUsd;
    }
  }

  return out;
}

export function parseScrydexExpansionListPaths(
  html: string,
  listPrefix: string,
): Map<string, string> {
  const out = new Map<string, string>();
  const escaped = escapeRegExp(listPrefix.trim());
  const anchorRe = new RegExp(
    `<a[^>]+href="(\\/pokemon\\/cards\\/[^"]+\\/(${escaped}-[a-z0-9]+))(\\?[^"]*)?"`,
    "gi",
  );
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const path = m[1];
    const norm = normalizeScrydexListCardKey(listPrefix, m[2]);
    if (!out.has(norm)) out.set(norm, path);
  }
  return out;
}

export async function fetchScrydexExpansionPageHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": SCRYDEX_DEFAULT_UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Scrydex expansion ${url}: HTTP ${res.status}`);
  return res.text();
}

const SCRYDEX_EXPANSION_MAX_PAGES = 100;

/**
 * Highest `?page=N` link Scrydex embeds for this expansion pathname (e.g. page 1 links to `?page=2`).
 */
export function maxScrydexExpansionPageFromHtml(html: string, pathname: string): number {
  const esc = escapeRegExp(pathname);
  const re = new RegExp(`${esc}\\?page=(\\d+)`, "gi");
  let max = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max;
}

/**
 * Fetch expansion listing HTML for all paginated pages and concatenate (parsers scan the full string).
 * Page 1 is fetched without a `page` query; additional pages use `?page=2`, etc.
 */
export async function fetchScrydexExpansionMultiPageHtml(expansionUrl: string): Promise<string> {
  const base = new URL(expansionUrl);
  const pathname = base.pathname;
  base.searchParams.delete("page");

  const chunks: string[] = [];
  let maxPage = 1;

  const firstHtml = await fetchScrydexExpansionPageHtml(base.toString());
  chunks.push(firstHtml);
  maxPage = Math.max(maxPage, maxScrydexExpansionPageFromHtml(firstHtml, pathname));

  let p = 2;
  while (p <= maxPage) {
    const u = new URL(base.toString());
    u.searchParams.set("page", String(p));
    const pageHtml = await fetchScrydexExpansionPageHtml(u.toString());
    chunks.push(pageHtml);
    const discovered = maxScrydexExpansionPageFromHtml(pageHtml, pathname);
    if (discovered > maxPage) maxPage = discovered;
    if (maxPage > SCRYDEX_EXPANSION_MAX_PAGES) {
      throw new Error(
        `Scrydex expansion pagination exceeded ${SCRYDEX_EXPANSION_MAX_PAGES}: ${expansionUrl}`,
      );
    }
    p += 1;
  }

  return chunks.join("\n");
}

/** Try multiple id spellings (TCGdex `me01-3` vs Scrydex `me1-3`). */
export function buildScrydexPriceMapLookupKeys(
  ext: string,
  listPrefix: string,
  tcgPrefixes: readonly string[],
): string[] {
  const e = ext.trim().toLowerCase();
  const keys = new Set<string>([e]);
  const di = e.lastIndexOf("-");
  if (di <= 0) return [...keys];
  const suff = e.slice(di + 1);
  const normalizedSuffix = suff.toLowerCase();
  const n = Number.parseInt(suff, 10);
  const lp = listPrefix.trim().toLowerCase();
  keys.add(`${lp}-${normalizedSuffix}`);
  if (Number.isFinite(n) && !/[a-z]/i.test(normalizedSuffix)) {
    keys.add(`${lp}-${n}`);
  }
  for (const tp of tcgPrefixes) {
    const t = tp.trim().toLowerCase();
    if (!t) continue;
    keys.add(`${t}-${normalizedSuffix}`);
    if (Number.isFinite(n) && !/[a-z]/i.test(normalizedSuffix)) {
      keys.add(`${t}-${n}`);
    }
  }
  return [...keys];
}

export function resolveScrydexListUsd(
  priceMap: Map<string, Record<string, number>>,
  ext: string,
  listPrefix: string,
  tcgPrefixes: readonly string[],
): Record<string, number> {
  for (const k of buildScrydexPriceMapLookupKeys(ext, listPrefix, tcgPrefixes)) {
    const rec = priceMap.get(k);
    if (rec && Object.keys(rec).length > 0) return { ...rec };
  }
  return {};
}

export function resolveScrydexCardPath(
  pathMap: Map<string, string>,
  ext: string,
  listPrefix: string,
  tcgPrefixes: readonly string[],
): string | undefined {
  for (const k of buildScrydexPriceMapLookupKeys(ext, listPrefix, tcgPrefixes)) {
    const p = pathMap.get(k);
    if (p) return p;
  }
  return undefined;
}
