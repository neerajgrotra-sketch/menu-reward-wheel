-- Phase 2: Menu Display Order, Slug, and Type
-- Adds slug (for public URLs), display_order, and updated_at to menus.
-- menu_type and display_order use IF NOT EXISTS — they may already exist from
-- the ad-hoc menu_system.sql script applied before tracked migrations began.

alter table public.menus
  add column if not exists menu_type     text default 'all_day',
  add column if not exists display_order integer not null default 0,
  add column if not exists slug          text,
  add column if not exists updated_at    timestamptz not null default now();

-- Back-fill slugs from existing menu names.
-- Strip non-alphanumeric characters, lowercase, replace whitespace with hyphens.
update public.menus
set slug = lower(regexp_replace(
  regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'),
  '\s+', '-', 'g'
))
where slug is null;

-- Resolve duplicate slugs within the same restaurant by appending -2, -3, etc.
with ranked as (
  select id, restaurant_id, slug,
         row_number() over (partition by restaurant_id, slug order by created_at) as rn
  from public.menus
  where slug is not null
)
update public.menus m
set slug = case when r.rn = 1 then r.slug else r.slug || '-' || r.rn::text end
from ranked r
where m.id = r.id and r.rn > 1;

-- Fallback: any rows that still have no slug (edge case) get a UUID-based slug.
update public.menus set slug = 'menu-' || substring(id::text, 1, 8) where slug is null or slug = '';

alter table public.menus
  alter column slug set not null;

alter table public.menus
  drop constraint if exists menus_restaurant_slug_unique;
alter table public.menus
  add constraint menus_restaurant_slug_unique unique (restaurant_id, slug);

create index if not exists menus_restaurant_id_display_order_idx
  on public.menus(restaurant_id, display_order)
  where active = true;

drop trigger if exists set_menus_updated_at on public.menus;
create trigger set_menus_updated_at
  before update on public.menus
  for each row
  execute function public.set_updated_at();

-- Add public read policy for menus so the customer-facing menu page can query them.
-- Owners-only policies already exist from menu_system.sql; this adds anon read.
drop policy if exists "Public read active menus" on public.menus;
create policy "Public read active menus"
  on public.menus for select
  using (active = true);
