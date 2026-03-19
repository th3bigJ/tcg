import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Ensures relationship columns and foreign keys exist for Brands ↔ Sets ↔ Master Card List.
 * Safe to run multiple times (uses IF NOT EXISTS / exception handling).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Sets.brand → Brands
  await db.execute(
    sql.raw(`
      ALTER TABLE "sets"
        ADD COLUMN IF NOT EXISTS "brand_id" integer
    `),
  );
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sets_brand_id_brands_id_fk'
        ) THEN
          ALTER TABLE "sets"
            ADD CONSTRAINT "sets_brand_id_brands_id_fk"
            FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$
    `),
  );
  await db.execute(
    sql.raw(`CREATE INDEX IF NOT EXISTS "sets_brand_idx" ON "sets" USING btree ("brand_id")`),
  );

  // 2. Master Card List.brand → Brands
  await db.execute(
    sql.raw(`
      ALTER TABLE "master_card_list"
        ADD COLUMN IF NOT EXISTS "brand_id" integer
    `),
  );
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'master_card_list_brand_id_brands_id_fk'
        ) THEN
          ALTER TABLE "master_card_list"
            ADD CONSTRAINT "master_card_list_brand_id_brands_id_fk"
            FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$
    `),
  );
  await db.execute(
    sql.raw(`CREATE INDEX IF NOT EXISTS "master_card_list_brand_idx" ON "master_card_list" USING btree ("brand_id")`),
  );

  // 3. Master Card List.set → Sets
  await db.execute(
    sql.raw(`
      ALTER TABLE "master_card_list"
        ADD COLUMN IF NOT EXISTS "set_id" integer
    `),
  );
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'master_card_list_set_id_sets_id_fk'
        ) THEN
          ALTER TABLE "master_card_list"
            ADD CONSTRAINT "master_card_list_set_id_sets_id_fk"
            FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
        END IF;
      END $$
    `),
  );
  await db.execute(
    sql.raw(`CREATE INDEX IF NOT EXISTS "master_card_list_set_idx" ON "master_card_list" USING btree ("set_id")`),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "master_card_list" DROP CONSTRAINT IF EXISTS "master_card_list_set_id_sets_id_fk";
      ALTER TABLE "master_card_list" DROP CONSTRAINT IF EXISTS "master_card_list_brand_id_brands_id_fk";
      ALTER TABLE "sets" DROP CONSTRAINT IF EXISTS "sets_brand_id_brands_id_fk";
    `),
  );
  await db.execute(
    sql.raw(`
      ALTER TABLE "master_card_list" DROP COLUMN IF EXISTS "set_id", DROP COLUMN IF EXISTS "brand_id";
      ALTER TABLE "sets" DROP COLUMN IF EXISTS "brand_id";
    `),
  );
  await db.execute(
    sql.raw(`
      DROP INDEX IF EXISTS "master_card_list_set_idx";
      DROP INDEX IF EXISTS "master_card_list_brand_idx";
      DROP INDEX IF EXISTS "sets_brand_idx";
    `),
  );
}
