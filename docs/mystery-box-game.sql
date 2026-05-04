-- SpinBite Game #2: Mystery Box Reveal
-- Run this in Supabase if the Mystery Box game row does not already exist.
-- This makes the game visible in Super Admin > Games.

insert into public.games (
  name,
  slug,
  description,
  status,
  icon,
  min_rewards,
  max_rewards,
  min_products,
  max_products,
  default_spins,
  default_coupon_expiry_minutes,
  stop_on_win_default,
  supports_coupon,
  supports_weighting,
  supports_try_again,
  sort_order,
  game_config
)
values (
  'Mystery Box Reveal',
  'mystery-box',
  'Customers tap one of three mystery boxes to reveal a prize with stars and confetti.',
  'active',
  '🎁',
  2,
  10,
  2,
  10,
  1,
  20,
  true,
  true,
  true,
  false,
  20,
  '{"mystery_box":{"boxCount":3,"winEffect":"confetti_stars"}}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  icon = excluded.icon,
  min_rewards = excluded.min_rewards,
  max_rewards = excluded.max_rewards,
  min_products = excluded.min_products,
  max_products = excluded.max_products,
  default_spins = excluded.default_spins,
  default_coupon_expiry_minutes = excluded.default_coupon_expiry_minutes,
  stop_on_win_default = excluded.stop_on_win_default,
  supports_coupon = excluded.supports_coupon,
  supports_weighting = excluded.supports_weighting,
  supports_try_again = excluded.supports_try_again,
  sort_order = excluded.sort_order,
  game_config = excluded.game_config;
