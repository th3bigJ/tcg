/**
 * Rewrite local `data/pokemon/pricing/card-pricing|price-history|price-trends/{setKey}.json`
 * so top-level keys match catalog `externalId` (trimmed, lowercased), using the same
 * alias rules as `buildPricingLookupIds`. Merges duplicate entries when several legacy
 * keys map to one card. Regenerates `price-trends` from merged `price-history`.
 *
 * After this, upload with your usual R2 static-data flow.
 *
 * Usage:
 *   DRY_RUN=1 node --import tsx/esm scripts/migrateSinglesPricingKeysToCanonical.ts
 *   node --import tsx/esm scripts/migrateSinglesPricingKeysToCanonical.ts
 *   node --import tsx/esm scripts/migrateSinglesPricingKeysToCanonical.ts --set=swsh12pt5,me2pt5
 */

import fs from "fs";
import path from "path";
import { buildPricingLookupIds } from "../lib/r2Pricing";
import { normalizeSinglesPricingCardKey } from "../lib/singlesPricingKeyNormalization";
import { mergeDailySeriesIntoWindow } from "../lib/r2PriceHistory";
import { buildTrendMapFromHistoryMap } from "../lib/r2PriceTrends";
import type {
  CardPriceHistory,
  CardPricingEntry,
  PriceHistoryPoint,
  PriceHistoryWindow,
  ScrydexCardPricing,
  ScrydexVariantPricing,
  SetPriceHistoryMap,
  SetPricingMap,
  SetPriceTrendMap,
} from "../lib/staticDataTypes";
import { pokemonLocalDataRoot } from "../lib/pokemonLocalDataPaths";

const dryRun = Boolean(process.env.DRY_RUN && process.env.DRY_RUN !== "0");
const setFilterArg = process.argv.find((a) => a.startsWith("--set="));
const setFilter = setFilterArg
  ? new Set(
      setFilterArg
        .slice("--set=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
  : null;

const DATA = pokemonLocalDataRoot;
const setsPath = path.join(DATA, "sets.json");
const cardsDir = path.join(DATA, "cards");
const pricingRoot = path.join(DATA, "pricing");

function readJson<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf-8").trim();
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function writeJson(p: string, obj: unknown): void {
  if (dryRun) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj));
}

function mergeNum(a?: number, b?: number): number | undefined {
  const fa = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const fb = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  if (fa === undefined) return fb;
  if (fb === undefined) return fa;
  if (fa === 0 && fb !== 0) return fb;
  if (fb === 0 && fa !== 0) return fa;
  return Math.max(fa, fb);
}

function mergeVariant(va: ScrydexVariantPricing, vb: ScrydexVariantPricing): ScrydexVariantPricing {
  return {
    raw: mergeNum(va.raw, vb.raw),
    psa10: mergeNum(va.psa10, vb.psa10),
    ace10: mergeNum(va.ace10, vb.ace10),
  };
}

function mergeScrydex(a: ScrydexCardPricing | null, b: ScrydexCardPricing | null): ScrydexCardPricing | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const out: ScrydexCardPricing = { ...a };
  for (const [vk, gradesB] of Object.entries(b)) {
    const gradesA = out[vk];
    out[vk] = gradesA ? mergeVariant(gradesA, gradesB) : { ...gradesB };
  }
  return out;
}

function mergeCardPricingEntry(a: CardPricingEntry, b: CardPricingEntry): CardPricingEntry {
  return {
    scrydex: mergeScrydex(a.scrydex, b.scrydex),
    tcgplayer:
      a.tcgplayer && b.tcgplayer && typeof a.tcgplayer === "object" && typeof b.tcgplayer === "object"
        ? { ...(a.tcgplayer as object), ...(b.tcgplayer as object) }
        : (b.tcgplayer ?? a.tcgplayer),
    cardmarket:
      a.cardmarket && b.cardmarket && typeof a.cardmarket === "object" && typeof b.cardmarket === "object"
        ? { ...(a.cardmarket as object), ...(b.cardmarket as object) }
        : (b.cardmarket ?? a.cardmarket),
  };
}

function ensureWindow(w: Partial<PriceHistoryWindow> | undefined): PriceHistoryWindow {
  return {
    daily: Array.isArray(w?.daily) ? (w!.daily as PriceHistoryPoint[]) : [],
    weekly: Array.isArray(w?.weekly) ? (w!.weekly as PriceHistoryPoint[]) : [],
    monthly: Array.isArray(w?.monthly) ? (w!.monthly as PriceHistoryPoint[]) : [],
  };
}

