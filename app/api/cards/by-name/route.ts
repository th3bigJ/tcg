import { NextResponse } from "next/server";

import { fetchMasterCardsBySimilarName } from "@/lib/cardsPageQueries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name")?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ cards: [] });
  }

  const cards = await fetchMasterCardsBySimilarName(name);
  return NextResponse.json({ cards });
}
