import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "boosters",
        DROP COLUMN IF EXISTS "pricing",
        DROP COLUMN IF EXISTS "updated"
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "boosters" jsonb,
        ADD COLUMN IF NOT EXISTS "pricing" jsonb,
        ADD COLUMN IF NOT EXISTS "updated" timestamp(3) with time zone
    `),
  );
}
