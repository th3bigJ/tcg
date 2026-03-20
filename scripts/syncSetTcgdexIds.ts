import fs from "fs/promises";
import path from "path";
import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";
import type { Payload } from "payload";

type RelId = number | string;

type SetDoc = {
  id: RelId;
  name?: string | null;
  code?: string | null;
  tcgdexId?: string | null;
};

type TCGdexSetBrief = {
  id: string;
  name: string;
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

const normalize = (value: string | undefined | null): string =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export default async function syncSetTcgdexIds() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const overwrite = process.argv.includes("--overwrite");
  const reportPath = path.resolve(process.cwd(), "docs/set-tcgdex-id-sync-report.md");

  const payload = await (async () => {
    const payloadConfig = (await import("../payload.config")).default;
    const { getPayload } = await import("payload");
    return getPayload({ config: payloadConfig });
  })();

  const tcgdex = new TCGdex("en");
  const tcgdexSets = (await tcgdex.set.list()) as unknown as TCGdexSetBrief[];

  const byId = new Map<string, TCGdexSetBrief>();
  const byName = new Map<string, TCGdexSetBrief[]>();
  for (const set of tcgdexSets) {
    byId.set(set.id.toLowerCase(), set);
    const key = normalize(set.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(set);
  }

  const setsResult = await payload.find({
    collection: "sets",
    limit: 1000,
    depth: 0,
    select: {
      id: true,
      name: true,
      code: true,
      tcgdexId: true,
    },
    overrideAccess: true,
  });

  const sets = setsResult.docs as SetDoc[];
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? sets.slice(0, limit) : sets;

  let updated = 0;
  let skippedExisting = 0;
  let unmatched = 0;
  let ambiguous = 0;

  const report: string[] = [
    "# Set TCGdex ID Sync Report",
    "",
    `- Total source sets: ${toProcess.length}`,
    "",
    "## Issues",
    "",
  ];

  for (const row of toProcess) {
    const current = (row.tcgdexId || "").trim();
    if (current && !overwrite) {
      skippedExisting++;
      continue;
    }

    const codeKey = (row.code || "").trim().toLowerCase();
    const nameKey = normalize(row.name);

      const byCode = codeKey ? byId.get(codeKey) : undefined;
    const nameCandidates = nameKey ? byName.get(nameKey) || [] : [];

    let chosen: TCGdexSetBrief | undefined;
    let matchReason = "none";

    if (byCode) {
      chosen = byCode;
      matchReason = "code";
    } else if (nameCandidates.length === 1) {
      chosen = nameCandidates[0];
      matchReason = "name";
    } else if (nameCandidates.length > 1) {
      ambiguous++;
      report.push(
        `- Ambiguous name match for set id \`${row.id}\` (\`${row.name || "unknown"}\`): ${nameCandidates.map((c) => `\`${c.id}\``).join(", ")}`,
      );
      continue;
    } else {
      unmatched++;
      report.push(
        `- Unmatched set id \`${row.id}\` (\`${row.name || "unknown"}\`, code=\`${row.code || ""}\`)`,
      );
      continue;
    }

    if (dryRun) {
      console.log(
        `[dry-run] set=${row.id} name="${row.name || ""}" code="${row.code || ""}" => tcgdexId="${chosen.id}" (${matchReason})`,
      );
      continue;
    }

    await payload.update({
      collection: "sets",
      id: row.id,
      data: { tcgdexId: chosen.id },
      overrideAccess: true,
    });

    updated++;
    console.log(
      `Updated set ${row.id}: ${row.name || ""} -> tcgdexId=${chosen.id} (${matchReason})`,
    );
  }

  report.push("");
  report.push("## Summary");
  report.push("");
  report.push(`- Updated: ${updated}`);
  report.push(`- Skipped existing: ${skippedExisting}`);
  report.push(`- Unmatched: ${unmatched}`);
  report.push(`- Ambiguous: ${ambiguous}`);
  await fs.writeFile(reportPath, report.join("\n"), "utf8");

  console.log("");
  console.log(`TCGdex set ID sync complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped existing: ${skippedExisting}`);
  console.log(`Unmatched: ${unmatched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Report: ${reportPath}`);

  await payload.destroy();
  process.exit(0);
}

syncSetTcgdexIds().catch((error) => {
  console.error(error);
  process.exit(1);
});
