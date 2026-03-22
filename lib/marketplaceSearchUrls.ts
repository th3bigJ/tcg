import {
  buildPokemonEbaySoldSearchQuery,
  type EbayPokemonCardSearchParts,
} from "@/lib/ebaySoldSearchUrl";
import { slugify } from "@/lib/slugs";

/** Same token order as eBay sold search: Pokémon + set + name + collector number. */
export function buildPokemonMarketplaceSearchQuery(parts: EbayPokemonCardSearchParts): string {
  return buildPokemonEbaySoldSearchQuery(parts);
}

/**
 * TCGPlayer Pokémon product search (public site). Verified HEAD 200 for this path + params.
 */
export function buildTcgplayerPokemonProductSearchUrl(searchQuery: string): string | null {
  const q = searchQuery.trim();
  if (!q) return null;
  const params = new URLSearchParams({
    productLineName: "pokemon",
    productName: q,
  });
  return `https://www.tcgplayer.com/search/pokemon/product?${params.toString()}`;
}

export type TcgplayerProductPageParts = {
  productId: number;
  setTcgdexId?: string;
  setName?: string;
  cardName: string;
  cardNumber?: string;
  externalId?: string;
  setCardCountOfficial?: number;
};

function tcgplayerSeriePrefixFromTcgdexSetId(setId: string): string | null {
  const m = setId.trim().toLowerCase().match(/^([a-z]+)/u);
  return m?.[1] ?? null;
}

function tcgplayerResolveTcgdexSetId(parts: Omit<TcgplayerProductPageParts, "productId">): string | null {
  const fromField = parts.setTcgdexId?.trim();
  if (fromField) return fromField;
  const ext = parts.externalId?.trim();
  if (!ext) return null;
  const idx = ext.lastIndexOf("-");
  if (idx <= 0) return null;
  const head = ext.slice(0, idx).trim();
  if (!/^[a-z0-9.]+$/i.test(head)) return null;
  return head;
}

