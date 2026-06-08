-- Phase 2: Menu Items Enrichment
-- Adds section hierarchy, rich content fields, AI-ready metadata envelope,
-- availability flag, and soft delete to menu_items.
--
-- All column additions use IF NOT EXISTS for safety. Live DB inspection on
-- 2026-06-06 confirmed description, image_url, and display_order were missing.
--
-- ai_metadata JSONB schema contract (initial):
-- {
--   "description_source":       "manual",
--   "description_model":        null,
--   "description_generated_at": null,
--   "description_reviewed":     false,
--   "image_source":             "manual",
--   "image_model":              null,
--   "image_generated_at":       null,
--   "original_image_url":       null,
--   "import_source":            "manual",
--   "import_job_id":            null
-- }
-- All AI features write here — no additional migrations needed for AI columns.

alter table public.menu_items
  -- Section hierarchy (nullable — existing items have section_id = NULL)
  -- ON DELETE SET NULL: deleting a section orphans items; does NOT cascade-delete them
  add column if not exists section_id    uuid        references public.menu_sections(id) on delete set null,

  -- Rich content (description confirmed missing from live DB as of 2026-06-06)
  add column if not exists description   text,
  add column if not exists image_url     text,
  add column if not exists display_order integer     not null default 0,
  add column if not exists is_featured   boolean     not null default false,
  add column if not exists tags          text[]      not null default '{}',

  -- Availability (separate from active: active = archived, available = sold out today)
  add column if not exists available     boolean     not null default true,

  -- AI-ready envelope
  add column if not exists ai_metadata   jsonb       not null default '{}'::jsonb,

  -- Soft delete
  add column if not exists deleted_at    timestamptz,
  add column if not exists updated_at    timestamptz not null default now();

-- ─── indexes ──────────────────────────────────────────────────────────────────

create index if not exists menu_items_section_id_order_idx
  on public.menu_items(section_id, display_order)
  where deleted_at is null and active = true;

create index if not exists menu_items_menu_id_order_idx
  on public.menu_items(menu_id, display_order)
  where deleted_at is null and active = true;

create index if not exists menu_items_featured_idx
  on public.menu_items(restaurant_id, is_featured)
  where is_featured = true and deleted_at is null and active = true;

create index if not exists menu_items_tags_gin_idx
  on public.menu_items using gin(tags)
  where deleted_at is null;

-- ─── trigger ──────────────────────────────────────────────────────────────────

drop trigger if exists set_menu_items_updated_at on public.menu_items;
create trigger set_menu_items_updated_at
  before update on public.menu_items
  for each row
  execute function public.set_updated_at();

-- ─── RLS: update public read policy to respect soft delete ───────────────────
-- The existing "public read menu items" policy (from schema.sql) has no
-- deleted_at guard. Replace it so soft-deleted items are hidden from customers.
-- Owners still see soft-deleted items via the authenticated policy.

drop policy if exists "public read menu items" on public.menu_items;
drop policy if exists "Public read active menu items" on public.menu_items;
create policy "Public read active menu items"
  on public.menu_items for select
  using (active = true and deleted_at is null);

-- Owners can read all their items including soft-deleted (for restore workflow)
drop policy if exists "Owners read own menu items including deleted" on public.menu_items;
create policy "Owners read own menu items including deleted"
  on public.menu_items for select
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );
