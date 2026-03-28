import { NextResponse } from "next/server";

import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { getAllCards, getAllSets } from "@/lib/staticCards";

let setMetaMap: Map<string, ReturnType<typeof getAllSets>[number]> | null = null;

function getSetMetaMap() {
  if (!setMetaMap) {
    setMetaMap = new Map();
    for (const set of getAllSets()) {
      if (set.code) setMetaMap.set(set.code, set);
      if (set.tcgdexId) setMetaMap.set(set.tcgdexId, set);
    }
  }
  return setMetaMap;
}

function normalizeName(value: string) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const next = new Array<number>(right.length + 1);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    next[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      next[rightIndex] = Math.min(
        next[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + cost,
      );
    }
    for (let rightIndex = 0; rightIndex < next.length; rightIndex += 1) {
      previous[rightIndex] = next[rightIndex]!;
    }
  }

  return previous[right.length]!;
}

function nameSimilarity(left: string, right: string) {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;
  if (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  ) {
    return 0.94;
  }
  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / Math.max(normalizedLeft.length, normalizedRight.length, 1);
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
      ? ((body as Record<string, unknown>).cardName as string).trim().slice(0, 120)
      : "";
  const rawNumber =
    typeof (body as Record<string, unknown>).cardNumber === "string"
      ? ((body as Record<string, unknown>).cardNumber as string).trim().slice(0, 40)
      : "";
  const rawHp =
    typeof (body as Record<string, unknown>).hp === "string"
      ? ((body as Record<string, unknown>).hp as string).trim().slice(0, 10)
      : "";

  if (!rawName && !rawNumber && !rawHp) {
    return NextResponse.json(
      { error: "At least one scan field is required." },
      { status: 400 },
    );
  }

  const allCards = getAllCards();
  const hpNumber = Number.parseInt(rawHp, 10);
  const exactNumberCards = rawNumber
    ? allCards.filter((card) => (card.cardNumber ?? "").trim() === rawNumber)
    : [];
  const workingCards = exactNumberCards.length > 0 ? exactNumberCards : allCards;

  const ranked = workingCards
    .map((card) => {
      let score = 0;
      if (rawNumber && (card.cardNumber ?? "").trim() === rawNumber) {
        score += 140;
      }

      if (rawName) {
        const similarity = nameSimilarity(card.cardName ?? "", rawName);
        score += similarity * 100;
      }

      if (Number.isFinite(hpNumber) && card.hp === hpNumber) {
        score += 24;
      }

      return { card, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 12)
    .map(({ card }) => toEntry(card))
    .filter((entry): entry is CardsPageCardEntry => entry !== null);

  const top = ranked[0];
  const confidence: "high" | "low" =
    Boolean(
      rawNumber &&
        top?.cardNumber === rawNumber &&
        (!rawHp || String(top.hp ?? "") === rawHp),
    )
      ? "high"
      : "low";

  return NextResponse.json({
    candidates: ranked,
    confidence,
  });
}
