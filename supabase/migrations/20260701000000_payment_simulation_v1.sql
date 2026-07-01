-- Payment Simulation V1
-- Creates: payments
--
-- Mock payment layer inserted between cart submission and order creation.
-- Capability-gated per restaurant (restaurant_capabilities.payment_simulation).
-- Restaurants without the capability are entirely unaffected — orders are
-- still created directly by POST /api/public/orders (Invariant #1).
--
-- Design invariants:
--   1. One row per checkout attempt. order_id is NULL until the linked order
--      is successfully created (payment-first, order-second sequencing).
--   2. Only service role may INSERT/UPDATE (mock or future real-provider
--      webhook writes happen server-side only — never client-writable).
--   3. Restaurant owners may SELECT their own payments (read-only, no owner
--      UPDATE/INSERT — this is a system-of-record table, not admin-editable).
--   4. Idempotency lives in metadata->>'idempotency_key' (payments has no
--      dedicated idempotency_key column per product spec) — enforced via a
--      partial unique index, mirroring orders.idempotency_key's role.
--   5. tip/tax/service-fee amounts live in metadata JSONB — zero new columns
--      on orders/order_items (explicit engineering constraint).
--   6. payment_simulation requires the ordering capability to also be enabled
--      (see docs/architecture/spinbite-platform-architecture-v4.md Invariant #17).

-- ── payments ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid          NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_id        uuid          REFERENCES public.orders(id) ON DELETE SET NULL,
  provider        text          NOT NULL,
  transaction_id  text          NOT NULL,
  amount          numeric(10,2) NOT NULL,
  currency        text          NOT NULL DEFAULT 'usd',
  status          text          NOT NULL DEFAULT 'pending',
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),
  metadata        jsonb         NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT payments_status_check CHECK (
    status IN ('pending', 'requires_action', 'succeeded', 'failed', 'refunded', 'cancelled')
  ),
  CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Lookup by order (payment detail from an order — refund/receipt UI)
CREATE INDEX IF NOT EXISTS payments_order_id_idx
  ON public.payments (order_id) WHERE order_id IS NOT NULL;

-- Lookup by restaurant (owner dashboard, reconciliation)
CREATE INDEX IF NOT EXISTS payments_restaurant_created_idx
  ON public.payments (restaurant_id, created_at DESC);

-- Idempotency: prevent double-submission of the same checkout attempt.
-- Scoped to non-failed rows so a genuinely retried-after-decline checkout
-- (real provider, future) isn't permanently blocked by its own failed attempt.
CREATE UNIQUE INDEX IF NOT EXISTS payments_restaurant_idempotency_uidx
  ON public.payments (restaurant_id, (metadata ->> 'idempotency_key'))
  WHERE metadata ->> 'idempotency_key' IS NOT NULL
    AND status <> 'failed';

DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_owner_read" ON public.payments;
CREATE POLICY "payments_owner_read"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid())
  );

-- No INSERT/UPDATE/DELETE policy for anon or authenticated — all writes go
-- through the service-role client in lib/payments/payment-orchestrator.ts.

-- ── Capability seed ───────────────────────────────────────────────────────────
-- No migration is required to introduce the 'payment_simulation' capability
-- name itself (restaurant_capabilities is a generic key-value table — see the
-- 'table_management' capability precedent). Seeded here only for admin-UI
-- query consistency, mirroring the 'ordering' seed block in
-- 20260621000000_ordering_engine_v1.sql.
INSERT INTO public.restaurant_capabilities (restaurant_id, capability_name, enabled)
SELECT id, 'payment_simulation', false
FROM public.restaurants
ON CONFLICT (restaurant_id, capability_name) DO NOTHING;

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.payments IS
  'Payment attempts/ledger for the capability-gated payment simulation layer. order_id is null until the linked order is created. Mock provider today; swappable for a real processor via lib/payments/providers.';

COMMENT ON COLUMN public.payments.metadata IS
  'JSONB: idempotency_key, tip_amount, tax_amount, service_fee_amount, subtotal, card_brand_display (mock only, no real PAN), and provider-specific fields. No schema changes to orders/order_items — all charge-breakdown data lives here.';

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP TRIGGER IF EXISTS set_payments_updated_at ON public.payments;
-- DROP POLICY IF EXISTS "payments_owner_read" ON public.payments;
-- DROP INDEX IF EXISTS public.payments_restaurant_idempotency_uidx;
-- DROP INDEX IF EXISTS public.payments_restaurant_created_idx;
-- DROP INDEX IF EXISTS public.payments_order_id_idx;
-- DROP TABLE IF EXISTS public.payments;
