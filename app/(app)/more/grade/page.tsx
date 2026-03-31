import Link from "next/link";

import { getCurrentCustomer } from "@/lib/auth";
import type { CardsPageCardEntry } from "@/lib/cardsPageQueries";
import { fetchCollectionCardEntries } from "@/lib/storefrontCardMapsServer";
import { getPricingForSet, getPricingForCard } from "@/lib/r2Pricing";
import { GradeOpportunitiesList, type GradeOpportunity } from "./GradeOpportunitiesList";

function readScrydexPrice(scrydex: unknown, key: string, variant?: string): number | null {
  if (!scrydex || typeof scrydex !== "object") return null;
  const sc = scrydex as Record<string, unknown>;

  function fromBlock(block: unknown): number | null {
    if (!block || typeof block !== "object") return null;
    const b = block as Record<string, unknown>;
    const v = b[key];
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  }

  if (variant?.trim()) {
    const v = fromBlock(sc[variant.trim()]);
    if (v !== null) return v;
  }

  for (const block of Object.values(sc)) {
    const v = fromBlock(block);
    if (v !== null) return v;
  }

  return null;
}

async function buildGradeOpportunities(customerId: string): Promise<GradeOpportunity[]> {
  const entries = await fetchCollectionCardEntries(customerId);

  // Only consider ungraded cards
  const ungradedEntries = entries.filter((e) => !e.gradingCompany);

  // Deduplicate by masterCardId + printing
  const seen = new Set<string>();
  const candidates: typeof ungradedEntries = [];
  for (const e of ungradedEntries) {
    const key = `${e.masterCardId}::${e.printing ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(e);
    }
  }

  // Group by set for batched R2 lookups
  const bySet = new Map<string, typeof candidates>();
  for (const e of candidates) {
    const code = e.set?.trim();
    if (!code || !e.externalId) continue;
    if (!bySet.has(code)) bySet.set(code, []);
    bySet.get(code)!.push(e);
  }

  const opportunities: GradeOpportunity[] = [];

  await Promise.all(
    [...bySet.entries()].map(async ([setCode, cards]) => {
      const pricingMap = await getPricingForSet(setCode);
      if (!pricingMap) return;

      for (const e of cards) {
        const ext = e.externalId?.trim();
        if (!ext) continue;

        const fallback = e.legacyExternalId?.trim() ? [e.legacyExternalId.trim()] : undefined;
        const entry = getPricingForCard(pricingMap, ext, fallback);
        if (!entry?.scrydex) continue;

        const variant = e.printing?.trim() || undefined;
        const rawGbp = readScrydexPrice(entry.scrydex, "raw", variant);
        const psa10Gbp = readScrydexPrice(entry.scrydex, "psa10", variant);
        const ace10Gbp = readScrydexPrice(entry.scrydex, "ace10", variant);

        if (!rawGbp || rawGbp <= 0) continue;
        if (!psa10Gbp && !ace10Gbp) continue;

        opportunities.push({
          masterCardId: e.masterCardId ?? "",
          cardName: e.cardName ?? "",
          setName: e.setName,
          setCode: e.set,
          printing: e.printing,
          lowSrc: e.lowSrc,
          highSrc: e.highSrc,
          card: {
            masterCardId: e.masterCardId,
            externalId: e.externalId,
            legacyExternalId: e.legacyExternalId,
            set: e.set,
            setSlug: e.setSlug,
            setName: e.setName,
            setTcgdexId: e.setTcgdexId,
            setCardCountOfficial: e.setCardCountOfficial,
            setLogoSrc: e.setLogoSrc,
            setSymbolSrc: e.setSymbolSrc,
            setReleaseDate: e.setReleaseDate,
            cardNumber: e.cardNumber,
            filename: e.filename,
            src: e.src,
            lowSrc: e.lowSrc,
            highSrc: e.highSrc,
            rarity: e.rarity,
            cardName: e.cardName,
            category: e.category,
            stage: e.stage,
            hp: e.hp,
            elementTypes: e.elementTypes,
            dexIds: e.dexIds,
            artist: e.artist,
            regulationMark: e.regulationMark,
          } satisfies CardsPageCardEntry,
          rawGbp,
          psa10Gbp,
          ace10Gbp,
        });
      }
    }),
  );

  return opportunities;
}

export default async function GradeOpportunitiesPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    return (
      <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-6 pt-2 text-[var(--foreground)]">
        <h1 className="text-xl font-semibold">Grade opportunities</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--foreground)]/70">
          Sign in to see which cards in your collection are worth grading.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex w-fit rounded-md border border-[var(--foreground)]/25 bg-[var(--foreground)]/10 px-4 py-2 text-sm font-medium transition hover:bg-[var(--foreground)]/18"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const opportunities = await buildGradeOpportunities(customer.id);

  return (
    <div className="flex min-h-full flex-col bg-[var(--background)] px-4 pb-8 pt-2 text-[var(--foreground)]">
      <h1 className="text-xl font-semibold">Grade opportunities</h1>
      <p className="mt-1 text-sm text-[var(--foreground)]/60">
        Ungraded cards in your collection sorted by potential profit after grading.
      </p>
      <GradeOpportunitiesList opportunities={opportunities} />
    </div>
  );
}
