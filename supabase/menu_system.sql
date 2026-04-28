-- Structured menu system for SpinBite
-- Run in Supabase SQL Editor before using /admin/menu.

create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  menu_type text not null default 'custom',
  description text,
  active boolean default true,
  display_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  menu_id uuid references menus(id) on delete cascade not null,
  name text not null,
  category text,
  price numeric(10,2),
  description text,
  image_url text,
  active boolean default true,
  display_order integer default 0,
  created_at timestamptz default now()
);

alter table menus enable row level security;
alter table menu_items enable row level security;

drop policy if exists "owners read own menus" on menus;
drop policy if exists "owners insert own menus" on menus;
drop policy if exists "owners update own menus" on menus;
drop policy if exists "owners delete own menus" on menus;

create policy "owners read own menus"
on menus for select
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners insert own menus"
on menus for insert
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners update own menus"
on menus for update
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners delete own menus"
on menus for delete
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

drop policy if exists "owners read own menu items" on menu_items;
drop policy if exists "owners insert own menu items" on menu_items;
drop policy if exists "owners update own menu items" on menu_items;
drop policy if exists "owners delete own menu items" on menu_items;

create policy "owners read own menu items"
on menu_items for select
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners insert own menu items"
on menu_items for insert
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners update own menu items"
on menu_items for update
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "owners delete own menu items"
on menu_items for delete
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create index if not exists menus_restaurant_id_idx on menus(restaurant_id);
create index if not exists menu_items_restaurant_id_idx on menu_items(restaurant_id);
create index if not exists menu_items_menu_id_idx on menu_items(menu_id);
