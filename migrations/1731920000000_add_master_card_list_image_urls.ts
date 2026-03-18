import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "image_high_url" text,
        ADD COLUMN IF NOT EXISTS "image_low_url" text
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "image_high_url",
        DROP COLUMN IF EXISTS "image_low_url"
    `),
  );
}
