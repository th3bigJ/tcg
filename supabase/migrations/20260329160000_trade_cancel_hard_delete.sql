-- Cancelled trades are removed entirely; keep in-app notifications by nulling trade_id on delete.

ALTER TABLE public.customer_trade_notifications
  DROP CONSTRAINT IF EXISTS customer_trade_notifications_trade_id_fkey;

ALTER TABLE public.customer_trade_notifications
  ALTER COLUMN trade_id DROP NOT NULL;

ALTER TABLE public.customer_trade_notifications
  ADD CONSTRAINT customer_trade_notifications_trade_id_fkey
  FOREIGN KEY (trade_id)
  REFERENCES public.customer_profile_share_trades(id)
  ON DELETE SET NULL;

DELETE FROM public.customer_profile_share_trades
WHERE status = 'cancelled';

ALTER TABLE public.customer_profile_share_trades
  DROP CONSTRAINT IF EXISTS customer_profile_share_trades_status_check;

ALTER TABLE public.customer_profile_share_trades
  ADD CONSTRAINT customer_profile_share_trades_status_check
  CHECK (
    status IN ('draft', 'offered', 'accepted', 'completed', 'declined')
  );

DROP POLICY IF EXISTS "profile_share_trades_delete" ON public.customer_profile_share_trades;

CREATE POLICY "profile_share_trades_delete"
ON public.customer_profile_share_trades
FOR DELETE
TO authenticated
USING (
  (
    initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
    AND status IN ('draft', 'offered')
  )
  OR
  (
    counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
    AND status = 'offered'
  )
);
