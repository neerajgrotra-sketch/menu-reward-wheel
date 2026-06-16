# SpinBite System Map v1

_Architecture audit completed: 2026-06-15_

---

## Platform Overview

SpinBite is a Next.js 14 (App Router) SaaS product deployed on Vercel with Supabase as the backend. It gives restaurants a QR-scannable menu with an embedded game-based promotion engine.

```
Customer Phone (QR Scan)
        │
        ▼
 /r/[restaurantSlug]          ← Public QR menu page
        │
  RestaurantPublicPage.tsx
        │ promotion widget
        ▼
 /play/[restaurantSlug]/[promotionSlug]
        │
  GameRuntimeRenderer.tsx     ← picks runtime from game registry
        │
  Game Runtime                ← WheelGame / ScratchCardGame / MysteryBoxGame …
        │
  POST /api/coupons/issue     ← coupon stored in coupon_redemptions
        │
  CustomerIdentityScreen.tsx  ← phone capture at claim point
        │
  POST /api/public/customer-identity
        │
  customer_profiles table
```

---

## System 1 — QR Menu

**Entry route:** `app/r/[restaurantSlug]/page.tsx`

The public menu page is a Server Component that fetches restaurant data, menu sections, menu items, and the active promotion using a Supabase service-role client. All data is passed as props to `RestaurantPublicPage.tsx`.

**Data pipeline:**
1. Server resolves `restaurantSlug` → restaurant row
2. Fetches `menus` → `menu_sections` → `menu_items` (filtered `available = true`, `deleted_at IS NULL`)
3. Fetches active promotion via `restaurants.current_promotion_id`
4. Passes typed `PublicRestaurant`, `PublicSection[]`, `PublicMenuItem[]`, `PublicPromotion` props

**Key files:**
- `app/r/[restaurantSlug]/page.tsx` — server data layer + type exports
- `components/public/RestaurantPublicPage.tsx` — full client render (hero, hours, filter chips, item grid, promotion widget)
- `components/BrandedUnavailablePage.tsx` — shown when restaurant not found / inactive

**Dependencies:** `restaurants`, `menus`, `menu_sections`, `menu_items`, `promotions`

---

## System 2 — Promotion Engine

**Scope:** Manages promotion lifecycle (draft → active → ended), game assignment, reward pool, scheduling, and public URL routing.

**Admin flow:**
1. `app/admin/promotions/page.tsx` → promotion list
2. `app/admin/promotions/[id]/builder/page.tsx` → promotion builder
3. `components/promotion-builder/PromotionBuilderShell.tsx` — orchestration shell
4. Sections: `PromotionMetadataSection`, `GameSelectionSection`, `PromotionRewardsSection`, `PromotionSchedulingSection`, `PromotionPublishingSection`

**State management:** `hooks/usePromotionsAdmin.ts` + `lib/builder/context.tsx` — shared promotion builder state via React context.

**Public play flow:**
1. `GET /api/public/promotion-play` resolves promotion, session, and game type
2. `lib/game-pool/resolvePromotionGame.ts` — picks game from weighted pool
3. `lib/game-pool/selectWeightedGame.ts` — pure weighted random selection
4. `components/game/GameRuntimeRenderer.tsx` — renders correct game runtime

**Key tables:** `promotions`, `promotion_rewards`, `promotion_game_assignments`

**Key constraint:** One live promotion per location enforced by DB trigger (`20260501180000_enforce_one_live_promotion_per_location.sql`).

---

## System 3 — Game Engine

**Architecture:** Contract-based plugin system. Every game is a self-contained module under `lib/games/{game-type}/` implementing `GameContract`.

**Registered games:**
| Slug | Display Name | Status |
|------|-------------|--------|
| `spin_wheel` / `wheel` | Spin Wheel | Active |
| `mystery_box` | Mystery Box | Active |
| `scratch_card` | Scratch Card | Active |
| `open_the_door` | Open The Door | Active (hidden in builder) |
| `reward_reels` | Reward Reels | Placeholder only |

**Contract structure per game (`lib/games/types.ts`):**
- `PlayComponent` — customer-facing game UI
- `components.BuilderPreview` — admin builder preview
- `components.ConfigPanel` — admin config UI
- `components.Runtime` — runtime renderer hook
- `stateMachine` — game phase progression (`idle → playing → animating → revealing → completed`)
- `contract.ts` — metadata, labels, confetti config, analytics prefix

**Registry:** `lib/games/registry.ts` — canonical lookup by game type string. Aliases `wheel` → `spin_wheel`.

**Runtime dispatch:** `components/game/GameRuntimeRenderer.tsx` → calls `getRuntimeGameComponent(gameType)` from registry.

**Multi-game assignment:** `promotion_game_assignments` table + `resolvePromotionGame` — on first visit, picks a game from the promotion's pool using weighted random selection. Selection is locked to `play_sessions.selected_game_type` for session continuity.

---

## System 4 — Coupon Generation

**Flow:**
1. Customer wins a reward inside a game runtime
2. Client calls `POST /api/coupons/issue` with `{promotion_id, promotion_reward_id, restaurant_id, coupon_code, play_session_id}`
3. Server validates promotion is active + reward belongs to promotion
4. Inserts row into `coupon_redemptions` with `status: 'issued'`
5. Coupon code displayed to customer on screen
6. Staff validate at `app/admin/validate/page.tsx`

**Expiry:** Computed client-side from `promotion.coupon_expiry_minutes` (default 20 min). No server-side TTL enforcement — expiry is display-only.

**Key file:** `app/api/coupons/issue/route.ts`

---

