import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "catalog_card_pricing";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "${TABLE}" DROP COLUMN IF EXISTS "tcgplayer_price";`));
  await db.execute(sql.raw(`ALTER TABLE "${TABLE}" DROP COLUMN IF EXISTS "cardmarket_price";`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "tcgplayer_price" jsonb;`));
  await db.execute(sql.raw(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "cardmarket_price" jsonb;`));
}
