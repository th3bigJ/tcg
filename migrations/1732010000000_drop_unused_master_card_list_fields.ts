import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "attacks",
        DROP COLUMN IF EXISTS "weaknesses",
        DROP COLUMN IF EXISTS "retreat",
        DROP COLUMN IF EXISTS "legal_standard",
        DROP COLUMN IF EXISTS "legal_expanded",
        DROP COLUMN IF EXISTS "notes"
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "attacks" jsonb,
        ADD COLUMN IF NOT EXISTS "weaknesses" jsonb,
        ADD COLUMN IF NOT EXISTS "retreat" numeric,
        ADD COLUMN IF NOT EXISTS "legal_standard" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "legal_expanded" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "notes" varchar
    `),
  );
}
