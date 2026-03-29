-- customer_profile_shares RLS: owner / recipient / email-link updates
-- Idempotent: safe to re-run (drops policies by name first).

ALTER TABLE public.customer_profile_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_profile_shares_select_authenticated" ON public.customer_profile_shares;
DROP POLICY IF EXISTS "customer_profile_shares_insert_authenticated" ON public.customer_profile_shares;
DROP POLICY IF EXISTS "customer_profile_shares_update_authenticated" ON public.customer_profile_shares;

CREATE POLICY "customer_profile_shares_select_authenticated"
ON public.customer_profile_shares
FOR SELECT
TO authenticated
USING (
  owner_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR recipient_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "customer_profile_shares_insert_authenticated"
ON public.customer_profile_shares
FOR INSERT
TO authenticated
WITH CHECK (
  owner_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "customer_profile_shares_update_authenticated"
ON public.customer_profile_shares
FOR UPDATE
TO authenticated
USING (
  owner_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR recipient_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR (
    recipient_customer_id IS NULL
    AND lower(btrim(recipient_email::text)) = lower(btrim(COALESCE((SELECT c.email FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1), '')))
  )
)
WITH CHECK (
  owner_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR recipient_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR (
    recipient_customer_id IS NULL
    AND lower(btrim(recipient_email::text)) = lower(btrim(COALESCE((SELECT c.email FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1), '')))
  )
);
