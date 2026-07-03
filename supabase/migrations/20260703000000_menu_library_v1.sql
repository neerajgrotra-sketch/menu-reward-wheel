-- Menu Library v1 — Architecture Redesign
-- Breaks the "one restaurant = one menu" assumption.
--
-- Before: menus (flat, restaurant-scoped "categories") -> menu_items
-- After:  menus (owner-scoped, reusable) -> menu_categories (renamed from old `menus`)
--         -> menu_items ; restaurant_menu_assignments joins restaurants <-> menus.
--
-- menu_items.restaurant_id is KEPT (items stay tied to their authoring restaurant;
-- cross-location reuse is governed entirely by restaurant_menu_assignments).
-- The dead `menu_sections` table (never wired to any UI) is dropped.

-- ─── 1. Rename old `menus` (today's categories) -> menu_categories ────────────

alter table public.menus rename to menu_categories;

-- Drop the old restaurant_id-scoped policies (from menu_system.sql /
-- menu_display_order.sql) up front — their USING/CHECK clauses reference
-- restaurant_id, which blocks dropping that column in step 5 otherwise.
drop policy if exists "owners read own menus" on public.menu_categories;
drop policy if exists "owners insert own menus" on public.menu_categories;
drop policy if exists "owners update own menus" on public.menu_categories;
drop policy if exists "owners delete own menus" on public.menu_categories;
drop policy if exists "Public read active menus" on public.menu_categories;

-- Plain column here (no inline FK) — the new `menus` table this will reference
-- doesn't exist yet at this point in the script; the FK constraint is added
-- explicitly in step 2 once it does.
alter table public.menu_categories
  add column if not exists menu_id uuid;

-- ─── 2. Create new top-level `menus` entity ───────────────────────────────────

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  menu_type text not null default 'custom', -- breakfast|lunch|dinner|kids|seasonal|holiday|catering|custom
  description text,
  active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Now that `menus` exists, point menu_categories.menu_id at it for real.
alter table public.menu_categories
  drop constraint if exists menu_categories_menu_id_fkey;
alter table public.menu_categories
  add constraint menu_categories_menu_id_fkey foreign key (menu_id) references public.menus(id) on delete cascade;

drop trigger if exists set_menus_updated_at on public.menus;
create trigger set_menus_updated_at
  before update on public.menus
  for each row
  execute function public.set_updated_at();

-- ─── 3. Backfill: one menu + one assignment per existing restaurant ───────────
-- Keyed strictly by restaurant_id (never by name — restaurant names may collide,
-- especially across locations of the same chain, which is exactly what this
-- feature is for).

alter table public.menus add column _backfill_restaurant_id uuid;

-- A handful of pre-auth test/demo restaurants (2026-04-27) have owner_id = null
-- and zero menus/items — nothing to preserve, and `menus.owner_id` is NOT NULL
-- by design, so they're excluded from the backfill rather than given a menu.
insert into public.menus (id, owner_id, name, menu_type, active, created_at, updated_at, _backfill_restaurant_id)
select gen_random_uuid(), r.owner_id, r.name || ' Menu', 'custom', true, now(), now(), r.id
from public.restaurants r
where r.owner_id is not null;

update public.menu_categories mc
set menu_id = m.id
from public.menus m
where m._backfill_restaurant_id = mc.restaurant_id;

create table public.restaurant_menu_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  active boolean not null default true,
  display_order integer not null default 0,
  -- reserved for future time-based auto-switching; unused/nullable until that phase
  active_start_time time,
  active_end_time time,
  active_days smallint[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, menu_id)
);

drop trigger if exists set_restaurant_menu_assignments_updated_at on public.restaurant_menu_assignments;
create trigger set_restaurant_menu_assignments_updated_at
  before update on public.restaurant_menu_assignments
  for each row
  execute function public.set_updated_at();

insert into public.restaurant_menu_assignments (restaurant_id, menu_id, active, display_order)
select _backfill_restaurant_id, id, true, 0 from public.menus where _backfill_restaurant_id is not null;

alter table public.menus drop column _backfill_restaurant_id;

-- ─── 4. Sanity check before making menu_id NOT NULL ───────────────────────────
-- Aborts the migration if any menu_categories row failed to backfill.

do $$
declare
  orphan_count integer;
begin
  select count(*) into orphan_count from public.menu_categories where menu_id is null;
  if orphan_count > 0 then
    raise exception 'Menu Library backfill incomplete: % menu_categories rows have no menu_id', orphan_count;
  end if;
end $$;

-- ─── 5. Finish menu_categories: drop restaurant_id, rescope uniqueness ────────

alter table public.menu_categories alter column menu_id set not null;

alter table public.menu_categories drop constraint if exists menus_restaurant_slug_unique;
alter table public.menu_categories drop column if exists restaurant_id;

alter table public.menu_categories
  add constraint menu_categories_menu_slug_unique unique (menu_id, slug);

drop index if exists menus_restaurant_id_display_order_idx;
create index if not exists menu_categories_menu_id_display_order_idx
  on public.menu_categories(menu_id, display_order)
  where active = true;

