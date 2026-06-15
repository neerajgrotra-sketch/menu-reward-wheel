# SpinBite Entity Registry — Single Source of Truth Policy

**Status:** Active — enforced by Engineering Rule 13
**Audience:** Engineering, product, and future AI coding sessions

---

## Principle

Core product entities must never have duplicate implementations.

Every entity that appears across multiple surfaces — admin, public, game engine, coupons, analytics — must have exactly one canonical definition. All other files must import from that definition; they must never re-define it.

Duplication causes silent divergence. The game visual fragmentation audit (2026-06-15) found **7 independent systems** all rendering the same 5 games differently, including a live data bug where `open_the_door` and `reward_reels` promotions displayed as "🎯 Spin Wheel" in the admin management view.

---

## Core Entities and Their Canonical Sources

### 1. Game Types

**Canonical source:** `lib/games/game-registry.ts`

Owns: `id`, `label`, `status`, `description`, `visual` key.

| Entity | Canonical File | What It Owns |
|---|---|---|
| Display metadata (label, status, description) | `lib/games/game-registry.ts` → `GAME_REGISTRY` | Labels, statuses, descriptions for all surfaces |
| Runtime contracts (components, animations, config) | `lib/games/*/contract.ts` | PlayComponent, confetti, getTargetRotation, createCard |
| Type definitions | `lib/games/types.ts` → `GameType` | TypeScript union type |
| CSS visual components | `components/game-visuals/GameVisual.tsx` | MiniPrizeWheel, MiniMysteryBox, MiniScratchCard, MiniOpenDoor |

**Forbidden:**
- Hardcoded label maps like `if (gameType === 'scratch_card') return 'Scratch Card'`
- Separate icon maps per component file
- Defining game lists anywhere other than the registry

**Current known violations (to be fixed in Phase 2+):**
- `app/LandingPageClient.tsx` — local `GAME_DEFINITIONS` constant
- `components/home/AvailableGamesSection.tsx` — local games array with hardcoded data
- `app/admin/promotions/page.tsx` — local `MiniPrizeWheel`, `MiniMysteryBox`, `MiniScratchCard`, `MiniOpenDoor` functions

---

### 2. Promotion Types

**Canonical source:** `hooks/usePromotionsAdmin.ts` → `type Promotion`

Status values (`active`, `pending`, `ended`, `draft`) must not be re-defined as separate enums or string unions in other files.

**Forbidden:**
- Independent `statusOf()` functions that duplicate promotion state logic
- Hardcoded status string comparisons outside the canonical hook

---

### 3. Menu Item Status

**Canonical source:** TBD — needs to be established in Phase 2

Current merchandising states: `featured`, `chef_special`, `popular`, `sold_out`.

These states currently have no central TypeScript definition. Any file using these strings is a violation risk.

**Action required:** Create `lib/menu/item-status.ts` with a `MenuItemStatus` type and canonical label map.

---

### 4. Coupon State

**Canonical source:** TBD — needs to be established in Phase 2

Current coupon display statuses: `active`, `expired`, `redeemed`.

**Action required:** Create `lib/coupons/coupon-status.ts`.

---

### 5. Promotion Status

**Canonical source:** `hooks/usePromotionsAdmin.ts` → `type Filter` + `getPromotionStatus()`

Do not re-implement promotion status logic. Import from the hook.

---

### 6. Customer Identity Status

**Canonical source:** TBD — needs to be established alongside the Customer Intelligence Engine (Phase 5 per target architecture).

---

## What Counts as Duplication

The following are all violations of Rule 13:

| Pattern | Why It's a Violation |
|---|---|
| `if (type === 'scratch_card') return '🪙'` in multiple files | Icon definition duplicated — change in one place won't propagate |
| `const games = [{ title: 'Spin Wheel', icon: '🎯' }]` inline in a component | Game list defined outside the registry |
| `type Status = 'active' \| 'ended' \| 'draft'` defined in 3 different files | Type union duplicated — they can silently diverge |
| Separate `statusBadge()` helpers in multiple page components | Business logic duplicated |
| Hardcoded fallback that covers all unknown values with a default | Masks missing cases instead of surfacing them |

---

## How to Add a New Game

1. Create `lib/games/<game-type>/contract.ts` with the full `GameContract`
2. Add the game to `lib/games/registry.ts` → `gameRegistry`
3. Add the game to `lib/games/game-registry.ts` → `GAME_REGISTRY`
4. Add the CSS visual to `components/game-visuals/GameVisual.tsx`
5. Do NOT add the game anywhere else — all other files derive from the above

---

## Refactor Priority Queue (Phase 2+)

| Violation | File | Priority |
|---|---|---|
| Local `GAME_DEFINITIONS` | `app/LandingPageClient.tsx` | High |
| Local games array | `components/home/AvailableGamesSection.tsx` | High |
| Local Mini* icon components | `app/admin/promotions/page.tsx` | High |
| Emoji `game.icon` used directly in UI (not from GAME_REGISTRY) | Multiple | Medium |
| Print wheel uses 6-segment conic-gradient vs 8-segment game wheel | `app/admin/promotions/[id]/print/page.tsx` | Medium |
| Fortune Cookie in marketing page (game does not exist in registry) | `components/home/AvailableGamesSection.tsx` | Low |
