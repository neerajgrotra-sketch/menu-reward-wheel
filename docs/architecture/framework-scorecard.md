# Framework Scorecard

## 1. How many files are now required to add a new game?

At minimum, the framework currently requires changes in 4 core places:

- `lib/games/types.ts` to add the new `GameType` literal
- `lib/games/<new-game>/contract.ts` to define the game contract
- `lib/games/<new-game>/runtime.tsx` to define the runtime component
- `lib/games/registry.ts` to import and register the new contract and include it in `validGameTypes`

In practice, because some consumer code still uses explicit game-type branches, a full product-level addition typically touches 6-8 files:

- `components/promotion-builder/GameSelectionSection.tsx`
- `lib/builder/types.ts`
- `app/admin/promotions/page.tsx`
- potentially admin builder preview or inline controls such as `components/admin/GameTypeInlineControl.tsx`

So the current framework is closer to 4 core files plus 2-4 UI-specific files.

## 2. Compare: Before Open The Door vs After Registry Unification

### Before Open The Door

- Game runtime component lookup was handled by a separate `lib/game-pool/gameRegistry.ts`.
- `GameType` definitions were duplicated across `lib/games/types.ts`, `lib/game-pool/types.ts`, and builder-specific type aliases.
- There were two registry boundaries: the contract registry in `lib/games/registry.ts` and the runtime registry under `lib/game-pool`.
- New games required changes in both metadata and runtime registry surfaces.

### After Registry Unification

- `lib/games/registry.ts` is now the single canonical registry for metadata and runtime component resolution.
- `GameRuntimeRenderer.tsx` now resolves runtime components through `getRuntimeGameComponent` instead of a separate `GAME_REGISTRY` file.
- The old file `lib/game-pool/gameRegistry.ts` is deleted.
- `lib/games/types.ts` remains the central `GameType` source.
- The split between contract-driven behavior and runtime rendering is now collapsed into one registry boundary.

## 3. Which architectural pain points remain?

- Explicit type branches still exist in UI code, especially in `components/promotion-builder/GameSelectionSection.tsx` and a few admin controls.
- `BuilderGameType` is still manually narrowed in `lib/builder/types.ts` to a subset of game types.
- There are still local `GameType` aliases and extracted subsets (`CreatePromotionGameTypePatch.tsx`, `app/admin/promotions/page.tsx`), which means not every consumer is fully generic.
- Some game selection and preview logic still relies on hardcoded type checks instead of deriving allowed games directly from contract metadata.
- `lib/game-pool/types.ts` still exists as a type alias wrapper for backward compatibility.

## 4. Is `GameType` now centralized?

Yes, largely.

- The canonical `GameType` union is defined in `lib/games/types.ts`.
- Most code now imports that type directly.
- A legacy wrapper file remains in `lib/game-pool/types.ts`, but it re-exports the canonical union.

So the source is centralized, but the ecosystem still has a small level of aliasing.

## 5. Is the registry now centralized?

Yes.

- `lib/games/registry.ts` is now the single canonical registry for both game contracts and runtime component lookup.
- `GameRuntimeRenderer.tsx` consumes `getRuntimeGameComponent` from the canonical registry.
- The old separate runtime registry has been removed.

## 6. What is still duplicated?

- Hardcoded allowed game-type lists and selection branches in UI components.
- Builder-specific type narrowing of `GameType` to `BuilderGameType`.
- Local game-type filters in admin components and the promotion page.
- The legacy `lib/game-pool/types.ts` alias remains for type compatibility.

## 7. Estimated files touched for:

### Treasure Chest

Likely 6-8 files:

- `lib/games/types.ts`
- `lib/games/treasure-chest/contract.ts`
- `lib/games/treasure-chest/runtime.tsx`
- `lib/games/registry.ts`
- `components/promotion-builder/GameSelectionSection.tsx`
- `lib/builder/types.ts`
- `app/admin/promotions/page.tsx`
- possibly admin controls if the game should be selectable in builder/admin flows

### Match 3

Likely 6-8 files, similar to Treasure Chest.

### Slot Machine

Likely 5-7 files.

- If slot machine is built as a new type separate from the existing `reward_reels` placeholder, it will need the same set of files.
- If it reuses the existing placeholder contract, then the count may be on the lower end (4-6 files).

## 8. Architecture score

### Before branch

- Score: 4/10
- Reasons: duplicate registries, duplicated type definitions, split runtime metadata boundaries, and a more fragile add-new-game surface.

### After branch

- Score: 7/10
- Reasons: registry unification is successful, runtime component lookup is centralized, and `GameType` is centralized in one type file. Remaining score loss comes from hardcoded UI branches, builder-specific type narrowing, and leftover aliasing.
