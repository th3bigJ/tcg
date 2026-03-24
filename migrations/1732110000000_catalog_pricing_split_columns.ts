import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "catalog_card_pricing" ADD COLUMN IF NOT EXISTS "tcgplayer_price" jsonb;`),
  );
  await db.execute(
    sql.raw(`ALTER TABLE "catalog_card_pricing" ADD COLUMN IF NOT EXISTS "cardmarket_price" jsonb;`),
  );
  await db.execute(
    sql.raw(`ALTER TABLE "catalog_card_pricing" ADD COLUMN IF NOT EXISTS "external_price" jsonb;`),
  );
  await db.execute(sql.raw(`ALTER TABLE "catalog_card_pricing" DROP COLUMN IF EXISTS "pricing_gbp";`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "catalog_card_pricing" ADD COLUMN IF NOT EXISTS "pricing_gbp" jsonb;`));
  await db.execute(sql.raw(`ALTER TABLE "catalog_card_pricing" DROP COLUMN IF EXISTS "tcgplayer_price";`));
  await db.execute(sql.raw(`ALTER TABLE "catalog_card_pricing" DROP COLUMN IF EXISTS "cardmarket_price";`));
  await db.execute(sql.raw(`ALTER TABLE "catalog_card_pricing" DROP COLUMN IF EXISTS "external_price";`));
}
