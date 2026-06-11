# SpinBite Architecture

This document describes the current implementation of SpinBite. It reflects the codebase state as of June 2026 including the Phase 2 menu experience, experience_mode routing, security hardening, and game registry unification.

## 1. Product Overview

SpinBite is a restaurant QR engagement platform. The product has evolved from a simple QR→Game→Coupon flow into a full restaurant experience platform.

**Current customer journey (Mode 3):**
```
QR Scan → /r/[slug] → Restaurant Landing Page
       → Browse Menu (with floating Reward Widget)
       → Play Game → Win Coupon → Redemption
```

**Experience modes** (`restaurants.experience_mode`):
| Mode | Value | Customer flow |
|------|-------|---------------|
| Promotion Only | `promotion_only` | QR → `/play/...` redirect (original flow, unchanged) |
| Menu Only | `menu_only` | QR → Restaurant landing page + menu, no game |
| Menu + Promotion | `menu_and_promotion` | QR → Landing → menu → game → coupon |

Key user roles:
- **Restaurant admin**: configures experience mode, uploads hero/menu images, builds promotions and rewards.
- **Customer**: scans QR, browses menu, plays game, receives coupon.
- **Staff**: validates/redeems coupons at point of sale.
- **Super admin**: manages available games, site content, and platform settings.

## 2. High-Level User Flows

### Restaurant Admin Flow
1. Set `experience_mode` in restaurant profile tabs (Profile / Contact / Settings).
2. Upload hero image, set description, hours, social links.
3. Build menu: create sections (`menus` table as "sections"), add items with images/tags/pricing.
4. Create promotion: select game type, configure rewards (optionally linked to menu items via `promotion_rewards.menu_item_id`).
5. Launch promotion: sets `status='active'` and `restaurants.current_promotion_id`.

### Customer Flow — Menu + Promotion (Mode 3)
1. Scan QR → `GET /r/[restaurantSlug]` (server component).
2. Server fetches `experience_mode`; for `menu_and_promotion` renders `RestaurantPublicPage`.
3. `GameEntryModal` appears 700–900ms after load (per-session, `sessionStorage` dismiss key).
4. Customer browses menu; `"🎁 Win This"` badges mark up to 3 reward-linked items.
5. `RewardWidget` FAB pulses on scroll; tap opens reward panel bottom sheet.
6. Tap "Spin Now" → `/play/[restaurantSlug]/[promotionSlug]`.
7. Client calls `GET /api/public/promotion-play` → resolves session, returns game config + rewards.
8. Game plays → `pickWeightedReward()` selects reward → `POST /api/coupons/issue` stores coupon.
9. Coupon displays with `SPIN-XXXXXX` code + confetti burst.
10. "Browse Menu" link returns customer to `/r/[slug]`.

### Customer Flow — Promotion Only (Mode 1, unchanged)
`GET /r/[restaurantSlug]` → immediate `redirect('/play/[slug]/[promo]')`.

### Staff Validation Flow
Coupon code submitted to `/api/admin/validate` or the admin validate UI. Server-side lookup against `coupon_redemptions`.

## 3. Repository Map

```
app/
├── r/[restaurantSlug]/page.tsx       ← mode-aware server component (entry point)
├── play/[restaurantSlug]/[promotionSlug]/page.tsx  ← game play client component
├── admin/
│   ├── menu/page.tsx                 ← menu builder (833 lines, monolithic client)
│   ├── promotions/page.tsx           ← promotion list + create
│   ├── promotions/[id]/builder/page.tsx  ← promotion builder (610 lines)
│   └── restaurants/page.tsx          ← restaurant profile tabs
└── api/
    ├── public/promotion-play/route.ts  ← game session init (service-role)
    ├── coupons/issue/route.ts          ← coupon persistence
    ├── admin/generate-description/route.ts  ← AI description via Anthropic SDK
    └── admin/validate/route.ts

components/
├── public/
│   └── RestaurantPublicPage.tsx       ← restaurant + menu public page (1131 lines)
├── promotion-builder/
│   ├── GameSelectionSection.tsx       ← game type picker
│   └── CreatePromotionFlow.tsx        ← create wizard
├── admin/
│   └── SpinWheelPreview.tsx           ← builder preview (delegates to game contract)
└── games/                             ← game-specific UI components

lib/
├── games/
│   ├── registry.ts                    ← CANONICAL registry (metadata + runtime)
│   ├── types.ts                       ← GameType union, GameContract interface
│   ├── spin-wheel/contract.ts
│   ├── mystery-box/contract.ts
│   ├── scratch-card/contract.ts
│   ├── reward-reels/contract.ts
│   └── open-the-door/
│       ├── contract.ts
│       └── builderPreview.tsx
├── game-pool/
│   ├── resolvePromotionGame.ts        ← session game-type resolution
│   └── types.ts                       ← re-exports GameType from lib/games/types.ts
│   (gameRegistry.ts DELETED — registry unification complete)
├── builder/
│   ├── context.tsx                    ← PromotionBuilderProvider + reducer
│   └── types.ts                       ← BuilderGameType (narrowed subset)
├── rewards.ts                         ← pickWeightedReward, createCouponCode
├── supabase/
│   ├── client.ts                      ← browser client (anon key)
│   ├── server.ts                      ← server client (anon key + cookies)
│   └── database.types.ts              ← auto-generated Supabase types

supabase/migrations/                   ← ordered SQL migrations
types/
└── reward.ts                          ← legacy RewardType enum
```

