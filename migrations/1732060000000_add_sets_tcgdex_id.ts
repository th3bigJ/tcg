import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "sets";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columnCheck = await db.execute(
    sql.raw(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = '${TABLE}'
        AND column_name = 'tcgdex_id'
      LIMIT 1
    `),
  );

  if ((columnCheck.rows?.length ?? 0) === 0) {
    await db.execute(
      sql.raw(`
        ALTER TABLE "${TABLE}"
          ADD COLUMN "tcgdex_id" text
      `),
    );
  }

  const indexCheck = await db.execute(
    sql.raw(`
      SELECT 1
      FROM pg_indexes
      WHERE tablename = '${TABLE}'
        AND indexname = '${TABLE}_tcgdex_id_idx'
      LIMIT 1
    `),
  );

  if ((indexCheck.rows?.length ?? 0) === 0) {
    await db.execute(
      sql.raw(`
        CREATE UNIQUE INDEX "${TABLE}_tcgdex_id_idx"
        ON "${TABLE}" ("tcgdex_id")
        WHERE "tcgdex_id" IS NOT NULL
      `),
    );
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "${TABLE}_tcgdex_id_idx"
    `),
  );

  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "tcgdex_id"
    `),
  );
}
