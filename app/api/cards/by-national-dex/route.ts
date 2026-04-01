import { NextResponse } from "next/server";

import { fetchMasterCardsByNationalDexIds } from "@/lib/cardsPageQueries";

const MAX_IDS = 20;

function parseDexIds(raw: string | null): number[] | null {
  if (!raw?.trim()) return [];
  const segments = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (segments.length > MAX_IDS) return null;
  const ids: number[] = [];
  for (const seg of segments) {
    const n = Number.parseInt(seg, 10);
    if (!Number.isFinite(n) || n <= 0) return null;
    ids.push(n);
  }
  return [...new Set(ids)];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = parseDexIds(searchParams.get("ids"));
    if (parsed === null) {
      return NextResponse.json({ error: "Invalid ids parameter" }, { status: 400 });
    }
    if (parsed.length === 0) {
      return NextResponse.json({ cards: [] });
    }

    const cards = await fetchMasterCardsByNationalDexIds(parsed);
    return NextResponse.json({ cards });
  } catch (error) {
    console.error("[api/cards/by-national-dex]", error);
    return NextResponse.json({ cards: [], error: "Failed to load cards" }, { status: 500 });
  }
}
