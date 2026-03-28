import { NextResponse } from "next/server";

import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { getAllCards, getAllSets } from "@/lib/staticCards";

let _setMetaMap: Map<string, ReturnType<typeof getAllSets>[number]> | null = null;
function getSetMetaMap() {
  if (!_setMetaMap) {
    _setMetaMap = new Map();
    for (const s of getAllSets()) {
      if (s.code) _setMetaMap.set(s.code, s);
      if (s.tcgdexId) _setMetaMap.set(s.tcgdexId, s);
    }
  }
  return _setMetaMap;
}

function toEntry(card: ReturnType<typeof getAllCards>[number]): CardsPageCardEntry | null {
  if (!card.imageLowSrc) return null;
  const filename = card.imageLowSrc.split("?")[0].split("/").pop();
  if (!filename) return null;

  const setMeta = getSetMetaMap().get(card.setCode);
  const localIdNormalized = card.localId
    ? /^\d+$/u.test(card.localId.trim())
      ? card.localId.trim().padStart(3, "0")
      : card.localId.trim()
    : null;
  const tcgdexStored = card.tcgdex_id?.trim() || undefined;
  const extStored = card.externalId?.trim() || undefined;
  const derivedFromSetAndLocal =
    card.setTcgdexId && localIdNormalized
      ? `${card.setTcgdexId}-${localIdNormalized}`
      : undefined;
  const ext = tcgdexStored ?? extStored ?? derivedFromSetAndLocal;
  const legacyExternalId =
    tcgdexStored !== undefined ? extStored ?? derivedFromSetAndLocal : derivedFromSetAndLocal;

  return {
    masterCardId: card.masterCardId,
    ...(ext ? { externalId: ext } : {}),
    ...(legacyExternalId ? { legacyExternalId } : {}),
    set: card.setCode,
    setSlug: setMeta?.slug ?? undefined,
    setName: setMeta?.name ?? undefined,
    setTcgdexId: card.setTcgdexId ?? undefined,
    setLogoSrc: setMeta?.logoSrc ?? undefined,
    setSymbolSrc: setMeta?.symbolSrc ?? undefined,
    setReleaseDate: setMeta?.releaseDate ?? undefined,
    cardNumber: card.cardNumber || undefined,
    filename,
    src: card.imageLowSrc,
    lowSrc: card.imageLowSrc,
    highSrc: card.imageHighSrc ?? card.imageLowSrc,
    rarity: card.rarity ?? "",
    cardName: card.cardName ?? "",
    category: card.category ?? undefined,
    stage: card.stage ?? undefined,
    hp: card.hp ?? undefined,
    elementTypes: card.elementTypes ?? undefined,
    dexIds: card.dexIds ?? undefined,
    artist: card.artist ?? undefined,
    regulationMark: card.regulationMark ?? undefined,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const rawName =
    typeof (body as Record<string, unknown>).cardName === "string"
      ? ((body as Record<string, unknown>).cardName as string).trim().slice(0, 100)
      : "";
  const rawNumber =
    typeof (body as Record<string, unknown>).cardNumber === "string"
      ? ((body as Record<string, unknown>).cardNumber as string).trim().slice(0, 100)
      : "";

  if (!rawName && !rawNumber) {
    return NextResponse.json(
      { error: "cardName and cardNumber cannot both be empty" },
      { status: 400 },
    );
  }

  const allCards = getAllCards();
  let candidates: CardsPageCardEntry[] = [];

  // Stage 1: card number alone — most reliable signal on Pokemon cards
  if (rawNumber) {
    candidates = allCards
      .filter((c) => c.imageLowSrc && c.cardNumber === rawNumber)
      .slice(0, 8)
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);
  }

  // Stage 2: exact name string
  if (candidates.length === 0 && rawName) {
    const nameLower = rawName.toLocaleLowerCase();
    candidates = allCards
      .filter((c) => c.imageLowSrc && c.cardName.toLocaleLowerCase().includes(nameLower))
      .slice(0, 8)
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);
  }

  // Stage 3: tokenized — try each word >= 4 chars, merge results.
  if (candidates.length === 0 && rawName) {
    const tokens = rawName
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, ""))
      .filter((t) => t.length >= 4);

    const seen = new Set<string>();
    const merged: CardsPageCardEntry[] = [];

    for (const token of tokens) {
      const tokenLower = token.toLocaleLowerCase();
      const results = allCards
        .filter((c) => c.imageLowSrc && c.cardName.toLocaleLowerCase().includes(tokenLower))
        .slice(0, 8)
        .map(toEntry)
        .filter((e): e is CardsPageCardEntry => e !== null);

      for (const entry of results) {
        const key = entry.masterCardId ?? entry.filename;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(entry);
        }
        if (merged.length >= 8) break;
      }
      if (merged.length >= 8) break;
    }
    candidates = merged;
  }

  const topMatch = candidates[0];
  const confidence: "high" | "low" =
    rawNumber !== "" && topMatch?.cardNumber === rawNumber ? "high" : "low";

  return NextResponse.json({
    candidates,
    confidence,
    _debug: { cardName: rawName, cardNumber: rawNumber },
  });
}
