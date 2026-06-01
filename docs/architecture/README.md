# SpinBite Architecture

This document describes the implementation of SpinBite as found in this repository. It is based on code and files present in the project — no assumptions beyond the repository contents are made.

## 1. Product Overview

SpinBite is a restaurant QR promotion platform. Restaurants create promotions (with rewards) and publish them. Customers scan a QR code, open a web play page, play a simple game (Spin Wheel, Mystery Box, Scratch Card, or Slot Machine/Reward Reels placeholder), and win coupons. Staff can validate/redeem coupons using server-side records.

Key user roles:
- Restaurant admin: creates promotions and configures rewards.
- Customer: scans QR, plays, and receives coupons.
- Staff: validates or redeems coupons in-person.
- Super admin: (repository includes admin pages and migrations for super-admin games and site content).

## 2. High-Level User Flows

- Restaurant admin flow
  - Create promotion using the Promotion Builder UI. Relevant code: [components/promotion-builder/CreatePromotionFlow.tsx](components/promotion-builder/CreatePromotionFlow.tsx#L1).
  - Select game type using a registry-driven selector at [components/promotion-builder/GameSelectionSection.tsx](components/promotion-builder/GameSelectionSection.tsx#L1).
  - Save a draft promotion which becomes a database record in `promotions` (see Supabase schema and migrations in `supabase/`).

- Customer play flow
  - Customers access a play URL (QR points to a route like `/play/[restaurantSlug]/[promotionSlug]`). The play UI is implemented at [app/play/[restaurantSlug]/[promotionSlug]/page.tsx](app/play/[restaurantSlug]/[promotionSlug]/page.tsx#L1).
  - The client requests promotion and reward data from the server via the public API route [app/api/public/promotion-play/route.ts](app/api/public/promotion-play/route.ts#L1). That route resolves the restaurant and promotion, selects the game, loads rewards, and returns the data needed by the client.
  - The client renders the game PlayComponent for the resolved game and calls `/api/coupons/issue` to persist coupon issuance when a player wins. See [app/api/coupons/issue/route.ts](app/api/coupons/issue/route.ts#L1).

- Staff validation flow
  - Coupons are issued and stored server-side (see tables in `supabase/schema.sql` and insert logic in `app/api/coupons/issue/route.ts`). Staff validate coupons against those records (the repo contains admin APIs under `app/api/admin/`).

- Super admin flow
  - The repository contains admin routes and migrations for super-admin features (see `supabase/migrations/20260430170000_super_admin_games.sql` and pages under `app/admin/`).

## 3. Repository Map

- `app/` — Next.js app routes and pages. Key pages:
  - `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` — customer play UI and client-side game orchestration.
  - `app/admin/` — admin UI pages.
  - `app/api/` — server route handlers (public and admin APIs).

- `components/` — reusable React components and visual building blocks.
  - `components/promotion-builder/` — promotion creation UI and selector components.
  - `components/games/` — game UI components and small preview visuals.
  - `components/game/GameRuntimeRenderer.tsx` — runtime loader for game components: it maps `gameType` to a UI component using `GAME_REGISTRY`.

- `lib/` — application libraries and domain logic.
  - `lib/games/` — game contracts and registry.
    - `lib/games/registry.ts` — central game registry and helper functions: `getAvailableGameContracts()`, `getGameDefinition()`, `getGameContract()`.
    - `lib/games/types.ts` — `GameContract`, `GameType`, and related type definitions.
    - Per-game contract files: `lib/games/spin-wheel/contract.ts`, `lib/games/mystery-box/contract.ts`, `lib/games/scratch-card/contract.ts`, `lib/games/reward-reels/contract.ts`.
  - `lib/supabase/` — Supabase client helpers: `lib/supabase/client.ts` and `lib/supabase/server.ts`.
  - `lib/rewards.ts` — reward picking, coupon helpers (used by play page).
  - `lib/game-pool/` — runtime registry/resolution helpers (`gameRegistry`, resolver functions).

- `supabase/` — SQL schema and migrations. Key files:
  - `supabase/schema.sql` — canonical tables: `restaurants`, `menu_items`, `rewards`, `coupons`, and RLS policy snippets.
  - `supabase/migrations/` — migration scripts, e.g. `20260430170000_super_admin_games.sql`, `..._permanent_location_qr.sql`, `..._enforce_one_live_promotion_per_location.sql`.

- `types/` — TypeScript domain types such as `types/reward.ts`.

- `tests/` — end-to-end tests (folder present as `tests/e2e/`).

## 4. Game Framework

Core types and registry:
- `GameType` is defined in [lib/games/types.ts](lib/games/types.ts#L1) and currently includes: `wheel`, `spin_wheel`, `mystery_box`, `scratch_card`, `reward_reels`.
- `GameContract` (in [lib/games/types.ts](lib/games/types.ts#L1)) defines the interface each game must expose, including `type`, `name`, `icon`, `availability`, `createCard`, `PlayComponent`, `confetti` settings, and optional builder/runtime components.
- The central registry is [lib/games/registry.ts](lib/games/registry.ts#L1). It exports:
  - `gameRegistry` — mapping of registered game keys to `GameContract` instances.
  - `availableGames` — filtered list of game contracts (excludes `availability === 'hidden'` duplicates).
  - `getAvailableGameContracts()` — returns `availableGames` (used by UI selectors).
  - `getGameDefinition(gameType)` / `getGameContract(gameType)` — helpers to resolve a concrete `GameContract` from a `gameType` string.

Current registered games (exact entries in `gameRegistry`):
- `wheel` and `spin_wheel` -> `lib/games/spin-wheel/contract.ts`
- `mystery_box` -> `lib/games/mystery-box/contract.ts`
- `scratch_card` -> `lib/games/scratch-card/contract.ts`
- `reward_reels` -> `lib/games/reward-reels/contract.ts` (displays in UI as "Slot Machine" and is marked `availability: 'beta'`).

Why registry-driven selector?
- The promotion UI uses `getAvailableGameContracts()` so the selection UI is data driven and does not hard-code game types and copy. See [components/promotion-builder/GameSelectionSection.tsx](components/promotion-builder/GameSelectionSection.tsx#L1).

How to add a new game (summary):
1. Add the new `GameType` (if needed) in [lib/games/types.ts](lib/games/types.ts#L1).
2. Create a contract file under `lib/games/<your-game>/contract.ts` implementing `GameContract`.
3. Add the contract to `gameRegistry` in [lib/games/registry.ts](lib/games/registry.ts#L1).
4. Provide visuals/components under `components/games/` or `lib/games/<your-game>/` for builder/runtime previews.
5. Verify with `npx tsc --noEmit` and test promotion creation and play flows.

Note: `reward_reels` is a placeholder and its `createCard.title` is surfaced as "Slot Machine" in the selection UI; it is marked `beta`/"Coming Soon" and is rendered disabled by the selector.

## 5. Promotion Builder Flow

- Entry point used in the create promotion UI: [components/promotion-builder/CreatePromotionFlow.tsx](components/promotion-builder/CreatePromotionFlow.tsx#L1).
- Game selection: [components/promotion-builder/GameSelectionSection.tsx](components/promotion-builder/GameSelectionSection.tsx#L1) calls `getAvailableGameContracts()` and renders cards based on `game.createCard` and `game.availability`.
- The builder is intentionally lightweight: `CreatePromotionFlow` creates a draft promotion record and defers preview/runtime experiences to the promotion builder route.

Relevant builder/state files:
- The builder uses `BuilderGameType` in `CreatePromotionFlow` and expects `onGameTypeChange` to accept a subset of `GameType` values (`wheel | mystery_box | scratch_card`). See [components/promotion-builder/GameSelectionSection.tsx](components/promotion-builder/GameSelectionSection.tsx#L1).

## 6. Customer Play Flow

- Play entry: route `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` loads page state and calls the public API.
- Server selection and payload: the server route [app/api/public/promotion-play/route.ts](app/api/public/promotion-play/route.ts#L1) uses a Supabase service client to:
  - Resolve `restaurants` by `slug`.
  - Load the `promotions` record for the restaurant and promotion slug.
  - Validate promotion status and time window (starts_at/ends_at).
  - Call `resolvePromotionGame` in `lib/game-pool/resolvePromotionGame` to determine the `game_type` for this session (fallback to promotion.game_type or `'wheel'`).
  - Load `promotion_rewards` for the promotion and return a normalized rewards array to the client.
- Client rendering: `app/play/.../page.tsx` calls `getGameDefinition(promotion.game_type)` to obtain the game contract and renders the contract's `PlayComponent`.
- Coupon issuance: when a player wins, the client posts to `/api/coupons/issue` (see [app/api/coupons/issue/route.ts](app/api/coupons/issue/route.ts#L1)) which inserts a record into `coupon_redemptions` and returns the stored coupon object.

## 7. Coupon and Reward Engine

- Rewards are stored in `promotion_rewards`/`rewards` tables (see `supabase/schema.sql` and migrations). The public API returns rewards with `label`, `description`, `terms`, `weight`, and `active`.
- Reward selection logic: `lib/rewards.ts` exports utilities like `pickWeightedReward` and `createCouponCode` used by the play page to select a winner and generate a code before issuing it to the server.
- Coupon persistence: The `/api/coupons/issue` route inserts into `coupon_redemptions` and returns the saved record. Staff or admin UIs can query these records for validation and reporting (see `app/api/admin/*` routes).

## 8. QR Architecture

- QR handling is implemented as standard web routes. A QR typically maps to a play URL that includes `restaurantSlug` and `promotionSlug` which the play page uses to fetch the promotion data from `app/api/public/promotion-play/route.ts`.
- The repository includes migrations and SQL for `permanent_location_qr` and constraints around promotions in `supabase/migrations/` (for example `20260501160000_permanent_location_qr.sql`), implying support for both location-level and promotion-specific QR behavior.

## 9. Supabase / Data Layer

- Client helpers:
  - Browser client factory: [lib/supabase/client.ts](lib/supabase/client.ts#L1) — uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  - Server client factory: [lib/supabase/server.ts](lib/supabase/server.ts#L1) — constructs a server-side client using cookies and the publishable key.

- SQL schema and migrations:
  - Canonical schema: [supabase/schema.sql](supabase/schema.sql#L1) — defines `restaurants`, `menu_items`, `rewards`, `coupons`, and RLS policies.
  - Migrations folder: `supabase/migrations/` contains per-change SQL including `super_admin_games`, `permanent_location_qr`, and others.

- Important tables visible in schema and migrations:
  - `restaurants` — id, name, slug, brand_color
  - `menu_items` — catalog items used by rewards
  - `rewards` and `promotion_rewards` — reward definitions and association to promotions
  - `coupons` or `coupon_redemptions` — persisted coupon issuance records (multiple migration files reference coupon tables)

- Security notes in repo:
  - `schema.sql` enables Row-Level Security (RLS) on key tables and provides permissive example policies. Review and tighten policies for production.
  - Server-side routes that need elevated privileges use a Supabase service key (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_KEY`) — do not store these in client-exposed env vars.

## 10. Deployment Architecture

- The application is a Next.js app (see `package.json` and `next.config.mjs`) intended for serverless deployment (common with Vercel).
- Backend data is Supabase. Server routes that need elevated permissions use a service role key environment variable: `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SERVICE_KEY` (used in `app/api/*` routes where service access is required).
- Environment variables referenced in the repo (names only):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`)

## 11. Current Architecture Strengths

- Contract-driven game architecture (`lib/games/*`) keeps game metadata, visuals, and runtime behavior co-located.
- Registry-driven UI renders available games dynamically (`getAvailableGameContracts()`), reducing duplication.
- Clear separation between public play APIs and admin APIs using Next.js route handlers under `app/api/`.
- SQL migrations and a canonical `schema.sql` are present for reproducible DB state.

## 12. Current Technical Debt / Risks

- Missing ESLint config in the repository causes `npm run lint` to prompt for configuration when run in a fresh environment.
- Some game contracts are placeholders (e.g., `reward_reels` / Slot Machine) with `availability: 'beta'`.
- Certain builder components still assume a subset of GameType values for selection (`CreatePromotionFlow` expects `wheel | mystery_box | scratch_card`).
- Policies in `supabase/schema.sql` are permissive example policies — these should be reviewed and hardened for production RLS.

## 13. How to Add a New Game (Checklist)

1. Update `GameType` in [lib/games/types.ts](lib/games/types.ts#L1) if adding a new literal.
2. Create a contract file at `lib/games/<your-game>/contract.ts` implementing `GameContract`.
3. Add the contract to `gameRegistry` in [lib/games/registry.ts](lib/games/registry.ts#L1).
4. Add any UI previews to `components/games/` or visuals in `components/promotion-builder/` if needed.
5. If the game is active, ensure `availability: 'active'` and provide `createCard` metadata for builder display.
6. Run `npx tsc --noEmit` to validate types.
7. Test the full flow: create a promotion, ensure the play page resolves the game, and verify coupon issuance.

## 14. Recommended Next Steps

- Add a Super Admin UI for managing available games (toggle `availability`, manage feature flags).
- Implement an actual Slot Machine runtime for `reward_reels` and promote from `beta` to `active` when ready.
- Create additional placeholder games to exercise the registry-driven flow.
- Harden Supabase RLS policies and ensure service keys are restricted and rotated.
- Split this document into more granular docs: `database-map.md`, `game-framework.md`, `security-checklist.md`.

---

Document created from repository files. For code references and deeper inspection, see the linked files in the repo tree listed above.
