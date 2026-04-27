-- Multi-restaurant / multi-menu / multi-promotion upgrade

create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null default 'Main Menu',
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists promotions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_id uuid references menus(id) on delete set null,
  name text not null,
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  description text,
  coupon_expiry_minutes integer not null default 20,
  created_at timestamptz default now(),
  unique (restaurant_id, slug)
);

alter table menu_items
  add column if not exists menu_id uuid references menus(id) on delete cascade;

alter table rewards
  add column if not exists promotion_id uuid references promotions(id) on delete cascade,
  add column if not exists discount_value text,
  add column if not exists display_order integer default 0;

alter table menus enable row level security;
alter table promotions enable row level security;

create policy if not exists "public read menus" on menus for select using (true);
create policy if not exists "public insert menus" on menus for insert with check (true);
create policy if not exists "public update menus" on menus for update using (true);

create policy if not exists "public read promotions" on promotions for select using (true);
create policy if not exists "public insert promotions" on promotions for insert with check (true);
create policy if not exists "public update promotions" on promotions for update using (true);
