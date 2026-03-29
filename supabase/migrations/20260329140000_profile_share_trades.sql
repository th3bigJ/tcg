-- Peer trades for active profile shares: trades, line items per revision, in-app notifications, completion RPC.

CREATE TABLE public.customer_profile_share_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid NOT NULL REFERENCES public.customer_profile_shares(id) ON DELETE RESTRICT,
  initiator_customer_id integer NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  counterparty_customer_id integer NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (
    status IN ('draft', 'offered', 'accepted', 'completed', 'declined', 'cancelled')
  ),
  revision integer NOT NULL DEFAULT 1,
  initiator_agreed_revision integer NOT NULL DEFAULT 0,
  counterparty_agreed_revision integer NOT NULL DEFAULT 0,
  initiator_money_gbp numeric(12, 2),
  counterparty_money_gbp numeric(12, 2),
  initiator_exchange_confirmed_at timestamptz,
  counterparty_exchange_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_profile_share_trades_distinct_parties CHECK (initiator_customer_id <> counterparty_customer_id),
  CONSTRAINT chk_profile_share_trades_revision_positive CHECK (revision >= 1)
);

CREATE INDEX idx_profile_share_trades_share_id ON public.customer_profile_share_trades(share_id);
CREATE INDEX idx_profile_share_trades_initiator ON public.customer_profile_share_trades(initiator_customer_id);
CREATE INDEX idx_profile_share_trades_counterparty ON public.customer_profile_share_trades(counterparty_customer_id);

