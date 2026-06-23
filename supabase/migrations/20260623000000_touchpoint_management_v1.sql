-- Touchpoint Management v1
-- Creates: restaurant_touchpoints
-- Extends: restaurant_capabilities (seeds table_management capability)
--
-- Touchpoints are the abstraction layer above physical table management.
-- A touchpoint is any named customer interaction point at a restaurant:
-- table, patio, counter, pickup, kiosk, waiting area, bar, etc.
-- This migration establishes the foundation. Future migrations may add
-- touchpoint types without altering this schema.

-- ── restaurant_touchpoints ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.restaurant_touchpoints (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     uuid        NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,

  -- Human-readable label shown in admin UI and on QR materials
  name              text        NOT NULL,

  -- Structural type of this touchpoint — constrains to known values
  -- Future types may be added via CHECK constraint update + migration
  type              text        NOT NULL DEFAULT 'table',

  -- Short URL-safe code embedded in QR codes and public URLs
  -- Unique per restaurant (not globally) — a restaurant can have its own "t1"
  -- Generated from name at create time; stable once printed
  public_code       text        NOT NULL,

  -- Optional grouping label for multi-section venues (e.g. "Main Floor", "Rooftop")
  section_name      text,

  -- Optional seating capacity — informational only in v1
  capacity          integer,

  -- Real-time occupancy state for future table status features
  occupancy_status  text        DEFAULT 'available',

  -- Soft ordering within the admin list
  display_order     integer     NOT NULL DEFAULT 0,

  -- Soft enable/disable without deleting the touchpoint or invalidating printed QR
  active            boolean     NOT NULL DEFAULT true,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),

  -- Soft delete: preserves QR history and future order FK references
  deleted_at        timestamptz,

  -- Type must be a known touchpoint category
  CONSTRAINT touchpoints_type_check CHECK (
    type IN ('table', 'patio', 'counter', 'pickup')
  ),

  -- Occupancy must be a known state when set
  CONSTRAINT touchpoints_occupancy_check CHECK (
    occupancy_status IN ('available', 'occupied', 'cleaning', 'reserved')
  ),

  -- public_code is unique per restaurant — two restaurants may share 't1'
  -- but a single restaurant cannot have two touchpoints with the same code
  UNIQUE (restaurant_id, public_code),

  -- name uniqueness per restaurant — prevents duplicate display labels
  UNIQUE (restaurant_id, name)
);

-- Primary query path: list active touchpoints for a restaurant ordered for display
CREATE INDEX touchpoints_restaurant_active_order_idx
  ON public.restaurant_touchpoints (restaurant_id, active, display_order)
  WHERE deleted_at IS NULL;

-- Lookup path: resolve public_code from QR URL to touchpoint row
CREATE INDEX touchpoints_restaurant_code_idx
  ON public.restaurant_touchpoints (restaurant_id, public_code)
  WHERE deleted_at IS NULL AND active = true;

ALTER TABLE public.restaurant_touchpoints ENABLE ROW LEVEL SECURITY;

-- ── RLS: restaurant_touchpoints ───────────────────────────────────────────────
-- Owner-only access. Public users access touchpoint context via the public API
-- route using service role — they never query this table directly.

CREATE POLICY "touchpoints_owner_select"
  ON public.restaurant_touchpoints FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "touchpoints_owner_insert"
  ON public.restaurant_touchpoints FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "touchpoints_owner_update"
  ON public.restaurant_touchpoints FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

CREATE POLICY "touchpoints_owner_delete"
  ON public.restaurant_touchpoints FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.id = restaurant_id
        AND r.owner_id = auth.uid()
    )
  );

-- ── Extend restaurant_capabilities: table_management ─────────────────────────
-- Follows the identical pattern as the 'ordering' capability introduced in
-- 20260621000000_ordering_engine_v1.sql. No schema change to the table —
-- only a new seed row per existing restaurant, disabled by default.

INSERT INTO public.restaurant_capabilities (restaurant_id, capability_name, enabled)
SELECT id, 'table_management', false
FROM public.restaurants
ON CONFLICT (restaurant_id, capability_name) DO NOTHING;

-- ── Rollback reference ────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS public.touchpoints_restaurant_code_idx;
-- DROP INDEX IF EXISTS public.touchpoints_restaurant_active_order_idx;
-- DROP TABLE IF EXISTS public.restaurant_touchpoints;
-- DELETE FROM public.restaurant_capabilities WHERE capability_name = 'table_management';
