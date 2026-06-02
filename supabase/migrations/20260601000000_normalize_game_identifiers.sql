-- Migration: Add game_type column and normalize game identifiers
-- Date: June 1, 2026
-- Purpose: Establish canonical game_type as the primary identifier for runtime contract resolution

-- Add game_type column (nullable initially for backwards compatibility)
alter table public.games
add column if not exists game_type text;

-- Map existing slugs to canonical game_type values
-- This establishes the single source of truth for game identifiers
update public.games set game_type = 'spin_wheel' where slug = 'spin-wheel' and game_type is null;
update public.games set game_type = 'mystery_box' where slug = 'mystery-box' and game_type is null;
update public.games set game_type = 'scratch_card' where slug = 'scratch-win' and game_type is null;
update public.games set game_type = 'reward_reels' where slug = 'lucky-slot' and game_type is null;
update public.games set game_type = 'pick_a_card' where slug = 'pick-a-card' and game_type is null;
update public.games set game_type = 'open_the_door' where slug = 'open-the-door' and game_type is null;

-- Standardize icons to match registry contracts
-- scratch-win used ✨, but scratch_card contract uses 🪙
update public.games set icon = '🪙' where game_type = 'scratch_card' and icon = '✨';

-- Add unique constraint on game_type to ensure no duplicates
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'games_game_type_unique'
  ) then
    alter table public.games
    add constraint games_game_type_unique unique (game_type);
  end if;
end $$;

-- Create an index on game_type for fast lookups
create index if not exists games_game_type_idx on public.games(game_type);

-- Future phase: After all code is migrated to use game_type, uncomment this to enforce NOT NULL
-- alter table public.games alter column game_type set not null;
