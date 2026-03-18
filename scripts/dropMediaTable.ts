/**
 * One-off script: DROP the media table. Run with:
 *   node --import tsx/esm scripts/dropMediaTable.ts
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
await client.query('DROP TABLE IF EXISTS "media" CASCADE');
console.log('Dropped table "media".');
await client.end();
process.exit(0);
