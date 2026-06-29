-- Guest Identity V1
-- Modifies: orders (adds guest_id for per-guest order attribution)
--
-- Adds a nullable FK from orders to session_guests so each order can be
-- attributed to the specific guest device that placed it.
--
-- Additive only — existing rows keep guest_id = NULL.
-- No RLS changes. Service-role writes bypass RLS on orders already.
-- No breaking changes.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.session_guests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_guest_idx
  ON public.orders (guest_id)
  WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.orders.guest_id IS
  'FK to session_guests.id — identifies which device placed this order. '
  'NULL for orders placed before Guest Identity V1 or in sessions without presence tracking.';

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.orders_guest_idx;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS guest_id;
