import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "catalog_card_pricing" (
        "id" serial PRIMARY KEY NOT NULL,
        "master_card_id" integer NOT NULL,
        "external_id" varchar NOT NULL,
        "set_code" varchar NOT NULL,
        "pricing_gbp" jsonb NOT NULL,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "catalog_card_pricing_master_card_id_fk"
          FOREIGN KEY ("master_card_id") REFERENCES "public"."master_card_list"("id")
          ON DELETE cascade ON UPDATE no action
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "catalog_card_pricing_external_id_idx" ON "catalog_card_pricing" USING btree ("external_id");
      CREATE INDEX IF NOT EXISTS "catalog_card_pricing_master_card_idx" ON "catalog_card_pricing" USING btree ("master_card_id");
      CREATE INDEX IF NOT EXISTS "catalog_card_pricing_set_code_idx" ON "catalog_card_pricing" USING btree ("set_code");
      CREATE INDEX IF NOT EXISTS "catalog_card_pricing_updated_at_idx" ON "catalog_card_pricing" USING btree ("updated_at");
      CREATE INDEX IF NOT EXISTS "catalog_card_pricing_created_at_idx" ON "catalog_card_pricing" USING btree ("created_at");
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "catalog_card_pricing" CASCADE;`));
}
