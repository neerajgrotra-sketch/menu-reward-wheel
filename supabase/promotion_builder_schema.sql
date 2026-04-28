-- SpinBite promotion builder schema upgrade
-- Run this in Supabase SQL Editor before testing the new Promotions page.

alter table promotions
  add column if not exists game_type text default 'wheel',
  add column if not exists max_spins integer default 1,
  add column if not exists stop_on_win boolean default true,
  add column if not exists daily_redeem_limit integer default 100,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists timezone text default 'America/Toronto',
  add column if not exists public_url text,
  add column if not exists updated_at timestamptz default now();

create table if not exists promotion_rewards (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid references promotions(id) on delete cascade not null,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  menu_item_id uuid references menu_items(id) on delete set null,
  custom_name text,
  reward_type text not null default 'percent_discount',
  reward_value numeric(10,2),
  daily_limit integer default 25,
  weight integer default 10,
  display_order integer default 0,
  created_at timestamptz default now()
);

alter table promotion_rewards enable row level security;

drop policy if exists "promotion rewards read via restaurant ownership" on promotion_rewards;
drop policy if exists "promotion rewards insert via restaurant ownership" on promotion_rewards;
drop policy if exists "promotion rewards update via restaurant ownership" on promotion_rewards;
drop policy if exists "promotion rewards delete via restaurant ownership" on promotion_rewards;

create policy "promotion rewards read via restaurant ownership"
on promotion_rewards for select
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "promotion rewards insert via restaurant ownership"
on promotion_rewards for insert
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "promotion rewards update via restaurant ownership"
on promotion_rewards for update
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()))
with check (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create policy "promotion rewards delete via restaurant ownership"
on promotion_rewards for delete
using (exists (select 1 from restaurants r where r.id = restaurant_id and r.owner_id = auth.uid()));

create index if not exists promotion_rewards_promotion_id_idx on promotion_rewards(promotion_id);
create index if not exists promotion_rewards_restaurant_id_idx on promotion_rewards(restaurant_id);
