import nextEnvImport from "@next/env";
import { sql } from "@payloadcms/db-postgres";

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const value = arg.slice(prefix.length).trim();
  return value || undefined;
}

async function run() {
  const setTcgdexId = getArgValue("set-tcgdex-id");
  if (!setTcgdexId) {
    console.error("Missing required flag: --set-tcgdex-id=<id>");
    process.exit(1);
  }

  const { loadEnvConfig } = nextEnvImport as {
    loadEnvConfig: (dir: string, dev: boolean) => unknown;
  };
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

  const payloadConfig = (await import("../payload.config")).default;
  const { getPayload } = await import("payload");
  const payload = await getPayload({ config: payloadConfig });

  try {
    const before = await payload.db.drizzle.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM "master_card_list" m
      INNER JOIN "sets" s ON s.id = m.set_id
      WHERE s.tcgdex_id = ${setTcgdexId}
        AND COALESCE(TRIM(m.tcgdex_id), '') <> ''
        AND m.external_id IS NOT NULL
    `);
    const beforeCount = Number(before.rows?.[0]?.count ?? 0);

    await payload.db.drizzle.execute(sql`
      UPDATE "master_card_list" m
      SET external_id = NULL
      FROM "sets" s
      WHERE s.id = m.set_id
        AND s.tcgdex_id = ${setTcgdexId}
        AND COALESCE(TRIM(m.tcgdex_id), '') <> ''
        AND m.external_id IS NOT NULL
    `);

    const after = await payload.db.drizzle.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM "master_card_list" m
      INNER JOIN "sets" s ON s.id = m.set_id
      WHERE s.tcgdex_id = ${setTcgdexId}
        AND COALESCE(TRIM(m.tcgdex_id), '') <> ''
        AND m.external_id IS NOT NULL
    `);
    const afterCount = Number(after.rows?.[0]?.count ?? 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          setTcgdexId,
          updated: beforeCount - afterCount,
          remainingNonNullExternalId: afterCount,
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

