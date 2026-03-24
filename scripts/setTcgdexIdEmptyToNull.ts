import nextEnvImport from "@next/env";
import { sql } from "@payloadcms/db-postgres";

async function run() {
  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const before = await payload.db.drizzle.execute(sql.raw(`
      SELECT COUNT(*)::int AS count
      FROM "master_card_list"
      WHERE "tcgdex_id" IS NOT NULL
        AND COALESCE(TRIM("tcgdex_id"), '') = ''
    `));
    const beforeCount = Number(before.rows?.[0]?.count ?? 0);

    await payload.db.drizzle.execute(sql.raw(`
      UPDATE "master_card_list"
      SET "tcgdex_id" = NULL
      WHERE "tcgdex_id" IS NOT NULL
        AND COALESCE(TRIM("tcgdex_id"), '') = ''
    `));

    const after = await payload.db.drizzle.execute(sql.raw(`
      SELECT COUNT(*)::int AS count
      FROM "master_card_list"
      WHERE "tcgdex_id" IS NOT NULL
        AND COALESCE(TRIM("tcgdex_id"), '') = ''
    `));
    const afterCount = Number(after.rows?.[0]?.count ?? 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          updated: beforeCount - afterCount,
          remainingEmptyStrings: afterCount,
        },
        null,
        2,
      ),
    );
  } finally {
    await payload.destroy();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

