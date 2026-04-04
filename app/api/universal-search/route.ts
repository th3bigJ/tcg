import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { jsonResponseWithAuthCookies, createSupabaseRouteHandlerClient } from "@/lib/supabase/route-handler";
import { getAllCards, getAllSets } from "@/lib/staticCards";
import { getFilterFacets } from "@/lib/staticCardIndex";
import { fetchGbpConversionMultipliers } from "@/lib/marketPriceExchange";
import { resolvePokemonMediaURL } from "@/lib/media";
import {
  getSealedProductCatalog,
  getSealedProductPrices,
  mergeSealedProductsWithPrices,
  searchShopSealedProducts,
  sortShopSealedProducts,
} from "@/lib/r2SealedProducts";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pokemonJson = require("../../../data/pokemon.json") as Array<{
  nationalDexNumber: number;
  name: string;
  imageUrl: string;
}>;

let _setNameMap: Map<string, string> | null = null;
function getSetNameMap(): Map<string, string> {
  if (_setNameMap) return _setNameMap;
  _setNameMap = new Map();
  for (const s of getAllSets()) {
    const code = s.code ?? s.tcgdexId;
    if (code && s.name) _setNameMap.set(code, s.name);
  }
  return _setNameMap;
}

function normalizeName(value: string): string {
  return value
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export async function GET(request: NextRequest) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  // Return filter facets when requested (no query needed)
  // Facets are static build-time data — safe to cache publicly for 24h.
  if (url.searchParams.get("facets") === "1") {
    const facets = getFilterFacets();
    const res = Response.json({
      rarityOptions: facets.rarityDisplayValues,
      energyOptions: facets.energyTypeDisplayValues,
      categoryOptions: facets.categoryDisplayValues,
    });
    res.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=86400");
    return res;
  }

  if (q.length < 2) {
    return jsonResponseWithAuthCookies(
      { cards: [], sets: [], pokemon: [], sealed: [], collection: [], wishlist: [] },
      authCookieResponse,
    );
  }

  const qLower = q.toLocaleLowerCase();
  const setNameMap = getSetNameMap();

  // Cards — search by name
  const cards = getAllCards()
    .filter((c) => c.imageLowSrc && c.cardName.toLocaleLowerCase().includes(qLower))
    .slice(0, 6)
    .map((c) => ({
      masterCardId: c.masterCardId,
      cardName: c.cardName,
      setCode: c.setCode,
      setName: setNameMap.get(c.setCode) ?? "",
      imageLowSrc: c.imageLowSrc,
      rarity: c.rarity ?? "",
    }));

  // Sets — search by name
  const sets = getAllSets()
    .filter((s) => s.isActive && s.logoSrc && s.name.toLocaleLowerCase().includes(qLower))
    .slice(0, 3)
    .map((s) => ({
      code: s.code ?? s.tcgdexId ?? "",
      name: s.name,
      logoSrc: s.logoSrc,
      cardCountOfficial: s.cardCountOfficial,
    }));

  // Pokemon — search by name
  const pokemon = pokemonJson
    .filter((p) => normalizeName(p.name).toLocaleLowerCase().includes(qLower))
    .slice(0, 3)
    .map((p) => ({
      nationalDexNumber: p.nationalDexNumber,
      name: normalizeName(p.name),
      imageUrl: resolvePokemonMediaURL(p.imageUrl),
    }));

  const [sealedCatalog, sealedPrices, multipliers] = await Promise.all([
    getSealedProductCatalog(),
    getSealedProductPrices(),
    fetchGbpConversionMultipliers(),
  ]);

  const sealed = sortShopSealedProducts(
    searchShopSealedProducts(mergeSealedProductsWithPrices(sealedCatalog, sealedPrices), q),
  )
    .slice(0, 6)
    .map((product) => ({
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      series: product.series,
      type: product.type,
      marketValue: product.marketValue,
      marketValueGbp: typeof product.marketValue === "number" ? product.marketValue * multipliers.usdToGbp : null,
      releaseDate: product.release_date,
    }));

  // Collection & Wishlist — only when signed in
  const collection: Array<{
    masterCardId: string;
    cardName: string;
    setName: string;
    imageLowSrc: string;
    setCode: string;
  }> = [];
  const wishlist: typeof collection = [];

  if (customer) {
    const { supabase } = createSupabaseRouteHandlerClient(request);

    const [collectionRes, wishlistRes] = await Promise.all([
      supabase
        .from("customer_collections")
        .select("master_card_id")
        .eq("customer_id", customer.id)
        .limit(2000),
      supabase
        .from("customer_wishlists")
        .select("master_card_id")
        .eq("customer_id", customer.id)
        .limit(2000),
    ]);

    const allCardsMap = new Map(getAllCards().map((c) => [c.masterCardId, c]));

    if (collectionRes.data) {
      const seen = new Set<string>();
      for (const row of collectionRes.data) {
        if (collection.length >= 6) break;
        const id = row.master_card_id as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const card = allCardsMap.get(id);
        if (!card || !card.imageLowSrc) continue;
        if (!card.cardName.toLocaleLowerCase().includes(qLower)) continue;
        collection.push({
          masterCardId: id,
          cardName: card.cardName,
          setCode: card.setCode,
          setName: setNameMap.get(card.setCode) ?? "",
          imageLowSrc: card.imageLowSrc,
        });
      }
    }

    if (wishlistRes.data) {
      const seen = new Set<string>();
      for (const row of wishlistRes.data) {
        if (wishlist.length >= 6) break;
        const id = row.master_card_id as string;
        if (seen.has(id)) continue;
        seen.add(id);
        const card = allCardsMap.get(id);
        if (!card || !card.imageLowSrc) continue;
        if (!card.cardName.toLocaleLowerCase().includes(qLower)) continue;
        wishlist.push({
          masterCardId: id,
          cardName: card.cardName,
          setCode: card.setCode,
          setName: setNameMap.get(card.setCode) ?? "",
          imageLowSrc: card.imageLowSrc,
        });
      }
    }
  }

  return jsonResponseWithAuthCookies(
    { cards, sets, pokemon, sealed, collection, wishlist },
    authCookieResponse,
  );
}