function mergePriceWindows(wa: PriceHistoryWindow, wb: PriceHistoryWindow): PriceHistoryWindow {
  const combinedDaily: PriceHistoryPoint[] = [...ensureWindow(wa).daily, ...ensureWindow(wb).daily];
  const byD = new Map<string, number>();
  for (const [d, p] of combinedDaily) {
    if (typeof d !== "string" || typeof p !== "number" || !Number.isFinite(p)) continue;
    const prev = byD.get(d);
    byD.set(d, prev === undefined ? p : Math.max(prev, p));
  }
  const sorted: PriceHistoryPoint[] = [...byD.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([d, p]) => [d, p]);
  return mergeDailySeriesIntoWindow(undefined, sorted);
}

function mergeCardHistory(a: CardPriceHistory, b: CardPriceHistory): CardPriceHistory {
  const out: CardPriceHistory = structuredClone(a);
  for (const [vKey, vObjB] of Object.entries(b)) {
    if (!out[vKey]) {
      out[vKey] = structuredClone(vObjB);
      continue;
    }
    const vObjA = out[vKey];
    for (const [gKey, winB] of Object.entries(vObjB)) {
      const winA = vObjA[gKey];
      if (!winA) {
        vObjA[gKey] = ensureWindow(winB as Partial<PriceHistoryWindow>);
        continue;
      }
      vObjA[gKey] = mergePriceWindows(ensureWindow(winA), ensureWindow(winB as Partial<PriceHistoryWindow>));
    }
  }
  return out;
}

function mergeCardHistories(parts: CardPriceHistory[]): CardPriceHistory {
  if (parts.length === 0) return {};
  let acc = structuredClone(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    acc = mergeCardHistory(acc, parts[i]);
  }
  return acc;
}

function buildAliasToCanonical(
  cards: { externalId: string | null }[],
): { map: Map<string, string>; collisions: string[] } {
  const aliasToCanonical = new Map<string, string>();
  const collisions: string[] = [];

  for (const c of cards) {
    const ext = (c.externalId ?? "").trim();
    if (!ext) continue;
    /** Exact Scrydex id as stored on the card (pricing JSON keys must match this). */
    const canonical = ext;
    for (const alias of buildPricingLookupIds(ext)) {
      const a = alias.toLowerCase();
      const existing = aliasToCanonical.get(a);
      if (existing !== undefined && existing !== canonical) {
        collisions.push(`${a} → ${existing} vs ${canonical}`);
        continue;
      }
      if (existing === undefined) aliasToCanonical.set(a, canonical);
    }
  }

  return { map: aliasToCanonical, collisions };
}

function canonicalBucketForRawKey(rawKey: string, aliasToCanonical: Map<string, string>): string | undefined {
  const lower = rawKey.toLowerCase();
  if (aliasToCanonical.has(lower)) return aliasToCanonical.get(lower);
  const normalized = normalizeSinglesPricingCardKey(rawKey);
  if (normalized !== lower && aliasToCanonical.has(normalized)) return aliasToCanonical.get(normalized);
  return undefined;
}

function sortTopLevelKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted = {} as T;
  for (const k of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
    sorted[k as keyof T] = obj[k];
  }
  return sorted;
}

