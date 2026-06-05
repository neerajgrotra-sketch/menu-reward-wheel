-- Each row makes one game_type available for a promotion's pool.
-- weight is stored as 1 for all rows (equal probability); the column
-- exists so resolvePromotionGame() can call selectWeightedGame() unchanged.
create table if not exists public.promotion_game_assignments (
  id            uuid        primary key default gen_random_uuid(),
  promotion_id  uuid        not null references public.promotions(id) on delete cascade,
  game_type     text        not null,
  weight        int         not null default 1 check (weight > 0),
  enabled       boolean     not null default true,
  created_at    timestamptz not null default now(),
  unique (promotion_id, game_type)
);

create index if not exists promotion_game_assignments_promotion_id_idx
  on public.promotion_game_assignments(promotion_id);