CREATE TABLE public.customer_profile_share_trade_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.customer_profile_share_trades(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  line_role text NOT NULL CHECK (line_role IN ('initiator_offers', 'initiator_requests')),
  customer_collection_id integer NOT NULL REFERENCES public.customer_collections(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_profile_share_trade_lines_revision_positive CHECK (revision >= 1)
);

CREATE INDEX idx_profile_share_trade_lines_trade_rev ON public.customer_profile_share_trade_lines(trade_id, revision);

CREATE TABLE public.customer_trade_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id integer NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.customer_profile_share_trades(id) ON DELETE CASCADE,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_trade_notifications_customer ON public.customer_trade_notifications(customer_id, created_at DESC);
CREATE INDEX idx_customer_trade_notifications_trade ON public.customer_trade_notifications(trade_id);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: move inventory when both parties confirmed physical exchange.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._transfer_collection_qty(
  p_collection_line_id integer,
  p_to_customer integer,
  p_qty integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src public.customer_collections%ROWTYPE;
  v_new_q integer;
  v_grade text;
BEGIN
  IF p_qty < 1 THEN
    RAISE EXCEPTION 'Invalid quantity';
  END IF;

  SELECT * INTO v_src
  FROM public.customer_collections
  WHERE id = p_collection_line_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Collection line not found';
  END IF;

  IF v_src.quantity IS NULL OR v_src.quantity < p_qty THEN
    RAISE EXCEPTION 'Insufficient quantity';
  END IF;

  v_new_q := v_src.quantity - p_qty;

  IF v_new_q > 0 THEN
    UPDATE public.customer_collections
    SET quantity = v_new_q
    WHERE id = p_collection_line_id;
  ELSE
    DELETE FROM public.customer_collections
    WHERE id = p_collection_line_id;
  END IF;

  v_grade := COALESCE(NULLIF(trim(both from coalesce(v_src.grading_company::text, '')), ''), 'none');

  INSERT INTO public.customer_collections (
    customer_id,
    master_card_id,
    condition_id,
    quantity,
    printing,
    language,
    purchase_type,
    price_paid,
    added_at,
    grading_company,
    grade_value,
    graded_market_price,
    unlisted_price,
    graded_image,
    graded_serial
  )
  VALUES (
    p_to_customer,
    v_src.master_card_id,
    v_src.condition_id,
    p_qty,
    COALESCE(v_src.printing, 'Standard'),
    COALESCE(v_src.language, 'English'),
    v_src.purchase_type,
    v_src.price_paid,
    now(),
    v_grade,
    v_src.grade_value,
    v_src.graded_market_price,
    v_src.unlisted_price,
    v_src.graded_image,
    v_src.graded_serial
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_profile_share_trade(p_trade_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade public.customer_profile_share_trades%ROWTYPE;
  v_line RECORD;
  v_src public.customer_collections%ROWTYPE;
  v_qty integer;
BEGIN
  SELECT * INTO v_trade
  FROM public.customer_profile_share_trades
  WHERE id = p_trade_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  IF v_trade.status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Trade must be accepted before completion';
  END IF;

  IF v_trade.initiator_exchange_confirmed_at IS NULL OR v_trade.counterparty_exchange_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Both parties must confirm the physical exchange';
  END IF;

  FOR v_line IN
    SELECT *
    FROM public.customer_profile_share_trade_lines
    WHERE trade_id = p_trade_id
      AND revision = v_trade.revision
  LOOP
    SELECT * INTO v_src
    FROM public.customer_collections
    WHERE id = v_line.customer_collection_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Collection line % not found', v_line.customer_collection_id;
    END IF;

    v_qty := v_line.quantity;
    IF v_src.quantity IS NULL OR v_src.quantity < v_qty THEN
      RAISE EXCEPTION 'Insufficient quantity on collection line %', v_line.customer_collection_id;
    END IF;

    IF v_line.line_role = 'initiator_offers' THEN
      IF v_src.customer_id IS DISTINCT FROM v_trade.initiator_customer_id THEN
        RAISE EXCEPTION 'Offer line does not belong to initiator';
      END IF;
      PERFORM public._transfer_collection_qty(v_line.customer_collection_id, v_trade.counterparty_customer_id, v_qty);
    ELSIF v_line.line_role = 'initiator_requests' THEN
      IF v_src.customer_id IS DISTINCT FROM v_trade.counterparty_customer_id THEN
        RAISE EXCEPTION 'Request line does not belong to counterparty';
      END IF;
      PERFORM public._transfer_collection_qty(v_line.customer_collection_id, v_trade.initiator_customer_id, v_qty);
    ELSE
      RAISE EXCEPTION 'Invalid line role';
    END IF;
  END LOOP;

  UPDATE public.customer_profile_share_trades
  SET
    status = 'completed',
    updated_at = now()
  WHERE id = p_trade_id;
END;
$$;

REVOKE ALL ON FUNCTION public._transfer_collection_qty(integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_profile_share_trade(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.complete_profile_share_trade(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.customer_profile_share_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profile_share_trade_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_trade_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profile_share_trades_select" ON public.customer_profile_share_trades;
DROP POLICY IF EXISTS "profile_share_trades_insert" ON public.customer_profile_share_trades;
DROP POLICY IF EXISTS "profile_share_trades_update" ON public.customer_profile_share_trades;

CREATE POLICY "profile_share_trades_select"
ON public.customer_profile_share_trades
FOR SELECT
TO authenticated
USING (
  (
    initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
    OR counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  )
  AND (
    status <> 'draft'
    OR initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  )
);

CREATE POLICY "profile_share_trades_insert"
ON public.customer_profile_share_trades
FOR INSERT
TO authenticated
WITH CHECK (
  initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "profile_share_trades_update"
ON public.customer_profile_share_trades
FOR UPDATE
TO authenticated
USING (
  initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
)
WITH CHECK (
  initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
  OR counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

DROP POLICY IF EXISTS "profile_share_trade_lines_select" ON public.customer_profile_share_trade_lines;
DROP POLICY IF EXISTS "profile_share_trade_lines_insert" ON public.customer_profile_share_trade_lines;
DROP POLICY IF EXISTS "profile_share_trade_lines_update" ON public.customer_profile_share_trade_lines;
DROP POLICY IF EXISTS "profile_share_trade_lines_delete" ON public.customer_profile_share_trade_lines;

CREATE POLICY "profile_share_trade_lines_select"
ON public.customer_profile_share_trade_lines
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_profile_share_trades t
    WHERE t.id = trade_id
      AND (
        t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
        OR t.counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
      )
      AND (
        t.status <> 'draft'
        OR t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
      )
  )
);

CREATE POLICY "profile_share_trade_lines_insert"
ON public.customer_profile_share_trade_lines
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customer_profile_share_trades t
    WHERE t.id = trade_id
      AND t.status IN ('draft', 'offered')
      AND (
        t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
        OR t.counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
      )
  )
);

CREATE POLICY "profile_share_trade_lines_update"
ON public.customer_profile_share_trade_lines
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_profile_share_trades t
    WHERE t.id = trade_id
      AND t.status IN ('draft', 'offered')
      AND (
        t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
        OR t.counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
      )
  )
);

CREATE POLICY "profile_share_trade_lines_delete"
ON public.customer_profile_share_trade_lines
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_profile_share_trades t
    WHERE t.id = trade_id
      AND t.status IN ('draft', 'offered')
      AND (
        t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
        OR t.counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
      )
  )
);

DROP POLICY IF EXISTS "customer_trade_notifications_select" ON public.customer_trade_notifications;
DROP POLICY IF EXISTS "customer_trade_notifications_insert" ON public.customer_trade_notifications;
DROP POLICY IF EXISTS "customer_trade_notifications_update" ON public.customer_trade_notifications;

CREATE POLICY "customer_trade_notifications_select"
ON public.customer_trade_notifications
FOR SELECT
TO authenticated
USING (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);

CREATE POLICY "customer_trade_notifications_insert"
ON public.customer_trade_notifications
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.customer_profile_share_trades t
    WHERE t.id = trade_id
      AND (
        (
          t.initiator_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
          AND customer_id = t.counterparty_customer_id
        )
        OR (
          t.counterparty_customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
          AND customer_id = t.initiator_customer_id
        )
      )
  )
);

CREATE POLICY "customer_trade_notifications_update"
ON public.customer_trade_notifications
FOR UPDATE
TO authenticated
USING (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
)
WITH CHECK (
  customer_id = (SELECT c.id FROM public.customers c WHERE c.supabase_user_id = (auth.uid())::text LIMIT 1)
);
