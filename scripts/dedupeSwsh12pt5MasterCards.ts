import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import type { Payload } from "payload";

/**
 * Crown Zenith (`swsh12pt5`) was sometimes imported twice: Pokémon TCG API ids
 * (`swsh12pt5-*`) vs TCGdex ids (`sw12.5-*` / similar). That creates duplicate
 * `master-card-list` rows for the same in-set slot (localId + card name).
 *
 * This script keeps one row per (localId, cardName) for set code `swsh12pt5`,
 * preferring rows whose `externalId` matches `data/cards/en/swsh12pt5.json`.
 *
 * Usage:
 *   npm run dedupe:swsh12pt5 -- --dry-run   (default — print plan only)
 *   npm run dedupe:swsh12pt5 -- --apply     (delete duplicate rows)
 */

type RelId = string | number;

type JsonCard = { id: string; name?: string; number?: string };

/** Fields we can merge from a loser into a keeper when keeper's value is blank. */
const MERGEABLE_FIELDS = [
  "externalId",
  "cardNumber",
  "fullDisplayName",
  "artist",
  "category",
  "localId",
  "rarity",
  "subtypes",
  "trainerType",
  "energyType",
  "regulationMark",
  "stage",
  "hp",
  "elementTypes",
  "evolveFrom",
  "dexId",
  "imageLow",
  "imageHigh",
] as const;

type MasterRow = {
  id: RelId;
  externalId?: string | null;
  localId?: string | null;
  cardName?: string | null;
  cardNumber?: string | null;
  fullDisplayName?: string | null;
  artist?: string | null;
  category?: string | null;
  rarity?: string | null;
  subtypes?: unknown;
  trainerType?: string | null;
  energyType?: string | null;
  regulationMark?: string | null;
  stage?: string | null;
  hp?: number | null;
  elementTypes?: unknown;
  evolveFrom?: string | null;
  dexId?: unknown;
  imageLow?: RelId | { id?: RelId } | null;
  imageHigh?: RelId | { id?: RelId } | null;
};

const SET_CODE = "swsh12pt5";
const JSON_PATH = path.resolve(process.cwd(), "data/cards/en/swsh12pt5.json");

const normalizeLocalId = (value: string | null | undefined): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return String(Number(raw));
  return raw.toLowerCase();
};

const normalizeName = (value: string | null | undefined): string =>
  String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const relId = (value: RelId | { id?: RelId } | null | undefined): RelId | undefined => {
  if (value == null) return undefined;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value.id === "string" || typeof value.id === "number") return value.id;
  return undefined;
};

const isBlank = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return true;
    const v = value as Record<string, unknown>;
    if (keys.every((k) => v[k] == null || v[k] === false)) return true;
  }
  return false;
};

/** Build merged update for keeper: fill keeper blanks from losers. */
const mergeFromLosers = (
  keeper: MasterRow,
  losers: MasterRow[],
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const field of MERGEABLE_FIELDS) {
    const keeperVal = (keeper as Record<string, unknown>)[field];
    if (isBlank(keeperVal)) {
      for (const loser of losers) {
        const loserVal = (loser as Record<string, unknown>)[field];
        if (!isBlank(loserVal)) {
          if (field === "imageLow" || field === "imageHigh") {
            out[field] = relId(loserVal as RelId | { id?: RelId }) ?? loserVal;
          } else {
            out[field] = loserVal;
          }
          break;
        }
      }
    }
  }
  return out;
};

const scoreKeeper = (row: MasterRow, jsonIds: ReadonlySet<string>): number => {
  const ext = String(row.externalId ?? "").trim();
  let s = 0;
  if (ext.startsWith("swsh12pt5-")) s += 10_000;
  if (jsonIds.has(ext)) s += 5_000;
  if (relId(row.imageHigh) != null) s += 200;
  if (relId(row.imageLow) != null) s += 100;
  const idNum = Number(row.id);
  if (Number.isFinite(idNum)) s -= idNum / 1_000_000;
  return s;
};

const groupKey = (row: MasterRow): string => {
  const lid = normalizeLocalId(row.localId);
  const nm = normalizeName(row.cardName);
  return `${lid}||${nm}`;
};

