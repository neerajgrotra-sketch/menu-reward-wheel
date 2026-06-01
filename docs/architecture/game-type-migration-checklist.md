# Game Type Migration - Code Reference

**Date:** June 1, 2026
**Branch:** feature/game-management

## Overview

After the database migration in `supabase/migrations/20260601000000_normalize_game_identifiers.sql` is applied, the following code files need updates to use `game_type` instead of `slug` or hardcoded slug checks.

This document lists all known locations that will need refactoring but does **not** implement those changes yet.

## Affected Files

### 1. Super Admin Game Configuration

**File:** [app/super-admin/games/actions.ts](app/super-admin/games/actions.ts)

**Current code (line ~75):**
```typescript
if (slug === 'spin-wheel') {
  // spin-wheel-specific config handling
}
```

**Issue:** Checks for slug instead of game_type. Will prevent non-spin-wheel games from properly persisting game_config.

**Phase 2 action:** Update to use `game_type` parameter from form data instead of slug.

---

### 2. Game Registry Resolution

**File:** [lib/games/registry.ts](lib/games/registry.ts)

**Current code (line ~40-45):**
```typescript
export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  if (gameType === 'scratch_card') return gameRegistry.scratch_card;
  if (gameType === 'reward_reels') return gameRegistry.reward_reels;
  if (gameType === 'spin_wheel') return gameRegistry.spin_wheel;
  return gameRegistry.wheel;
}
```

**Issue:** Currently uses `GameType` parameter which is already aligned with game_type. No change needed here, but verify that calling code passes `game_type` from DB, not `slug`.

---

### 3. Promotion Play API

**File:** [app/api/public/promotion-play/route.ts](app/api/public/promotion-play/route.ts)

**Current code (line ~88):**
```typescript
fallbackGameType: (promotion.game_type || 'wheel') as GameType,
```

**Issue:** Promotion already stores `game_type`. Should verify this maps correctly to the normalized game types (e.g., `spin_wheel` instead of `spin-wheel`).

**Phase 2 action:** After migration, verify that promotions default to `'wheel'` (backward compat) or update to use `'spin_wheel'`.

---

### 4. Builder Game Type Resolution

**File:** [lib/builder/context.tsx](lib/builder/context.tsx) and related builder files

**Current code:** Builder uses `promotion.game_type` field, which should now align with normalized game types.

**Issue:** Builder may have hardcoded game type checks or assumptions about slug format.

**Phase 2 action:** Audit builder for any slug-based lookups and migrate to game_type.

---

### 5. Game Pool Registry

**File:** [lib/game-pool/gameRegistry.ts](lib/game-pool/gameRegistry.ts)

**Current code:**
```typescript
export const GAME_REGISTRY: Record<GameType, ComponentType<any>> = {
  wheel: PlaceholderGame,
  mystery_box: PlaceholderGame,
  scratch_card: PlaceholderGame,
  slot_machine: PlaceholderGame,
  pick_a_door: PlaceholderGame,
  fortune_cookie: PlaceholderGame,
};
```

**Issue:** This legacy registry has entries that don't match the canonical games table game_type values. It should be unified with `lib/games/registry.ts`.

**Phase 2 action:** Replace `lib/game-pool/gameRegistry.ts` with imports from `lib/games/registry.ts` or deprecate it.

---

### 6. Game Type Union Definitions

**File:** [lib/game-pool/types.ts](lib/game-pool/types.ts)

**Current code:**
```typescript
export type GameType =
  | 'wheel'
  | 'mystery_box'
  | 'scratch_card'
  | 'slot_machine'
  | 'pick_a_door'
  | 'fortune_cookie';
```

**Issue:** This overlaps with `lib/games/types.ts` and has entries that don't exist in the current contract registry. Should be consolidated.

**Phase 2 action:** Deprecate this file in favor of `lib/games/types.ts` GameType union.

---

### 7. Builder Game Type Union

**File:** [lib/builder/types.ts](lib/builder/types.ts)

**Current code:**
```typescript
export type BuilderGameType = 'wheel' | 'mystery_box' | 'scratch_card';
```

**Issue:** Restricts builder to only 3 games but database now has 5. Should be aligned with registry.

**Phase 2 action:** Update to include all available games or derive from registry.

---

### 8. Promotion Builder UI

**File:** [components/promotion-builder/GameSelectionSection.tsx](components/promotion-builder/GameSelectionSection.tsx)

**Current code:** Renders game cards from `availableGames` - should already be correct.

**Issue:** Verify that game selection properly uses registry game types, not slugs.

**Phase 2 action:** No changes needed if already using `availableGames` from registry.

---

### 9. Admin Game Type Selector

**File:** [components/admin/GameTypeRegistrySelector.tsx](components/admin/GameTypeRegistrySelector.tsx)

**Current code:** Uses `availableGames` and `game.type` - should already be correct.

**Issue:** None identified. This component already uses the registry properly.

**Phase 2 action:** No changes needed.

---

### 10. Super Admin Games Page

**File:** [app/super-admin/games/GameLabCard.tsx](app/super-admin/games/GameLabCard.tsx)

**Current code (line ~295):**
```typescript
const isSpinWheel = game.slug === 'spin-wheel';
```

**Issue:** Uses slug comparison instead of game_type.

**Phase 2 action:** Change to `game.game_type === 'spin_wheel'`.

---

### 11. Promotion Record Insertion

**File:** [app/api/admin/promotions/create/route.ts](app/api/admin/promotions/create/route.ts) (if exists) or similar

**Issue:** When creating a promotion, must ensure `game_type` is set to a valid canonical value, not a slug.

**Phase 2 action:** Audit promotion creation to ensure it uses game_type correctly.

---

## Migration Checklist

- [ ] Database migration applied
- [ ] Update [app/super-admin/games/actions.ts](app/super-admin/games/actions.ts) to use game_type
- [ ] Update [app/super-admin/games/GameLabCard.tsx](app/super-admin/games/GameLabCard.tsx) slug check
- [ ] Verify [app/api/public/promotion-play/route.ts](app/api/public/promotion-play/route.ts) handles game_type correctly
- [ ] Consolidate [lib/game-pool/types.ts](lib/game-pool/types.ts) with [lib/games/types.ts](lib/games/types.ts)
- [ ] Update [lib/builder/types.ts](lib/builder/types.ts) BuilderGameType union
- [ ] Review [lib/game-pool/gameRegistry.ts](lib/game-pool/gameRegistry.ts) for deprecation
- [ ] Run `npx tsc --noEmit` to validate all type changes
- [ ] Test promotion creation with each game type
- [ ] Test play flow for each game type
- [ ] Deploy to staging for QA validation

## Notes

- The migration is non-breaking: `game_type` is initially nullable and a unique constraint is added.
- No code changes are required for the migration to deploy successfully.
- Code updates can be staged across multiple PRs to keep changes reviewable.
- After all code is migrated, `game_type` can be made NOT NULL in a future migration.
