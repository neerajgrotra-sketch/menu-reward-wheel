-- Special Offer Engine — Phase 1
-- Adds time-based pricing columns to menu_items.
-- Architecture: Rule 51 — all special offer data lives on menu_items, no new table.
-- Rule 52 — pricing calculations happen server-side at request time.
-- Rule 54 — future AI commands can write directly to these columns.

ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS special_enabled    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS special_type       text,
  ADD COLUMN IF NOT EXISTS special_percent    numeric(5,2),
  ADD COLUMN IF NOT EXISTS special_price      numeric(10,2),
  ADD COLUMN IF NOT EXISTS special_start_at   timestamptz,
  ADD COLUMN IF NOT EXISTS special_end_at     timestamptz,
  ADD COLUMN IF NOT EXISTS special_no_expiry  boolean      NOT NULL DEFAULT false;

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_special_type_check;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_special_type_check
  CHECK (
    special_type IS NULL
    OR special_type IN ('percentage', 'fixed_price')
  );

-- Enforce safe percent range at DB level: 1–99 only. Blocks negative-price attacks.
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_special_percent_valid;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_special_percent_valid
  CHECK (
    special_percent IS NULL
    OR (special_percent >= 1 AND special_percent <= 99)
  );

-- Enforce positive special price: prevents $0 or negative override prices.
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_special_price_valid;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_special_price_valid
  CHECK (
    special_price IS NULL
    OR special_price > 0
  );

-- Index for efficient querying of active specials — used by the On Special filter
CREATE INDEX IF NOT EXISTS menu_items_special_active_idx
  ON public.menu_items (restaurant_id, special_enabled)
  WHERE special_enabled = true AND deleted_at IS NULL AND active = true;


-- ─── DOWN MIGRATION (execute manually to roll back) ──────────────────────────
--
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_special_price_valid;
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_special_percent_valid;
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_special_type_check;
-- DROP INDEX IF EXISTS public.menu_items_special_active_idx;
-- ALTER TABLE public.menu_items
--   DROP COLUMN IF EXISTS special_no_expiry,
--   DROP COLUMN IF EXISTS special_end_at,
--   DROP COLUMN IF EXISTS special_start_at,
--   DROP COLUMN IF EXISTS special_price,
--   DROP COLUMN IF EXISTS special_percent,
--   DROP COLUMN IF EXISTS special_type,
--   DROP COLUMN IF EXISTS special_enabled;
