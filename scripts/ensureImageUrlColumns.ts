/**
 * One-off: ensure master_card_list has image_high_url and image_low_url columns.
 * Run: node --import tsx/esm scripts/ensureImageUrlColumns.ts
 */
import nextEnvImport from "@next/env";
import pg from "pg";

const { loadEnvConfig } = nextEnvImport as { loadEnvConfig: (dir: string, dev: boolean) => unknown };
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

const connectionString = process.env.DATABASE_URI;
if (!connectionString) {
  console.error("DATABASE_URI is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

await client.query(`
  ALTER TABLE "master_card_list"
    ADD COLUMN IF NOT EXISTS "image_high_url" text,
    ADD COLUMN IF NOT EXISTS "image_low_url" text
`);
console.log('Ensured columns image_high_url and image_low_url on master_card_list.');
await client.end();
process.exit(0);