## 4. Database Inventory

17 tables in production (from `lib/supabase/database.types.ts`, regenerated 2026-06-08):

| Table | Purpose |
|-------|---------|
| `restaurants` | Core restaurant entity; `experience_mode`, `hero_image_url`, `brand_color`, `hours`, social links |
| `restaurant_settings` | Key-value feature flags and per-restaurant settings |
| `menus` | "Sections" in admin UI (naming mismatch); groups menu items |
| `menu_sections` | True sub-section hierarchy (exists in DB, **not yet wired to admin builder**) |
| `menu_items` | Individual menu items with images, tags, `is_featured`, `available`, `ai_metadata` |
| `promotions` | Promotion records; `game_type`, `placement_mode`, `status`, timing |
| `promotion_rewards` | Rewards for a promotion; `menu_item_id` FK is the menu↔promotion bridge |
| `promotion_game_assignments` | Secondary game types for multi-game pool mode |
| `games` | Super-admin game catalogue entries; `game_type` column (added 2026-06-01) |
| `play_sessions` | One row per customer+promotion session; tracks `session_token` |
| `coupon_redemptions` | Issued coupons; `coupon_code` (`SPIN-XXXXXX`), `status`, expiry |
| `customer_profiles` | Phone + marketing consent (Phase 2); `phone_number_e164` |
| `profiles` | Auth user profiles for restaurant owners |
| `campaigns` | Campaign grouping for promotions |
| `rewards` | Legacy reward definitions (pre-promotion-rewards era) |
| `guest_sessions` | Legacy guest session tracking |
| `faqs` / `site_content` / `site_media` | Super-admin managed content |

**Key columns added in Phase 2 (June 2026):**
- `restaurants.experience_mode` — `'promotion_only' | 'menu_only' | 'menu_and_promotion'`
- `restaurants.hero_image_url`, `description`, `hours` (JSONB), social link columns, `secondary_color`, `accent_color`
- `menu_items.image_url`, `is_featured`, `tags` (text[]), `available`, `display_order`, `ai_metadata` (JSONB), `deleted_at`
- `menus.display_order`, `slug`, `menu_type`
- `promotions.placement_mode` — `'restaurant' | 'menu' | 'section' | 'item'` (only `'restaurant'` used)
- `games.game_type` — added migration 20260601000000

## 5. Routing Architecture

### `/r/[restaurantSlug]` — Universal Entry Point
Server component (`app/r/[restaurantSlug]/page.tsx`). Mode-aware dispatch:

```
experience_mode = 'promotion_only'
  → fetch promotions → redirect('/play/[slug]/[promo]')   [unchanged from original]

experience_mode = 'menu_only' | 'menu_and_promotion'
  → fetch menus + items [+ promotion if menu_and_promotion]
  → render <RestaurantPublicPage />
```

The `promotion_only` path is an **early return with redirect** — no extra DB queries for existing Mode 1 restaurants.

### Other Routes
| Route | Type | Purpose |
|-------|------|---------|
| `/play/[restaurantSlug]/[promotionSlug]` | Client component | Game play page |
| `/admin/menu` | Client component | Menu builder |
| `/admin/promotions/[id]/builder` | Client component | Promotion builder |
| `/admin/restaurants` | Client component | Restaurant profile tabs |
| `/api/public/promotion-play` | GET handler | Game session init |
| `/api/coupons/issue` | POST handler | Coupon issuance |
| `/api/admin/generate-description` | POST handler | AI description (Anthropic) |

## 6. Game Framework

### Canonical Registry
`lib/games/registry.ts` is the **single source of truth** for both game metadata and runtime component lookup. The previously separate `lib/game-pool/gameRegistry.ts` has been **deleted** (registry unification complete).

### GameType Union (`lib/games/types.ts`)
```typescript
type GameType = 'wheel' | 'spin_wheel' | 'mystery_box' | 'scratch_card' | 'reward_reels' | 'open_the_door'
```

