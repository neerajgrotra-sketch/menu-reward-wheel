# Game Registry Reconciliation

**Date:** June 1, 2026
**Branch:** feature/game-management

## Summary

This reconciliation compares the application game registry in `lib/games/registry.ts` with the seeded `games` table rows in `supabase/migrations/20260430170000_super_admin_games.sql`.

## Registry Entries

The active game registry contains these entries:

- `wheel` / `spin_wheel`
  - Contract name: `Spin Wheel`
  - Icon: `🎯`
  - `createCard.description`: `Customers scan a QR code, spin a branded prize wheel, and win configured rewards.`
  - Availability: `active`
- `mystery_box`
  - Contract name: `Mystery Box Reveal`
  - Icon: `🎁`
  - `createCard.description`: `Customers tap one of 3 mystery boxes and reveal a surprise coupon with stars and confetti.`
  - Availability: `active`
- `scratch_card`
  - Contract name: `Scratch Card`
  - Icon: `🪙`
  - `createCard.description`: `Customers scratch through a digital card to reveal a surprise reward using the shared coupon engine.`
  - Availability: `active`
- `reward_reels`
  - Contract name: `Reward Reels`
  - Icon: `🎰`
  - `createCard.title`: `Slot Machine`
  - `createCard.description`: `Pull the lever, match the reels, and unlock a surprise reward.`
  - Availability: `beta`

## Seeded Database Rows

Seeded `games` table records in `supabase/migrations/20260430170000_super_admin_games.sql`:

- `spin-wheel`
  - Name: `Spin Wheel`
  - Description: `Customers spin a branded reward wheel and win configured coupons.`
  - Icon: `🎯`
  - Status: `active`
- `scratch-win`
  - Name: `Scratch & Win`
  - Description: `Customers scratch a digital card to reveal an instant reward.`
  - Icon: `✨`
  - Status: `coming_soon`
- `mystery-box`
  - Name: `Mystery Box`
  - Description: `Customers pick a mystery box and reveal a surprise coupon.`
  - Icon: `🎁`
  - Status: `coming_soon`
- `pick-a-card`
  - Name: `Pick a Card`
  - Description: `Customers choose a card from a playful deck to reveal their prize.`
  - Icon: `🃏`
  - Status: `coming_soon`
- `lucky-slot`
  - Name: `Lucky Slot`
  - Description: `Customers play a quick slot-style game to unlock a coupon.`
  - Icon: `🎰`
  - Status: `coming_soon`

## Audit Findings

### 1. Missing games in database

The registry includes game contracts that are not represented by seeded `games` rows:

- `scratch_card` is missing from the database.
- `reward_reels` is missing from the database.

### 2. Missing games in registry

The database includes seeded games with no corresponding registry entry:

- `scratch-win`
- `pick-a-card`
- `lucky-slot`

These are likely legacy or planned titles that are not mapped to the current contract registry.

### 3. Slug and mapping mismatches

- The DB uses `spin-wheel` while the registry uses `spin_wheel` and `wheel`.
  - The only explicit code mapping for `spin-wheel` exists in `app/super-admin/games/actions.ts` to support spin-wheel-specific config.
  - There is no general slug normalization layer between `games.slug` and `GameType` values.
- There is no direct DB/registry mapping for `scratch-win` to `scratch_card`.
- There is no direct DB/registry mapping for `mystery-box` to `mystery_box` in code, though the naming suggests the intended relationship.
- There is no direct DB/registry mapping for `lucky-slot` to `reward_reels`, despite icon and theme similarity.

### 4. Status and description mismatches

- `Spin Wheel`: registry and DB agree on active availability and icon.
- `Mystery Box`: DB uses `mystery-box` and icon `🎁`; registry uses `mystery_box` and icon `🎁`.
  - Descriptions differ slightly but are semantically aligned.
- `Scratch`: DB uses `scratch-win` with icon `✨` and status `coming_soon`; registry uses `scratch_card` with icon `🪙` and availability `active`.
  - This is a clear mismatch in both slug and status/availability semantics.
- `Pick a Card`: DB only, no registry contract.
- `Lucky Slot`: DB only, but registry has `reward_reels` with a slot machine concept.
  - This indicates a possible legacy naming mismatch rather than an actual missing game type.

### 5. Duplicate sources of truth

- `games.slug` is currently the only persisted identifier in the database, but the runtime registry uses `GameType` values like `spin_wheel`, `mystery_box`, `scratch_card`, and `reward_reels`.
- `lib/games/registry.ts` contains the canonical contract definitions for runtime behavior (name, icon, availability, descriptions), while `games` table rows contain editable metadata.
- As implemented today, the database and registry are two overlapping sources of truth with no strict reconciliation layer.
  - The database is the persisted admin-configurable source of game metadata.
  - The registry is the runtime behavior source.
- Additional duplication exists in naming and icon definitions between DB seeds and contract metadata.

## Recommended Canonical Source of Truth

- Use `lib/games/registry.ts` / `lib/games/*/contract.ts` as the canonical runtime game registry.
  - This should define `GameType`, availability, default metadata, and runtime components.
- Use the `games` database table as the canonical persisted admin configuration layer.
  - The table should reference registry-backed game types via a stable field such as `game_type` or normalized `slug`.
- Introduce a canonical mapping layer between `games.slug` and registry `GameType` values.
  - Prefer a distinct `game_type` column in `games` over relying on a free-form slug.
  - If `slug` stays, normalize it with a strict mapping table or enum.
- Keep contract descriptions and icons in the registry, with the DB storing optional overrides only when needed.

## Recommendations

- Normalize runtime mapping by adding a `game_type` field in `games` or by enforcing a strict slug/contract map.
- Migrate legacy seeded rows (`scratch-win`, `pick-a-card`, `lucky-slot`) to match current registry game types or add registry entries for them.
- Remove ambiguity between `spin-wheel` and `spin_wheel` by consolidating on one canonical identifier.
- Align DB status values with registry availability semantics to avoid dual lifecycle definitions.
- Make the registry the source of truth for game definitions, and make the database the source of truth for super-admin configuration.
