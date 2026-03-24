import nextEnvImport from "@next/env";
import TCGdex from "@tcgdex/sdk";

type DbSetRow = {
  id: string | number;
  name: string;
  code: string;
  tcgdexId: string;
};

type IssueRow = {
  name: string;
  code: string;
  tcgdexId: string;
  status:
    | "missing_tcgdex_id"
    | "invalid_tcgdex_id"
    | "name_not_found_in_tcgdex"
    | "approved_custom_exception";
  suggestedTcgdexId?: string;
};

const APPROVED_CUSTOM_SET_IDS = new Set(["mee"]);

async function auditSetTcgdexIds() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });
  const tcgdex = new TCGdex("en");

  try {
    const apiSetsRaw = await tcgdex.fetch("sets");
    const apiSets = Array.isArray(apiSetsRaw) ? apiSetsRaw : [];
    const apiById = new Map(
      apiSets
        .filter((set): set is { id: string; name?: string } => !!set && typeof set.id === "string")
        .map((set) => [set.id.trim(), set]),
    );
    const apiByName = new Map(
      apiSets
        .filter((set): set is { id: string; name: string } => !!set && typeof set.id === "string" && typeof set.name === "string")
        .map((set) => [set.name.trim().toLowerCase(), set.id.trim()]),
    );

    const dbResult = await payload.find({
      collection: "sets",
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    });

    const dbSets: DbSetRow[] = dbResult.docs.map((doc) => ({
      id: doc.id,
      name: typeof doc.name === "string" ? doc.name.trim() : "",
      code: typeof doc.code === "string" ? doc.code.trim() : "",
      tcgdexId: typeof doc.tcgdexId === "string" ? doc.tcgdexId.trim() : "",
    }));

    let exactMatches = 0;
    let missingTcgdexId = 0;
    let invalidTcgdexId = 0;
    let approvedCustomExceptions = 0;
    const issues: IssueRow[] = [];

    for (const set of dbSets) {
      if (!set.tcgdexId) {
        missingTcgdexId += 1;
        issues.push({
          name: set.name,
          code: set.code,
          tcgdexId: "",
          status: "missing_tcgdex_id",
          suggestedTcgdexId: apiByName.get(set.name.toLowerCase()),
        });
        continue;
      }

      if (apiById.has(set.tcgdexId)) {
        exactMatches += 1;
        continue;
      }

      if (APPROVED_CUSTOM_SET_IDS.has(set.tcgdexId)) {
        approvedCustomExceptions += 1;
        issues.push({
          name: set.name,
          code: set.code,
          tcgdexId: set.tcgdexId,
          status: "approved_custom_exception",
        });
        continue;
      }

      invalidTcgdexId += 1;
      const suggested = apiByName.get(set.name.toLowerCase());
      issues.push({
        name: set.name,
        code: set.code,
        tcgdexId: set.tcgdexId,
        status: suggested ? "invalid_tcgdex_id" : "name_not_found_in_tcgdex",
        suggestedTcgdexId: suggested,
      });
    }

    const dbTcgdexIds = new Set(dbSets.map((set) => set.tcgdexId).filter(Boolean));
    const tcgdexMissingInDb = apiSets
      .filter((set) => !!set && typeof set.id === "string" && !dbTcgdexIds.has(set.id.trim()))
      .map((set) => ({ id: String(set.id), name: typeof set.name === "string" ? set.name : "" }));

    const report = {
      summary: {
        dbSets: dbSets.length,
        tcgdexSets: apiSets.length,
        exactTcgdexIdMatches: exactMatches,
        approvedCustomExceptions,
        missingTcgdexId,
        invalidTcgdexId,
        tcgdexSetsMissingInDb: tcgdexMissingInDb.length,
      },
      approvedCustomSetIds: Array.from(APPROVED_CUSTOM_SET_IDS),
      issues,
      tcgdexMissingInDbSample: tcgdexMissingInDb.slice(0, 100),
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await payload.destroy();
  }
}

auditSetTcgdexIds().catch((error) => {
  console.error(error);
  process.exit(1);
});
