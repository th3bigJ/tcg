import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "series" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "tcgdex_series_id" varchar,
        "is_active" boolean DEFAULT true,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "series_name_idx" ON "series" USING btree ("name");
      CREATE UNIQUE INDEX IF NOT EXISTS "series_slug_idx" ON "series" USING btree ("slug");
      CREATE INDEX IF NOT EXISTS "series_updated_at_idx" ON "series" USING btree ("updated_at");
      CREATE INDEX IF NOT EXISTS "series_created_at_idx" ON "series" USING btree ("created_at");
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DROP TABLE IF EXISTS "series" CASCADE;
    `),
  );
}
