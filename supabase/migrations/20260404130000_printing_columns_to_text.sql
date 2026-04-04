-- Use unrestricted text for variant names so new TCG finishes never require enum migrations.
-- Safe to run once; `USING col::text` preserves existing enum labels as strings.

ALTER TABLE customer_collections
  ALTER COLUMN printing TYPE text USING printing::text;

ALTER TABLE customer_wishlists
  ALTER COLUMN target_printing TYPE text USING target_printing::text;
