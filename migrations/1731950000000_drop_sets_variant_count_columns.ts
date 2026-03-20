import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "sets";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "card_count_first_ed",
        DROP COLUMN IF EXISTS "card_count_holo",
        DROP COLUMN IF EXISTS "card_count_normal",
        DROP COLUMN IF EXISTS "card_count_reverse"
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "card_count_first_ed" numeric,
        ADD COLUMN IF NOT EXISTS "card_count_holo" numeric,
        ADD COLUMN IF NOT EXISTS "card_count_normal" numeric,
        ADD COLUMN IF NOT EXISTS "card_count_reverse" numeric
    `),
  );
}