### Registered Games
| Key | Status | Contract | Notes |
|-----|--------|----------|-------|
| `wheel` | active | `spin-wheel/contract.ts` | Hidden alias; routes to spin_wheel |
| `spin_wheel` | active | `spin-wheel/contract.ts` | Primary identifier |
| `mystery_box` | active | `mystery-box/contract.ts` | |
| `scratch_card` | active | `scratch-card/contract.ts` | |
| `reward_reels` | beta | `reward-reels/contract.ts` | "Coming Soon" in builder |
| `open_the_door` | active | `open-the-door/contract.ts` | Added June 2026; has dedicated `builderPreview.tsx` |

### GameContract Interface
Each game contract exposes:
- `type`, `name`, `icon`, `availability`
- `createCard` — builder UI metadata
- `PlayComponent` — runtime game UI
- `confetti` — post-win confetti config
- `resultDelayMs` — delay before showing result
- `labels` — UI copy
- `getTargetRotation(rewardIndex)` — game-specific rotation math
- `components.BuilderPreview` — optional; shown in admin promotion builder preview

### Adding a New Game (Checklist)
1. Add the new `GameType` literal to `lib/games/types.ts`
2. Create `lib/games/<your-game>/contract.ts` implementing `GameContract`
3. Create `lib/games/<your-game>/runtime.tsx` with the `PlayComponent`
4. Optionally create `lib/games/<your-game>/builderPreview.tsx` for admin preview
5. Register in `lib/games/registry.ts` (`gameRegistry` map + `validGameTypes` array)
6. Update `BuilderGameType` in `lib/builder/types.ts` if the game should be selectable in the builder
7. Update `components/promotion-builder/GameSelectionSection.tsx` (still has explicit type checks)
8. Add a DB seed row in `games` table with matching `game_type` column value
9. Run `npx tsc --noEmit` and test create→play→coupon flow end to end

## 7. Promotion Builder Flow

Entry: `/admin/promotions` → create → redirect to `/admin/promotions/[id]/builder`.

**Builder save pattern** (full delete + re-insert, not incremental):
```
UPDATE promotions SET ...
DELETE FROM promotion_rewards WHERE promotion_id = $1
INSERT INTO promotion_rewards (...)
DELETE FROM promotion_game_assignments WHERE promotion_id = $1
INSERT INTO promotion_game_assignments (...)  ← only if multi-game pool enabled
UPDATE restaurants SET current_promotion_id = $1  ← on launch only
```

**Multi-game pool:** Primary game always included. Additional games stored in `promotion_game_assignments`. `resolvePromotionGame()` picks a game per session from the pool.

**`normalizePrimary()` helper:** Maps `'wheel'` ↔ `'spin_wheel'` equivalence.

## 8. Customer Play Flow

1. Client: `getPlaySessionToken()` → localStorage UUID per `{rSlug}_{pSlug}`
2. Client: `getCustomerSessionId()` → global localStorage UUID
3. `GET /api/public/promotion-play?restaurantSlug=...&promotionSlug=...&sessionToken=...`
4. Server: `resolvePromotionGame()` — creates/finds `play_sessions` row, selects game from pool
5. Server: `resolveSessionPlayState()` — determines plays used from `coupon_redemptions` (source of truth)
6. Client: `pickWeightedReward()` → `game.getTargetRotation()` → animate → after `resultDelayMs` → `issueCoupon()` → `confetti(game.confetti)`
7. Post-win: `CustomerIdentityScreen` (phone + consent capture) — skipped if `sessionStorage` flag set

## 9. Coupon and Reward Engine

- Reward selection: `pickWeightedReward()` in `lib/rewards.ts` uses weighted random selection
- Coupon codes: `createCouponCode()` generates `SPIN-XXXXXX` (6 alphanumeric, no ambiguous chars)
- Persistence: `POST /api/coupons/issue` → inserts into `coupon_redemptions`
- Menu↔Promotion bridge: `promotion_rewards.menu_item_id` (nullable FK to `menu_items`)

### Reward Label Resolution
`custom_name` → menu item name (via `menu_item_id` FK lookup) → `'Reward'`

## 10. Menu System

The admin builder (`app/admin/menu/page.tsx`) uses the `menus` table as "sections". This is a naming mismatch — the UI calls them "Sections" but the underlying table is `menus`.

A separate `menu_sections` table exists in the DB (migration `20260606030000`) for a true two-level hierarchy (menu → section → items), but the admin builder **does not yet write to `menu_sections`**. This is the primary menu architecture debt item.

Current effective hierarchy:
```
menus (called "Sections" in UI)
└── menu_items (shown within each "section")
```

Intended hierarchy (partially built):
```
menus (top-level: Lunch, Dinner, etc.)
└── menu_sections (sub-sections: Starters, Mains, etc.)
    └── menu_items
```

## 11. Public Restaurant Page (`RestaurantPublicPage`)

