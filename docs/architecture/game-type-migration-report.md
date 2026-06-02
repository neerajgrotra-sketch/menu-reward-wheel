# Game Type Migration Report

**Date:** June 1, 2026
**Branch:** feature/game-management

## Files changed

- `supabase/migrations/20260601000000_normalize_game_identifiers.sql`
  - Added `game_type` to `public.games`
  - Populated existing rows using canonical mappings
  - Added unique constraint on `game_type`
  - Removed the `CHECK` constraint to satisfy Phase 1 requirements
  - Kept an index for `game_type` lookups
- `app/super-admin/games/actions.ts`
  - Updated spin wheel-specific config logic to prefer `game_type` over `slug`
  - Added `game_type` to the update payload when present
- `app/super-admin/games/GameLabCard.tsx`
  - Added `game_type` to the game shape
  - Added a hidden `game_type` form field
  - Updated spin wheel preview logic to prefer `game_type`

## Queries changed

- `supabase/migrations/20260601000000_normalize_game_identifiers.sql`
  - `update public.games set game_type = 'spin_wheel' where slug = 'spin-wheel' and game_type is null;`
  - `update public.games set game_type = 'mystery_box' where slug = 'mystery-box' and game_type is null;`
  - `update public.games set game_type = 'scratch_card' where slug = 'scratch-win' and game_type is null;`
  - `update public.games set game_type = 'reward_reels' where slug = 'lucky-slot' and game_type is null;`
  - `update public.games set game_type = 'pick_a_card' where slug = 'pick-a-card' and game_type is null;`
  - created index: `create index if not exists games_game_type_idx on public.games(game_type);`
- `app/super-admin/games/actions.ts`
  - Query payload now includes `game_type` when it is available from form data

## Remaining slug dependencies

The migration is Phase 1 and preserves slug usage in the following areas:

- Game seed rows and existing database records still retain `slug` values for backwards compatibility and display.
- Promotion and play URLs still use `promotion.slug` for the user-facing route: `/play/{restaurantSlug}/{promotion.slug}`.
- UI components and admin pages still render `game.slug` in some places for labels or fallback logic.
- Legacy migration scripts and seed data still reference `slug` values such as `spin-wheel`, `mystery-box`, `scratch-win`, `lucky-slot`, and `pick-a-card`.

## Notes

- `game_type` is now the canonical identifier for game resolution in this phase.
- The database migration intentionally does not add a `CHECK` constraint.
- Further refactoring is needed to fully remove slug-based game logic from all code paths.