## System 5 — Public Restaurant Menu Rendering Pipeline

```
[Server] app/r/[restaurantSlug]/page.tsx
    │  createServiceClient() — bypasses RLS
    │
    ├─ SELECT restaurants WHERE slug = :slug
    ├─ SELECT menus WHERE restaurant_id = :id AND active = true
    ├─ SELECT menu_sections WHERE menu_id IN [...] AND deleted_at IS NULL
    ├─ SELECT menu_items WHERE section_id IN [...] AND available = true AND deleted_at IS NULL
    └─ SELECT promotions WHERE id = restaurant.current_promotion_id
          │
          ▼
[Client] RestaurantPublicPage.tsx
    ├─ Hero banner (hero_image_url, brand_color)
    ├─ Hours display (parseWeekHours utility — inline in component)
    ├─ Filter chips (by section name)
    ├─ Item grid (MenuItemCard-style inline sub-component)
    ├─ Item detail bottom sheet (inline)
    └─ RewardWidget (floating promotion button → /play/… link)
```

**Branding:** `brand_color` drives hero gradient, CTA buttons, tag pills. Falls back to `#FF6B00`.

---

## System 6 — Admin Dashboard

**Auth gate:** `middleware.ts` — redirects unauthenticated users to `/auth` for all `/admin/*` routes. Uses Supabase SSR cookie-based session.

**Admin pages:**
| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard overview + metrics |
| `/admin/promotions` | Promotion list (rewritten to `/admin/promotions-shell` via middleware) |
| `/admin/promotions/[id]/builder` | Promotion builder |
| `/admin/promotions/[id]/print` | Print-ready QR sheet |
| `/admin/menu` | Menu builder |
| `/admin/restaurant` | Restaurant profile tabs |
| `/admin/restaurants` | Multi-restaurant list |
| `/admin/coupons` | Coupon list |
| `/admin/validate` | Coupon validator for staff |

**Super-admin pages:**
| Route | Purpose |
|-------|---------|
| `/super-admin` | Platform overview |
| `/super-admin/games` | Game Lab — manage game registry |
| `/super-admin/content` | CMS for site copy |
| `/super-admin/faqs` | FAQ management |
| `/super-admin/settings` | Platform settings |

**Metrics API:** `GET /api/admin/dashboard-metrics` — requires authenticated session, uses service client to count restaurants, promotions, coupons.

---

## System 7 — Supabase Schema

See `docs/architecture/database-map-v1.md` for full table-by-table breakdown.

---

## System 8 — Authentication

**Provider:** Supabase Auth (email/password). JWT stored in cookies via `@supabase/ssr`.

**Two client types:**
- `lib/supabase/client.ts` — browser client (reads cookies)
- `lib/supabase/server.ts` — server-side auth client (cookie-based)
- Service client — instantiated inline in API routes using `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS)

**Roles:**
- `profiles.role = 'admin'` — restaurant owner
- `profiles.role = 'super_admin'` — SpinBite platform admin (checked via `is_super_admin()` DB function)

**Auth routes:** `app/auth/page.tsx` (login), `app/auth/callback/route.ts` (OAuth callback), `app/login/page.tsx`, `app/signup/page.tsx`

---

## System 9 — Analytics

**Current state:** Minimal. `coupon_redemptions` table tracks issuance and redemption counts. Dashboard metrics endpoint aggregates these per restaurant.

**Planned:** Full analytics pipeline is a non-goal for MVP. Future tables would track `play_sessions` aggregate funnels, reward distribution, game type performance.

**APIs:** `GET /api/admin/promotion-metrics`, `GET /api/admin/promotion-performance`

---

## System 10 — Multi-Location Restaurant Architecture

**Current state:** `restaurants.location_count` field exists but is not actively used for location splitting. Each restaurant row represents one logical location. Multi-location is supported at the data model level (multiple restaurant rows per `owner_id`) but the admin UX does not yet provide a unified multi-location management view.

---

## System 11 — File Upload Architecture

**Storage buckets (Supabase Storage):**
| Bucket | Contents | Path format |
|--------|----------|-------------|
| `restaurant-logos` | Logo images | `{uid}/{restaurant_id}/{filename}` |
| `restaurant-heroes` | Hero/banner images | `{uid}/{restaurant_id}/{filename}` |
| `menu-item-images` | Menu item photos | `{uid}/{restaurant_id}/{filename}` |

**Upload components:**
- `components/admin/restaurants/HeroImageUploader.tsx` — hero image, max 10 MB, JPEG/WebP/PNG
- `components/admin/restaurants/MenuItemImageUploader.tsx` — menu item image
- Both components require `ownerId` for path-scoped storage policy enforcement

**Security:** Supabase Storage RLS policies enforce path prefix = `auth.uid()`. See `supabase/migrations/20260609000000_phase_a_security_hardening.sql`.

---

## System 12 — Shared Component Architecture

See `docs/engineering/component-registry.md` for the full registry.

**Key invariant:** `components/game-visuals/GameVisual.tsx` is the single source of truth for all game icon rendering. No component may render its own game visual.

---

## Cross-System Dependency Map

```
restaurants
  ├─ menus → menu_sections → menu_items
  ├─ promotions → promotion_rewards
  │                └─ promotion_game_assignments
  ├─ play_sessions → coupon_redemptions → customer_profiles
  ├─ campaigns (stub)
  └─ restaurant_settings (key-value config)

Auth (profiles)
  └─ restaurants.owner_id

Super-Admin
  ├─ games (game registry)
  ├─ site_content (CMS copy)
  ├─ site_media (video embeds)
  └─ faqs
```
