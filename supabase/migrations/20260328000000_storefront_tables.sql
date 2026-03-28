-- ============================================================
-- Storefront tables to replace Payload CMS collections
-- Run this in the Supabase SQL editor or via supabase CLI
--
-- item_conditions and product_types are NOT tables — they are
-- static reference data baked into the application code at
-- lib/referenceData.ts. condition_id and product_type_id store
-- the slug directly as a plain text value (e.g. 'near-mint').
-- ============================================================

-- ── Customer profiles ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email            text NOT NULL,
  first_name       text NOT NULL DEFAULT '',
  last_name        text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_supabase_user_id_idx ON customers(supabase_user_id);

-- ── Customer collections (cards owned) ───────────────────────

CREATE TABLE IF NOT EXISTS customer_collections (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  master_card_id   text NOT NULL,
  condition_id     text,                  -- slug from lib/referenceData ITEM_CONDITIONS
  printing         text NOT NULL DEFAULT 'Standard',
  language         text NOT NULL DEFAULT 'English',
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  purchase_type    text CHECK (purchase_type IN ('packed', 'bought')),
  price_paid       numeric(10,2) CHECK (price_paid >= 0),
  grading_company  text NOT NULL DEFAULT 'none',
  grade_value      text,
  notes            text,
  added_at         timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_collections_customer_id_idx ON customer_collections(customer_id);
CREATE INDEX IF NOT EXISTS customer_collections_master_card_id_idx ON customer_collections(master_card_id);

-- ── Customer wishlists ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_wishlists (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  master_card_id      text NOT NULL,
  target_condition_id text,              -- slug from lib/referenceData ITEM_CONDITIONS
  target_printing     text,
  max_price           numeric(10,2) CHECK (max_price >= 0),
  priority            text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  notes               text,
  added_at            timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_wishlists_customer_id_idx ON customer_wishlists(customer_id);
CREATE INDEX IF NOT EXISTS customer_wishlists_master_card_id_idx ON customer_wishlists(master_card_id);

-- ── Account transactions ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS account_transactions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  direction        text NOT NULL CHECK (direction IN ('purchase', 'sale')),
  product_type_id  text,                 -- slug from lib/referenceData PRODUCT_TYPES
  description      text NOT NULL,
  master_card_id   text,
  quantity         integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  unit_price       numeric(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_transactions_customer_id_idx ON account_transactions(customer_id);
CREATE INDEX IF NOT EXISTS account_transactions_transaction_date_idx ON account_transactions(transaction_date DESC);

-- ── updated_at triggers ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON customer_collections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON customer_wishlists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_collections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_wishlists    ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions  ENABLE ROW LEVEL SECURITY;

-- Customers: each user can only see/edit their own row
CREATE POLICY "Customers: own row"
  ON customers FOR ALL
  USING (supabase_user_id = auth.uid());

-- Customer collections: own rows only
CREATE POLICY "Collections: own rows"
  ON customer_collections FOR ALL
  USING (
    customer_id = (SELECT id FROM customers WHERE supabase_user_id = auth.uid())
  );

-- Customer wishlists: own rows only
CREATE POLICY "Wishlists: own rows"
  ON customer_wishlists FOR ALL
  USING (
    customer_id = (SELECT id FROM customers WHERE supabase_user_id = auth.uid())
  );

-- Account transactions: own rows only
CREATE POLICY "Transactions: own rows"
  ON account_transactions FOR ALL
  USING (
    customer_id = (SELECT id FROM customers WHERE supabase_user_id = auth.uid())
  );
