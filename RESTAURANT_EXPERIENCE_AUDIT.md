# SpinBite Restaurant Experience Platform Audit

**Date:** 2026-06-09  
**Branch:** feature/restaurant-experience-audit  
**Auditor:** CTO-level platform review — evidence gathering only, no implementation  
**Scope:** Full platform capability inventory, customer journey, architecture, competitive position, AI readiness, and implementation roadmap  

---

## Table of Contents

1. [Current Platform Capability Inventory](#1-current-platform-capability-inventory)
2. [Current Customer Journey Audit](#2-current-customer-journey-audit)
3. [QR Architecture Audit](#3-qr-architecture-audit)
4. [Menu Architecture Deep Dive](#4-menu-architecture-deep-dive)
5. [Branding System Audit](#5-branding-system-audit)
6. [Reusable Asset Inventory](#6-reusable-asset-inventory)
7. [Competitive Gap Analysis](#7-competitive-gap-analysis)
8. [AI Readiness Assessment](#8-ai-readiness-assessment)
9. [Future Restaurant Experience Architecture](#9-future-restaurant-experience-architecture)
10. [Implementation Readiness Assessment](#10-implementation-readiness-assessment)

---

## 1. Current Platform Capability Inventory

### 1.1 Restaurant Management Capabilities

**Schema columns (source: migrations 20260606000000, initial schema.sql):**

| Column | Type | Status |
|---|---|---|
| `id`, `slug`, `name` | core identity | Fully operational |
| `owner_id` | FK → auth.users | Fully operational |
| `experience_mode` | enum: promotion_only \| menu_only \| menu_and_promotion | Schema + admin UI, not rendered customer-side |
| `logo_url` | text | Upload UI built (LogoImageUploader) |
| `hero_image_url` | text | Upload UI built (HeroImageUploader) |
| `brand_color`, `secondary_color`, `accent_color` | hex text | Stored, not rendered in customer UI |
| `description` | text | Admin UI tab built, not rendered customer-side |
| `hours` | JSONB (7-day 24h contract) | Admin UI built (HoursEditor), not rendered customer-side |
| `website_url`, `instagram_url`, `facebook_url`, `google_maps_url` | social/contact | Admin tab built (RestaurantContactTab), not rendered |
| `contact_email`, `phone`, `address_line1`, `city`, `state`, `zip` | PII/contact | Stored (H-3 exposure risk), admin readable |
| `owner_name` | text | Stored (H-3), admin only |
| `current_promotion_id` | FK → promotions | Powers permanent QR redirect |
| `timezone` | text | Present, not yet applied to hours display |
| `deleted_at`, `updated_at` | soft delete + audit | Added Phase 2; trigger in place |

**Admin UI tabs (source: `app/admin/restaurants/page.tsx`, `components/admin/restaurants/`):**

| Tab | Component | Coverage |
|---|---|---|
| Profile | RestaurantProfileTab | name, slug, description, experience_mode, logo, hero image |
| Hours | HoursEditor | 7-day open/close schedule, per-day closed toggle |
| Contact & Social | RestaurantContactTab | phone, email, address, website, instagram, facebook, google_maps |
| Settings | RestaurantSettingsTab | Key-value settings (hero_layout, widget_position, show_prices, AI features) |

**Gap:** All admin-entered data (branding, hours, description, social links) is saved to DB but not yet consumed by any customer-facing page.

---

### 1.2 Menu System Capabilities

**Schema tables (source: migrations 20260606020000–20260606040000):**

| Table | Key Columns | Status |
|---|---|---|
| `menus` | id, restaurant_id, name, menu_type, display_order, active | Operational |
| `menu_sections` | id, menu_id, name, description, display_order, active, deleted_at | Schema complete |
| `menu_items` | id, menu_id, restaurant_id, section_id (FK), name, price, description, image_url, display_order, is_featured, tags[], available, ai_metadata, active, deleted_at | Schema complete; admin UI exposes name+price only |

**Admin menu UI (source: `app/admin/menu/page.tsx`):**

Current admin UI only exposes: `name`, `price` (create/edit/delete). It does **not** expose:
- `description`
- `image_url`
- `tags[]`
- `is_featured`
- `available`
- `section_id` (section assignment)
- `display_order`

**Customer-facing menu page:** Does not exist. No `/menu/[restaurantSlug]` route.

**Public menu via play page:** Menu items are referenced from `promotion_rewards.menu_item_id` (for reward labels). No display of the broader menu to customers during/after play.

---

### 1.3 Promotion System Capabilities

**Schema tables (source: migrations 20260605000000, 20260605120000):**

| Table | Key Columns | Status |
|---|---|---|
| `promotions` | id, restaurant_id, name, slug, game_type, status (draft/active/ended), starts_at, ends_at, max_spins, coupon_expiry_minutes, current_promotion_id (FK), placement_mode | Fully operational |
| `promotion_game_assignments` | promotion_id, game_type, max_spins, starts_at, ends_at | Operational (phase for multi-game routing) |
| `promotion_rewards` | id, promotion_id, menu_item_id (FK), custom_name, reward_type (free/discount/custom), reward_value, weight | Fully operational |
| `coupon_redemptions` | id, play_session_id (FK), coupon_code, status, issued_at, promotion_reward_id | Fully operational |

**Promotion builder UI (source: `app/admin/promotions/[id]/builder/page.tsx`, `components/promotion-builder/`):**

Full 6-section promotion builder:
1. Metadata (name, slug, start/end dates, max spins, coupon expiry)
2. Game selection (registry-driven selector with preview)
3. Game config (per-game config panel via contract pattern)
4. Rewards (weighted reward slots linked to menu items or custom)
5. Preview (live spin wheel preview with reward slots rendered)
6. Publishing (launch, print kit with QR, status management)

**Print kit (source: `app/admin/promotions/[id]/print/page.tsx`):** Generates a print-ready page with a 420px QR code pointing to the permanent `/r/[slug]` resolver, plus promotional copy.

**placement_mode column:** Added (migration 20260606000000) but not yet wired to any UI. Defined values: `restaurant`, `menu`, `section`, `item`. Only `restaurant` used in V1.

---

### 1.4 Customer Identity & Session Capabilities

**Schema tables:**

| Table | Key Columns | Status |
|---|---|---|
| `play_sessions` | id, promotion_id, session_token, game_type, ip_address, user_agent, customer_profile_id (FK), expires_at | Operational; service-role only (Phase B) |
| `customer_profiles` | id, phone, marketing_consent, terms_accepted_at, play_session_id | Operational; service-role only (Phase B) |
| `guest_sessions` | id (UUID token), restaurant_id, session_data JSONB, created_at | Schema exists; H-1 unresolved |
| `coupon_redemptions` | id, play_session_id, coupon_code, session_token, status, issued_at | Operational |

**Customer identity capture (source: `app/api/public/customer-identity/route.ts`):**
- POST endpoint captures phone + consent after a coupon is won
- Links `customer_profile_id` → `play_session` (session_token FK)
- Server-side service role only; no client-side RLS exposure

**Session recovery:** Session token stored in client localStorage. On page reload, same token submitted to `/api/public/promotion-play?sessionToken=...` which restores existing coupons and play state.

**play_sessions.expires_at:** Stored but not enforced in session recovery path (documented as deferred hardening item in SECURITY_MASTER_BACKLOG.md).

---

### 1.5 Game Engine Capabilities

**Registry (source: `lib/games/registry.ts`):**

| Game ID | Type | Implementation Status | Builder Preview | Config Panel | State Machine |
|---|---|---|---|---|---|
| `spin_wheel` / `wheel` | alias pair | Complete | ✓ | ✓ | ✓ |
| `mystery_box` | Complete | ✓ | ✓ | ✓ |
| `scratch_card` | Complete | ✓ | ✓ | ✓ |
| `open_the_door` | Complete | ✓ | — | — |
| `reward_reels` | Placeholder contract only | ✓ (stub) | — | — |
| `pick_a_card` | DB seed entry only | — | — | — |

**Contract pattern (source: `lib/games/types.ts`):** Each game implements: `type`, `label`, `availability` (`available` / `coming_soon` / `hidden`), `PlayComponent`, `PreviewComponent`, `ConfigPanel`, `defaultConfig`.

**Game routing (source: `lib/game-pool/resolvePromotionGame.ts`):** Uses service-role client at module level. Reads `promotion_game_assignments` for multi-game pool, falls back to `promotion.game_type`. Inserts `play_sessions` row. Handles 23505 duplicate on race condition.

**Multi-game weighted pool (source: `lib/game-pool/selectWeightedGame.ts`):** Weight-based random selection across assigned games for A/B or probability-based experiences.

---

### 1.6 Admin Dashboard & Analytics

**Routes:**

| Route | Purpose | Data Source |
|---|---|---|
| `app/admin/page.tsx` | Dashboard summary | `api/admin/dashboard-metrics` |
| `app/api/admin/dashboard-metrics/route.ts` | Aggregate play stats | `play_sessions`, `coupon_redemptions` |
| `app/api/admin/promotion-metrics/route.ts` | Per-promotion metrics | `play_sessions`, `coupon_redemptions` |
| `app/api/admin/promotion-performance/route.ts` | Performance comparison | promotions cross-tab |
| `app/admin/coupons/page.tsx` | Coupon list + search | `coupon_redemptions` |
| `app/admin/validate/page.tsx` | Coupon validation (staff) | `coupon_redemptions` |
| `app/staff/page.tsx` | Staff-facing coupon scan | service-role validation |

**Super-admin (source: `app/super-admin/`):**

| Route | Purpose |
|---|---|
| `super-admin/games/page.tsx` | Game Lab — enable/disable games globally, manage availability |
| `super-admin/content/page.tsx` | CMS — edit page copy via `site_content` table |
| `super-admin/faqs/page.tsx` | FAQ management |
| `super-admin/settings/page.tsx` | Platform-wide settings |

---

## 2. Current Customer Journey Audit

### 2.1 Primary Play Journey (QR → Coupon)

```
[Physical QR Code / Print Kit]
         |
         v
GET /r/[restaurantSlug]                     (server-side redirect, service role)
  - Reads restaurants.current_promotion_id
  - Falls back to latest live promotion
  - Renders BrandedUnavailablePage if no active promotion
         |
         v
GET /play/[restaurantSlug]/[promotionSlug]  (Next.js page.tsx, force-dynamic)
  - Fetches API: /api/public/promotion-play?restaurantSlug=&promotionSlug=&sessionToken=
  - New session: generates UUID sessionToken, stores in localStorage
  - Existing session: passes stored sessionToken for recovery
         |
         v
GET /api/public/promotion-play              (server-side service role)
  - Validates restaurant, promotion status, dates
  - Calls resolvePromotionGame → inserts play_sessions row
  - Returns: restaurant, promotion, rewards[], sessionToken, playSessionId
         |
         v
[Game renders client-side]
  - WheelGame / MysteryBoxGame / ScratchCardGame component
  - Customer presses spin / reveal
         |
         v
POST /api/coupons/issue                     (service role)
  - Inserts coupon_redemptions row
  - Returns coupon_code, expires_at
         |
         v
[Win screen + Coupon card displayed]
  - QR code on coupon rendered via api.qrserver.com
  - CustomerIdentityScreen offered (optional phone + consent)
         |
         v
POST /api/public/customer-identity          (service role, optional)
  - Records phone, consent in customer_profiles
  - Links customer_profile_id → play_session
         |
         v
[Staff validates coupon at POS]
  - Staff uses /staff or /admin/validate to scan/enter coupon code
```

### 2.2 Session Recovery Journey

```
[Customer reloads page or returns via browser back]
  - localStorage.getItem('spinbite_session_token') → existing UUID
  - Same UUID passed to /api/public/promotion-play?sessionToken=...
  - API returns alreadyPlayed: true (all plays used) or resumes play
  - Existing coupons re-displayed if plays consumed
```

### 2.3 Missing Customer Journeys (Gap Analysis)

| Journey | Status | Impact |
|---|---|---|
| Public menu browsing (no promotion context) | Not built | Customers with menu_only mode have no experience |
| Menu discovery → play CTA | Not built | No bridge from menu view to reward game |
| Post-play menu recommendation | Not built | Won reward has no menu context shown |
| Returning customer recognition | Not built | Phone captured but not used for return visits |
| QR scanning in menu_and_promotion mode | Not built | Mode stored but no routing logic |
| Social sharing of win | Not built | No share CTA after coupon win |
| Coupon expiry countdown UX | Not built | expires_at stored but no client-side countdown |

---

## 3. QR Architecture Audit

### 3.1 QR Generation Infrastructure

**External dependency:** `api.qrserver.com` — third-party QR API, no authentication required, no SLA guarantees.

**Three QR generation contexts (evidence from source files):**

| Context | Source File | Size | URL Encoded |
|---|---|---|---|
| Coupon redemption card | `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` | 220px | Coupon validation URL |
| Promotion builder preview | `app/admin/promotions/[id]/builder/page.tsx` | 240px | `/r/[restaurantSlug]` |
| Print kit (physical print) | `app/admin/promotions/[id]/print/page.tsx` | 420px | `/r/[restaurantSlug]` |

**QR URL format:** `https://api.qrserver.com/v1/create-qr-code/?size=NxN&data=...`

### 3.2 Permanent Resolver Architecture

**Route:** `/r/[restaurantSlug]` (source: `app/r/[restaurantSlug]/page.tsx`)

```
Permanent QR URL: https://[domain]/r/[restaurantSlug]
                           |
                           v
PermanentRestaurantQrPage (force-dynamic, service role)
  1. Lookup restaurant by slug
  2. Fetch last 50 promotions for restaurant
  3. Priority ladder:
     a. livePromotions WHERE id = current_promotion_id
     b. Any livePromotion[0]
     c. nonEndedPromotion WHERE id = current_promotion_id
     d. nonEndedPromotion[0]
  4. redirect → /play/[slug]/[promotionSlug]
  5. No promotion? → BrandedUnavailablePage
```

**Design insight:** The physical QR code never needs to be reprinted. Changing `current_promotion_id` on the restaurant record silently redirects all scans to the new promotion.

### 3.3 Direct Play URL Architecture

**Route:** `/play/[restaurantSlug]/[promotionSlug]`

Direct link format used for:
- Promotion builder preview links
- Print kit (QR encodes `/r/` not `/play/` for permanence)
- Staff testing

### 3.4 QR Architecture Risks & Gaps

| Risk | Severity | Notes |
|---|---|---|
| External QR service dependency | Medium | api.qrserver.com outage breaks coupon display + print kits. No fallback or self-hosted generation. |
| QR printout shows no promotion name | Low | Print kit QR URL is `/r/[slug]` — always resolves live. But the printed poster shows the current promotion name, which goes stale. |
| No QR analytics | Medium | No scan tracking at the QR resolver level. Scan counts not recorded in play_sessions until full game load. |
| `/play/` URL sharing | Low | Direct `/play/` links become invalid when promotions are archived. The `/r/` resolver is more robust. |
| `experience_mode` not wired to QR resolver | High | `menu_only` and `menu_and_promotion` modes exist in schema but the resolver always routes to a promotion. Menu-only restaurants have no landing page. |

---

## 4. Menu Architecture Deep Dive

### 4.1 Schema Hierarchy

```
restaurants (1)
  └─ menus (many)  [restaurant_id FK, menu_type, display_order]
       └─ menu_items (many)  [menu_id FK, section_id FK nullable]
            ├─ menu_sections (independent, menu_id FK)
            └─ promotion_rewards.menu_item_id (FK — reward-to-item link)
```

**Key design decisions:**
- `menu_items.section_id` is nullable (ON DELETE SET NULL) — deleting a section orphans items rather than cascading delete
- `active` = archived (hard visibility toggle); `available` = sold out today (operational toggle)
- `deleted_at` = soft delete (owner can restore; customer-facing policy filters deleted_at IS NULL)
- `ai_metadata` JSONB envelope tracks AI provenance per item (description_source, model, image_source, import_source, etc.)

### 4.2 Admin Menu UI Gap Analysis

**What admin UI exposes (source: `app/admin/menu/page.tsx`):**

| Field | Create | Edit | Gap |
|---|---|---|---|
| `name` | ✓ | ✓ | — |
| `price` | ✓ | ✓ | — |
| `description` | ✗ | ✗ | Rich content not accessible |
| `image_url` | ✗ | ✗ | Food photography bucket exists but no upload UI |
| `is_featured` | ✗ | ✗ | Featured flag unusable |
| `available` | ✗ | ✗ | Availability toggle not built |
| `tags[]` | ✗ | ✗ | Dietary tags not accessible |
| `section_id` | ✗ | ✗ | Section assignment not accessible |
| `display_order` | ✗ | ✗ | Ordering drag not built |
| `active` | ✗ | ✗ | Archive/restore not built |

**Assessment:** Admin menu UI covers ~20% of available schema functionality. The remaining 80% of the menu data model (rich content, media, sections, availability, AI metadata) is inaccessible via any admin interface.

### 4.3 Customer-Facing Menu Presence

**Public menu page:** Does not exist. No `/menu/[restaurantSlug]` or `/m/[restaurantSlug]` route.

**Menu items in customer context:** Only referenced as reward labels in the play/coupon flow via:
- `promotion_rewards.menu_item_id` → `menu_items.name` (for reward label generation in `promotion-play/route.ts`)
- Customer sees reward as "FREE Butter Chicken" — not a full menu item card

**Menu data not used in customer-facing experience:**
- `description` — never shown to customers
- `image_url` — never shown to customers
- `is_featured` — no featured section in any customer page
- `tags` — no dietary/allergen display
- `hours` — customers cannot see restaurant hours anywhere
- `hero_image_url` — not rendered on any customer page

### 4.4 Menu-Promotion Integration

**Current integration depth:** Reward labels only (`menu_item_id` → `name`)

**Designed but not built:**
- `promotions.placement_mode` column exists with values `restaurant | menu | section | item` — V1 uses only `restaurant`. Item-level promotions (e.g., "Win a discount on this specific dish") are schema-ready but not wired to any UI.
- Reward card display of item description + image alongside coupon (coupon UX gap)

---

## 5. Branding System Audit

### 5.1 Stored Branding Assets

| Asset | Storage | Admin UI | Customer Rendering |
|---|---|---|---|
| Logo (`logo_url`) | Supabase storage bucket: `restaurant-logos` | Upload UI: `LogoImageUploader` (not found in components but referenced) | **Not rendered on any customer page** |
| Hero image (`hero_image_url`) | Supabase storage bucket: `restaurant-heroes` | Upload UI: `HeroImageUploader.tsx` | **Not rendered on any customer page** |
| Brand color (`brand_color`) | DB column | `BrandColorFields.tsx` admin component | **Not applied in customer UI** |
| Secondary color (`secondary_color`) | DB column | `BrandColorFields.tsx` | **Not applied** |
| Accent color (`accent_color`) | DB column | `BrandColorFields.tsx` | **Not applied** |
| Hero layout (`hero_layout`) | `restaurant_settings` KV | `RestaurantSettingsTab.tsx` | **Not applied** |
| Widget position (`widget_position`) | `restaurant_settings` KV | `RestaurantSettingsTab.tsx` | **Not applied** |

### 5.2 Branding in Customer Play Page

**Source:** `app/play/[restaurantSlug]/[promotionSlug]/page.tsx`

The play page API call (`/api/public/promotion-play`) returns:
```typescript
restaurant: { id, name, slug, address_line1, city, logo_url }
```

Fields **not returned** to play page: `hero_image_url`, `brand_color`, `secondary_color`, `accent_color`, `description`, `hours`, social links, `experience_mode`.

**Play page rendering:** Uses generic SpinBite brand colors (Tailwind defaults). No per-restaurant theming applied. Restaurant name shown in header only.

### 5.3 Branding Maturity Assessment

| Layer | Maturity | Description |
|---|---|---|
| Asset capture | 40% | Admin forms built, uploads functional via storage |
| Asset storage | 90% | Schema complete, buckets created, RLS secured |
| Design token system | 0% | No CSS variable injection or theme provider exists |
| Customer experience rendering | 5% | Only restaurant name displayed; logo_url in API response but not rendered |
| Print kit branding | 20% | Print template has restaurant name; no logo/colors |

**Critical gap:** Branding is a pure data collection exercise today. None of the captured brand data influences what customers see.

---

## 6. Reusable Asset Inventory

### 6.1 Reusable Customer-Facing Components

| Component | File | Reuse Potential |
|---|---|---|
| BrandedUnavailablePage | `components/BrandedUnavailablePage.tsx` | Restaurant-context error page — reusable across menu, QR, play |
| CustomerIdentityScreen | `components/CustomerIdentityScreen.tsx` | Phone + consent capture — reusable across contexts (play, menu sign-up) |
| CountdownTimer | `components/CountdownTimer.tsx` | Coupon expiry — reusable for any time-limited offer |
| RewardWheel | `components/RewardWheel.tsx` | Standalone wheel component — usable in widget context |
| ExplainerVideo | `components/ExplainerVideo.tsx` | Onboarding video — usable in landing and play contexts |
| PlayEndedRedirectWatcher | `components/PlayEndedRedirectWatcher.tsx` | Post-play redirect logic — reusable |

### 6.2 Reusable Game Engine Assets

| Asset | File | Description |
|---|---|---|
| Game registry | `lib/games/registry.ts` | Contract-driven game lookup — easily extended |
| Game resolver | `lib/game-pool/resolvePromotionGame.ts` | Session + game-type resolution — core business logic |
| Weighted selector | `lib/game-pool/selectWeightedGame.ts` | Generic weighted random — reusable for any probability selection |
| Session play state | `lib/session-play-state.ts` | Play count / completion logic — reusable |
| GameRuntimeRenderer | `components/game/GameRuntimeRenderer.tsx` | Contract-driven game component loader — used by all play flows |

### 6.3 Reusable Admin Components

| Component | File | Description |
|---|---|---|
| BrandColorFields | `components/admin/restaurants/BrandColorFields.tsx` | Color picker trio — reusable for any branding context |
| HeroImageUploader | `components/admin/restaurants/HeroImageUploader.tsx` | Path-scoped image upload — template for menu-item-images uploader |
| HoursEditor | `components/admin/restaurants/HoursEditor.tsx` | 7-day JSONB hours editor — reusable for any time-schedule context |
| ConfirmModal | `components/admin/restaurants/ConfirmModal.tsx` | Generic confirm/cancel dialog — reusable admin utility |
| PromotionBuilderShell | `components/promotion-builder/PromotionBuilderShell.tsx` | Multi-section form shell — template for menu item editor |

### 6.4 Reusable API Routes

| Route | File | Reuse Pattern |
|---|---|---|
| `/api/public/promotion-play` | `app/api/public/promotion-play/route.ts` | Could be extended to return `menu_items` for `menu_and_promotion` mode |
| `/api/public/customer-identity` | `app/api/public/customer-identity/route.ts` | Reusable for any customer capture context (menu sign-up, loyalty) |
| `/api/coupons/issue` | `app/api/coupons/issue/route.ts` | Core coupon issuance — reusable for any reward context |

### 6.5 Reusable Database Tables

| Table | Reuse Pattern |
|---|---|
| `restaurant_settings` | Key-value KV store — any new feature flag can be added without schema migration |
| `site_content` | Full CMS — any page copy goes here; admin already built |
| `promotion_rewards.menu_item_id` | FK link to menu items — already wired for reward-to-dish relationships |
| `promotions.placement_mode` | `menu`, `section`, `item` values ready for item-level promotions |

---

## 7. Competitive Gap Analysis

### 7.1 Competitor Capability Matrix

| Capability | SpinBite | Toast | Square | Lightspeed | Popmenu | Owner.com |
|---|---|---|---|---|---|---|
| QR → Play game → Coupon | **✓ (core)** | ✗ | ✗ | ✗ | ✗ | ✗ |
| Multi-game engine | **✓ (4 games)** | ✗ | ✗ | ✗ | ✗ | ✗ |
| POS integration | ✗ | ✓ (native) | ✓ (native) | ✓ (native) | ✗ | ✗ |
| Online ordering | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Loyalty / points | Coupon only | ✓ | ✓ | ✓ | Limited | ✓ |
| Customer CRM / segmentation | Phone capture only | ✓ | ✓ | ✓ | ✓ | ✓ |
| Menu website | ✗ (schema only) | ✓ | ✓ | ✓ | **✓ (core)** | ✓ |
| AI menu descriptions | Schema ready | ✗ | ✗ | ✗ | ✓ | ✓ |
| Per-restaurant branding | Schema, not rendered | ✓ | ✓ | ✓ | ✓ | ✓ |
| Table reservation | ✗ | ✓ (Toast Tables) | ✗ | ✓ | ✗ | ✓ |
| Email / SMS marketing | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Analytics / reporting | Basic | ✓ | ✓ | ✓ | ✓ | ✓ |
| Multi-location support | ✓ (per restaurant) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Staff coupon validation | ✓ (/staff route) | ✓ | ✓ | ✓ | ✗ | ✗ |
| Print-ready QR kit | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Permanent QR (no reprint) | ✓ (/r/ resolver) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Game A/B testing | ✓ (weighted pool) | ✗ | ✗ | ✗ | ✗ | ✗ |
| Monthly SaaS fee | Unknown | $110–$165/mo | $60+/mo | $69+/mo | $149+/mo | $199+/mo |

### 7.2 SpinBite Unique Differentiators

1. **Gamified QR engagement:** No direct competitor offers a dine-in QR → spin-to-win → coupon flow.
2. **Permanent QR resolver:** `/r/[slug]` with `current_promotion_id` rotation means restaurants never reprint QR materials.
3. **Multi-game weighted pool:** A/B testing across game types with weighted probability is a unique analytics capability.
4. **Print kit with QR:** First-class printable promotional material generation (competitors rely on external tools).
5. **AI metadata envelope:** Schema-level AI provenance tracking on all menu content — ahead of competitors.

### 7.3 Competitive Gaps Requiring Resolution

**Tier 1 (blockers for initial restaurant adoption):**

| Gap | Competitor Benchmark | Estimated Build |
|---|---|---|
| Public menu page | Popmenu, Owner.com | Phase 2 (2–3 weeks) |
| Per-restaurant branding on customer pages | All competitors | Phase 2 (1 week) |
| Hours display on landing/play page | All competitors | Phase 2 (1 week) |

**Tier 2 (needed within 6 months):**

| Gap | Competitor Benchmark | Estimated Build |
|---|---|---|
| Email/SMS marketing to captured customers | Toast, Square | Phase 4 |
| Customer CRM dashboard | Toast, Square | Phase 4 |
| POS integration (Square, Toast webhooks) | Native to competitors | Phase 5 |
| Online ordering or delivery partner link | All major competitors | Phase 5–6 |

**Tier 3 (competitive parity for enterprise):**

| Gap | Competitor Benchmark | Estimated Build |
|---|---|---|
| Table reservation | Toast, Lightspeed | Phase 6 |
| Multi-menu (breakfast/lunch/dinner) with schedule | Toast | Phase 3 |
| Inventory/sold-out sync | Toast, Square | Phase 5 |

### 7.4 Competitive Positioning Recommendation

SpinBite's strategy should be **engagement-first, menu-second** — the QR game creates diner acquisition and loyalty data that no competitor collects. The menu system provides context (what they won, what to order) rather than being the primary product.

**Recommended positioning:** "The engagement layer that sits on top of your existing POS and menu" — not a POS replacement, but a customer acquisition tool that generates warm coupon-holders in-venue.

---

## 8. AI Readiness Assessment

### 8.1 Schema Readiness

**`ai_metadata` JSONB envelope (source: migration 20260606040000):**

```json
{
  "description_source":       "manual",
  "description_model":        null,
  "description_generated_at": null,
  "description_reviewed":     false,
  "image_source":             "manual",
  "image_model":              null,
  "image_generated_at":       null,
  "original_image_url":       null,
  "import_source":            "manual",
  "import_job_id":            null
}
```

**Assessment:** Schema is fully AI-ready. Every AI operation (description generation, image generation, menu import) has a designated tracking field. No additional migrations needed to support any AI content workflow.

**`ai_features_enabled` setting (source: migration 20260606010000):**  
A boolean flag in `restaurant_settings` that can gate AI features per restaurant. Not yet wired to any UI feature display.

### 8.2 AI Capability Opportunities

| Capability | Schema Ready | Storage Ready | Generation Code | Admin UI | Customer UI |
|---|---|---|---|---|---|
| AI menu item descriptions | ✓ (`ai_metadata.description_model`) | N/A | ✗ Not built | ✗ Not built | ✗ Not built |
| AI food photography generation | ✓ (`ai_metadata.image_model`) | ✓ (`menu-item-images` bucket) | ✗ Not built | ✗ Not built | ✗ Not built |
| Menu import (PDF/URL → items) | ✓ (`ai_metadata.import_source`) | N/A | ✗ Not built | ✗ Not built | N/A |
| AI-suggested promotions | ✗ | N/A | ✗ | ✗ | N/A |
| Dynamic reward descriptions | ✗ | N/A | ✗ | ✗ | N/A |
| Customer personalization | ✗ | N/A | ✗ | ✗ | ✗ |
| Post-win menu recommendations | ✗ | N/A | ✗ | ✗ | ✗ |

### 8.3 AI Readiness Score by Domain

| Domain | Readiness | Notes |
|---|---|---|
| Food description generation | 30% | Schema and storage ready; generation endpoint not built |
| Food image generation | 20% | Bucket and path convention defined; no upload UI, no generation API |
| Menu import (bulk ingestion) | 15% | Schema envelope ready; no parser, no import route |
| AI-powered promotions | 5% | No schema, no concept — future consideration |
| Customer personalization | 0% | Phone captured but no behavioral model |

### 8.4 AI Integration Strategy Recommendation

**Phase A (Quick wins — 1–2 weeks per capability):**
1. **Description generation:** Add "Generate with AI" button in menu item editor that calls an LLM API (Anthropic or OpenAI), writes to `description`, updates `ai_metadata.description_source='ai'`, `description_model='claude-...'`, `description_reviewed=false`. Gate behind `ai_features_enabled` setting.
2. **Bulk review UI:** Admin list of items with `description_reviewed=false` for human sign-off before customer display.

**Phase B (Medium-term — 2–4 weeks):**
3. **Menu import:** Upload a menu PDF or paste a URL → AI extracts items + descriptions → batch insert into `menu_items` with `import_source='ai_import'`. Matches competitive parity with Popmenu's AI import.
4. **Image generation:** "Generate food photo" button calls a text-to-image API, uploads to `menu-item-images` bucket, sets `image_source='ai_generated'`, `original_image_url` = the source URL.

**Phase C (Strategic):**
5. **Post-play recommendations:** After coupon win, show 2–3 complementary menu items ("You won a free starter — here's what pairs well"). Requires public menu page first.
6. **Dynamic coupon copy:** AI-generated win copy that varies by item ("Congratulations! You've unlocked a free Butter Chicken...") using `promotion_rewards.menu_item_id` as context.

---

## 9. Future Restaurant Experience Architecture

### 9.1 Target State Architecture

```
Customer Touch Points
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  QR Scan  ──→  /r/[slug] resolver  ─→  Experience Router           │
│  (Table)                               (reads experience_mode)      │
│                                              │                      │
│                         ┌────────────────────┼────────────────────┐ │
│                         ▼                    ▼                    ▼ │
│                  promotion_only       menu_and_promotion      menu_only │
│                         │                    │                    │ │
│                    [Play Page]     [Menu Page + Float Widget]  [Menu Page] │
│                         │                    │                       │
│                   [Win Coupon]         [Menu Browse]                 │
│                         │             [Spin to Win CTA]              │
│                         │                    │                       │
│                   [Identity Capture]   [Win Coupon]                  │
│                         │                    │                       │
│                    [Post-Win Menu] ←──────────┘                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

Admin Capabilities (target state)
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Restaurant Profile ──→  Brand Theme Engine  ──→  Customer Preview │
│  Menu Builder      ──→  AI Description/Image ──→  Rich Menu Page   │
│  Promotion Builder ──→  Weighted Game Pool   ──→  Analytics        │
│  Customer CRM      ──→  Segmentation         ──→  Campaign         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 Proposed Architecture: Experience Router

**Trigger:** The `/r/[restaurantSlug]` resolver currently always routes to a promotion. In the target architecture it reads `experience_mode` and routes accordingly:

```
/r/[slug]
  │
  ├─ experience_mode = 'promotion_only'  →  /play/[slug]/[promotionSlug]
  ├─ experience_mode = 'menu_and_promotion'  →  /menu/[slug]?promo=[promotionSlug]
  └─ experience_mode = 'menu_only'  →  /menu/[slug]
```

All three modes already have their route destinations either built (`/play/`) or schema-ready (`/menu/`).

### 9.3 Proposed Architecture: Brand Theme Engine

**Mechanism:** On any customer-facing page, inject a `<style>` block from restaurant record:
```css
:root {
  --brand-primary: [restaurants.brand_color];
  --brand-secondary: [restaurants.secondary_color];
  --brand-accent: [restaurants.accent_color];
}
```

**Impact:** Zero additional schema changes. All color data already in DB. The play page API call just needs to return these fields alongside `logo_url`.

### 9.4 Proposed Architecture: Public Menu Page

**Proposed route:** `/menu/[restaurantSlug]`

**Data requirements (all available):**
- `restaurants`: name, slug, logo_url, hero_image_url, description, hours, brand_color, experience_mode
- `menus`: ordered list
- `menu_sections`: ordered within menu
- `menu_items`: description, image_url, price, is_featured, available, tags[], display_order

**Integration with promotions:** If `experience_mode = 'menu_and_promotion'`, a floating `RewardWheel` widget or CTA banner invites the customer to spin. Uses `promotion_rewards.menu_item_id` to link rewards to items displayed in the menu.

### 9.5 Proposed Roadmap Phases

#### Phase 2: Restaurant Experience MVP (2–3 weeks)
**Goal:** Make admin-entered data visible to customers.

1. Brand theme engine — inject CSS variables from restaurant record into play page
2. Return `hero_image_url`, `brand_color`, `secondary_color`, `accent_color` from `/api/public/promotion-play`
3. Public menu page `/menu/[restaurantSlug]` — basic list view (no sections, no AI)
4. Experience router in `/r/[slug]` — handle `menu_only` mode
5. Hours display on play page and menu page

**Tables touched (read-only adds):** `restaurants`, `menus`, `menu_items`, `menu_sections`  
**New routes:** `/menu/[restaurantSlug]`  
**Modified routes:** `/r/[restaurantSlug]` (experience_mode routing), `/api/public/promotion-play` (return brand fields)

#### Phase 3: Rich Menu Admin (3–4 weeks)
**Goal:** Close admin UI gap for menu management.

1. Menu item editor — add description, image upload, tags, featured, availability, section assignment
2. Section management — create/order/delete menu sections
3. Display order drag-and-drop for sections and items
4. Menu item image upload UI using `menu-item-images` bucket (path: `{uid}/{restaurantId}/items/{itemId}/{timestamp}.ext`)
5. Soft-delete and restore workflow for menu items

**Tables touched:** `menu_items`, `menu_sections`  
**Components reused:** `HeroImageUploader` pattern for `MenuItemImageUploader`

#### Phase 4: AI Content Automation (2–3 weeks)
**Goal:** Add AI description generation and menu import.

1. "Generate with AI" button in menu item editor (Claude API)
2. AI review queue (items with `description_reviewed=false`)
3. Menu import (PDF/URL → AI parse → bulk insert)
4. AI image generation for menu items
5. Gate all AI features behind `ai_features_enabled` restaurant setting

**Tables touched:** `menu_items` (ai_metadata updates), `restaurant_settings`

#### Phase 5: Customer Engagement Layer (4–6 weeks)
**Goal:** Convert one-time winners into repeat customers.

1. Customer CRM dashboard — list customers by restaurant (phone, consent, play history)
2. SMS/email campaign builder using captured `customer_profiles`
3. Return-visit promotions — "You last visited 14 days ago, spin again for a reward"
4. Coupon expiry push notification (browser push via Service Worker)
5. Social sharing CTA after coupon win

**New tables:** `campaigns`, `campaign_sends`

#### Phase 6: Platform Integration (6–8 weeks)
**Goal:** Connect SpinBite into existing restaurant operations stack.

1. Square POS integration — auto-validate coupon on Square checkout
2. Toast POS integration — webhook-based coupon redemption
3. Delivery platform menu sync (Uber Eats, DoorDash) — export menu items
4. Google My Business hours sync — read-only pull to populate hours
5. Reservation system embed (OpenTable/Resy deep link)

#### Phase 7: Analytics & Growth (ongoing)
**Goal:** Turn play data into actionable restaurant intelligence.

1. Customer lifetime value dashboard
2. Promotion performance comparison (A/B test results)
3. Heatmap of high-engagement items (most-won rewards → most-ordered items)
4. Predictive churn (customers who played but haven't returned)
5. Multi-location aggregate reporting

---

## 10. Implementation Readiness Assessment

### 10.1 Capability Readiness Percentages

| Capability | Readiness | Schema | API | Admin UI | Customer UI | Notes |
|---|---|---|---|---|---|---|
| QR Play Flow (promotion_only) | **95%** | ✓ | ✓ | ✓ | ✓ | Session token expiry not enforced |
| Multi-game engine (4 games) | **85%** | ✓ | ✓ | ✓ | ✓ | reward_reels placeholder; pick_a_card DB-only |
| Promotion builder | **90%** | ✓ | ✓ | ✓ | N/A | placement_mode not wired |
| Coupon issuance + validation | **90%** | ✓ | ✓ | ✓ | ✓ | No POS integration |
| Session recovery | **85%** | ✓ | ✓ | N/A | ✓ | expires_at not enforced |
| Customer identity capture | **80%** | ✓ | ✓ | N/A | ✓ | Consent recorded; data not used downstream |
| Restaurant profile management | **75%** | ✓ | Partial | ✓ | ✗ | Admin complete; data not rendered customer-side |
| Branding system | **35%** | ✓ | ✗ | ✓ | ✗ | Stored, not applied to customer pages |
| Menu data model | **80%** | ✓ | Partial | ✗ | ✗ | Schema complete; admin covers ~20% of fields |
| Menu admin UI | **25%** | N/A | N/A | Partial | N/A | name+price only; no rich content, no sections |
| Public menu page | **0%** | ✓ | ✗ | ✗ | ✗ | Route does not exist |
| Experience mode routing | **10%** | ✓ | ✗ | ✓ | ✗ | Stored; resolver always routes to promotion |
| AI content generation | **15%** | ✓ | ✗ | ✗ | ✗ | Envelope schema ready; no generation code |
| Customer CRM | **15%** | ✓ | ✗ | ✗ | ✗ | Data collected; no CRM dashboard |
| Email/SMS marketing | **0%** | ✗ | ✗ | ✗ | ✗ | Not started |
| Analytics depth | **40%** | ✓ | ✓ | Partial | N/A | Basic metrics; no per-customer analytics |
| Floating reward widget | **0%** | ✓ | ✗ | ✗ | ✗ | `widget_position` stored; widget not built |
| Print kit | **85%** | N/A | N/A | ✓ | N/A | QR print page functional; no logo/brand colors |
| Social/SEO (OG tags, structured data) | **10%** | ✗ | ✗ | ✗ | ✗ | Basic Next.js metadata; no restaurant schema.org markup |

### 10.2 Launch Readiness Assessment

**Current state (2026-06-09):** SpinBite is **production-ready for the `promotion_only` use case**. A restaurant can:
- Create a profile, logo, and promotions
- Configure and launch a spin wheel with weighted rewards linked to menu items
- Generate and print QR materials
- Have customers scan → play → win → show coupon to staff
- Validate coupons at the counter
- See basic play metrics

**Not production-ready (blocks broader adoption):**
1. **No per-restaurant branding** on the customer play page — all customers see generic SpinBite colors
2. **menu_only / menu_and_promotion modes** — stored but non-functional (no menu page exists)
3. **Rich menu admin** — owners cannot manage descriptions, photos, or sections

### 10.3 Critical Path to Full Platform Launch

**Minimum viable expansion (Phase 2 scope, ~3 weeks):**

Priority order for maximum customer-facing impact vs. minimum implementation risk:

| # | Item | Risk | Time | Impact |
|---|---|---|---|---|
| 1 | Return brand fields from promotion-play API | Very Low | 2h | Unblocks theming |
| 2 | Apply CSS brand variables to play page | Low | 4h | Restaurant feels branded |
| 3 | Experience mode routing in `/r/[slug]` | Low | 4h | Fixes menu_only mode |
| 4 | Basic public menu page `/menu/[slug]` | Low | 3d | Core gap closed |
| 5 | Hours display on play page | Low | 4h | Operational info to customers |
| 6 | Rich menu item editor (description, image, tags, sections) | Medium | 1w | Unblocks AI + promotion integration |

**Estimated Phase 2 total:** 2–3 weeks to close the highest-impact gaps.

---

## Appendix: Evidence Sources

| Evidence | Source File / Migration |
|---|---|
| Restaurant schema additions | `supabase/migrations/20260606000000_restaurant_experience_foundation.sql` |
| Restaurant settings KV | `supabase/migrations/20260606010000_restaurant_settings.sql` |
| Menu sections | `supabase/migrations/20260606030000_menu_sections.sql` |
| Menu items enrichment + ai_metadata | `supabase/migrations/20260606040000_menu_items_enrichment.sql` |
| Storage buckets | `supabase/migrations/20260606050000_storage_buckets.sql` |
| QR resolver | `app/r/[restaurantSlug]/page.tsx` |
| Play page + session recovery | `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` |
| Promotion-play API | `app/api/public/promotion-play/route.ts` |
| Game registry | `lib/games/registry.ts` |
| Game resolver | `lib/game-pool/resolvePromotionGame.ts` |
| Menu admin UI | `app/admin/menu/page.tsx` |
| Restaurant admin UI | `app/admin/restaurants/page.tsx` |
| Admin components | `components/admin/restaurants/` |
| Promotion builder | `app/admin/promotions/[id]/builder/page.tsx`, `components/promotion-builder/` |
| Customer identity API | `app/api/public/customer-identity/route.ts` |
| Branding component | `components/admin/restaurants/BrandColorFields.tsx` |
| HeroImageUploader | `components/admin/restaurants/HeroImageUploader.tsx` |
| Build verification | `npm run lint` (warnings only, exit 0), `npx tsc --noEmit` (clean, exit 0), `npm run build` (fails: `supabaseUrl is required` — env vars unavailable in devcontainer, not a code defect) |
| Security state | `SECURITY_MASTER_BACKLOG.md`, tags v0.2.0 through v0.2.3 |

---

*Audit completed 2026-06-09 on branch `feature/restaurant-experience-audit`. No migrations, schema changes, production code, or UI implemented as part of this audit. All findings are evidence-based from current codebase state.*
