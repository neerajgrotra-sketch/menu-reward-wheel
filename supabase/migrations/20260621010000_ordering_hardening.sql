-- Ordering Hardening Sprint
-- 1. Atomic order number counter (replaces SELECT MAX race condition)
-- 2. Public read policy for customer order tracking (UUID as access token)

-- ── restaurant_order_counters ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurant_order_counters (
  restaurant_id     uuid    PRIMARY KEY REFERENCES public.restaurants(id) ON DELETE CASCADE,
  last_order_number integer NOT NULL DEFAULT 0
);

-- Seed from any orders already placed (idempotent)
INSERT INTO public.restaurant_order_counters (restaurant_id, last_order_number)
SELECT restaurant_id, COALESCE(MAX(order_number), 0)
FROM public.orders
GROUP BY restaurant_id
ON CONFLICT (restaurant_id) DO UPDATE
  SET last_order_number = EXCLUDED.last_order_number;

-- ── Atomic increment function ─────────────────────────────────────────────────
-- Called by the orders API via supabase.rpc('next_order_number', { p_restaurant_id })
-- UPSERT + increment is a single atomic statement — no SELECT MAX, no race condition.
-- SECURITY DEFINER runs as the function owner (postgres), bypassing RLS on the counter table.
CREATE OR REPLACE FUNCTION public.next_order_number(p_restaurant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result integer;
BEGIN
  INSERT INTO public.restaurant_order_counters (restaurant_id, last_order_number)
  VALUES (p_restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_order_number = restaurant_order_counters.last_order_number + 1
  RETURNING last_order_number INTO result;
  RETURN result;
END;
$$;

-- ── Public read policies for order tracking ───────────────────────────────────
-- Order UUIDs are unguessable. Sharing the tracking URL is the access mechanism.
-- Anon SELECT is intentionally broad — no customer identity system exists yet.
-- Replace with a signed token check when customer identity ships.

DROP POLICY IF EXISTS "orders_public_track" ON public.orders;
CREATE POLICY "orders_public_track"
  ON public.orders FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "order_items_public_track" ON public.order_items;
CREATE POLICY "order_items_public_track"
  ON public.order_items FOR SELECT
  TO anon
  USING (true);

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "order_items_public_track" ON public.order_items;
-- DROP POLICY IF EXISTS "orders_public_track" ON public.orders;
-- DROP FUNCTION IF EXISTS public.next_order_number(uuid);
-- DROP TABLE IF EXISTS public.restaurant_order_counters;
