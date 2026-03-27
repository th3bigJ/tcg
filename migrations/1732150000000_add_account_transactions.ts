import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      CREATE TABLE IF NOT EXISTS "account_transactions" (
        "id" serial PRIMARY KEY NOT NULL,
        "customer_id" integer NOT NULL,
        "direction" varchar NOT NULL,
        "product_type_id" integer NOT NULL,
        "description" varchar NOT NULL,
        "master_card_id" integer,
        "quantity" integer NOT NULL DEFAULT 1,
        "unit_price" numeric(10,2) NOT NULL DEFAULT 0,
        "transaction_date" timestamp(3) with time zone NOT NULL,
        "notes" text,
        "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "account_transactions_customer_id_customers_id_fk"
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE no action,
        CONSTRAINT "account_transactions_product_type_id_product_types_id_fk"
          FOREIGN KEY ("product_type_id") REFERENCES "product_types"("id") ON DELETE restrict ON UPDATE no action,
        CONSTRAINT "account_transactions_master_card_id_master_card_list_id_fk"
          FOREIGN KEY ("master_card_id") REFERENCES "master_card_list"("id") ON DELETE set null ON UPDATE no action
      );
      CREATE INDEX IF NOT EXISTS "account_transactions_customer_idx" ON "account_transactions" USING btree ("customer_id");
      CREATE INDEX IF NOT EXISTS "account_transactions_transaction_date_idx" ON "account_transactions" USING btree ("transaction_date");
      CREATE INDEX IF NOT EXISTS "account_transactions_direction_idx" ON "account_transactions" USING btree ("direction");
      CREATE INDEX IF NOT EXISTS "account_transactions_updated_at_idx" ON "account_transactions" USING btree ("updated_at");
      CREATE INDEX IF NOT EXISTS "account_transactions_created_at_idx" ON "account_transactions" USING btree ("created_at");
    `),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`DROP TABLE IF EXISTS "account_transactions" CASCADE;`),
  );
}
