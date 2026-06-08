-- Phase 2: Menu Sections
-- Introduces structured section/category hierarchy: Menu → Section → Items.
-- Replaces the free-text menu_items.category field for new items.
-- Existing items keep their category string as a display fallback — category is
-- never dropped in this phase.
--
-- Soft delete: sections use deleted_at instead of hard delete so analytics
-- references to section_id on historical menu_items remain valid.

create table if not exists public.menu_sections (
  id            uuid        primary key default gen_random_uuid(),
  menu_id       uuid        not null references public.menus(id) on delete cascade,
  restaurant_id uuid        not null references public.restaurants(id) on delete cascade,
  name          text        not null,
  description   text,
  display_order integer     not null default 0,
  active        boolean     not null default true,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ─── indexes ──────────────────────────────────────────────────────────────────

create index if not exists menu_sections_menu_id_order_idx
  on public.menu_sections(menu_id, display_order)
  where deleted_at is null and active = true;

create index if not exists menu_sections_restaurant_id_idx
  on public.menu_sections(restaurant_id)
  where deleted_at is null;

-- ─── trigger ──────────────────────────────────────────────────────────────────

drop trigger if exists set_menu_sections_updated_at on public.menu_sections;
create trigger set_menu_sections_updated_at
  before update on public.menu_sections
  for each row
  execute function public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.menu_sections enable row level security;

-- Public read for customer-facing menu page (anon key)
drop policy if exists "Public read active menu sections" on public.menu_sections;
create policy "Public read active menu sections"
  on public.menu_sections for select
  using (deleted_at is null and active = true);

-- Authenticated owner read (includes soft-deleted rows for restore workflow)
drop policy if exists "Owners read own menu sections" on public.menu_sections;
create policy "Owners read own menu sections"
  on public.menu_sections for select
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );

-- Owner insert
drop policy if exists "Owners insert own menu sections" on public.menu_sections;
create policy "Owners insert own menu sections"
  on public.menu_sections for insert
  to authenticated
  with check (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );

-- Owner update (rename, reorder, soft-delete via deleted_at)
drop policy if exists "Owners update own menu sections" on public.menu_sections;
create policy "Owners update own menu sections"
  on public.menu_sections for update
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  )
  with check (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );

-- Owner hard delete (available after 30 days per UI convention)
drop policy if exists "Owners delete own menu sections" on public.menu_sections;
create policy "Owners delete own menu sections"
  on public.menu_sections for delete
  to authenticated
  using (
    restaurant_id in (
      select id from public.restaurants where owner_id = auth.uid()
    )
  );
