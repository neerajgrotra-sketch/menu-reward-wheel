# Game Identifier Normalization Strategy

**Date:** June 1, 2026
**Branch:** feature/game-management

## Current State

The `games` table currently uses `slug` as the only identifier:

- `spin-wheel` (Spin Wheel, 🎯, active)
- `scratch-win` (Scratch & Win, ✨, coming_soon)
- `mystery-box` (Mystery Box, 🎁, coming_soon)
- `pick-a-card` (Pick a Card, 🃏, coming_soon)
- `lucky-slot` (Lucky Slot, 🎰, coming_soon)

The runtime registry uses stable `GameType` identifiers:

- `spin_wheel` (Spin Wheel, 🎯, active)
- `mystery_box` (Mystery Box Reveal, 🎁, active)
- `scratch_card` (Scratch Card, 🪙, active)
- `reward_reels` (Reward Reels, 🎰, beta)

**Problem:** There is no canonical mapping between DB slugs and runtime `GameType` values. This creates friction when resolving promotions or loading games.

## Target State

Add a `game_type` column to the `games` table to create a canonical, stable identifier that aligns with the runtime registry.

### Canonical Game Type Mapping

| DB Slug | Canonical `game_type` | Game Name | Icon | Registry Match |
|---------|----------------------|-----------|------|-----------------|
| `spin-wheel` | `spin_wheel` | Spin Wheel | 🎯 | ✅ `spin_wheel` contract exists |
| `mystery-box` | `mystery_box` | Mystery Box | 🎁 | ✅ `mystery_box` contract exists |
| `scratch-win` | `scratch_card` | Scratch Card | ✨→🪙 | ✅ `scratch_card` contract exists |
| `lucky-slot` | `reward_reels` | Reward Reels | 🎰 | ✅ `reward_reels` contract exists (beta) |
| `pick-a-card` | `pick_a_card` | Pick a Card | 🃏 | ❌ No contract (legacy or future) |

### Icon standardization

- `scratch-win` (✨) should be updated to `scratch_card` icon (🪙) for consistency with the contract.
- `lucky-slot` (🎰) maps to `reward_reels` which uses the same icon.

## Migration Strategy

### Phase 1: Add `game_type` column (Non-breaking)

Create a new migration that:

1. Adds `game_type` text column (nullable initially)
2. Adds a unique constraint on `game_type` (for future enforcement)
3. Populates `game_type` based on slug mapping for known games
4. Updates icons to match registry contracts where needed

### Phase 2: Update references (After Phase 1)

Update code that currently references slugs to prefer `game_type`:

- `app/super-admin/games/actions.ts` currently checks `slug === 'spin-wheel'`
- Any slug-based lookups in the runtime should migrate to `game_type`

### Phase 3: Optional enforcement (Future)

Once all code is migrated:

- Make `game_type` NOT NULL
- Mark `slug` as deprecated or keep it for admin display/URLs only

## Proposed Migration SQL

```sql
-- Phase 1: Add game_type column and populate
alter table public.games
add column if not exists game_type text;

-- Create a unique constraint on game_type
alter table public.games
add constraint games_game_type_unique unique (game_type);

-- Map existing slugs to canonical game_type values
update public.games set game_type = 'spin_wheel' where slug = 'spin-wheel';
update public.games set game_type = 'mystery_box' where slug = 'mystery-box';
update public.games set game_type = 'scratch_card' where slug = 'scratch-win';
update public.games set game_type = 'reward_reels' where slug = 'lucky-slot';
update public.games set game_type = 'pick_a_card' where slug = 'pick-a-card';

-- Standardize icons to match registry contracts
update public.games set icon = '🪙' where game_type = 'scratch_card';

-- Add a check constraint to allow only known game types
alter table public.games
add constraint games_game_type_check check (
  game_type in ('spin_wheel', 'mystery_box', 'scratch_card', 'reward_reels', 'pick_a_card')
);
```

## Deployment sequence

1. **Deploy migration:** Adds nullable `game_type` column and populates existing rows.
2. **Update code:** Migrate slug-based lookups to prefer `game_type`.
3. **Validate:** Verify all games resolve correctly via `game_type` in promotion builder and play flows.
4. **Deprecate slug:** Once all code uses `game_type`, mark slug as optional display-only.

## Code Changes Required

### Immediate (Phase 2)

- `app/super-admin/games/actions.ts` line 75: Change `if (slug === 'spin-wheel')` to `if (game_type === 'spin_wheel')`
- Any queries that look up games should use `game_type` where possible

### Future (Phase 3)

- Make `game_type` NOT NULL after all references are updated
- Optional: Deprecate `slug` column or keep it for admin URLs/backwards compatibility

## Benefits

- **Single source of truth:** `game_type` maps directly to runtime `GameType` union
- **Eliminates slug ambiguity:** No more `spin-wheel` vs `spin_wheel` confusion
- **Future-proof:** Adding Open The Door requires only a new contract + DB row with `game_type = 'open_the_door'`
- **Admin clarity:** Super Admin UI can display registry metadata keyed by `game_type`
- **API stability:** Public and internal APIs can use `game_type` as the stable identifier

## Known Legacy Game

`pick-a-card` has no corresponding runtime contract. Options:

1. Create a contract for `pick_a_card` (implement the game)
2. Mark it as a legacy game with `availability: 'hidden'` in a future contract
3. Delete it from the database if it's truly unused

For now, the schema allows it as a valid `game_type`, but it should be addressed as part of the game development roadmap.

## Rollback Plan

If needed, the migration can be reversed by:

1. Removing the `game_type` column
2. Keeping `slug` as the primary identifier (reverting to the current state)

All downstream code that switches to `game_type` would need to revert as well.
