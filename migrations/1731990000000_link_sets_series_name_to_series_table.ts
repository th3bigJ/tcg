import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

const SETS_TABLE = "sets";
const SERIES_TABLE = "series";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      -- Ensure a relationship column exists on sets for series.
      ALTER TABLE "${SETS_TABLE}"
        ADD COLUMN IF NOT EXISTS "serie_name_id" integer;

      -- If legacy text column exists, create series rows and backfill relation ids.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${SETS_TABLE}'
            AND column_name = 'serie_name'
        ) THEN
          INSERT INTO "${SERIES_TABLE}" ("name", "slug", "is_active", "created_at", "updated_at")
          SELECT DISTINCT
            TRIM(s."serie_name") AS "name",
            CONCAT(
              REGEXP_REPLACE(LOWER(TRIM(s."serie_name")), '[^a-z0-9]+', '-', 'g'),
              '-',
              SUBSTRING(MD5(TRIM(s."serie_name")) FROM 1 FOR 6)
            ) AS "slug",
            true,
            NOW(),
            NOW()
          FROM "${SETS_TABLE}" s
          WHERE s."serie_name" IS NOT NULL
            AND TRIM(s."serie_name") <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM "${SERIES_TABLE}" r
              WHERE LOWER(r."name") = LOWER(TRIM(s."serie_name"))
            );

          UPDATE "${SETS_TABLE}" s
          SET "serie_name_id" = r."id"
          FROM "${SERIES_TABLE}" r
          WHERE s."serie_name" IS NOT NULL
            AND TRIM(s."serie_name") <> ''
            AND LOWER(r."name") = LOWER(TRIM(s."serie_name"));
        END IF;
      END $$;

      -- Backfill via TCGdex ids first: sets.serie_id -> series.tcgdex_series_id.
      WITH series_by_tcgdex AS (
        SELECT DISTINCT ON (LOWER(TRIM("tcgdex_series_id")))
          "id",
          LOWER(TRIM("tcgdex_series_id")) AS tcgdex_key
        FROM "${SERIES_TABLE}"
        WHERE "tcgdex_series_id" IS NOT NULL
          AND TRIM("tcgdex_series_id") <> ''
        ORDER BY LOWER(TRIM("tcgdex_series_id")), "id"
      )
      UPDATE "${SETS_TABLE}" s
      SET "serie_name_id" = r."id"
      FROM series_by_tcgdex r
      WHERE s."serie_id" IS NOT NULL
        AND TRIM(s."serie_id") <> ''
        AND LOWER(TRIM(s."serie_id")) = r.tcgdex_key
        AND s."serie_name_id" IS NULL;

      -- Normalize column type and values before adding FK.
      DO $$
      DECLARE
        serie_name_id_data_type text;
      BEGIN
        SELECT data_type
        INTO serie_name_id_data_type
        FROM information_schema.columns
        WHERE table_name = '${SETS_TABLE}'
          AND column_name = 'serie_name_id';

        -- If a previous run created the column with a text-like type, coerce safely.
        IF serie_name_id_data_type IN ('character varying', 'text') THEN
          ALTER TABLE "${SETS_TABLE}"
            ALTER COLUMN "serie_name_id" TYPE integer
            USING (
              CASE
                WHEN TRIM("serie_name_id") ~ '^[0-9]+$' THEN TRIM("serie_name_id")::integer
                ELSE NULL
              END
            );
        ELSIF serie_name_id_data_type = 'numeric' THEN
          ALTER TABLE "${SETS_TABLE}"
            ALTER COLUMN "serie_name_id" TYPE integer
            USING (
              CASE
                WHEN "serie_name_id" IS NULL THEN NULL
                ELSE "serie_name_id"::integer
              END
            );
        END IF;
      END $$;

      -- Null out broken references so FK can be added safely.
      UPDATE "${SETS_TABLE}" s
      SET "serie_name_id" = NULL
      WHERE s."serie_name_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM "${SERIES_TABLE}" r
          WHERE r."id" = s."serie_name_id"
        );

      -- Add FK + index.
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'sets_serie_name_id_series_id_fk'
        ) THEN
          ALTER TABLE "${SETS_TABLE}"
            ADD CONSTRAINT "sets_serie_name_id_series_id_fk"
            FOREIGN KEY ("serie_name_id")
            REFERENCES "${SERIES_TABLE}"("id")
            ON DELETE SET NULL
            ON UPDATE NO ACTION;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS "sets_serie_name_idx"
        ON "${SETS_TABLE}" USING btree ("serie_name_id");

      -- Remove old text column if it exists.
      ALTER TABLE "${SETS_TABLE}"
        DROP COLUMN IF EXISTS "serie_name";
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      ALTER TABLE "${SETS_TABLE}"
        ADD COLUMN IF NOT EXISTS "serie_name" varchar;

      -- Restore text from relationship if the relationship column exists.
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = '${SETS_TABLE}'
            AND column_name = 'serie_name_id'
        ) THEN
          UPDATE "${SETS_TABLE}" s
          SET "serie_name" = r."name"
          FROM "${SERIES_TABLE}" r
          WHERE s."serie_name_id" = r."id"
            AND (s."serie_name" IS NULL OR TRIM(s."serie_name") = '');
        END IF;
      END $$;

      ALTER TABLE "${SETS_TABLE}"
        DROP CONSTRAINT IF EXISTS "sets_serie_name_id_series_id_fk";
      DROP INDEX IF EXISTS "sets_serie_name_idx";
      ALTER TABLE "${SETS_TABLE}"
        DROP COLUMN IF EXISTS "serie_name_id";
    `),
  );
}
