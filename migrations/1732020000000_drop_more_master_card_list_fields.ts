import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "item_name",
        DROP COLUMN IF EXISTS "item_effect",
        DROP COLUMN IF EXISTS "description",
        DROP COLUMN IF EXISTS "effect"
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "item_name" varchar,
        ADD COLUMN IF NOT EXISTS "item_effect" varchar,
        ADD COLUMN IF NOT EXISTS "description" varchar,
        ADD COLUMN IF NOT EXISTS "effect" varchar
    `),
  );
}
