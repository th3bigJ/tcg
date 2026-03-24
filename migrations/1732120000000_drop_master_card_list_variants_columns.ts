import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "variants_first_edition",
        DROP COLUMN IF EXISTS "variants_holo",
        DROP COLUMN IF EXISTS "variants_normal",
        DROP COLUMN IF EXISTS "variants_reverse",
        DROP COLUMN IF EXISTS "variants_w_promo"
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "variants_first_edition" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "variants_holo" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "variants_normal" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "variants_reverse" boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS "variants_w_promo" boolean DEFAULT false
    `),
  );
}
