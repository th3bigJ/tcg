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
  const rawArtist =
    typeof (body as Record<string, unknown>).artist === "string"
      ? ((body as Record<string, unknown>).artist as string).trim().slice(0, 100)
      : "";
  const rawHp =
    typeof (body as Record<string, unknown>).hp === "string"
      ? ((body as Record<string, unknown>).hp as string).trim().slice(0, 10)
      : "";

  if (!rawName && !rawNumber && !rawArtist && !rawHp) {
    return NextResponse.json(
      { error: "At least one scan field is required" },
      { status: 400 },
    );
  }

  const allCards = getAllCards();
  const hpNumber = Number.parseInt(rawHp, 10);

  function includesNormalized(haystack: string | null | undefined, needle: string) {
    return (haystack ?? "").toLocaleLowerCase().includes(needle.toLocaleLowerCase());
  }

  function scoreCard(card: ReturnType<typeof getAllCards>[number]) {
    let score = 0;

    if (rawNumber && card.cardNumber === rawNumber) score += 120;
    if (rawName && includesNormalized(card.cardName, rawName)) score += 70;
    if (rawArtist && includesNormalized(card.artist, rawArtist)) score += 45;
    if (rawArtist) {
      const artistTokens = rawArtist
        .split(/\s+/)
        .map((t) => t.replace(/[^A-Za-zÀ-ÿ0-9.'-]/g, ""))
        .filter((t) => t.length >= 3);
      for (const token of artistTokens) {
        if (includesNormalized(card.artist, token)) score += 10;
      }
    }
    if (Number.isFinite(hpNumber) && card.hp === hpNumber) score += 20;

    return score;
  }

  function applyHpFilter(cards: ReturnType<typeof getAllCards>) {
    if (!Number.isFinite(hpNumber)) return cards;
    const exactHpMatches = cards.filter((card) => card.hp === hpNumber);
    return exactHpMatches.length > 0 ? exactHpMatches : cards;
  }

  function toRankedEntries(cards: ReturnType<typeof getAllCards>) {
    return applyHpFilter(cards)
      .filter((c) => c.imageLowSrc)
      .map((card) => ({ card, score: scoreCard(card) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ card }) => toEntry(card))
      .filter((e): e is CardsPageCardEntry => e !== null);
  }

  let candidates: CardsPageCardEntry[] = [];

  // Stage 1: card number alone — most reliable signal on Pokemon cards
  if (rawNumber) {
    candidates = applyHpFilter(allCards)
      .filter((c) => c.imageLowSrc && c.cardNumber === rawNumber)
      .slice(0, 8)
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);
  }

  // If number gave us multiple results, use the extra OCR signals to narrow them.
  if (candidates.length > 1 && (rawName || rawArtist || rawHp)) {
    const numberedCards = allCards.filter((c) => c.imageLowSrc && c.cardNumber === rawNumber);
    const narrowed = toRankedEntries(numberedCards);
    if (narrowed.length > 0) {
      candidates = narrowed;
    }
  }

  // Stage 2: exact name string
  if (candidates.length === 0 && rawName) {
    const nameLower = rawName.toLocaleLowerCase();
    candidates = applyHpFilter(allCards)
      .filter((c) => c.imageLowSrc && c.cardName.toLocaleLowerCase().includes(nameLower))
      .slice(0, 8)
      .map(toEntry)
      .filter((e): e is CardsPageCardEntry => e !== null);
  }

  // Stage 3: rank across all cards using any extra OCR signals we have.
  if (candidates.length === 0 && (rawName || rawArtist || rawHp)) {
    candidates = toRankedEntries(allCards);
  }

  // Stage 4: tokenized — try each word >= 4 chars, merge results.
  if (candidates.length === 0 && rawName) {
    const tokens = rawName
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Za-zÀ-ÿ]/g, ""))
      .filter((t) => t.length >= 4);

    const seen = new Set<string>();
    const merged: CardsPageCardEntry[] = [];

    for (const token of tokens) {
      const tokenLower = token.toLocaleLowerCase();
      const results = applyHpFilter(allCards)
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
    rawNumber !== "" &&
    topMatch?.cardNumber === rawNumber &&
    (rawHp === "" || String(topMatch?.hp ?? "") === rawHp)
      ? "high"
      : "low";

  return NextResponse.json({
    candidates,
    confidence,
    _debug: { cardName: rawName, cardNumber: rawNumber, artist: rawArtist, hp: rawHp },
  });
}
