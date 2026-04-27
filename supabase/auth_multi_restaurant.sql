-- Auth + multi-restaurant ownership upgrade
-- Run this after the base schema and multi_promotion_system.sql.

alter table restaurants
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists restaurants_owner_id_idx on restaurants(owner_id);
create index if not exists menus_restaurant_id_idx on menus(restaurant_id);
create index if not exists promotions_restaurant_id_idx on promotions(restaurant_id);
create index if not exists rewards_promotion_id_idx on rewards(promotion_id);

-- MVP auth policies. Existing public policies may still exist from early prototype.
-- In a later hardening pass, remove public insert/update and restrict everything to owner_id = auth.uid().
create policy if not exists "owners read own restaurants"
on restaurants for select
using (owner_id = auth.uid() or owner_id is null);

create policy if not exists "authenticated users create restaurants"
on restaurants for insert
with check (auth.uid() is not null and owner_id = auth.uid());

create policy if not exists "owners update own restaurants"
on restaurants for update
using (owner_id = auth.uid() or owner_id is null)
with check (owner_id = auth.uid() or owner_id is null);
