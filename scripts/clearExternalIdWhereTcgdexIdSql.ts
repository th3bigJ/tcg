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
      WHERE COALESCE(TRIM("tcgdex_id"), '') <> ''
        AND COALESCE("external_id", '') <> ''
    `));
    const beforeCount = Number(before.rows?.[0]?.count ?? 0);

    await payload.db.drizzle.execute(sql.raw(`
      UPDATE "master_card_list"
      SET "external_id" = ''
      WHERE COALESCE(TRIM("tcgdex_id"), '') <> ''
        AND COALESCE("external_id", '') <> ''
    `));

    const after = await payload.db.drizzle.execute(sql.raw(`
      SELECT COUNT(*)::int AS count
      FROM "master_card_list"
      WHERE COALESCE(TRIM("tcgdex_id"), '') <> ''
        AND COALESCE("external_id", '') <> ''
    `));
    const afterCount = Number(after.rows?.[0]?.count ?? 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          updated: beforeCount - afterCount,
          remaining: afterCount,
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

