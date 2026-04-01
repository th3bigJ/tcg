-- Per-customer UI preferences (grid density, etc.)

CREATE TABLE IF NOT EXISTS public.customer_preferences (
  customer_id integer PRIMARY KEY REFERENCES public.customers (id) ON DELETE CASCADE,
  grid_columns_mobile smallint NOT NULL DEFAULT 3
    CONSTRAINT customer_preferences_grid_columns_mobile_chk CHECK (
      grid_columns_mobile >= 1 AND grid_columns_mobile <= 4
    ),
  grid_columns_desktop smallint NOT NULL DEFAULT 7
    CONSTRAINT customer_preferences_grid_columns_desktop_chk CHECK (
      grid_columns_desktop >= 3 AND grid_columns_desktop <= 10
    ),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_preferences_updated_at_idx
  ON public.customer_preferences (updated_at DESC);

ALTER TABLE public.customer_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_preferences_select_own" ON public.customer_preferences;
DROP POLICY IF EXISTS "customer_preferences_insert_own" ON public.customer_preferences;
DROP POLICY IF EXISTS "customer_preferences_update_own" ON public.customer_preferences;

CREATE POLICY "customer_preferences_select_own"
ON public.customer_preferences
FOR SELECT
TO authenticated
USING (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "customer_preferences_insert_own"
ON public.customer_preferences
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "customer_preferences_update_own"
ON public.customer_preferences
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
)
WITH CHECK (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);
