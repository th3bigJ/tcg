import TCGdex from "@tcgdex/sdk";
import nextEnvImport from "@next/env";

type FullSet = {
  id: string;
  name?: string;
  releaseDate?: string;
  legal?: { standard?: boolean; expanded?: boolean };
  serie?: { id?: string; name?: string };
  cardCount?: {
    total?: number;
    official?: number;
    firstEd?: number;
    holo?: number;
    normal?: number;
    reverse?: number;
  };
};

const getArg = (key: string): string | undefined => {
  const match = process.argv.find((arg) => arg.startsWith(`--${key}=`));
  if (!match) return undefined;
  return match.split("=").slice(1).join("=") || undefined;
};

export default async function mergeSetDetails() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const dryRun = process.argv.includes("--dry-run");
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const setArg = getArg("set");

  const tcgdex = new TCGdex("en");

  const payload = dryRun
    ? null
    : await (async () => {
        const payloadConfig = (await import("../payload.config")).default;
        const { getPayload } = await import("payload");
        return getPayload({ config: payloadConfig });
      })();

  let setsToProcess: { id: string; code: string }[];

  if (dryRun) {
    const list = (await tcgdex.fetch("sets")) as { id: string }[] | undefined;
    const codes = Array.isArray(list) ? list.map((s) => ({ id: "", code: s.id })) : [];
    setsToProcess = setArg ? codes.filter((c) => c.code === setArg) : codes;
  } else {
    const setsResult = await payload!.find({
      collection: "sets",
      limit: 500,
      select: { id: true, code: true },
      overrideAccess: true,
    });
    setsToProcess = setsResult.docs
      .filter((s): s is { id: string; code: string } => s.code != null && String(s.code).trim() !== "")
      .map((s) => ({ id: s.id, code: String(s.code) }));
    if (setArg) setsToProcess = setsToProcess.filter((s) => s.code === setArg);
  }

  const total = setsToProcess.length;
  const toProcess =
    typeof limit === "number" && Number.isFinite(limit) && limit > 0
      ? Math.min(total, limit)
      : total;

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toProcess; i++) {
    const row = setsToProcess[i];
    const code = row.code;

    let fullSet: FullSet | undefined;
    try {
      fullSet = (await tcgdex.fetch("sets", code)) as FullSet | undefined;
    } catch (err) {
      console.warn(`Fetch failed for set code=${code}:`, err);
      errors++;
      continue;
    }

    if (!fullSet) {
      console.warn(`No TCGdex set returned for code=${code}. Skipping.`);
      skipped++;
      continue;
    }

    const cc = fullSet.cardCount ?? {};
    const legal = fullSet.legal ?? {};
    const serie = fullSet.serie ?? {};

    const data: Record<string, unknown> = {};
    if (fullSet.releaseDate != null) data.releaseDate = fullSet.releaseDate;
    if (typeof cc.total === "number") data.cardCountTotal = cc.total;
    if (typeof cc.official === "number") data.cardCountOfficial = cc.official;
    if (typeof cc.firstEd === "number") data.cardCountFirstEd = cc.firstEd;
    if (typeof cc.holo === "number") data.cardCountHolo = cc.holo;
    if (typeof cc.normal === "number") data.cardCountNormal = cc.normal;
    if (typeof cc.reverse === "number") data.cardCountReverse = cc.reverse;
    if (typeof legal.standard === "boolean") data.legalStandard = legal.standard;
    if (typeof legal.expanded === "boolean") data.legalExpanded = legal.expanded;
    if (serie.id != null) data.serieId = serie.id;
    if (serie.name != null) data.serieName = serie.name;

    if (dryRun) {
      console.log(`[dry-run] code=${code}`, data);
      updated++;
      continue;
    }

    await payload!.update({
      collection: "sets",
      id: row.id,
      data,
      overrideAccess: true,
    });

    updated++;
    console.log(`Merged ${i + 1}/${toProcess}: ${fullSet.name ?? code} (${code})`);
  }

  console.log("");
  console.log(`Merge set details complete (${dryRun ? "dry-run" : "write mode"})`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (!dryRun && payload) {
    await payload.destroy();
    process.exit(0);
  }
}

mergeSetDetails().catch((err) => {
  console.error(err);
  process.exit(1);
});
