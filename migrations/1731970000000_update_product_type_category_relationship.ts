import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "product_categories"
        DROP CONSTRAINT IF EXISTS "product_categories_parent_category_id_product_categories_id_fk";
      ALTER TABLE "product_categories"
        DROP COLUMN IF EXISTS "parent_category_id";

      ALTER TABLE "product_types"
        ADD COLUMN IF NOT EXISTS "product_category_id" integer;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'product_types_product_category_id_product_categories_id_fk'
        ) THEN
          ALTER TABLE "product_types"
            ADD CONSTRAINT "product_types_product_category_id_product_categories_id_fk"
            FOREIGN KEY ("product_category_id")
            REFERENCES "product_categories"("id")
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "product_types_product_category_idx"
        ON "product_types" USING btree ("product_category_id");
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "product_types"
        DROP CONSTRAINT IF EXISTS "product_types_product_category_id_product_categories_id_fk";
      DROP INDEX IF EXISTS "product_types_product_category_idx";
      ALTER TABLE "product_types"
        DROP COLUMN IF EXISTS "product_category_id";

      ALTER TABLE "product_categories"
        ADD COLUMN IF NOT EXISTS "parent_category_id" integer;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'product_categories_parent_category_id_product_categories_id_fk'
        ) THEN
          ALTER TABLE "product_categories"
            ADD CONSTRAINT "product_categories_parent_category_id_product_categories_id_fk"
            FOREIGN KEY ("parent_category_id")
            REFERENCES "product_categories"("id")
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "product_categories_parent_category_idx"
        ON "product_categories" USING btree ("parent_category_id");
    `),
  );
}
