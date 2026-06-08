-- Phase 2: Restaurant Experience Foundation
-- Adds experience mode, visual identity, content, and contact fields to restaurants.
-- Also adds promotion placement_mode for future-proofing (not yet wired in UI).
--
-- All changes are additive — no existing columns altered or dropped.

-- ─── restaurants: experience mode ────────────────────────────────────────────

alter table public.restaurants
  add column if not exists experience_mode text not null default 'promotion_only'
    constraint restaurants_experience_mode_check
    check (experience_mode in ('promotion_only', 'menu_only', 'menu_and_promotion'));

-- ─── restaurants: visual identity ────────────────────────────────────────────

alter table public.restaurants
  add column if not exists hero_image_url  text,
  add column if not exists secondary_color text,
  add column if not exists accent_color    text;

-- ─── restaurants: content fields ──────────────────────────────────────────────

alter table public.restaurants
  add column if not exists description text;

-- hours JSONB schema contract:
-- { "monday": { "open": "11:00", "close": "22:00", "closed": false }, ... }
-- Days: monday|tuesday|wednesday|thursday|friday|saturday|sunday
-- Times are 24-hour strings "HH:MM". closed:true means day is closed.
-- Timezone from existing restaurants.timezone column.
alter table public.restaurants
  add column if not exists hours jsonb;

-- ─── restaurants: contact / social ────────────────────────────────────────────

alter table public.restaurants
  add column if not exists website_url     text,
  add column if not exists instagram_url   text,
  add column if not exists facebook_url    text,
  add column if not exists google_maps_url text;

-- ─── restaurants: audit fields ────────────────────────────────────────────────

alter table public.restaurants
  add column if not exists deleted_at  timestamptz,
  add column if not exists updated_at  timestamptz not null default now();

-- ─── indexes ──────────────────────────────────────────────────────────────────

create index if not exists restaurants_experience_mode_idx
  on public.restaurants(experience_mode)
  where deleted_at is null;

create index if not exists restaurants_slug_mode_idx
  on public.restaurants(slug, experience_mode)
  where deleted_at is null;

-- ─── updated_at trigger ───────────────────────────────────────────────────────

drop trigger if exists set_restaurants_updated_at on public.restaurants;
create trigger set_restaurants_updated_at
  before update on public.restaurants
  for each row
  execute function public.set_updated_at();

-- ─── promotions: placement_mode (future-proofing, not yet wired in UI) ────────
-- Allows promotions to be scoped to restaurant|menu|section|item levels in future.
-- V1 only uses 'restaurant'. The column is here so analytics can reference it
-- without a future schema migration.

alter table public.promotions
  add column if not exists placement_mode text not null default 'restaurant'
    constraint promotions_placement_mode_check
    check (placement_mode in ('restaurant', 'menu', 'section', 'item'));