function migrateSet(setKey: string): {
  wroteCp: boolean;
  wrotePh: boolean;
  wrotePt: boolean;
  unmappedCp: number;
  unmappedPh: number;
  mergedKeysCp: number;
  mergedKeysPh: number;
} {
  const cardPath = path.join(cardsDir, `${setKey}.json`);
  if (!fs.existsSync(cardPath)) {
    return {
      wroteCp: false,
      wrotePh: false,
      wrotePt: false,
      unmappedCp: 0,
      unmappedPh: 0,
      mergedKeysCp: 0,
      mergedKeysPh: 0,
    };
  }

  const cards = JSON.parse(fs.readFileSync(cardPath, "utf-8")) as { externalId: string | null }[];
  const { map: aliasToCanonical, collisions } = buildAliasToCanonical(cards);
  if (collisions.length) {
    console.log(`  [${setKey}] alias collisions (first mapping kept): ${collisions.slice(0, 5).join("; ")}${collisions.length > 5 ? " …" : ""}`);
  }

  const cpPath = path.join(pricingRoot, "card-pricing", `${setKey}.json`);
  const phPath = path.join(pricingRoot, "price-history", `${setKey}.json`);
  const ptPath = path.join(pricingRoot, "price-trends", `${setKey}.json`);

  const rawCp = readJson<SetPricingMap>(cpPath) ?? {};
  const rawPh = readJson<SetPriceHistoryMap>(phPath) ?? {};

  const bucketsCp = new Map<string, CardPricingEntry[]>();
  const unmappedCp: SetPricingMap = {};
  let mergedKeysCp = 0;

  for (const [k, v] of Object.entries(rawCp)) {
    const canon = canonicalBucketForRawKey(k, aliasToCanonical);
    if (canon) {
      const list = bucketsCp.get(canon) ?? [];
      list.push(v);
      bucketsCp.set(canon, list);
      if (k !== canon) mergedKeysCp += 1;
    } else {
      unmappedCp[k] = v;
    }
  }

  const nextCp: SetPricingMap = { ...unmappedCp };
  for (const [canon, parts] of bucketsCp) {
    if (parts.length === 0) continue;
    nextCp[canon] = parts.reduce((a, b) => mergeCardPricingEntry(a, b));
  }

  const bucketsPh = new Map<string, CardPriceHistory[]>();
  const unmappedPh: SetPriceHistoryMap = {};
  let mergedKeysPh = 0;

  for (const [k, v] of Object.entries(rawPh)) {
    const canon = canonicalBucketForRawKey(k, aliasToCanonical);
    if (canon) {
      const list = bucketsPh.get(canon) ?? [];
      list.push(v);
      bucketsPh.set(canon, list);
      if (k !== canon) mergedKeysPh += 1;
    } else {
      unmappedPh[k] = v;
    }
  }

  const nextPh: SetPriceHistoryMap = { ...unmappedPh };
  for (const [canon, parts] of bucketsPh) {
    if (parts.length === 0) continue;
    nextPh[canon] = mergeCardHistories(parts);
  }

  const nextPt: SetPriceTrendMap = buildTrendMapFromHistoryMap(nextPh);

  const sortedCp = sortTopLevelKeys(nextCp);
  const sortedPh = sortTopLevelKeys(nextPh);
  const sortedPt = sortTopLevelKeys(nextPt);

  const cpExists = fs.existsSync(cpPath);
  const phExists = fs.existsSync(phPath);
  const ptExists = fs.existsSync(ptPath);

  const shouldWriteCp = cpExists || Object.keys(sortedCp).length > 0;
  const shouldWritePh = phExists || Object.keys(sortedPh).length > 0;
  const shouldWritePt = shouldWritePh || ptExists;

  if (!shouldWriteCp && !shouldWritePh && !shouldWritePt) {
    return {
      wroteCp: false,
      wrotePh: false,
      wrotePt: false,
      unmappedCp: Object.keys(unmappedCp).length,
      unmappedPh: Object.keys(unmappedPh).length,
      mergedKeysCp,
      mergedKeysPh,
    };
  }

  if (shouldWriteCp) writeJson(cpPath, sortedCp);
  if (shouldWritePh) writeJson(phPath, sortedPh);
  if (shouldWritePt) writeJson(ptPath, sortedPt);

  return {
    wroteCp: shouldWriteCp,
    wrotePh: shouldWritePh,
    wrotePt: shouldWritePt,
    unmappedCp: Object.keys(unmappedCp).length,
    unmappedPh: Object.keys(unmappedPh).length,
    mergedKeysCp,
    mergedKeysPh,
  };
}

function main(): void {
  const sets = JSON.parse(fs.readFileSync(setsPath, "utf-8")) as { setKey: string }[];
  let totalMergedCp = 0;
  let totalMergedPh = 0;
  let totalUnmappedCp = 0;
  let totalUnmappedPh = 0;
  let setsTouched = 0;

  console.log(dryRun ? "DRY_RUN=1 — no files written\n" : "Writing migrated JSON…\n");

  for (const { setKey } of sets) {
    if (setFilter && !setFilter.has(setKey.toLowerCase())) continue;
    const r = migrateSet(setKey);
    if (!r.wroteCp && !r.wrotePh && !r.wrotePt) continue;
    setsTouched += 1;
    totalMergedCp += r.mergedKeysCp;
    totalMergedPh += r.mergedKeysPh;
    totalUnmappedCp += r.unmappedCp;
    totalUnmappedPh += r.unmappedPh;
    if (r.mergedKeysCp || r.mergedKeysPh || r.unmappedCp || r.unmappedPh) {
      console.log(
        `  ${setKey}: merged legacy keys cp ${r.mergedKeysCp} / ph ${r.mergedKeysPh}; unmapped keys kept cp ${r.unmappedCp} / ph ${r.unmappedPh}`,
      );
    }
  }

  console.log(
    `\nDone. Sets updated: ${setsTouched}; legacy keys merged (cp/ph): ${totalMergedCp}/${totalMergedPh}; unmapped keys retained: cp ${totalUnmappedCp}, ph ${totalUnmappedPh}.`,
  );
  if (dryRun) console.log("Re-run without DRY_RUN=1 to write files.");
}

main();
