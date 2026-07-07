-- Fix play_sessions_game_type_valid check constraint
--
-- The constraint was written against a legacy game_type vocabulary
-- ('wheel', 'slot_machine', 'fortune_cookie', 'pick_a_door') that no longer
-- matches the canonical GameType union the app actually writes
-- (lib/games/types.ts: 'wheel' | 'spin_wheel' | 'mystery_box' | 'scratch_card'
-- | 'reward_reels' | 'open_the_door'). Every promotion whose weighted game
-- pool picked 'spin_wheel' (the most common primary game type) failed to
-- insert its play_sessions row with:
--   new row for relation "play_sessions" violates check constraint
--   "play_sessions_game_type_valid"
-- 'wheel' is kept alongside 'spin_wheel' since 13 historical rows already
-- use it.

alter table public.play_sessions
  drop constraint if exists play_sessions_game_type_valid;

alter table public.play_sessions
  add constraint play_sessions_game_type_valid
  check (selected_game_type = any (array[
    'wheel'::text,
    'spin_wheel'::text,
    'mystery_box'::text,
    'scratch_card'::text,
    'reward_reels'::text,
    'open_the_door'::text
  ]));
