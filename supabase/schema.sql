create extension if not exists "pgcrypto";

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  brand_color text default '#f97316',
  created_at timestamptz default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  category text default 'General',
  price numeric,
  description text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  menu_item_id uuid references menu_items(id) on delete set null,
  label text not null,
  description text not null,
  terms text default 'Standard terms apply.',
  reward_type text default 'CHEF_SPECIAL',
  weight integer not null default 10 check (weight > 0),
  minimum_spend numeric,
  daily_limit integer,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  reward_id uuid not null references rewards(id) on delete cascade,
  code text unique not null,
  status text not null default 'issued',
  issued_at timestamptz default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz
);

alter table restaurants enable row level security;
alter table menu_items enable row level security;
alter table rewards enable row level security;
alter table coupons enable row level security;

create policy "public read restaurants" on restaurants for select using (true);
create policy "public insert restaurants" on restaurants for insert with check (true);
create policy "public update restaurants" on restaurants for update using (true);

create policy "public read menu items" on menu_items for select using (true);
create policy "public insert menu items" on menu_items for insert with check (true);
create policy "public update menu items" on menu_items for update using (true);

create policy "public read rewards" on rewards for select using (true);
create policy "public insert rewards" on rewards for insert with check (true);
create policy "public update rewards" on rewards for update using (true);

create policy "public read coupons" on coupons for select using (true);
create policy "public insert coupons" on coupons for insert with check (true);
create policy "public update coupons" on coupons for update using (true);
