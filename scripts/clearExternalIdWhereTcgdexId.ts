import nextEnvImport from "@next/env";

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const limit = 500;
    let page = 1;
    let totalPages = 1;
    let scanned = 0;
    let updated = 0;

    while (page <= totalPages) {
      const result = await payload.find({
        collection: "master-card-list",
        limit,
        page,
        depth: 0,
        overrideAccess: true,
        select: { id: true, tcgdex_id: true, externalId: true },
      });
      totalPages = result.totalPages || 1;

      for (const doc of result.docs as Array<Record<string, unknown>>) {
        scanned += 1;
        const tcgdexId =
          typeof doc.tcgdex_id === "string" ? doc.tcgdex_id.trim() : "";
        if (!tcgdexId) continue;

        const currentExternal =
          typeof doc.externalId === "string" ? doc.externalId : "";
        if (currentExternal === "") continue;

        await payload.update({
          collection: "master-card-list",
          id: String(doc.id),
          data: { externalId: "" },
          overrideAccess: true,
        });
        updated += 1;
      }

      if (page % 10 === 0) {
        console.log(
          `Progress page ${page}/${totalPages} scanned=${scanned} updated=${updated}`,
        );
      }
      page += 1;
    }

    console.log(JSON.stringify({ ok: true, scanned, updated }, null, 2));
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

