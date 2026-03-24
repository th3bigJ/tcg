import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "catalog_card_pricing";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "tcgdex_id" varchar,
        ADD COLUMN IF NOT EXISTS "external_pricing" jsonb
    `),
  );

  await db.execute(
    sql.raw(`
      CREATE INDEX IF NOT EXISTS "catalog_card_pricing_tcgdex_id_idx"
        ON "${TABLE}" USING btree ("tcgdex_id")
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`DROP INDEX IF EXISTS "catalog_card_pricing_tcgdex_id_idx"`),
  );
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "external_pricing",
        DROP COLUMN IF EXISTS "tcgdex_id"
    `),
  );
}
