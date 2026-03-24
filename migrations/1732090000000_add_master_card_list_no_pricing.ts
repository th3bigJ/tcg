import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";
const COLUMN = "no_pricing";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const columnCheck = await db.execute(
    sql.raw(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = '${TABLE}'
        AND column_name = '${COLUMN}'
      LIMIT 1
    `),
  );

  if ((columnCheck.rows?.length ?? 0) === 0) {
    await db.execute(
      sql.raw(`
        ALTER TABLE "${TABLE}"
          ADD COLUMN "${COLUMN}" boolean DEFAULT false NOT NULL
      `),
    );
  }
}

export async function down({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "${COLUMN}"
    `),
  );
}
