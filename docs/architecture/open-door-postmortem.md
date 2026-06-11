# Open The Door Postmortem

> **Note (June 2026):** `lib/game-pool/gameRegistry.ts` — listed below as a file touched during this feature — was **subsequently deleted** as part of registry unification work completed after open_the_door shipped. That file no longer exists. `lib/games/registry.ts` is now the single canonical registry. See `registry-unification-report.md`.
>
> Two post-ship bugs were also discovered and fixed:
> - **Selection bug**: `GameSelectionSection.tsx` click handler had an explicit allow-list that excluded `open_the_door`, making the card visible but unclickable. Fixed. See `open-door-selection-bug.md`.
> - **Preview bug**: `SpinWheelPreview.tsx` fell back to Mystery Box preview for non-wheel games. Fixed by adding `components.BuilderPreview` to the contract. See `open-door-preview-bug.md`.

## Files Touched

- `lib/games/open-the-door/contract.ts`
- `lib/games/open-the-door/runtime.tsx`
- `lib/games/registry.ts`
- `lib/games/types.ts`
- `lib/game-pool/types.ts`
- `lib/game-pool/gameRegistry.ts`
- `lib/builder/types.ts`
- `lib/builder/context.tsx`
- `hooks/usePromotionsAdmin.ts`
- `components/admin/BuilderGameTypeStateSync.tsx`
- `components/admin/GameTypeInlineControl.tsx`
- `components/promotion-builder/GameSelectionSection.tsx`
- `app/admin/promotions/page.tsx`
- `supabase/migrations/20260430170000_super_admin_games.sql`
- `supabase/migrations/20260601000000_normalize_game_identifiers.sql`

## Required Changes

- Added a new formal game contract and runtime for `open_the_door`.
- Registered `open_the_door` in the shared `lib/games/registry.ts`.
- Extended common `GameType` unions to include `open_the_door` across game types, builder types, and game pool types.
- Updated builder state normalization and admin builder game type controls so the new type is preserved instead of defaulting back to `wheel`.
- Added the new game option to the admin promotion creation UI.
- Seeded a new game row for `open-the-door` and mapped the slug to `game_type` in the normalization migration.

## Unexpected Changes

- `lib/game-pool/gameRegistry.ts` required an update because the shared game type union is used beyond just the customer runtime registry.
- Normalization helpers in `components/admin/BuilderGameTypeStateSync.tsx`, `components/admin/GameTypeInlineControl.tsx`, and `lib/builder/context.tsx` needed to be updated even though the new game itself was a runtime-level addition.
- The promotion creation UI had hardcoded selectable game type branches, which made adding a new game require changes in multiple places.

## Framework Friction

- The game framework still has multiple dispersed type unions and normalization branches for `game_type` values.
- Legacy builder logic implicitly mapped unknown game types to `wheel`, which is brittle for new games.
- Admin creation UI and builder selection contained hardcoded allowable types, so adding a new game required both registry registration and explicit UI surface updates.
- There is no single shared source of truth for builder-selectable game types, causing duplication.

## Recommended Improvements

- Centralize supported game types in one shared registry or configuration object instead of scattering union literals across files.
- Replace explicit type-based game selection branches with contract-driven selection logic where the available game contract list determines what appears in the UI.
- Make builder normalization generic so new `game_type` values are preserved by default rather than mapped back to `wheel`.
- Consider moving promotion creation to use `getAvailableGameContracts()` directly, reducing the need for admin page-specific game type conditionals.

## Estimated Future Effort

If the framework were refactored to use a single shared registry and generic type normalization, adding game #6 would likely be 40-60% easier.

Right now, the biggest overhead is updating UI and builder normalization layers rather than the new game logic itself. Once those shared bottlenecks are removed, future games should only require a new contract, registry registration, and seed metadata.