`components/public/RestaurantPublicPage.tsx` (1131 lines) renders the full customer experience for Mode 2 and Mode 3. Key sub-components:

| Component | Purpose |
|-----------|---------|
| `MenuItemCard` | 2-col grid item card with image, price, tags |
| `ItemDetailSheet` | Bottom sheet; focus trap, iOS scroll lock, Escape key dismiss |
| `RewardWidget` | Floating action button; pulses, bounces; expands to reward panel |
| `GameEntryModal` | First-load modal; 700–900ms delay; per-session `sessionStorage` dismiss; fires confetti on "Play Now" |

`isRewardItem` prop on `MenuItemCard`: renders `"🎁 Win This"` badge (capped at first 3 reward items).

## 12. Security Architecture

Three hardening phases applied (migration `20260609000000_phase_a_security_hardening.sql`):

- Fixed open `UPDATE` policies on `restaurants`, `menus`, `promotions`
- Dropped anonymous `INSERT` on `restaurants`
- Fixed storage bucket policies (path-scoped to `{uid}/...`)
- Removed `owner_id IS NULL` loophole from `restaurants` SELECT

**Client pattern:** Public reads use **service-role client** in server components (`makeServiceClient()`) — Supabase RLS bypassed server-side, data filtered in query. Admin writes use **authenticated client** with owner-scoped RLS.

**Storage buckets:**
- `restaurant-heroes` (10MB, public) — upload path `{uid}/{restaurantId}/hero.{ext}`
- `menu-item-images` (5MB, public) — upload path `{uid}/{restaurantId}/items/{itemId}/{ts}.{ext}`

## 13. AI Integration

`POST /api/admin/generate-description` — uses Anthropic SDK (Claude) to generate menu item descriptions. Admin clicks "Generate" in menu builder → calls this route → populates description field. Menu item stores `ai_metadata` JSONB field (tracks `description_source`, `description_model`, `description_generated_at`).

## 14. External Dependencies

- **Supabase**: PostgreSQL + RLS + Auth + Storage
- **Vercel**: Serverless deployment
- **Anthropic SDK**: AI description generation
- **canvas-confetti**: 3 usage sites (GameEntryModal, play page win, admin promotion end)
- **api.qrserver.com**: External QR code image generation — privacy concern; no SLA; candidate for internalization

## 15. Session and Storage Keys

| Key | Storage | Purpose |
|-----|---------|---------|
| `spinbite_play_session_{rSlug}_{pSlug}` | localStorage | Play token per promotion |
| `spinbite_customer_session_id` | localStorage | Global customer identity |
| `game-entry-modal-dismissed-{promotionId}` | sessionStorage | Modal dismiss per session |

## 16. Current Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| `menus` used as "sections" while `menu_sections` table unused | High | Admin builder must be updated to use true two-level hierarchy |
| `app/admin/menu/page.tsx` monolith (833 lines) | Medium | Direct Supabase calls, no server actions, currency hardcoded to CAD |
| `app/admin/promotions/[id]/builder/page.tsx` monolith (610 lines) | Medium | Full delete+re-insert save pattern; no optimistic updates |
| `BuilderGameType` manually narrowed in `lib/builder/types.ts` | Low | Requires manual update when adding new selectable games |
| Hardcoded game-type branches in `GameSelectionSection.tsx` | Low | Not fully data-driven from registry |
| `api.qrserver.com` external dependency | Medium | Privacy risk; no offline support |
| Legacy `types/reward.ts` — duplicate Reward type definitions | Low | Two different `Reward` type shapes in codebase |
| `PromotionBuilderClient.tsx` stub returns `<div />` | Low | Dead code, can be removed |
| `lib/game-pool/types.ts` re-export wrapper | Low | Kept for backward compat; can be inlined |
| `placement_mode` column exists but only `'restaurant'` is used | Low | Future: menu/section/item-scoped promotions |
| Wallet buttons (Apple/Google Wallet) are UI stubs | Low | Not implemented; shows UI without function |

## 17. Recommended Next Steps

1. **Wire `menu_sections` to admin builder** — highest-impact menu architecture work; resolves the naming confusion and enables true two-level menus
2. **Internalize QR generation** — replace `api.qrserver.com` with a self-hosted or library-based solution
3. **Super Admin game management UI** — toggle `availability`, manage `games` table from UI instead of SQL
4. **Split admin page monoliths** — `menu/page.tsx` and `promotions/[id]/builder/page.tsx` into composable server actions + smaller components
5. **Promote `reward_reels`** — implement actual slot machine runtime and change `availability` from `'beta'` to `'active'`
6. **Loyalty foundation** — `customer_profiles` + play history are already captured; add tier/visit tracking

---

*Last updated: 2026-06-11. Reflects Phase 2 menu experience, experience_mode routing, registry unification, and security hardening phases A/B/C.*
