create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'restaurant_owner' check (role in ('restaurant_owner', 'super_admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  status text not null default 'coming_soon' check (status in ('active', 'coming_soon', 'disabled')),
  icon text,
  min_rewards int not null default 6,
  max_rewards int not null default 10,
  default_spins int not null default 3,
  default_coupon_expiry_minutes int not null default 20,
  stop_on_win_default boolean not null default true,
  supports_coupon boolean not null default true,
  supports_weighting boolean not null default true,
  supports_try_again boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint games_reward_range_check check (min_rewards > 0 and max_rewards >= min_rewards),
  constraint games_default_spins_check check (default_spins > 0),
  constraint games_coupon_expiry_check check (default_coupon_expiry_minutes > 0)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_games_updated_at on public.games;
create trigger set_games_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.games enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

drop policy if exists "profiles_insert_restaurant_owner_own" on public.profiles;
create policy "profiles_insert_restaurant_owner_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid() and role = 'restaurant_owner');

drop policy if exists "profiles_update_super_admin" on public.profiles;
create policy "profiles_update_super_admin"
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "profiles_insert_super_admin" on public.profiles;
create policy "profiles_insert_super_admin"
on public.profiles
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "games_select_authenticated" on public.games;
create policy "games_select_authenticated"
on public.games
for select
to authenticated
using (true);

drop policy if exists "games_insert_super_admin" on public.games;
create policy "games_insert_super_admin"
on public.games
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists "games_update_super_admin" on public.games;
create policy "games_update_super_admin"
on public.games
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists "games_delete_super_admin" on public.games;
create policy "games_delete_super_admin"
on public.games
for delete
to authenticated
using (public.is_super_admin());

insert into public.games (
  name,
  slug,
  description,
  status,
  icon,
  min_rewards,
  max_rewards,
  default_spins,
  default_coupon_expiry_minutes,
  stop_on_win_default,
  supports_coupon,
  supports_weighting,
  supports_try_again,
  sort_order
)
values
  ('Spin Wheel', 'spin-wheel', 'Customers spin a branded reward wheel and win configured coupons.', 'active', '🎯', 6, 10, 3, 20, true, true, true, false, 10),
  ('Scratch & Win', 'scratch-win', 'Customers scratch a digital card to reveal an instant reward.', 'coming_soon', '✨', 6, 10, 3, 20, true, true, true, false, 20),
  ('Mystery Box', 'mystery-box', 'Customers pick a mystery box and reveal a surprise coupon.', 'coming_soon', '🎁', 6, 10, 3, 20, true, true, true, false, 30),
  ('Pick a Card', 'pick-a-card', 'Customers choose a card from a playful deck to reveal their prize.', 'coming_soon', '🃏', 6, 10, 3, 20, true, true, true, false, 40),
  ('Lucky Slot', 'lucky-slot', 'Customers play a quick slot-style game to unlock a coupon.', 'coming_soon', '🎰', 6, 10, 3, 20, true, true, true, false, 50)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  icon = excluded.icon,
  min_rewards = excluded.min_rewards,
  max_rewards = excluded.max_rewards,
  default_spins = excluded.default_spins,
  default_coupon_expiry_minutes = excluded.default_coupon_expiry_minutes,
  stop_on_win_default = excluded.stop_on_win_default,
  supports_coupon = excluded.supports_coupon,
  supports_weighting = excluded.supports_weighting,
  supports_try_again = excluded.supports_try_again,
  sort_order = excluded.sort_order;
