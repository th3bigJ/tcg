import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

type RelId = number | string;

type LocalSet = {
  id: string;
  name?: string;
  printedTotal?: number;
  total?: number;
  ptcgoCode?: string;
  releaseDate?: string;
};

type SetRow = {
  id: RelId;
  name?: string | null;
  code?: string | null;
  tcgdexId?: string | null;
  cardCountOfficial?: number | null;
  cardCountTotal?: number | null;
  releaseDate?: string | null;
};

type TCGdexSet = {
  id?: string;
  name?: string;
  tcgOnline?: string;
  releaseDate?: string;
};

const normalize = (value: string | null | undefined): string =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const toDateKey = (value: string | null | undefined): string => {
  if (!value) return "";
  // local json: YYYY/MM/DD, tcgdex: YYYY-MM-DD, DB: ISO
  const cleaned = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.slice(0, 10);
  return "";
};

const loadLocalSets = async (filePath: string): Promise<LocalSet[]> => {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`Expected array in ${filePath}`);
  return parsed as LocalSet[];
};

export default async function syncSetCodeToLocalJson() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;

  const localPath = path.resolve(process.cwd(), "data/sets/en.json");
  const reportPath = path.resolve(process.cwd(), "docs/set-code-sync-unmatched.md");

  const localSets = await loadLocalSets(localPath);
  const byLocalId = new Map<string, LocalSet>();
  const byName = new Map<string, LocalSet[]>();
  const byNameDate = new Map<string, LocalSet[]>();
  const byPtcgo = new Map<string, LocalSet[]>();

  for (const ls of localSets) {
    const id = (ls.id || "").trim().toLowerCase();
    if (id) byLocalId.set(id, ls);

    const nk = normalize(ls.name);
    if (nk) {
      if (!byName.has(nk)) byName.set(nk, []);
      byName.get(nk)!.push(ls);
    }

    const dk = toDateKey(ls.releaseDate);
    if (nk && dk) {
      const key = `${nk}|${dk}`;
      if (!byNameDate.has(key)) byNameDate.set(key, []);
      byNameDate.get(key)!.push(ls);
    }

    const pk = (ls.ptcgoCode || "").trim().toLowerCase();
    if (pk) {
      if (!byPtcgo.has(pk)) byPtcgo.set(pk, []);
      byPtcgo.get(pk)!.push(ls);
    }
  }

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  const tcgdex = new TCGdex("en");

  const res = await payload.find({
    collection: "sets",
    limit: 1000,
    depth: 0,
    select: {
      id: true,
      name: true,
      code: true,
      tcgdexId: true,
      cardCountOfficial: true,
      cardCountTotal: true,
      releaseDate: true,
    },
    overrideAccess: true,
  });

  const sourceRows = res.docs as SetRow[];
  const rows =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? sourceRows.slice(0, limit)
      : sourceRows;

  let updated = 0;
  let blanked = 0;
  let unchanged = 0;
  const unmatched: string[] = [];

  const tcgCache = new Map<string, TCGdexSet | null>();

  for (const row of rows) {
    const currentCode = (row.code || "").trim();
    const tcgdexId = (row.tcgdexId || "").trim();
    const nameKey = normalize(row.name);
    const dateKey = toDateKey(row.releaseDate);

    let match: LocalSet | null = null;
    let reason = "none";

    // 1) direct id by current code
    const directByCode = byLocalId.get(currentCode.toLowerCase());
    if (directByCode) {
      match = directByCode;
      reason = "current-code-id";
    }

    // 2) direct id by tcgdexId if local id happens to match
    if (!match && tcgdexId) {
      const directByTcgdexId = byLocalId.get(tcgdexId.toLowerCase());
      if (directByTcgdexId) {
        match = directByTcgdexId;
        reason = "tcgdex-id";
      }
    }

    // 3) exact name + date
    if (!match && nameKey && dateKey) {
      const candidates = byNameDate.get(`${nameKey}|${dateKey}`) || [];
      if (candidates.length === 1) {
        match = candidates[0];
        reason = "name-date";
      }
    }

    // 4) exact unique name
    if (!match && nameKey) {
      const candidates = byName.get(nameKey) || [];
      if (candidates.length === 1) {
        match = candidates[0];
        reason = "name";
      }
    }

    // 5) tcgdex tcgOnline -> local ptcgoCode
    if (!match && tcgdexId) {
      let full = tcgCache.get(tcgdexId);
      if (full === undefined) {
        full = (await tcgdex.fetch("sets", tcgdexId).catch(() => null)) as TCGdexSet | null;
        tcgCache.set(tcgdexId, full);
      }
      const tcgOnline = (full?.tcgOnline || "").trim().toLowerCase();
      if (tcgOnline) {
        const candidates = byPtcgo.get(tcgOnline) || [];
        if (candidates.length === 1) {
          match = candidates[0];
          reason = "tcgOnline-ptcgo";
        }
      }
    }

    if (match) {
      const nextCode = match.id;
      if (currentCode === nextCode) {
        unchanged++;
        continue;
      }
      if (dryRun) {
        console.log(`[dry-run] ${row.id} "${row.name || ""}" code "${currentCode}" -> "${nextCode}" (${reason})`);
      } else {
        await payload.update({
          collection: "sets",
          id: row.id,
          data: { code: nextCode },
          overrideAccess: true,
        });
      }
      updated++;
      continue;
    }

    // no confident match: blank code
    if (!currentCode) {
      unchanged++;
    } else {
      if (dryRun) {
        console.log(`[dry-run] ${row.id} "${row.name || ""}" code "${currentCode}" -> BLANK`);
      } else {
        await payload.update({
          collection: "sets",
          id: row.id,
          data: { code: null },
          overrideAccess: true,
        });
      }
      blanked++;
    }
    unmatched.push(`- set id \`${row.id}\` | name: \`${row.name || ""}\` | old code: \`${currentCode}\` | tcgdexId: \`${tcgdexId}\``);
  }

  const report = [
    "# Set Code Sync Unmatched Rows",
    "",
    `- Total processed: ${rows.length}`,
    `- Updated code to local id: ${updated}`,
    `- Blanked code (no confident match): ${blanked}`,
    `- Unchanged: ${unchanged}`,
    "",
    "## Unmatched",
    "",
    ...(unmatched.length > 0 ? unmatched : ["- None"]),
    "",
    "## Unused Local JSON IDs",
    "",
  ];

  const refreshedSets = await payload.find({
    collection: "sets",
    limit: 1000,
    depth: 0,
    select: { code: true },
    overrideAccess: true,
  });
  const usedCodes = new Set(
    refreshedSets.docs
      .map((doc) => String((doc as { code?: string | null }).code || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const unusedLocal = localSets
    .filter((ls) => !usedCodes.has((ls.id || "").trim().toLowerCase()))
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));

  if (unusedLocal.length === 0) {
    report.push("- None");
  } else {
    for (const ls of unusedLocal) {
      report.push(
        `- local id \`${ls.id}\` | name: \`${ls.name || ""}\` | ptcgoCode: \`${ls.ptcgoCode || ""}\` | releaseDate: \`${ls.releaseDate || ""}\``,
      );
    }
  }
  report.push("");

  await fs.writeFile(reportPath, report.join("\n"), "utf8");

  console.log("");
  console.log(`Set code sync complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Updated: ${updated}`);
  console.log(`Blanked: ${blanked}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Report: ${reportPath}`);

  await payload.destroy();
  process.exit(0);
}

syncSetCodeToLocalJson().catch((error) => {
  console.error(error);
  process.exit(1);
});