const loadJsonCanonicalIds = async (): Promise<ReadonlySet<string>> => {
  const raw = await fs.readFile(JSON_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${JSON_PATH}`);
  const ids = new Set<string>();
  for (const c of parsed as JsonCard[]) {
    if (c && typeof c.id === "string" && c.id.trim()) ids.add(c.id.trim());
  }
  return ids;
};

export default async function dedupeSwsh12pt5MasterCards() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = !process.argv.includes("--apply");
  if (dryRun) {
    console.log("Dry run (no deletes). Pass --apply to delete duplicate rows.\n");
  }

  const jsonIds = await loadJsonCanonicalIds();
  console.log(`Loaded ${jsonIds.size} canonical card ids from ${path.basename(JSON_PATH)}`);

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload: Payload = await getPayload({ config: payloadConfig });

  try {
    const setRes = await payload.find({
      collection: "sets",
      where: { code: { equals: SET_CODE } },
      limit: 1,
      depth: 0,
      select: { id: true, name: true },
      overrideAccess: true,
    });
    if (setRes.totalDocs === 0) {
      throw new Error(`No set found with code=${SET_CODE}`);
    }
    const setId = setRes.docs[0].id;

    const cardsRes = await payload.find({
      collection: "master-card-list",
      where: { set: { equals: setId } },
      limit: 2000,
      depth: 0,
      select: {
        id: true,
        externalId: true,
        localId: true,
        cardName: true,
        cardNumber: true,
        fullDisplayName: true,
        artist: true,
        category: true,
        rarity: true,
        subtypes: true,
        trainerType: true,
        energyType: true,
        regulationMark: true,
        stage: true,
        hp: true,
        elementTypes: true,
        evolveFrom: true,
        dexId: true,
        imageLow: true,
        imageHigh: true,
      },
      overrideAccess: true,
    });

    const docs = cardsRes.docs as MasterRow[];
    console.log(`Found ${docs.length} master-card-list rows for ${SET_CODE}\n`);

    const byKey = new Map<string, MasterRow[]>();
    for (const row of docs) {
      const key = groupKey(row);
      if (!normalizeLocalId(row.localId) || !normalizeName(row.cardName)) {
        console.warn(
          `Skipping row id=${row.id} (missing localId or cardName) — review manually in admin.`,
        );
        continue;
      }
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(row);
    }

    const toDelete: MasterRow[] = [];
    const keepers: Array<{ key: string; kept: MasterRow; removed: number }> = [];

    for (const [key, group] of byKey) {
      if (group.length <= 1) continue;
      const sorted = [...group].sort((a, b) => scoreKeeper(b, jsonIds) - scoreKeeper(a, jsonIds));
      const keeper = sorted[0];
      const losers = sorted.slice(1);
      toDelete.push(...losers);
      keepers.push({ key, kept: keeper, removed: losers.length });
    }

    console.log(`Duplicate groups (same localId + card name): ${keepers.length}`);
    console.log(`Rows to delete: ${toDelete.length}\n`);

    const reportPath = path.resolve(process.cwd(), "docs/dedupe-swsh12pt5-report.md");
    const reportLines: string[] = [
      `# Dedupe report: ${SET_CODE} (Crown Zenith)`,
      "",
      `Generated: ${new Date().toISOString()}`,
      "",
      `- Mode: ${dryRun ? "**dry-run** (no deletes)" : "**apply** (duplicates deleted)"}`,
      `- Canonical JSON: \`data/cards/en/swsh12pt5.json\` (${jsonIds.size} ids)`,
      `- Rows before: ${docs.length}`,
      `- Duplicate groups: ${keepers.length}`,
      `- Rows to remove: ${toDelete.length}`,
      "",
      "## Keeper per group (highest score = Pokémon TCG \`swsh12pt5-*\` id preferred)",
      "",
      "| Group key | Kept id | Kept externalId | Removed ids |",
      "| --- | --- | --- | --- |",
    ];

    for (const { key, kept, removed } of keepers.sort((a, b) => a.key.localeCompare(b.key))) {
      const group = byKey.get(key)!;
      const losers = group.filter((r) => r.id !== kept.id);
      const removedIds = losers.map((r) => String(r.id)).join(", ");
      reportLines.push(
        `| \`${key.replace(/\|/g, "\\|")}\` | ${kept.id} | \`${String(kept.externalId ?? "")}\` | ${removedIds} |`,
      );
    }
    reportLines.push("");

    await fs.writeFile(reportPath, `${reportLines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${reportPath}`);

    if (!dryRun && toDelete.length > 0) {
      let merged = 0;
      let deleted = 0;
      for (const { key, kept } of keepers) {
        const group = byKey.get(key)!;
        const losers = group.filter((r) => r.id !== kept.id);
        const mergedData = mergeFromLosers(kept, losers);
        if (Object.keys(mergedData).length > 0) {
          await payload.update({
            collection: "master-card-list",
            id: kept.id,
            data: mergedData,
            overrideAccess: true,
          });
          merged++;
        }
      }
      for (const row of toDelete) {
        await payload.delete({
          collection: "master-card-list",
          id: row.id,
          overrideAccess: true,
        });
        deleted++;
        if (deleted % 25 === 0) console.log(`Deleted ${deleted}/${toDelete.length}...`);
      }
      console.log(`\nMerged blank fields into ${merged} keeper(s).`);
      console.log(`Deleted ${deleted} duplicate row(s).`);
    } else if (dryRun && toDelete.length > 0) {
      console.log("Example duplicate groups (first 5):");
      for (const g of keepers.slice(0, 5)) {
        const grp = byKey.get(g.key)!;
        console.log(`  ${g.key}`);
        for (const r of grp) {
          console.log(`    id=${r.id} externalId=${r.externalId ?? ""}`);
        }
      }
    }
  } finally {
    await payload.destroy();
  }
}

dedupeSwsh12pt5MasterCards().catch((err) => {
  console.error(err);
  process.exit(1);
});
