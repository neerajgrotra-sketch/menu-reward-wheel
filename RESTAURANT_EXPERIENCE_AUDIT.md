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
11. [Menu Architecture Validation Report](#11-menu-architecture-validation-report)
12. [Menu Builder Maturity Assessment](#12-menu-builder-maturity-assessment)
13. [Menu Foundation Readiness Gate](#13-menu-foundation-readiness-gate)

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

---

## 11. Menu Architecture Validation Report

### 11.1 Schema Lineage — The Three-File Problem

The `menus` and `menu_items` tables were defined across three separate SQL files applied at different times outside the tracked migration system. Each file made conflicting assumptions. This is the root of all three defects.

**File 1: `supabase/schema.sql`** (original baseline)

```sql
create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  category text default 'General',
  price numeric,
  description text,
  active boolean default true,
  created_at timestamptz default now()
  -- NO menu_id column
  -- NO menu_type column
  -- NO slug column
);
-- NO menus table
```

`menu_items` created without any menu grouping. No `menus` table. Items belong only to a restaurant.

**File 2: `supabase/multi_promotion_system.sql`** (ad-hoc, applied after schema.sql)

```sql
create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null default 'Main Menu',
  -- NO menu_type column
  -- NO slug column
  -- NO display_order column
  active boolean default true,
  created_at timestamptz default now()
);

alter table menu_items
  add column if not exists menu_id uuid references menus(id) on delete cascade;
  --                                                                 ^^^^^^^^^^
  -- NULLABLE — no NOT NULL constraint
  -- This ALTER is what actually runs against the live DB
```

Adds `menu_id` as a **nullable** FK to the already-existing `menu_items` table.

**File 3: `supabase/menu_system.sql`** (ad-hoc, applied after multi_promotion_system.sql)

```sql
create table if not exists menus ( ... );        -- NO-OP: table already exists
create table if not exists menu_items (
  ...
  menu_id uuid references menus(id) on delete cascade NOT NULL,  -- NEVER APPLIED
  ...
);
```

**Both `CREATE TABLE IF NOT EXISTS` statements are no-ops.** The tables already exist. The `NOT NULL` constraint on `menu_id` in `menu_system.sql` is dead code — it was never applied to the live database.

**Consequence:** `menu_items.menu_id` is **nullable** in the live database. Any item created before the menus system was introduced has `menu_id = NULL`. These items are permanently orphaned in the admin UI.

---

### 11.2 Defect A — Menu Creation Slug NOT NULL Violation

**Observed error:** `null value in column "slug" of relation "menus" violates not-null constraint`

**Schema state established by migration `20260606020000_menu_display_order.sql`:**

```sql
alter table public.menus add column if not exists slug text;  -- nullable first
-- ... back-fill all existing rows ...
alter table public.menus alter column slug set not null;       -- then enforce
alter table public.menus add constraint menus_restaurant_slug_unique unique (restaurant_id, slug);
```

After this migration, any `INSERT INTO menus` that omits `slug` is rejected by the DB.

**Current `addMenu()` code** (`app/admin/menu/page.tsx:101–108`):

```javascript
const slug = newMenu.trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'menu';
const result = await supabase.from('menus').insert({
  name: newMenu.trim(),
  menu_type: newMenu.trim().toLowerCase(),
  restaurant_id: restaurant.id,
  slug   // ← slug IS included
});
```

The current code **does supply `slug`**. The constraint violation cannot be triggered by this code path today.

**Root cause — deployment window gap:**

The `slug NOT NULL` constraint was introduced as a DB migration. The frontend code that generates and supplies `slug` in the insert payload must have been deployed at a different time (or from a cached browser bundle). The error was real but is architectural in nature: the DB schema constraint was applied before or independently of the frontend code that satisfies it.

**Secondary issue — slug not updated on rename:**

`saveMenuName()` (`app/admin/menu/page.tsx:123–128`) updates `name` and `menu_type` but **does not update `slug`**:

```javascript
await supabase.from('menus').update({
  name: editingMenuName.trim(),
  menu_type: editingMenuName.trim().toLowerCase()
  // slug: intentionally absent — slug is not updated on rename
}).eq('id', menuId);
```

Result: A menu renamed from "Lunch" to "Afternoon" retains `slug = 'lunch'`. This is not a crash defect, but it means the `slug` column drifts from the menu name. If a public menu page ever uses the slug as a URL segment, the URL would not match the name.

**Defect A verdict:** Historical defect caused by a deployment window gap between migration and frontend code update. Not reproducible with current codebase. Secondary slug-drift issue is an active latent defect.

---

### 11.3 Defect B — Incorrect Item Assignment

**Observed behavior:** Items the owner created for one context appear under a different menu or restaurant.

**Root cause — Promotion builder silent auto-copy** (`app/admin/promotions/[id]/builder/page.tsx:301–398`):

The promotion builder's `loadItems` effect executes the following undocumented decision tree:

```
STEP 1: Query menu_items WHERE menu_id = {selected menu}
  → If items found: display them → STOP

STEP 2 (triggered when menu is empty): Query sibling restaurants
  SELECT id FROM restaurants
  WHERE owner_id = {current owner}
    AND name = {current restaurant name}     ← same restaurant name
    AND id != {current restaurant}           ← different location

STEP 3: Query sibling menus matching by menuKey
  menuKey(menu) = (menu.menu_type || menu.name || '').toLowerCase().trim()
  → Matches if menuKey matches OR names match case-insensitively

STEP 4: SILENTLY INSERT sibling items into current restaurant's menu
  INSERT INTO menu_items (name, price, menu_id, restaurant_id)
  VALUES (sibling_item.name, sibling_item.price,
          {current menu id}, {current restaurant id})
```

**Data integrity consequence:** This auto-copy creates rows in `menu_items` that:
1. The restaurant owner never explicitly created
2. Appear in the admin menu UI for the target restaurant
3. Are permanent (not cleaned up on promotion save/cancel)
4. Are triggered without any user confirmation or notification

**Trigger condition:** Any restaurant owner who has:
- Two or more restaurants with the same name (multi-location)
- An empty menu at one location that matches a populated menu at another location
- Opens the promotion builder for the empty-menu location

The insert happens **during the `useEffect` that fires when `menuId` changes** — not on any explicit user action. The owner sees items populate and may not realize they came from another location.

**Secondary cause — stale `items` state during menu panel switching** (`app/admin/menu/page.tsx:111–114`):

```javascript
async function toggleMenu(menuId: string) {
  if (expandedMenuId === menuId && editingMenuId !== menuId) {
    setExpandedMenuId(null); setItems([]); return;
  }
  setExpandedMenuId(menuId);  // ← re-render fires here: items still old
  await loadItems(menuId);    // ← items updated after async completes
}
```

`setItems([])` is not called before `await loadItems(menuId)`. During the async gap, the previous menu's items array remains in state. The component re-renders with `expandedMenuId = new menu` but `items = old items`. Items from the previously-expanded menu are briefly visible under the newly-expanded menu.

This is a UI rendering race condition. It resolves once `loadItems` completes, but creates the visual impression of cross-menu item assignment.

**Defect B verdict:** Two distinct causes:
1. **Architectural defect** — Promotion builder silently auto-copies items across restaurant locations. Creates permanent data that owner did not intend. Requires explicit design decision and code change to resolve.
2. **UI race condition** — `items` state not cleared before async load, causing stale items to flash under the wrong menu. Minor UX defect.

---

### 11.4 Defect C — Actual Hierarchy Verification

**Designed hierarchy (from schema + migration intent):**

```
restaurants (1)
  └── menus (many)             [restaurant_id FK]
        ├── menu_sections (many)  [menu_id FK, restaurant_id FK]
        │     └── menu_items (many)  [section_id FK → menu_sections]
        └── menu_items (many, unsectioned)  [section_id = NULL]
```

**Actual hierarchy in practice:**

```
restaurants (1)
  └── menus (many)             [restaurant_id FK, active, slug, menu_type, display_order]
        └── menu_items (many)  [menu_id FK — NULLABLE in live DB, section_id ALWAYS NULL]

menu_sections                  [table exists, RLS configured, ZERO rows — never used]
menu_items.section_id          [column exists, ALWAYS NULL — no code ever sets it]
menu_items with menu_id = NULL [exist in DB from schema.sql era — ORPHANED, invisible to admin UI]
```

**Evidence for each finding:**

**`menu_sections` is never used:**
- Table created by `20260606030000_menu_sections.sql` with full RLS
- Zero admin UI to create, view, or manage sections
- No INSERT INTO `menu_sections` in any application code path
- `section_id` on `menu_items` is never set by any INSERT or UPDATE in `app/admin/menu/page.tsx` or `app/admin/promotions/[id]/builder/page.tsx`

**`menu_items.section_id` is always NULL:**
- The only menu item INSERT is `app/admin/menu/page.tsx:135`: `insert({ name, price, menu_id, restaurant_id })` — `section_id` omitted
- The promotion builder INSERT at line 372: `insert({ name, price, menu_id, restaurant_id })` — `section_id` omitted
- No UPDATE statement ever touches `section_id`

**`menu_items.menu_id` is nullable in live DB:**
- `schema.sql` created `menu_items` without `menu_id`
- `multi_promotion_system.sql` added it via `ALTER TABLE ... ADD COLUMN menu_id ... ON DELETE CASCADE` (no NOT NULL)
- `menu_system.sql` declared NOT NULL in a `CREATE TABLE IF NOT EXISTS` that was a no-op
- No tracked migration has ever added a NOT NULL constraint to `menu_items.menu_id`

**Orphaned items (menu_id = NULL):**
- Any items created via the original schema.sql-era code have `menu_id = NULL`
- The admin menu UI queries `WHERE menu_id = {specific id}`, which excludes NULL rows
- These items exist in the database but are invisible to every admin code path
- They remain accessible to the `menu_items` SELECT policies (public read, owner read) — they would appear on any public menu page that doesn't filter by `menu_id`

**`menus` are functioning as sections, not as menus:**
- The UX label is "Create Menu" but the input placeholder reads "Breakfast, Lunch, Dinner..."
- In practice, owners create one row per meal-type or category (Breakfast, Drinks, Appetizers)
- This is conceptually a section, not a menu
- The schema has a dedicated `menu_sections` table for this purpose — which is never used
- There is no concept of a "menu document" (e.g., Dine-In Menu vs. Take-Out Menu) in the current UI

**Current hierarchy diagram:**

```
Restaurant: "Punjabi By Nature"
  ├── menu row: id=abc, name="Breakfast", slug="breakfast", menu_type="breakfast"
  │     ├── menu_item: "Chai" $3.50, section_id=NULL
  │     └── menu_item: "Paratha" $8.00, section_id=NULL
  │
  ├── menu row: id=def, name="Dinner", slug="dinner", menu_type="dinner"
  │     ├── menu_item: "Butter Chicken" $18.00, section_id=NULL
  │     └── menu_item: "Naan" $4.00, section_id=NULL
  │
  └── [orphaned items with menu_id=NULL — invisible to admin UI]
        └── menu_item: "Samosa" $6.00, category="General", menu_id=NULL

menu_sections: (0 rows for this restaurant — never created)
```

**Defect C verdict:** The intended three-tier hierarchy (Menu → Section → Item) does not exist at runtime. What exists is a two-tier hierarchy where `menus` rows are used as sections. The `menu_sections` table is an unused schema artifact. Items from the schema.sql era are permanently orphaned.

---

## 12. Menu Builder Maturity Assessment

### 12.1 Competitor Baseline

| Feature | Toast | Square | Lightspeed | Owner.com | SpinBite |
|---|---|---|---|---|---|
| Menu → Category → Item | ✓ | ✓ | ✓ | ✓ | ✗ (2-tier only) |
| Item modifiers / add-ons | ✓ | ✓ | ✓ | ✓ | ✗ |
| Item photo upload | ✓ | ✓ | ✓ | ✓ | ✗ (bucket ready) |
| Item description | ✓ | ✓ | ✓ | ✓ | ✗ (column ready) |
| Available / sold-out toggle | ✓ | ✓ | ✓ | ✓ | ✗ (column ready) |
| Featured / promoted items | ✓ | Partial | ✓ | ✓ | ✗ (column ready) |
| Dietary / allergen tags | ✓ | ✓ | ✓ | ✓ | Partial (tags[] field) |
| Drag-and-drop ordering | ✓ | ✓ | ✓ | ✓ | ✗ |
| Multi-menu (dine-in vs. take-out) | ✓ | ✓ | ✓ | ✓ | ✗ |
| Time-scheduled menus | ✓ | ✓ | ✓ | ✗ | ✗ |
| Bulk import (PDF / URL) | ✗ | ✗ | ✗ | ✓ | ✗ (schema ready) |
| AI description generation | ✓ (beta) | ✗ | ✗ | ✓ | ✗ (schema ready) |
| Public QR menu page | ✓ | ✓ | ✓ | ✓ | ✗ |
| SEO / structured data | ✗ | ✓ | ✓ | ✓ | ✗ |
| POS sync (real-time) | ✓ (native) | ✓ (native) | ✓ (native) | ✗ | ✗ |
| Mobile management app | ✓ | ✓ | ✗ | ✗ | Responsive web only |

### 12.2 Dimension Scores

**Data Model: 45/100**

The schema is well-designed. All the right columns exist: `description`, `image_url`, `tags[]`, `is_featured`, `available`, `display_order`, `section_id`, `ai_metadata`. The `ai_metadata` JSONB envelope is actually more comprehensive than what most competitors offer.

Deductions:
- No modifiers or modifier groups (required for real restaurant menus)
- No structured allergen/dietary flags (tags[] is freeform, not validated)
- `menu_items.menu_id` is nullable in live DB (schema integrity issue)
- Three-tier hierarchy (`menu_sections`) exists in schema but is never populated
- Orphaned items (menu_id = NULL) create a permanently inconsistent data state

**UX: 15/100**

The admin UI exposes 2 of the ~12 available schema fields (name and price). All other fields — description, image, tags, featured, availability, section, display order — are inaccessible. Specific gaps:

- No image upload UI (bucket and path convention exist; no uploader component)
- No description textarea
- No featured/availability toggles
- No section management
- No drag-and-drop reorder
- No search or filter
- No bulk operations
- Item count displayed per menu, but no item-level detail view without entering edit mode

**Scalability: 35/100**

The DB layer has appropriate indexes (`menu_items_menu_id_order_idx`, `menu_items_featured_idx`, `menu_items_tags_gin_idx`). However:

- Item count in `loadMenus` fetches ALL items for the restaurant, then counts in-memory — scales poorly above ~500 items
- The auto-copy in the promotion builder (Defect B) creates unchecked data proliferation at multi-location scale
- No pagination on item lists
- `menu_type` is set to the lowercased menu name — it carries no semantic meaning distinct from `name`; `dedupeMenus` in the builder silently drops menus with matching `menu_type`

**Mobile Friendliness: 45/100**

The Tailwind-based UI is responsive. The single-column accordion layout is readable on mobile. However:

- No touch-optimized image picker
- No swipe-to-delete
- Inline edit mode for items requires precise tap targets on small screens
- No dedicated mobile flow

**AI Readiness: 35/100**

Schema ahead of most competitors. The `ai_metadata` envelope tracks description source, model, generation timestamp, review state, image source, and import job ID. The `ai_features_enabled` restaurant setting flag is in place.

Deductions:
- Zero generation code
- No LLM API integration
- No admin review workflow
- No import parser
- AI features cannot be turned on even for testing

**QR Menu Readiness: 5/100**

- No public `/menu/[restaurantSlug]` route
- No customer-facing menu rendering of any kind
- No structured data markup
- No menu-specific QR code generation
- The menu data exists in the DB but has no public display path

### 12.3 Overall Maturity Score

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Data Model | 20% | 45 | 9.0 |
| UX | 30% | 15 | 4.5 |
| Scalability | 15% | 35 | 5.3 |
| Mobile Friendliness | 10% | 45 | 4.5 |
| AI Readiness | 10% | 35 | 3.5 |
| QR Menu Readiness | 15% | 5 | 0.8 |

**Overall Menu Builder Maturity: 28/100**

The score reflects a system where the DB schema is materially more advanced than the UI that exposes it. The schema would score ~52/100 in isolation. The UX brings the composite score to 28/100.

---

## 13. Menu Foundation Readiness Gate

### 13.1 Gate Assessment per Capability

| Capability | Gate | Evidence |
|---|---|---|
| Food photos | 🟡 Yellow | `menu-item-images` bucket created, path convention `{uid}/{restaurantId}/items/{itemId}/{ts}.ext` defined in migration. Policy fixed (Phase C1 H-6). No upload UI in menu item editor. One component to build. |
| Descriptions | 🟡 Yellow | `menu_items.description` column exists. No edit textarea in admin UI. One field to add to existing edit form. |
| Featured items | 🟡 Yellow | `menu_items.is_featured` column + partial index exists. No toggle UI. One boolean field to expose. |
| Menu sections | 🔴 Red | `menu_sections` table and `section_id` FK exist but have NEVER been used. The current UX treats `menus` rows as sections. An architectural decision is required before a section UI can be built: should `menus` be renamed to `sections`, or should a new UI layer be added on top of the current structure? Cannot build section support on top of the current UX without addressing this conceptual conflict. |
| QR menu pages | 🔴 Red | No `/menu/[restaurantSlug]` route exists. No customer-facing rendering. The experience router in `/r/[slug]` does not handle `menu_only` or `menu_and_promotion` modes. Must be built from scratch. However, all required data (items, sections, branding) is schema-ready. |
| AI menu import | 🔴 Red | No import pipeline, no parser, no batch insert UI, no job tracking. The `ai_metadata.import_job_id` field exists but there is no job runner. Requires full pipeline construction. |
| AI description generation | 🟡 Yellow | Schema (ai_metadata envelope), storage (not required for text), and feature gate (`ai_features_enabled`) are all in place. Requires: LLM API integration, a "Generate" button in the menu item editor, and a review workflow (items with `description_reviewed = false`). Blocked by the missing description field in the admin UI — which is itself a Yellow item. |

### 13.2 Active Defects Blocking Feature Work

| Defect | Severity | Blocking |
|---|---|---|
| B1: Silent auto-copy in promotion builder | **High** | Multi-location menu management, any future menu sync, AI-generated content workflows (content gets silently overwritten on next builder open) |
| B2: Stale `items` state on panel switch | Low | Visual only — resolves on async completion. Not blocking. |
| C1: Orphaned items (menu_id = NULL) | Medium | Public menu page (orphaned items would appear if not filtered), AI import (ambiguous assignment target for items without menu context) |
| C2: menu_sections never populated | Medium | Section-based menu display, AI-powered section grouping, any UX that references sections |
| A2: Slug drift on rename | Low | Public menu page URLs — a menu renamed from "Lunch" to "Afternoon" keeps the `/menu/slug/lunch` URL |

### 13.3 Recommendation

**🟡 Perform a Menu Stabilization Sprint before Menu Foundation work begins.**

**This is not a full re-architecture.** The DB schema is sound. The data model is correct. The gaps are in the application layer.

A targeted stabilization sprint (estimated 5–7 days) would close all blocking issues:

| Task | Time | Closes |
|---|---|---|
| Remove silent auto-copy from promotion builder OR replace with an explicit "Copy items from another location?" confirmation dialog | 0.5d | Defect B1 |
| Add `setItems([])` before `await loadItems(menuId)` in toggleMenu | 0.5h | Defect B2 |
| Write migration: `UPDATE menu_items SET menu_id = (SELECT id FROM menus WHERE restaurant_id = menu_items.restaurant_id ORDER BY created_at LIMIT 1) WHERE menu_id IS NULL` | 0.5d | Defect C1 |
| Architectural decision: treat current `menus` rows as "sections" going forward; rename/re-label in UI | 0.5d | Defect C2 (partial) |
| Extend menu item editor: add description textarea, image upload (reuse HeroImageUploader pattern), is_featured toggle, available toggle | 2d | Unblocks food photos, descriptions, featured items |
| Update slug on menu rename | 0.5h | Defect A2 |

**Without the stabilization sprint:**

- Food photos can be built, but the upload component is attaching images to items that may be auto-copied silently to other locations
- AI descriptions can be generated, but the auto-copy will silently propagate AI-generated content to sibling restaurant menus without owner review
- A QR menu page can be built, but it would display orphaned items (menu_id = NULL) if it queries by `restaurant_id` without a `menu_id` filter
- Section navigation on the QR menu page cannot be built at all without resolving the menus-as-sections naming conflict

**The stabilization sprint takes ≤1 week and prevents technical debt from compounding into every subsequent feature.**

---

### Summary: Menu Architecture Defect Register

| ID | Defect | Type | Severity | Status |
|---|---|---|---|---|
| MA-1 | Slug NOT NULL on menu creation — historical deploy gap | Historical | Low | Not reproducible in current code; secondary slug-drift still active |
| MA-2 | Promotion builder silently auto-copies items across locations | Architectural | High | Active |
| MA-3 | Stale `items` state during menu panel switch | UI | Low | Active |
| MA-4 | `menu_items.menu_id` is nullable (NOT NULL never applied) | Schema | Medium | Active |
| MA-5 | Orphaned items (menu_id = NULL) invisible to admin | Data | Medium | Active |
| MA-6 | `menu_sections` table and `section_id` column never used | Architectural | Medium | Active |
| MA-7 | `menus` rows function as sections, not menus — conceptual mismatch | Architectural | Medium | Active |
| MA-8 | Slug not updated when menu is renamed | Logic | Low | Active |

---

*Parts 11–13 added 2026-06-09. All findings are evidence-based. No code or schema changes made.*
