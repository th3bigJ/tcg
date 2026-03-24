/**
 * Fills `tcgdex_id` / `no_pricing` from TCGdex. After each set finishes, refreshes
 * `docs/tcgdex-id-by-set.md` and `docs/tcgdex-id-by-set.csv` (unless `--skip-progress-docs`).
 *
 * Flags: `--series=`, `--set-tcgdex-id=`, `--set-concurrency=`, `--skip-progress-docs`
 */
import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

import { MEGA_EVOLUTION_SERIES_NAME } from "../lib/catalogPricingConstants";
import {
  createSerializedTaskQueue,
  writeTcgdexIdProgressFiles,
} from "../lib/exportTcgdexIdStats";
import { getRelationshipDocumentId, toPayloadRelationshipId } from "../lib/relationshipId";

type PayloadClient = Awaited<ReturnType<typeof import("payload").getPayload>>;

type SetDoc = {
  id: string | number;
  name: string;
  code?: string;
  tcgdexId?: string;
};

const tcgdex = new TCGdex("en");

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = arg.slice(prefix.length).trim();
  return value || undefined;
}

function getArgNumber(name: string, fallback: number): number {
  const raw = getArgValue(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function hasPricing(card: unknown): boolean {
  if (!card || typeof card !== "object" || !("pricing" in card)) return false;
  const pricing = (card as { pricing?: unknown }).pricing;
  if (!pricing || typeof pricing !== "object") return false;
  const row = pricing as { tcgplayer?: unknown; cardmarket?: unknown };
  return row.tcgplayer != null || row.cardmarket != null;
}

function padLocalIdTo3(localId: string): string {
  return localId.trim().padStart(3, "0");
}

/**
 * TCGdex card URLs use `setId-XXX` (3-digit) for many modern sets, but older sets
 * (e.g. Base base1) use unpadded numbers (`base1-1` not `base1-001`). Try both.
 */
function buildCandidateCardLookupIds(setTcgdexId: string, localId: string): string[] {
  const trimmed = localId.trim();
  const padded = padLocalIdTo3(trimmed);
  const primary = `${setTcgdexId}-${padded}`;
  const out: string[] = [primary];

  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    if (Number.isFinite(n)) {
      const alternate = `${setTcgdexId}-${n}`;
      if (alternate !== primary) {
        out.push(alternate);
      }
    }
  }

  return out;
}

async function findSeriesId(payload: PayloadClient): Promise<string | number | null> {
  const requestedSeriesName = getArgValue("series") ?? MEGA_EVOLUTION_SERIES_NAME;
  const result = await payload.find({
    collection: "series",
    where: { name: { equals: requestedSeriesName } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const doc = result.docs[0];
  if (!doc) return null;
  return toPayloadRelationshipId(getRelationshipDocumentId(doc.id) ?? String(doc.id)) ?? null;
}

function mapDocToSetDoc(doc: Record<string, unknown>): SetDoc | null {
  const id = toPayloadRelationshipId(getRelationshipDocumentId(doc.id) ?? String(doc.id));
  const name = typeof doc.name === "string" ? doc.name.trim() : "";
  const code = typeof doc.code === "string" ? doc.code.trim() : undefined;
  const tcgdexId = typeof doc.tcgdexId === "string" ? doc.tcgdexId.trim() : undefined;
  if (id === undefined || !name || !tcgdexId) return null;
  return { id, name, code, tcgdexId };
}

async function findSetByTcgdexId(payload: PayloadClient, tcgdexId: string): Promise<SetDoc | null> {
  const result = await payload.find({
    collection: "sets",
    where: { tcgdexId: { equals: tcgdexId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const row = result.docs[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return mapDocToSetDoc(row);
}

async function findSeriesSets(payload: PayloadClient, seriesId: string | number): Promise<SetDoc[]> {
  const result = await payload.find({
    collection: "sets",
    where: { serieName: { equals: seriesId } },
    limit: 200,
    depth: 0,
    overrideAccess: true,
  });

  return result.docs
    .map((doc) => mapDocToSetDoc(doc as Record<string, unknown>))
    .filter((v): v is SetDoc => v !== null)
    .sort((a, b) => (a.tcgdexId ?? "").localeCompare(b.tcgdexId ?? ""));
}

type SetRunTotals = {
  scanned: number;
  filled: number;
  cleared: number;
  /** Resolved tcgxdex_id but TCGdex has no TCGPlayer/Cardmarket payload */
  noMarketPricing: number;
  /** No matching card on TCGdex for any candidate id */
  unresolved: number;
  skippedNoLocalId: number;
};

async function processSet(payload: PayloadClient, set: SetDoc): Promise<SetRunTotals> {
  const cards = await payload.find({
    collection: "master-card-list",
    where: { set: { equals: set.id } },
    limit: 2000,
    depth: 0,
    overrideAccess: true,
    select: {
      id: true,
      localId: true,
      tcgdex_id: true,
      no_pricing: true,
      externalId: true,
    },
  });

  console.log(`[${set.tcgdexId}] ${set.name}: ${cards.docs.length} cards`);

  const totals: SetRunTotals = {
    scanned: 0,
    filled: 0,
    cleared: 0,
    noMarketPricing: 0,
    unresolved: 0,
    skippedNoLocalId: 0,
  };

  for (const cardDoc of cards.docs) {
    totals.scanned += 1;

    const row = cardDoc as Record<string, unknown>;
    const cardId = String(row.id);
    const localId = typeof row.localId === "string" ? row.localId.trim() : "";
    const currentTcgdexId = typeof row.tcgdex_id === "string" ? row.tcgdex_id.trim() : "";

    const currentNoPricing =
      typeof row.no_pricing === "boolean" ? row.no_pricing : false;

    if (!localId) {
      totals.skippedNoLocalId += 1;
      if (currentTcgdexId || currentNoPricing) {
        await payload.update({
          collection: "master-card-list",
          id: cardId,
          data: { tcgdex_id: "", no_pricing: false },
          overrideAccess: true,
        });
        totals.cleared += 1;
      }
      continue;
    }

    const lookupCandidates = buildCandidateCardLookupIds(set.tcgdexId, localId);
    let winningLookupId: string | null = null;
    let winningHasMarketPricing = false;
    for (const lookupId of lookupCandidates) {
      try {
        const card = await tcgdex.fetch("cards", lookupId);
        if (!card) continue;
        winningLookupId = lookupId;
        winningHasMarketPricing = hasPricing(card);
        break;
      } catch {
        // try next candidate
      }
    }

    if (winningLookupId !== null) {
      const targetNoPricing = !winningHasMarketPricing;
      if (targetNoPricing) {
        totals.noMarketPricing += 1;
      }
      const needsUpdate =
        currentTcgdexId !== winningLookupId || currentNoPricing !== targetNoPricing;
      if (needsUpdate) {
        await payload.update({
          collection: "master-card-list",
          id: cardId,
          data: {
            tcgdex_id: winningLookupId,
            no_pricing: targetNoPricing,
          },
          overrideAccess: true,
        });
        totals.filled += 1;
      }
    } else {
      totals.unresolved += 1;
      if (currentTcgdexId || currentNoPricing) {
        await payload.update({
          collection: "master-card-list",
          id: cardId,
          data: { tcgdex_id: "", no_pricing: false },
          overrideAccess: true,
        });
        totals.cleared += 1;
      }
    }

    if (totals.scanned % 50 === 0 || totals.scanned === cards.docs.length) {
      console.log(
        `[${set.tcgdexId}] progress ${totals.scanned}/${cards.docs.length} | filled=${totals.filled} no-market=${totals.noMarketPricing} unresolved=${totals.unresolved} cleared=${totals.cleared}`,
      );
    }
  }

  console.log(
    `[${set.tcgdexId}] done | scanned=${totals.scanned} filled=${totals.filled} no-market-pricing=${totals.noMarketPricing} unresolved=${totals.unresolved} cleared=${totals.cleared} no-localId=${totals.skippedNoLocalId}`,
  );
  console.log("");

  return totals;
}

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  const requestedSeriesName = getArgValue("series") ?? MEGA_EVOLUTION_SERIES_NAME;
  const singleSetTcgdexId = getArgValue("set-tcgdex-id");
  const setConcurrency = getArgNumber("set-concurrency", 1);
  const skipProgressDocs = hasFlag("skip-progress-docs");

  try {
    const enqueueProgressWrite = createSerializedTaskQueue();
    let sets: SetDoc[];

    if (singleSetTcgdexId) {
      const one = await findSetByTcgdexId(payload, singleSetTcgdexId.trim());
      if (one === null) {
        console.error(`Set not found for tcgdexId: ${singleSetTcgdexId}`);
        process.exit(1);
      }
      sets = [one];
      console.log(`Single set mode: ${one.name} (${one.tcgdexId})`);
    } else {
      const seriesId = await findSeriesId(payload);
      if (seriesId === null) {
        console.error(`Series not found: ${requestedSeriesName}`);
        process.exit(1);
      }

      sets = await findSeriesSets(payload, seriesId);
      if (sets.length === 0) {
        console.error(`No sets found in series: ${requestedSeriesName}`);
        process.exit(1);
      }

      console.log(`Series: ${requestedSeriesName}`);
    }

    if (sets.length === 0) {
      console.error("No sets to process.");
      process.exit(1);
    }

    console.log(`Set concurrency: ${setConcurrency}`);
    console.log(
      `Sets: ${sets.map((s) => `${s.name} (${s.tcgdexId}${s.code ? ` / legacy:${s.code}` : ""})`).join(", ")}`,
    );
    console.log("");

    let totalScanned = 0;
    let totalFilled = 0;
    let totalCleared = 0;
    let totalNoMarketPricing = 0;
    let totalUnresolved = 0;
    let totalSkippedNoLocalId = 0;

    let cursor = 0;
    async function worker() {
      while (cursor < sets.length) {
        const currentIndex = cursor;
        cursor += 1;
        const set = sets[currentIndex];
        const setTotals = await processSet(payload, set);
        totalScanned += setTotals.scanned;
        totalFilled += setTotals.filled;
        totalCleared += setTotals.cleared;
        totalNoMarketPricing += setTotals.noMarketPricing;
        totalUnresolved += setTotals.unresolved;
        totalSkippedNoLocalId += setTotals.skippedNoLocalId;

        if (!skipProgressDocs) {
          await enqueueProgressWrite(async () => {
            const { generatedAt, paths } = await writeTcgdexIdProgressFiles(payload, {
              series: false,
              sets: true,
            });
            console.log(
              `[progress] Updated ${paths.setMarkdown ?? "tcgdex-id-by-set.md"} (UTC ${generatedAt}) after [${set.tcgdexId}] ${set.name}`,
            );
          });
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(setConcurrency, sets.length) }, () => worker()));

    const doneLabel = singleSetTcgdexId
      ? `Set ${sets[0]?.name ?? singleSetTcgdexId}`
      : requestedSeriesName;
    console.log(`${doneLabel} tcgdex_id population complete.`);
    console.log(`Scanned: ${totalScanned}`);
    console.log(`Filled: ${totalFilled}`);
    console.log(`No market pricing (no_pricing=true): ${totalNoMarketPricing}`);
    console.log(`Unresolved (no TCGdex card): ${totalUnresolved}`);
    console.log(`Cleared: ${totalCleared}`);
    console.log(`Skipped (no localId): ${totalSkippedNoLocalId}`);
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

process.on("beforeExit", () => {
  process.exit(0);
});
