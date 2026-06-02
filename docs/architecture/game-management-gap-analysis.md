# Game Management Gap Analysis

**Date:** June 1, 2026
**Branch:** feature/game-management

## Existing Functionality

- Super Admin can view every row in the `games` table at `/super-admin/games`.
- The UI is a list of game cards with counts for `active`, `coming_soon`, and `disabled` games.
- Super Admin can update existing game rows via `app/super-admin/games/actions.ts`.
- Editable fields in the current UI include:
  - `name`
  - `slug`
  - `description`
  - `icon`
  - `status` (`active`, `coming_soon`, `disabled`)
  - `min_rewards`, `max_rewards`
  - `default_spins`
  - `default_coupon_expiry_minutes`
  - `sort_order`
  - `stop_on_win_default`
  - `supports_coupon`
  - `supports_weighting`
  - `supports_try_again`
- Spin Wheel has a dedicated preview card and additional global configuration for:
  - `wheel_speed`
  - `spin_rotations`
  - `slowdown_seconds`
  - `win_effect`
  - `try_again` label and colors
- Other game cards render a placeholder preview, indicating game-specific controls are not yet built.
- The Super Admin page uses `requireSuperAdmin()` in `lib/super-admin.ts` to protect access.
- The game management UI is implemented in `app/super-admin/games/page.tsx` and `app/super-admin/games/GameLabCard.tsx`.
- The update action persists game fields to the `games` table and revalidates `/super-admin/games`.

## Database Fields

`games` table columns:

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `name` (text, not null)
- `slug` (text, unique, not null)
- `description` (text)
- `status` (text, not null, default `coming_soon`, check in `('active', 'coming_soon', 'disabled')`)
- `icon` (text)
- `min_rewards` (int, not null, default 6)
- `max_rewards` (int, not null, default 10)
- `min_products` (int, not null, default 6)
- `max_products` (int, not null, default 10)
- `default_spins` (int, not null, default 3)
- `default_coupon_expiry_minutes` (int, not null, default 20)
- `stop_on_win_default` (boolean, not null, default true)
- `supports_coupon` (boolean, not null, default true)
- `supports_weighting` (boolean, not null, default true)
- `supports_try_again` (boolean, not null, default false)
- `sort_order` (int, not null, default 0)
- `game_config` (jsonb, not null, default `'{}'`)
- `created_at` (timestamptz, not null, default now())
- `updated_at` (timestamptz, not null, default now())

Constraints and triggers:

- `games_reward_range_check` ensures `min_rewards > 0` and `max_rewards >= min_rewards`
- `games_default_spins_check` ensures `default_spins > 0`
- `games_coupon_expiry_check` ensures `default_coupon_expiry_minutes > 0`
- `games_product_range_check` ensures `min_products > 0` and `max_products >= min_products`
- Trigger `set_games_updated_at` updates `updated_at` before update

## Current UI Capabilities

- activate games? Yes. `status` can be set to `active`.
- disable games? Yes. `status` can be set to `disabled`.
- hide games? No. There is no separate `hidden` status or dedicated hide behavior in the UI or DB status enum.
- mark games coming soon? Yes. `status` can be set to `coming_soon`.
- edit descriptions? Yes, description is editable in the form.
- edit icons? Yes, icon is editable in the form.
- edit configuration? Yes, global configuration is editable for all games, and spin-wheel receives additional `game_config` editing.

## Missing Capabilities

### Missing Super Admin workflows

- Create new games from the UI.
- Delete existing games from the UI.
- Manage a distinct hidden/beta lifecycle state separate from `disabled` and `coming_soon`.
- Edit `min_products` and `max_products` independently of `min_rewards` and `max_rewards`.
- Persist and edit game-specific `game_config` for non-spin-wheel games.
- Display a real preview/testing experience for games other than Spin Wheel.
- Prevent or validate unsafe `slug` changes, since `slug` is used to resolve contracts.
- Expose a game lifecycle beyond `active`, `coming_soon`, and `disabled`.
- View game details, history, or audit trail for configuration changes.
- Control game availability at the contract/registry level (`active`/`beta`/`hidden`) from a single admin surface.
- Support rollout controls or restaurant-scoped enablement.

### Technical gaps in current implementation

- `GameLabCard` uses `min_rewards`/`max_rewards` only, while `min_products`/`max_products` exist in the schema but are never editable and are always overwritten to match reward ranges in `actions.ts`.
- `game_config` persistence is implemented only for `spin-wheel`; other games do not expose a config editor or persist custom config.
- UI capability is limited to updating existing rows; there is no create/delete action in `app/super-admin/games/actions.ts`.
- The `lib/games/registry.ts` contract-level availability uses `availability !== 'hidden'` and a separate concept of game contract visibility that is not reflected in the `games` table.
- `status` is a platform-wide game status, but there is no clear mapping to game contract `availability` or promotion launch state.
- There is no dedicated game management API beyond the server action used for updates.

## Recommended Roadmap

### Phase 1 — Core game management completion

- Add create/delete game management support in `app/super-admin/games`.
- Add explicit `hidden` or `beta` visibility states and make them actionable in the UI.
- Expose `min_products` and `max_products` as editable fields separate from reward counts.
- Expand the game config UI to support non-spin-wheel games and persist `game_config` consistently.
- Add form validation and slug safety checks to prevent contract-breaking renames.
- Improve Super Admin page UX for game rows, filters, and status labels.

### Phase 2 — Registry and contract alignment

- Align `games` table lifecycle states with game contract availability in `lib/games/registry.ts` and `lib/games/types.ts`.
- Surface contract-driven metadata and preview capabilities for every registered game.
- Build a single source of truth for game availability across DB configuration and runtime registry.
- Add admin controls for game launch sequencing and hidden/beta release plans.

### Phase 3 — Governance, rollout, and audit

- Add audit logging or change history for game configuration changes.
- Introduce restaurant-level or segment-level game rollout controls.
- Support promotion-level overrides and release management for game defaults.
- Add feature flag or experiment support for new game availability.

## Specific Code Changes Needed

- `app/super-admin/games/page.tsx`
  - Add create/delete flows, filters, and management actions.
  - Surface hidden/beta status if the schema is extended.

- `app/super-admin/games/GameLabCard.tsx`
  - Add editable fields for `min_products` / `max_products`.
  - Add configurable `game_config` support for games beyond Spin Wheel.
  - Add better preview sections for non-spin-wheel games.
  - Add slug-change validation and UI guidance.

- `app/super-admin/games/actions.ts`
  - Add `createGame` / `deleteGame` server actions.
  - Add validation for hidden/beta lifecycle states.
  - Update action payloads to persist separate `min_products` / `max_products`.
  - Expand `game_config` persistence logic for other game types.

- `supabase/migrations/20260430170000_super_admin_games.sql`
  - Potential schema updates for hidden/beta status, game lifecycle metadata, or new constraint support.

- `supabase/migrations/20260430210000_game_global_config.sql`
  - Potential schema updates for expanded `game_config` support or config defaults.

- `lib/games/registry.ts`
  - Align game registry availability semantics with DB-managed status.
  - Ensure slug/contract mapping supports new game lifecycle states.

- `lib/games/types.ts`
  - Potentially add or refine status/availability unions and config typing.

- `docs/architecture/super-admin-audit.md`
  - Update audit documentation once new game management requirements are implemented.

---

## Notes

- The current repository passes `npx tsc --noEmit` without errors.
