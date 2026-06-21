-- Ordering Engine v1
-- Creates: orders, order_items, restaurant_capabilities tables
-- Inserts: default ordering capability row for every existing restaurant

-- ── restaurant_capabilities ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.restaurant_capabilities (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid    NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  capability_name   text    NOT NULL,
  enabled           boolean NOT NULL DEFAULT false,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (restaurant_id, capability_name)
);

ALTER TABLE public.restaurant_capabilities ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can read/update their own capabilities
CREATE POLICY "restaurant_capabilities_owner_select"
  ON public.restaurant_capabilities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "restaurant_capabilities_owner_update"
  ON public.restaurant_capabilities FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- Seed: insert ordering capability for all existing restaurants (disabled by default)
INSERT INTO public.restaurant_capabilities (restaurant_id, capability_name, enabled)
SELECT id, 'ordering', false
FROM public.restaurants
ON CONFLICT (restaurant_id, capability_name) DO NOTHING;

-- ── orders ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_number            integer     NOT NULL,
  status                  text        NOT NULL DEFAULT 'pending',
  order_origin            text        NOT NULL DEFAULT 'direct_link',
  table_identifier        text,
  customer_name           text,
  kitchen_notes           text,
  subtotal                numeric(10,2) NOT NULL,
  idempotency_key         text        NOT NULL UNIQUE,
  session_id              text,
  coupon_id               uuid,
  promotion_session_id    uuid,
  preparing_at            timestamptz,
  ready_at                timestamptz,
  completed_at            timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  CONSTRAINT orders_status_check CHECK (
    status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')
  ),
  CONSTRAINT orders_origin_check CHECK (
    order_origin IN ('restaurant_qr', 'direct_link')
  )
);

-- Scoped sequential order numbers per restaurant
CREATE UNIQUE INDEX orders_restaurant_number_uidx
  ON public.orders (restaurant_id, order_number);

CREATE INDEX orders_restaurant_status_idx
  ON public.orders (restaurant_id, status);

CREATE INDEX orders_created_idx
  ON public.orders (created_at DESC);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Restaurant owners can see their orders
CREATE POLICY "orders_owner_select"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- Public INSERT allowed (orders submitted by customers) — service role used in API, not direct insert
-- No public RLS insert policy needed; API route uses service role key

-- ── order_items ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_items (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id               uuid        NOT NULL REFERENCES public.restaurants(id),
  menu_item_id                uuid        REFERENCES public.menu_items(id) ON DELETE SET NULL,
  name_snapshot               text        NOT NULL,
  price_snapshot              numeric(10,2) NOT NULL,
  effective_price_snapshot    numeric(10,2) NOT NULL,
  special_active_snapshot     boolean     NOT NULL DEFAULT false,
  quantity                    integer     NOT NULL DEFAULT 1,
  line_total                  numeric(10,2) NOT NULL,
  special_instructions        text,
  created_at                  timestamptz DEFAULT now()
);

CREATE INDEX order_items_order_id_idx
  ON public.order_items (order_id);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_owner_select"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.restaurants r ON r.id = o.restaurant_id
      WHERE o.id = order_id
        AND r.owner_id = auth.uid()
    )
  );

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS public.order_items;
-- DROP TABLE IF EXISTS public.orders;
-- DROP TABLE IF EXISTS public.restaurant_capabilities;
