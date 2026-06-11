# Game Type Dependency Audit

> **Status update (June 2026):**
> - Super admin slug checks (`actions.ts`, `GameLabCard.tsx`) were cleaned up per `game-type-cleanup-report.md` — those files now use `game_type`.
> - `lib/game-pool/gameRegistry.ts` has been **deleted** (registry unification). No longer a slug dependency.
> - `open_the_door` was added safely using `game_type` from day one — confirming the migration readiness assessment was correct.
> - The audit below documents the pre-cleanup state for historical context.

---

This audit is based on a repository-wide search for legacy game identifier references:
- `spin-wheel`
- `mystery-box`
- `scratch-win`
- `lucky-slot`
- `games.slug`
- `slug ===`
- `where('slug'`
- `eq('slug'`

## Files still depending on slug

### `app/super-admin/games/actions.ts`
- Purpose: super-admin game update handler for games, including game configuration payload construction.
- Severity: High
- Notes: This file still uses `slug === 'spin-wheel'` as a fallback when deciding whether to populate `game_config` with Spin Wheel payload fields.

### `app/super-admin/games/GameLabCard.tsx`
- Purpose: game lab preview / admin UI logic for rendering Spin Wheel-specific controls or preview state.
- Severity: Medium
- Notes: This file still checks `game.slug === 'spin-wheel'` alongside `game.game_type === 'spin_wheel'`.

### `supabase/migrations/20260430210000_game_global_config.sql`
- Purpose: database migration script that filters games by slug to apply global config changes for Spin Wheel.
- Severity: Medium
- Notes: This is migration code, not runtime app logic, but it still depends on legacy slug values.

### `supabase/migrations/20260601000000_normalize_game_identifiers.sql`
- Purpose: migration script that populates `game_type` from existing legacy slug values and standardizes game metadata.
- Severity: Low
- Notes: This script is the intended normalization path and is expected to reference legacy slugs during migration.

### `docs/architecture/game-type-migration-checklist.md`
- Purpose: migration documentation capturing known slug-to-game_type issues.
- Severity: Informational
- Notes: Contains legacy notes and should be updated after slug references are removed from production code.

### `docs/architecture/game-identifier-normalization.md`
- Purpose: documentation of slug-to-game_type mapping decisions.
- Severity: Informational
- Notes: Useful reference for migration but not part of runtime enforcement.

### `docs/architecture/game-registry-reconciliation.md`
- Purpose: architecture analysis of registry identifier mapping and slug ambiguity.
- Severity: Informational
- Notes: Documents the legacy state and recommended reconciliation strategy.

## Runtime Dependencies

No runtime game resolution flow currently depends on legacy `games.slug` values for game contract resolution. The only remaining slug dependency in production code is in the Super Admin path for Spin Wheel detection.

Other slug lookups observed in the repository, such as `restaurantSlug` and `promotionSlug` in `app/r/[restaurantSlug]/page.tsx` and `app/api/public/promotion-play/route.ts`, are unrelated to `games.slug` and are part of routing/lookup behavior for restaurants and promotions.

## Promotion Builder Dependencies

None detected. The current search found no promotion builder flow that still requires legacy `games.slug` values for game type resolution.

## Super Admin Dependencies

The Super Admin game management flow still depends on legacy slug logic in two places:
- `app/super-admin/games/actions.ts`
- `app/super-admin/games/GameLabCard.tsx`

These should be updated to rely only on `game_type` once the migration is complete.

## Migration Readiness

Can Open The Door be implemented safely using `game_type`?

YES

Caveat: runtime game contract resolution appears ready for `game_type`, but the Super Admin flow still contains legacy `slug` fallbacks. Those fallback checks should be fixed before fully switching to `game_type` only.

## Recommended Next Step

1. Do not change application code in this audit.
2. Update the remaining Super Admin slug checks in `app/super-admin/games/actions.ts` and `app/super-admin/games/GameLabCard.tsx` to rely solely on `game_type`.
3. Keep migration scripts that reference legacy slugs (`supabase/migrations/20260430210000_game_global_config.sql`, `supabase/migrations/20260601000000_normalize_game_identifiers.sql`) as-is until the migration is complete.
4. Run TypeScript validation to confirm the current codebase remains clean.