-- ─── 6. menu_items: rename menu_id -> category_id (still FK'd to the same ──────
--        physical rows, now called menu_categories). restaurant_id is unchanged.

alter table public.menu_items rename column menu_id to category_id;

drop index if exists menu_items_menu_id_order_idx;
create index if not exists menu_items_category_id_order_idx
  on public.menu_items(category_id, display_order)
  where deleted_at is null and active = true;

-- ─── 7. Drop dead menu_sections table (never wired into any UI) ───────────────
-- menu_items.section_id FKs into it and is itself unused (confirmed nothing ever
-- sets it) — drop both rather than leave an orphaned, FK-less column behind.

alter table public.menu_items drop column if exists section_id;
drop table if exists public.menu_sections;

-- ─── 8. RLS ────────────────────────────────────────────────────────────────────

alter table public.menus enable row level security;
alter table public.restaurant_menu_assignments enable row level security;

-- menus: owner-scoped by owner_id directly
drop policy if exists "owners read own menus" on public.menus;
drop policy if exists "owners insert own menus" on public.menus;
drop policy if exists "owners update own menus" on public.menus;
drop policy if exists "owners delete own menus" on public.menus;
drop policy if exists "Public read active menus" on public.menus;

create policy "owners read own menus" on public.menus
  for select to authenticated using (owner_id = auth.uid());
create policy "owners insert own menus" on public.menus
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update own menus" on public.menus
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete own menus" on public.menus
  for delete to authenticated using (owner_id = auth.uid());
-- Public read: a menu is publicly visible if it has at least one active assignment.
create policy "Public read assigned menus" on public.menus
  for select using (
    active = true and exists (
      select 1 from public.restaurant_menu_assignments rma
      where rma.menu_id = menus.id and rma.active = true
    )
  );

-- menu_categories: rescope owner policies from restaurant_id join -> menu_id join
drop policy if exists "Owners read own menu categories" on public.menu_categories;
drop policy if exists "Owners insert own menu categories" on public.menu_categories;
drop policy if exists "Owners update own menu categories" on public.menu_categories;
drop policy if exists "Owners delete own menu categories" on public.menu_categories;
drop policy if exists "Public read active menus" on public.menu_categories;

create policy "Owners read own menu categories" on public.menu_categories
  for select to authenticated using (
    menu_id in (select id from public.menus where owner_id = auth.uid())
  );
create policy "Owners insert own menu categories" on public.menu_categories
  for insert to authenticated with check (
    menu_id in (select id from public.menus where owner_id = auth.uid())
  );
create policy "Owners update own menu categories" on public.menu_categories
  for update to authenticated using (
    menu_id in (select id from public.menus where owner_id = auth.uid())
  ) with check (
    menu_id in (select id from public.menus where owner_id = auth.uid())
  );
create policy "Owners delete own menu categories" on public.menu_categories
  for delete to authenticated using (
    menu_id in (select id from public.menus where owner_id = auth.uid())
  );
create policy "Public read active menu categories" on public.menu_categories
  for select using (
    active = true and menu_id in (
      select m.id from public.menus m
      join public.restaurant_menu_assignments rma on rma.menu_id = m.id
      where m.active = true and rma.active = true
    )
  );

-- restaurant_menu_assignments: owner-scoped via the restaurant side (single owner model)
create policy "Owners read own menu assignments" on public.restaurant_menu_assignments
  for select to authenticated using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  );
create policy "Owners insert own menu assignments" on public.restaurant_menu_assignments
  for insert to authenticated with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
    and menu_id in (select id from public.menus where owner_id = auth.uid())
  );
create policy "Owners update own menu assignments" on public.restaurant_menu_assignments
  for update to authenticated using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  ) with check (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  );
create policy "Owners delete own menu assignments" on public.restaurant_menu_assignments
  for delete to authenticated using (
    restaurant_id in (select id from public.restaurants where owner_id = auth.uid())
  );
-- Public read: needed so /r/[slug] (service-role client bypasses RLS anyway, but keep
-- this for defense-in-depth / any future anon-key read path).
create policy "Public read active menu assignments" on public.restaurant_menu_assignments
  for select using (active = true);

-- menu_items RLS is UNCHANGED — still restaurant_id-based, no policy changes needed.

-- Note: a follow-up migration (20260703000001) drops a pre-existing, undocumented
-- "public insert menus" policy discovered on this table post-rename — WITH CHECK
-- (true) for the `public` role, i.e. anonymous insert of arbitrary category rows.
-- Not introduced by this migration; found while auditing this table's RLS.

-- ─── DOWN MIGRATION (manual, destructive — do not run unless rolling back) ────
--
-- alter table public.menu_items rename column category_id to menu_id;
-- alter table public.menu_categories add column restaurant_id uuid references public.restaurants(id);
-- -- (would need to re-derive restaurant_id from restaurant_menu_assignments before dropping menus/assignments)
-- drop table if exists public.restaurant_menu_assignments;
-- drop table if exists public.menus;
-- alter table public.menu_categories rename to menus;
-- alter table public.menus drop column if exists menu_id;
