import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "media" CASCADE`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Media collection was removed; down migration does not recreate the table.
  // Re-add the Media collection in Payload config and run migrate:create if you need to restore it.
}
