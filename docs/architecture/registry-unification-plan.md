# Registry Unification Plan

## Objective

Document the current split between game contract metadata and runtime component registry logic, and propose a canonical unification path without changing code.

## 1. Responsibilities of each registry

### `lib/games/registry.ts`
- Holds the canonical per-game `GameContract` definitions.
- Exposes metadata-driven helpers: `getGameDefinition`, `getGameContract`, `getAvailableGameContracts`.
- Provides game type alias handling (`wheel` / `spin_wheel`) and hides implementation details behind contract objects.
- Used for promotion builder UI, admin preview cards, and client play page mapping.

### `lib/game-pool/gameRegistry.ts`
- Maps `GameType` values to React runtime components.
- Designed for direct dynamic rendering of a game component based on `gameType`.
- Uses the shared `GameType` union from `lib/games/types.ts`.
- Exists separately from contract metadata.

### `components/game/GameRuntimeRenderer.tsx`
- Runtime wrapper that selects a React component from `GAME_REGISTRY` and renders it.
- Responsible for safe fallback messaging when a game type has no component.
- Centralizes the actual component lookup for runtime render paths.

### `lib/game-pool/resolvePromotionGame.ts`
- Selects and persists the promotion play session game type.
- Resolves existing play session assignments or chooses a weighted assignment from `promotion_game_assignments`.
- Returns the final `GameType` that the client should render.
- Is a selection/assignment service, not a contract registry.

## 2. Why both exist

- `lib/games/registry.ts` is a domain-level registry of game definitions and meta-behavior. It is used for builder logic, preview generation, and game configuration.
- `lib/game-pool/gameRegistry.ts` is a runtime UI registry specialized for component rendering. It was likely introduced to decouple actual rendered React components from the contract/metadata layer.
- The separation appears to reflect two orthogonal concerns:
  1. "What is this game and how does it behave?" (`games/registry.ts`)
  2. "Which React component should render this game at runtime?" (`game-pool/gameRegistry.ts`)
- `resolvePromotionGame.ts` is the play-session assignment flow, and it needs only the `GameType` value, not full game contracts.

## 3. Which registry should become canonical

The canonical registry should be `lib/games/registry.ts`.

Rationale:
- It already contains formal `GameContract` objects and shared helpers.
- It is used by both admin/builder and front-end play paths.
- It is the single source of truth for game metadata, labels, availability, preview behavior, and contract-level helpers.
- Component rendering should be derived from the canonical contract registry instead of maintaining a parallel registry.

`lib/game-pool/gameRegistry.ts` should become a derived/runtime-only mapping or be folded into the canonical registry as a component map.

## 4. Exact files that depend on each registry

### Depends on `lib/games/registry.ts`
- `components/promotion-builder/PromotionBuilderShell.tsx`
  - imports `getGameContract`
- `components/promotion-builder/GameSelectionSection.tsx`
  - imports `getAvailableGameContracts`
- `components/admin/BuilderGamePreviewCard.tsx`
  - imports `getGameDefinition`
- `components/admin/GameTypeRegistrySelector.tsx`
  - imports `availableGames`
- `components/admin/GameTypeInlineControl.tsx`
  - imports `availableGames`
- `components/admin/SpinWheelPreview.tsx`
  - imports `getGameDefinition`
- `app/play/[restaurantSlug]/[promotionSlug]/page.tsx`
  - imports `getGameDefinition`

### Depends on `lib/game-pool/gameRegistry.ts`
- `components/game/GameRuntimeRenderer.tsx`
  - imports `GAME_REGISTRY`

### Depends on `lib/game-pool/resolvePromotionGame.ts`
- `app/api/public/promotion-play/route.ts`
  - imports `resolvePromotionGame`

### Additional runtime/lookup dependencies
- `lib/game-pool/types.ts`
  - defines `GameType` and `GamePoolEntry`
  - referenced by `lib/game-pool/resolvePromotionGame.ts`

## 5. Proposed migration path

1. Keep `lib/games/registry.ts` as the canonical contract registry.
2. Introduce a runtime component map exported from `lib/games/registry.ts` or another shared file in `lib/games`.
3. Update `components/game/GameRuntimeRenderer.tsx` to use the canonical registry-derived runtime mapping instead of importing `lib/game-pool/gameRegistry.ts`.
4. Migrate any `GameType` alias or union duplication to the centralized `lib/games/types.ts` source.
5. Ensure `resolvePromotionGame.ts` continues to return a `GameType` and does not require dependence on a separate component registry.
6. Remove `lib/game-pool/gameRegistry.ts` once component mapping has been fully migrated and runtime rendering only uses canonical mappings.

## 6. Risks

- If `gameRegistry` and the contract registry diverge, runtime rendering could become inconsistent with contract metadata.
- Hidden or alias game types (`spin_wheel`, `reward_reels`) may behave differently in each registry during migration.
- Runtime component imports may be sensitive to bundle size and client-only rendering constraints if moved incorrectly.
- Existing preview/admin contracts and production play flow must continue to resolve the same game type values.
- `GameRuntimeRenderer` appears to be the only consumer of `lib/game-pool/gameRegistry.ts`; if it is unused elsewhere, the migration risk is lower but still requires validation.

## 7. Estimated effort

- Audit and dependency validation: 1-2 hours
- Create canonical runtime component mapping and update `GameRuntimeRenderer`: 2-3 hours
- Remove duplicate registry code and clean up imports: 1-2 hours
- Regression testing and type validation: 1-2 hours

Total estimate: 1 working day (4-8 hours), depending on whether the runtime component mapping can be reused directly from the canonical registry.
