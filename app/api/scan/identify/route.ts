import { NextResponse } from "next/server";
import type { Where } from "payload";

import {
  masterCardDocToCardsPageEntry,
  type CardsPageCardEntry,
} from "@/lib/cardsPageQueries";

const MASTER_CARD_SELECT = {
  id: true,
  externalId: true,
  tcgdex_id: true,
  localId: true,
  set: true,
  imageLow: true,
  imageHigh: true,
  rarity: true,
  cardNumber: true,
  cardName: true,
  category: true,
  stage: true,
  hp: true,
  elementTypes: true,
  dexId: true,
  artist: true,
  regulationMark: true,
} as const;

async function getPayloadInstance() {
  const payloadConfig = (await import("@/payload.config")).default;
  const { getPayload } = await import("payload");
  return getPayload({ config: payloadConfig });
}

function docToEntry(doc: unknown): CardsPageCardEntry | null {
  return masterCardDocToCardsPageEntry(doc as Record<string, unknown>);
}

async function queryCards(payload: Awaited<ReturnType<typeof getPayloadInstance>>, where: Where, limit: number): Promise<CardsPageCardEntry[]> {
  const result = await payload.find({
    collection: "master-card-list",
    depth: 1,
    limit,
    page: 1,
    overrideAccess: true,
    select: MASTER_CARD_SELECT,
    where,
  });
  return result.docs
    .map(docToEntry)
    .filter((e): e is CardsPageCardEntry => e !== null);
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

  const rawName = typeof (body as Record<string, unknown>).cardName === "string"
    ? ((body as Record<string, unknown>).cardName as string).trim().slice(0, 100)
    : "";
  const rawNumber = typeof (body as Record<string, unknown>).cardNumber === "string"
    ? ((body as Record<string, unknown>).cardNumber as string).trim().slice(0, 100)
    : "";

  if (!rawName && !rawNumber) {
    return NextResponse.json({ error: "cardName and cardNumber cannot both be empty" }, { status: 400 });
  }

  const payload = await getPayloadInstance();

  // Stage 1: card number alone — most reliable signal on Pokemon cards
  let candidates: CardsPageCardEntry[] = [];
  if (rawNumber) {
    candidates = await queryCards(payload, {
      and: [
        { cardNumber: { equals: rawNumber } },
        { imageLow: { exists: true } },
      ],
    }, 8);
  }

  // Stage 2: name only
  if (candidates.length === 0 && rawName) {
    candidates = await queryCards(payload, {
      and: [
        { cardName: { contains: rawName } },
        { imageLow: { exists: true } },
      ],
    }, 8);
  }

  // Stage 3: tokenized fallback
  if (candidates.length === 0 && rawName) {
    const tokens = rawName.split(/\s+/).filter((t) => t.length > 3);
    const seen = new Set<string>();
    const merged: CardsPageCardEntry[] = [];
    for (const token of tokens) {
      const results = await queryCards(payload, {
        and: [
          { cardName: { contains: token } },
          { imageLow: { exists: true } },
        ],
      }, 8);
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

  return NextResponse.json({ candidates, confidence, _debug: { cardName: rawName, cardNumber: rawNumber } });
}
