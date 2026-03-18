import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const TABLE = "master_card_list";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Add jsonb columns to the main table so all data lives in one place
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "subtypes" jsonb,
        ADD COLUMN IF NOT EXISTS "element_types" jsonb,
        ADD COLUMN IF NOT EXISTS "dex_id" jsonb,
        ADD COLUMN IF NOT EXISTS "attacks" jsonb,
        ADD COLUMN IF NOT EXISTS "weaknesses" jsonb
    `),
  );

  // Drop join tables created by array/hasMany fields (data now in main table json columns)
  const joinTables = [
    "master_card_list_attacks",
    "master_card_list_dex_id",
    "master_card_list_weaknesses",
    "master_card_list_texts",
    "master_card_list_subtypes",
    "master_card_list_element_types",
  ];
  for (const name of joinTables) {
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${name}" CASCADE`));
  }

  // attacks may have a nested cost table
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "master_card_list_attacks_cost" CASCADE`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${TABLE}"
        DROP COLUMN IF EXISTS "subtypes",
        DROP COLUMN IF EXISTS "element_types",
        DROP COLUMN IF EXISTS "dex_id",
        DROP COLUMN IF EXISTS "attacks",
        DROP COLUMN IF EXISTS "weaknesses"
    `),
  );
}