function parseSlashLocalAndOfficial(cardNumber: string | undefined): { local: string; official: string } | null {
  if (!cardNumber?.trim()) return null;
  const m = cardNumber.trim().match(/^(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  return { local: m[1], official: m[2] };
}

function parseLocalCardNumber(cardNumber: string | undefined, externalId: string | undefined): string | null {
  if (cardNumber?.trim()) {
    const s = cardNumber.trim();
    const leading = s.match(/^(\d+)/);
    if (leading) return leading[1];
    const any = s.match(/(\d+)/);
    if (any) return any[1];
  }
  const ext = externalId?.trim();
  if (ext) {
    const idx = ext.lastIndexOf("-");
    if (idx >= 0) {
      const tail = ext.slice(idx + 1);
      if (/^\d+$/.test(tail)) return tail;
    }
  }
  return null;
}

/**
 * Path segment after `/product/{id}/`, e.g. `pokemon-me-ascended-heroes-mega-dragonite-ex-271-217`.
 */
export function buildTcgplayerProductSlugSegment(parts: Omit<TcgplayerProductPageParts, "productId">): string | null {
  const setId = tcgplayerResolveTcgdexSetId(parts);
  const serie = setId ? tcgplayerSeriePrefixFromTcgdexSetId(setId) : null;
  const setName = parts.setName?.trim();
  if (!serie || !setName) return null;

  const fromSlash = parseSlashLocalAndOfficial(parts.cardNumber);
  const local = fromSlash?.local ?? parseLocalCardNumber(parts.cardNumber, parts.externalId);
  let official = fromSlash?.official;
  if (!official && typeof parts.setCardCountOfficial === "number" && Number.isFinite(parts.setCardCountOfficial)) {
    official = String(Math.floor(parts.setCardCountOfficial));
  }
  if (!local || !official) return null;

  const setSlug = slugify(setName);
  const nameSlug = slugify(parts.cardName);
  if (!setSlug || !nameSlug) return null;

  return `pokemon-${serie}-${setSlug}-${nameSlug}-${local}-${official}`;
}

/**
 * Canonical TCGPlayer product page, e.g.
 * `https://www.tcgplayer.com/product/676083/pokemon-me-ascended-heroes-mega-dragonite-ex-271-217?page=1&Language=English`
 */
export function buildTcgplayerProductPageUrl(parts: TcgplayerProductPageParts): string {
  const query = new URLSearchParams({ page: "1", Language: "English" });
  const qs = query.toString();
  const { productId, ...slugParts } = parts;
  const slug = buildTcgplayerProductSlugSegment(slugParts);
  const base = `https://www.tcgplayer.com/product/${productId}`;
  return slug ? `${base}/${slug}?${qs}` : `${base}?${qs}`;
}

const LOWER_CARDMARKET_NAME_TOKENS = new Set(["ex", "gx", "v", "vmax", "vstar", "gg", "tg", "fb"]);

export type CardmarketSinglesPathParts = {
  setSlug?: string;
  setName?: string;
  setCode: string;
  cardName: string;
  cardNumber?: string;
  /** TCGdex-style id (`me02.5-271`) — used to recover local card number when `cardNumber` is empty. */
  externalId?: string;
  listingVersion?: number;
};

function hyphenSegmentsTitleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join("-");
}

function hyphenSegmentsTitleCaseFromSetName(setName: string): string {
  return setName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("-");
}

function cardmarketSetSegment(parts: CardmarketSinglesPathParts): string | null {
  if (parts.setSlug?.trim()) return hyphenSegmentsTitleCaseFromSlug(parts.setSlug.trim());
  if (parts.setName?.trim()) return hyphenSegmentsTitleCaseFromSetName(parts.setName.trim());
  const code = parts.setCode?.trim();
  if (code) {
    const kebab = slugify(code);
    if (kebab) return hyphenSegmentsTitleCaseFromSlug(kebab);
  }
  return null;
}

function cardmarketCardNameSegment(cardName: string): string | null {
  const words = cardName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const segments: string[] = [];
  for (const w of words) {
    const alnum = w.replace(/[^a-zA-Z0-9]/g, "");
    if (!alnum) continue;
    const lw = alnum.toLowerCase();
    if (LOWER_CARDMARKET_NAME_TOKENS.has(lw)) segments.push(lw);
    else segments.push(alnum.charAt(0).toUpperCase() + alnum.slice(1).toLowerCase());
  }
  if (segments.length === 0) return null;
  return segments.join("-");
}

function cardmarketListingPrefix(parts: CardmarketSinglesPathParts): string | null {
  if (parts.setName?.trim()) {
    const firstWord = parts.setName.trim().split(/\s+/)[0] ?? "";
    const letters = firstWord.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 1) return letters.toUpperCase().slice(0, 3).padEnd(3, "X");
  }
  if (parts.setSlug?.trim()) {
    const first = parts.setSlug.trim().split("-")[0] ?? "";
    const letters = first.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 1) return letters.toUpperCase().slice(0, 3).padEnd(3, "X");
  }
  const code = parts.setCode?.trim();
  if (code) {
    const letters = code.replace(/[^a-zA-Z]/g, "");
    if (letters.length >= 1) return letters.toUpperCase().slice(0, 3).padEnd(3, "X");
  }
  return null;
}

/**
 * Cardmarket singles product URL: `/Singles/{SetSegment}/{NameSegment}-V{n}-{Prefix}{localId}`
 * Example: `…/Singles/Ascended-Heroes/Mega-Dragonite-ex-V2-ASC271`
 */
export function buildCardmarketPokemonSinglesProductPathUrl(parts: CardmarketSinglesPathParts): string | null {
  const setSeg = cardmarketSetSegment(parts);
  const nameSeg = cardmarketCardNameSegment(parts.cardName);
  const localNum = parseLocalCardNumber(parts.cardNumber, parts.externalId);
  const prefix = cardmarketListingPrefix(parts);
  if (!setSeg || !nameSeg || !localNum || !prefix) return null;
  const rawV = parts.listingVersion ?? 1;
  const v = Math.max(1, Math.floor(Number.isFinite(rawV) ? rawV : 1));
  const productSeg = `${nameSeg}-V${v}-${prefix}${localNum}`;
  const base = "https://www.cardmarket.com/en/Pokemon/Products/Singles";
  return `${base}/${encodeURIComponent(setSeg)}/${encodeURIComponent(productSeg)}`;
}

/**
 * Fallback: Cardmarket singles listing filtered by search string.
 */
export function buildCardmarketPokemonSinglesSearchUrl(searchQuery: string): string | null {
  const q = searchQuery.trim();
  if (!q) return null;
  const params = new URLSearchParams({ searchString: q });
  return `https://www.cardmarket.com/en/Pokemon/Products/Singles?${params.toString()}`;
}
