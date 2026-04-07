import { type NextRequest } from "next/server";

import { getCurrentCustomerForApiRoute } from "@/lib/auth";
import { type CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { getSearchCardDataForCustomer } from "@/lib/searchCardDataServer";
import { getCardMapById } from "@/lib/staticCardIndex";
import { buildScrydexPrefixCandidates } from "@/lib/scrydexPrefixCandidatesForSet";
import { getAllSets } from "@/lib/staticCards";
import type { CardJsonEntry } from "@/lib/staticDataTypes";
import { jsonResponseWithAuthCookies } from "@/lib/supabase/route-handler";

function normalizeTcgdexLocalId(localId: string | null | undefined): string | null {
  if (!localId) return null;
  const trimmed = localId.trim();
  if (!trimmed) return null;
  if (/^\d+$/u.test(trimmed)) return trimmed.padStart(3, "0");
  return trimmed;
}

function buildSetMetaMap(): Map<string, ReturnType<typeof getAllSets>[number]> {
  const map = new Map<string, ReturnType<typeof getAllSets>[number]>();
  for (const set of getAllSets()) {
    for (const p of buildScrydexPrefixCandidates(set)) {
      map.set(p, set);
    }
  }
  return map;
}

function cardJsonEntryToCardsPageEntry(
  card: CardJsonEntry,
  setMeta: ReturnType<typeof getAllSets>[number] | undefined,
): CardsPageCardEntry | null {
  if (!card.imageLowSrc) return null;

  const lowUrl = card.imageLowSrc;
  const highUrl = card.imageHighSrc ?? lowUrl;
  const cleanPath = lowUrl.split("?")[0];
  const filename = cleanPath.split("/").pop();
  if (!filename) return null;

  const localIdNormalized = normalizeTcgdexLocalId(card.localId);
  const extStored = card.externalId?.trim() || undefined;
  const derivedFromSetAndLocal =
    card.setCode && localIdNormalized ? `${card.setCode}-${localIdNormalized}` : undefined;

  const ext = extStored ?? derivedFromSetAndLocal;

  return {
    ...(card.masterCardId ? { masterCardId: card.masterCardId } : {}),
    ...(ext ? { externalId: ext } : {}),
    set: card.setCode,
    setName: setMeta?.name || undefined,
    setCardCountOfficial:
      setMeta?.cardCountOfficial != null && setMeta.cardCountOfficial >= 0
        ? Math.floor(setMeta.cardCountOfficial)
        : undefined,
    setLogoSrc: setMeta?.logoSrc || undefined,
    setSymbolSrc: setMeta?.symbolSrc || undefined,
    setReleaseDate: setMeta?.releaseDate ?? undefined,
    cardNumber: card.cardNumber || undefined,
    filename,
    src: lowUrl,
    lowSrc: lowUrl,
    highSrc: highUrl,
    rarity: card.rarity ?? "",
    cardName: card.cardName ?? "",
    category: card.category ?? undefined,
    hp: card.hp ?? undefined,
    elementTypes: card.elementTypes ?? undefined,
    dexIds: card.dexIds ?? undefined,
    artist: card.artist ?? undefined,
    regulationMark: card.regulationMark ?? undefined,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ masterCardId: string }> },
) {
  const { customer, authCookieResponse } = await getCurrentCustomerForApiRoute(request);
  const { masterCardId: raw } = await context.params;
  const masterCardId = decodeURIComponent(raw ?? "").trim();

  if (!masterCardId) {
    return jsonResponseWithAuthCookies({ error: "masterCardId is required" }, authCookieResponse, {
      status: 400,
    });
  }

  const card = getCardMapById().get(masterCardId);
  if (!card) {
    return jsonResponseWithAuthCookies({ error: "Card not found" }, authCookieResponse, {
      status: 404,
    });
  }

  const setMetaMap = buildSetMetaMap();
  const entry = cardJsonEntryToCardsPageEntry(card, setMetaMap.get(card.setCode));
  if (!entry) {
    return jsonResponseWithAuthCookies({ error: "Card is missing preview media" }, authCookieResponse, {
      status: 404,
    });
  }

  const searchCardData = customer ? await getSearchCardDataForCustomer(customer.id) : null;

  return jsonResponseWithAuthCookies({ card: entry, searchCardData }, authCookieResponse);
}
