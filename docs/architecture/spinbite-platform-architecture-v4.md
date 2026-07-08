# SpinBite Platform Architecture v4

**Document version:** 4.4
**Date:** 2026-07-07
**Status:** Source of truth — supersedes v3
**Audience:** Engineering, product, CTO

---

## Why v4.4

A full documentation audit (this revision wasn't triggered by one specific feature — it's a sweep of everything shipped since v4.3, 2026-07-03) found and closed five gaps, none involving a change to code behavior beyond what was already fixed in production the same day:

1. **§6.5 (new)** — the "Redeem Now" coupon-to-cart-to-checkout bridge has existed since 2026-07-05 (`feature/redeem-now-order-payment`) and was never documented. Added, including three real bugs fixed 2026-07-07: game-type display drifting from the actually-played game (Rule 64, new), repeat "Redeem Now" taps silently duplicating the cart item (Rule 65, new), and the coupon-status confusion between "added to cart" and "actually redeemed."
2. **§6.2/§6.4** — `play_sessions`' schema block was missing its `selected_game_type` column and check constraint entirely, and that constraint's undocumented drift from the app's canonical game vocabulary broke every `spin_wheel` play session for ~4 weeks before a user report surfaced it (Rule 56, new).
3. **§4.3 (new)** — four Menu Library hardening migrations from 2026-07-04 (RLS recursion fix, category display-order backfill + reorder controls, menu name uniqueness, admin grid Clone/soft-delete) were never folded in after the pre-merge hardening audit doc they followed.
4. **§8.2, §8.7 (new)** — `/admin/sessions` was renamed/restructured to "Dining Intelligence" 2026-07-02 and was never called that here; separately, `/architecture/realtime_presence_v1.md` had documented two admin realtime channels as "LIVE" for over a week while `supabase_realtime` had zero tables registered — RLS was correct, but publication membership (a separate, unrelated requirement) was missing the entire time (Rule 57, new). Fixed 2026-07-07; `orders` still has the same gap, tracked as open debt.
5. **§3.6, root `README.md`** — the Restaurant Directory/Workspace redesign (§3.6) was already current as of v4.3, but `docs/architecture/README.md`'s repo map and the root `README.md` had never been updated to match it or the Dining Intelligence rename.

See `docs/architecture/README.md`'s "Known technical debt" section for the open items this audit produced but didn't fix (the `orders` realtime-publication gap, the dormant `pick_a_card` game-registry gap, the dead `engine/session-presence/realtime-channels.ts` module, and a rule-numbering gap in `docs/engineering/claude-engineering-rules.md`).

---

## Why v4.3

§3.6 (Admin UI structure) is rewritten for the Restaurant Directory + Workspace redesign: `/admin/restaurants` moves from a single page rendering every restaurant as an expanded inline-form card to a two-level Directory (grid of summary tiles, read-only, with search/filter) → Workspace (`/admin/restaurants/[restaurantId]`, 8 tabs) pattern — the same Directory→Workspace shape already used by the Dining Intelligence admin UI (`/admin/sessions` → `/admin/sessions/[restaurantId]`) and Menu Library (§4.1). No functionality was removed; every existing tab/form moved into the Workspace. See §3.6 for the full detail; no other section changed.

---

## Why v4.2

§4 (Menu Architecture) is rewritten for the Menu Library redesign (`20260703000000_menu_library_v1.sql`), which replaces the "one restaurant = one menu" model with owner-scoped, reusable menus assignable to multiple restaurants via `restaurant_menu_assignments`. See §4 for the full detail; no other section changed.

---

## Why v4

v3 (2026-06-22) was accurate for auth, multi-tenancy, menu, promotions, ordering, the AI content-generation intelligence layer, and security. It predates an entire product layer shipped 2026-06-23 through 2026-06-30 — Touchpoint Management, the Session Lifecycle state machine, the Session Presence Engine, the Session Events behavioral log, the Guest Identity Engine, Session Intelligence V3.1, and Decision Runtime V1 — none of which appeared anywhere in v3. That layer has instead lived, undiscoverably, in a second documentation tree at `/architecture/` (repo root, no `docs/` prefix) with no links from either README.

This revision does three things:
1. Adds the missing layer (§7 Touchpoint Architecture, §9 Session, Presence & Behavioral Intelligence) as decision-level summaries, pointing to `/architecture/` (root) for full implementation detail rather than duplicating it — that tree remains the authoritative technical reference for session/intelligence internals per Rule 42.
2. Corrects a live schema/doc mismatch found during this audit: v3 §5.4–5.5 described tables named `rewards` and `coupons`. The live database (confirmed via direct schema query) shows those tables exist but are **empty and unused** — the application code and 329/123 live rows respectively are in `promotion_rewards` and `coupon_redemptions`. §8 below reflects the real tables.
3. Cross-links the two documentation trees so neither is an orphan. See `docs/architecture/README.md` for the full index.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Authentication Architecture](#2-authentication-architecture)
3. [Multi-Tenant Restaurant Architecture](#3-multi-tenant-restaurant-architecture)
4. [Menu Architecture](#4-menu-architecture)
5. [Touchpoint Architecture](#5-touchpoint-architecture)
6. [Promotion Engine](#6-promotion-engine)
7. [Ordering Engine v1](#7-ordering-engine-v1)
8. [Session, Presence & Behavioral Intelligence](#8-session-presence--behavioral-intelligence)
9. [Intelligence Layer — AI Content Generation](#9-intelligence-layer--ai-content-generation)
10. [Security Architecture](#10-security-architecture)
11. [Future Architecture Roadmap](#11-future-architecture-roadmap)
12. [Appendix: Key Invariants](#appendix-key-invariants)

---

## 1. Platform Overview

SpinBite is a multi-tenant restaurant revenue platform. A single operator account manages one or more physical restaurant locations. Each location gets an independent public QR menu, per-touchpoint session tracking, a promotion and game engine, commission-free ordering, behavioral intelligence, and AI-powered content generation.

**Core mission:** AI-first Restaurant Revenue Operating System. Near-term: stable, clean operational primitives (menu → item → promotion → reward → coupon → customer → campaign). Long-term: every layer AI-controllable. Do not build autonomous AI execution ahead of stable primitives — see [Appendix](#appendix-key-invariants).

### Core product surfaces

| Surface | Route | Audience |
|---|---|---|
| Public QR Menu | `/r/[restaurantSlug]` or `/r/[restaurantSlug]/[touchpointCode]` | Customers |
| Order Tracker | `/r/order/[orderId]` | Customers |
| Promotion Play | `/play/[restaurantSlug]/[promotionSlug]` | Customers |
| Admin Dashboard | `/admin` | Restaurant owners |
| Restaurant Management | `/admin/restaurants` | Restaurant owners |
| Menu Library | `/admin/menus`, `/admin/menus/[menuId]` | Restaurant owners |
| Promotions | `/admin/promotions` | Restaurant owners |
| Orders Inbox | `/admin/orders` | Restaurant owners |
| Sessions & Live Intelligence | `/admin/sessions` | Restaurant owners |
| Super Admin | `/super-admin` | SpinBite staff |

### Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage |
| Realtime | Supabase Realtime (`postgres_changes` + Broadcast) |
| AI — text | Anthropic Claude (Haiku / Sonnet) |
| AI — image | Google Vertex AI (Gemini 2.5 Flash Image / Imagen 3) |
| Hosting | Vercel |
| Language | TypeScript |

---

## 2. Authentication Architecture

Unchanged from v3. Restaurant creation only happens after authentication; `owner_id` is assigned explicitly at insert time in `/setup`. No email-claim or pre-auth restaurant creation path exists.

```
/auth (signup mode) → supabase.auth.signUp() → supabase.auth.signInWithPassword() → goAfterAuth()
  ├─ owns any restaurants? YES → /admin
  └─ NO → /admin/restaurants  (then "+ Add Restaurant" → /setup)
```

`restaurants.owner_id uuid NOT NULL → auth.users(id)` is the single source of truth for multi-tenant access control — `restaurants.owner_id = auth.uid()` is the only ownership derivation used in RLS policies, API guards, and UI data loads.

Roles: `restaurant_owner` (default) and `super_admin` (manual `profiles.role` update, checked via `is_super_admin()`).

---

## 3. Multi-Tenant Restaurant Architecture

### 3.1 Core principle

**Every capability, setting, and configuration is per restaurant, never per account.** Applies without exception to feature flags (`restaurant_capabilities`), UI/UX settings (`restaurant_settings`), the ordering toggle, AI generation quota, intelligence profile, menu content, promotions, touchpoints, QR codes, and orders.

### 3.2 Restaurants table (key columns)

```sql
restaurants (
  id uuid PK, owner_id uuid NOT NULL → auth.users(id), name text NOT NULL, slug text UNIQUE NOT NULL,
  experience_mode text, -- 'promotion_only' | 'menu_only' | 'menu_and_promotion'
  brand_color, secondary_color, accent_color, description, hero_image_url, logo_url text,
  hours jsonb, phone, address_line1, city, province_state, postal_code, country,
  website_url, instagram_url, facebook_url, google_maps_url text,
  current_promotion_id uuid, deleted_at, created_at, updated_at timestamptz
)
```

Soft delete via `deleted_at`. Slug: `slugify(name) + '-' + last5digitsOfTimestamp` — collision-safe across accounts.

### 3.3 Experience modes

| Mode | Public menu behavior |
|---|---|
| `promotion_only` | Spin wheel / game only — no menu browsing |
| `menu_only` | Menu only, no game or promotion |
| `menu_and_promotion` | Full menu + floating promotion widget |

### 3.4 restaurant_settings and 3.5 restaurant_capabilities

Both are per-restaurant key-value stores (`UNIQUE (restaurant_id, key/capability_name)`). `restaurant_settings` controls presentation (`show_featured_items_on_landing`, `show_prices_on_landing`, `enable_floating_reward_widget`, `widget_position`). `restaurant_capabilities` controls whether a feature operates at all — `ordering` and `table_management` (Settings tab), `payment_simulation` (Payments tab), all default `false`. Toggle location: `/admin/restaurants/[restaurantId]` Workspace → the relevant tab, saves immediately, no Save button.

### 3.6 Admin UI structure

**Restaurant Directory + Workspace** (redesigned 2026-07-03) — two levels, replacing the old single-page-with-inline-forms model:

- **Directory** (`/admin/restaurants`) — a grid of read-only summary tiles (`RestaurantDirectoryTile`): cover photo, logo, name, address, live counts (tables, assigned menus, active promotions, active sessions — from `GET /api/admin/restaurants/summary`), operational badges (ordering/payments enabled, experience mode). Search + filter (All / Ordering Enabled / Promotion Enabled / Active Locations). No editing happens here — "Open Workspace" is the only action per tile, plus an `AddRestaurantTile` linking to `/setup`.
- **Workspace** (`/admin/restaurants/[restaurantId]`) — where all configuration lives, behind 8 tabs: Overview, Branding, Menus, Promotions, Tables, QR Codes, Payments, Settings.
  - **Overview** — live stat tiles for this restaurant (tables, assigned menus, active promotions, orders today, revenue today, active dining sessions).
  - **Branding** — composes the existing `RestaurantProfileTab` (experience mode, description, brand colors, logo) and `RestaurantContactTab` (phone, address, hours, socials) under one tab; neither component's internals changed.
  - **Menus** — read-only list of this restaurant's `restaurant_menu_assignments`; menus are owner-scoped platform objects (§4), not restaurant-owned, so editing happens only via "Manage Menus →" to the Menu Library.
  - **Promotions** — read-only summary of this restaurant's `promotions` rows; "Manage Promotions →" deep-links to `/admin/promotions?slug={slug}`. (Promotions remain `restaurant_id`-scoped, not yet a shared library like Menus — that would be its own redesign.)
  - **Tables** (`RestaurantTablesTab`), **QR Codes** (`RestaurantQrTab`), **Settings** (`RestaurantSettingsTab`) — unchanged from before, just relocated.
  - **Payments** (`RestaurantPaymentsTab`) — new: exposes the `payment_simulation` capability toggle, which existed in `restaurant_capabilities` and was enforced server-side but had no admin UI until this change.

`restaurantId` is passed explicitly to every tab — no tab derives restaurant context from global state or `.limit(1)`.

### 3.7 Navigation architecture

`/admin/*` and `/super-admin/*` share a persistent desktop sidebar + mobile burger drawer via a centralized shell (shipped 2026-06-30, PR #83).

- `lib/navigation.ts` — single source of truth: `adminNavigation` and `superAdminNavigation` arrays (`{ label, href, icon }`)
- `components/layout/AppShell.tsx` — composes sidebar + mobile header + drawer around `children`; route isolation is structural via `app/admin/layout.tsx` / `app/super-admin/layout.tsx`
- `components/layout/{AdminSidebar,MobileBurgerMenu,AdminHeader,NavigationItem}.tsx`
- Routes ending in `/print` bypass the shell entirely (exact physical print dimensions)
- `lib/ui-layers.ts` (`UI_LAYERS`) centralizes z-index — new overlays import from here, never hardcode `z-[N]`
- `requireSuperAdmin()` lives in `app/super-admin/layout.tsx`; Server Action files keep their own call since Server Actions bypass the layout render tree
- Auth/role gating is unchanged: middleware still gates `/admin/*`

---

## 4. Menu Architecture

**Redesigned 2026-07-03 — Menu Library v1** (`20260703000000_menu_library_v1.sql`). Replaces the v3 "one restaurant = one menu" model.

```
Owner → Menu (owner-scoped, reusable) → MenuCategory → MenuItem
Restaurant ←→ Menu   via restaurant_menu_assignments (many-to-many)
```

`menus` (new, top-level) is owned directly by `owner_id uuid → auth.users(id)` — not by a restaurant. A menu (e.g. "Lunch Menu", "Kids Menu") can be assigned to zero, one, or many restaurants via `restaurant_menu_assignments (restaurant_id, menu_id, active, display_order)`. `active_start_time` / `active_end_time` / `active_days` columns exist on this table, reserved and unused, for the future time-based auto-switching roadmap item (§11) — no runtime logic reads them yet.

`menu_categories` is the renamed v3 `menus` table (what the admin builder actually operated on as flat "categories" — the old table name never matched what it held). It is now scoped by `menu_id uuid → menus(id)` instead of `restaurant_id`. The dead `menu_sections` table (never wired to any UI since before v3) was dropped in the same migration, along with the equally-unused `menu_items.section_id`.

`menu_items.category_id` (renamed from `menu_id`) points at `menu_categories`. `menu_items.restaurant_id` is **kept** as the item's authoring/originating restaurant — a deliberate simplification: cross-location reuse of a menu is governed entirely by `restaurant_menu_assignments`, not by items themselves being multi-restaurant-aware. This keeps RLS on `menu_items` and existing API routes (`generate-food-image`, coupons, promotion-performance, session tracking) unchanged. `menu_items` still carries the Special Offer Engine columns directly (`special_enabled`, `special_type`, `special_percent`, `special_price`, `special_start_at`, `special_end_at`, `special_no_expiry`) — no separate pricing table. Effective price computed server-side via `calculateSpecialPrice()` in `lib/menu/special-offer.ts`; order items snapshot `effective_price_snapshot` / `special_active_snapshot` at order time.

`ai_metadata` JSONB is the standing contract for all AI-generated content on an item (`description_source`, `description_model`, `image_source`, `image_model`, `import_source`, etc.) — new AI capabilities write into this envelope, no new columns.

Shared fetch helpers live in `lib/menu/queries.ts` (`fetchAssignedMenus`, `fetchMenuContents`) — used by both the public menu pages and the admin builder so the assignment → menu → category → item traversal isn't duplicated.

### 4.1 Admin UI

`/admin/menus` — Menu Library: grid of all menus owned by the current user (not restaurant-scoped), with category/item/assigned-location counts and Create Menu. `/admin/menus/[menuId]` — the category/item builder (formerly `/admin/menu`), scoped to one menu via the route param rather than a restaurant picker; shows its currently assigned restaurant(s) and links to Assign Locations. `/admin/menus/[menuId]/assign` — checkbox list of the owner's restaurants toggling `restaurant_menu_assignments` rows.

### 4.2 Public rendering

`/r/[restaurantSlug]` and `/r/[restaurantSlug]/[touchpointCode]` resolve a restaurant's active menus via `restaurant_menu_assignments` (not a direct `restaurant_id` query on `menus`). `components/public/RestaurantPublicPage.tsx` and `TouchpointMenuPage.tsx` themselves are unmodified and still only ever receive one flat `sections: PublicSection[]` array (now sourced from `menu_categories` of whichever menu is selected). Gated by `experience_mode`, `restaurant_settings`, and `restaurant_capabilities.ordering`, unchanged from v3.

#### 4.2.1 Deterministic resolution algorithm

Given `(restaurant_id, menu query param)`, resolution is a pure server-side function of DB state — no client-side selection logic, no caching, no randomness:

1. **Assigned menus** — `restaurant_menu_assignments` rows where `restaurant_id = X AND active = true`, ordered by `display_order ASC, created_at ASC`. The `created_at` tiebreaker is load-bearing, not decorative: `display_order` defaults to `0` for every assignment today (the Assign Locations UI has no reordering control yet), so without it, Postgres does not guarantee stable ordering among ties and which menu appears "first" could vary between requests. With it, the first-ever-assigned menu always wins ties.
2. **Filter to active menus** — join to `menus` where `active = true`, preserving the assignment order from step 1 (a menu deactivated after assignment silently drops out, it is not an error state).
3. **Select one menu** — if a `?menu=<id>` query param matches one of the assigned menu IDs, use it; otherwise use the first (per step 1/2 ordering). Zero assigned menus → `selectedMenu = null`.
4. **Categories** — `menu_categories` where `menu_id = selectedMenu.id AND active = true`, ordered by `display_order ASC`. (No `selectedMenu` → skipped, empty array.)
5. **Items** — `menu_items` where `category_id IN (category IDs from step 4) AND deleted_at IS NULL AND active = true`, ordered by `display_order ASC`.
6. **Render** — zero assigned menus renders the existing empty-state branch already built into `RestaurantPublicPage`/`TouchpointMenuPage` (`sections.length === 0`), not a crash or redirect. More than one assigned menu renders a server-rendered pill-nav (`?menu=<id>` anchor links, one per assigned menu in step-1 order) above the menu; exactly one assigned menu (the common case, and what every pre-existing restaurant was backfilled to) renders with no nav at all — byte-for-byte the same DOM shape as the pre-redesign single-menu experience.

Verified 2026-07-03 against live data via reversible transactions (insert + rollback): a restaurant with an active assignment temporarily deactivated resolves to zero assigned menus with no error; a restaurant temporarily given a second active assignment correctly isolates each menu's categories/items with no cross-contamination, and the tiebreaker produces a stable order across repeated runs.

### 4.3 Post-launch hardening (2026-07-04, undocumented until this audit)

Four follow-up migrations landed the day after the redesign shipped, none reflected here until now:

- **RLS recursion fix** (`20260704000000_fix_menu_assignment_rls_recursion.sql`) — `menus`' own SELECT policy queries `restaurant_menu_assignments`, and that table's INSERT/UPDATE checks queried `menus` directly, re-triggering the first policy — a same-relation RLS cycle Postgres detects and aborts as "infinite recursion detected in policy for relation restaurant_menu_assignments." Surfaced on `/admin/menus/[id]/assign` when toggling a location checkbox. Fixed with a `SECURITY DEFINER` helper (`public.user_owns_menu(p_menu_id)`) that checks menu ownership without re-invoking `menus`' RLS policies.
- **Category ordering** (`20260704000000_menu_category_display_order_backfill.sql`) — `menu_categories.display_order` was always inserted as `0` and the admin builder's own category query had no `ORDER BY`, so the admin list and the live public menu could disagree on category order. Backfilled real values by creation order; new categories now get the next order on creation; the admin builder (`app/admin/menus/[menuId]/page.tsx`) sorts to match and has up/down reorder controls (category-level only — `restaurant_menu_assignments.display_order`, the menu-to-restaurant order from §4.2.1 step 1, still has no reorder UI).
- **Menu name uniqueness** (`20260704000001_menu_name_uniqueness.sql`) — enforces `UNIQUE (owner_id, lower(name))` on `menus` (partial index, `WHERE deleted_at IS NULL`), after two backfilled per-location menus both named identically caused confusion in the Menu Library grid and Assign Locations screen. Pre-existing collisions were deduped in the same migration (renamed to include the assigned restaurant's city, or a numbered suffix if unassigned).
- **Admin grid additions** (`app/admin/menus/page.tsx`, same window) — Clone Menu (duplicates a menu's categories/items under a new name, still unassigned) and soft-delete (`deleted_at` + `active = false`, filtered via `.is('deleted_at', null)` everywhere the grid or resolution algorithm reads `menus`) plus a View/Edit link split, replacing a single ambiguous action.
- Also from the same hardening pass: `menus.version`, auto-incremented via an `increment_menu_version()` trigger — a change counter, not real versioning/rollback (no history table, nothing reads old versions yet).

---

## 5. Touchpoint Architecture

**New since v3.** Shipped `20260623000000_touchpoint_management_v1.sql`. Governed by Rules 31–33 in `docs/engineering/claude-engineering-rules.md`.

### 5.1 Core principle

A restaurant is not one QR code. It is a set of physical entry points — tables, patio seats, a counter, a pickup window, a kiosk, a bar, a waiting area. The canonical entity is `restaurant_touchpoints`, not a `restaurant_tables` table. No code may special-case "table" as the only touchpoint type, hardcode table-specific columns onto `orders`, or name QR params `?table=` instead of `?tp=`.

### 5.2 restaurant_touchpoints table

```sql
restaurant_touchpoints (
  id uuid PK, restaurant_id uuid NOT NULL → restaurants(id),
  name text NOT NULL, type text NOT NULL DEFAULT 'table',
  touchpoint_code text NOT NULL, section_name text, capacity integer,
  occupancy_status text DEFAULT 'available',
  display_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
  created_at, updated_at, deleted_at timestamptz
)
```

`type` values include `table`, `patio`, `counter`, `pickup`, `kiosk`, `bar`, `waiting_area`. `touchpoint_code` is restaurant-scoped (renamed from `public_code` — clarified in `90657d0`), unique per restaurant, not globally.

**Doc/reality drift (found 2026-07-08):** the live `touchpoints_type_check` constraint only allows `table`, `patio`, `counter`, `pickup` — `kiosk`, `bar`, `waiting_area` are documented above but not actually permitted by the database today. Verify live (`pg_get_constraintdef` on `restaurant_touchpoints`, per Rule 56) before assuming any of the undocumented three are usable; the admin UI's `TYPE_OPTIONS` (`components/admin/restaurants/RestaurantTablesTab.tsx`) also only offers the four constraint-backed values.

### 5.3 QR encoding

Restaurant-level QR (`/r/{slug}`) encodes the restaurant only. Touchpoint-level QR encodes `/r/{restaurantSlug}?tp={touchpoint_code}` (or the dedicated route `/r/[restaurantSlug]/[touchpointCode]`). The param name is `tp`, never `table` — must not assume touchpoint type.

### 5.4 Orders and touchpoints

`orders.table_identifier` (text) is a legacy display-only field from Ordering Engine v1 — it is not a structured reference and must not be relied on for business logic. The structured reference is `orders.touchpoint_id uuid FK → restaurant_touchpoints(id)`; when both fields are present, `touchpoint_id` is authoritative. Any new feature needing to know where an order originated must use `touchpoint_id`.

### 5.5 Admin UI

Tables/touchpoints admin UI lives under `/admin` (Touchpoint Management v1, Phase A schema + Phase B admin UI). Must render generically over `type`, never assume every touchpoint is a table.

### 5.6 Restaurant-level QR (`/r/[slug]`) guest-experience parity (fixed 2026-07-08)

`/r/[slug]` (no touchpoint code) and `/r/[slug]/[touchpointCode]` render the same underlying `RestaurantPublicPage` menu, but historically diverged in guest-facing behavior: the touchpoint route wrapped it in `TouchpointMenuPage`, which resolves a `visit_sessions`/`session_guests` row (§8.1/§8.4) and prompts for the guest's name before showing the menu; the restaurant-level route rendered `RestaurantPublicPage` directly with none of that — no name prompt at all.

**Fix:** a new `components/public/DirectMenuPage.tsx` wrapper now sits in front of `RestaurantPublicPage` on the restaurant-level route, showing the identical name-capture UI (extracted into a shared `components/public/GuestNameModal.tsx`, used by both wrappers) — but backed by `sessionStorage` only, never `/api/public/sessions/resolve`.

**This is a deliberate, permanent asymmetry, not a partial fix.** `resolveSessionJoin()` (§8.2, `engine/session-presence/join-session.ts`) enforces one *active* `visit_sessions` row per `touchpoint_id`, joining any visitor within a 2-hour staleness window into the same session as a fellow guest of the same party — correct when a touchpoint is a physical table scanned by one party's phones, but would silently merge unrelated strangers sharing one restaurant-level link into a fake shared party (corrupting presence counts and, critically, session-scoped "My Orders" — Guest A would see Guest B's orders). `hooks/useDirectOrders.ts` already established this boundary for order history (a per-browser `sessionStorage` list instead of a session-scoped server query); `DirectMenuPage` follows the same principle for guest identity. Promotion/coupon behavior was already at parity before this fix — `RewardWidget` is the same component on both routes and picked up the Rule 66 fix (§6.5 above) automatically; only the coupon's `localStorage` key isn't session-scoped on this route (documented, intentional — see `lib/play-session-token.ts`). Full use-case detail: `docs/architecture/promotions-in-menu.md` §1.1.

---

## 6. Promotion Engine

### 6.1 Promotions table

```sql
promotions (
  id uuid PK, restaurant_id uuid → restaurants(id), name text, slug text UNIQUE,
  status text, -- 'draft' | 'active' | 'ended'
  game_type text DEFAULT 'wheel', placement_mode text DEFAULT 'restaurant', -- future: 'menu' | 'section' | 'item'
  max_spins integer DEFAULT 1, stop_on_win boolean DEFAULT true,
  daily_redeem_limit integer DEFAULT 100, starts_at, ends_at timestamptz, timezone text
)
```

One active promotion per restaurant at a time — launching auto-ends any other active promotion and sets `restaurants.current_promotion_id`.

### 6.2 Game engine

Games are registered in the `games` table (super-admin managed) and resolved through `lib/games/registry.ts` — the single canonical registry for both metadata and runtime component lookup.

| Game | Type key | Status | Has a registry contract? |
|---|---|---|---|
| Spin Wheel | `spin_wheel` (alias `wheel`) | Active | Yes (`lib/games/spin-wheel/`) |
| Mystery Box | `mystery_box` | Active | Yes (`lib/games/mystery-box/`) |
| Scratch Card | `scratch_card` | Active | Yes (`lib/games/scratch-card/`) |
| Open The Door | `open_the_door` | Active | Yes (`lib/games/open-the-door/`) |
| Reward Reels | `reward_reels` (`games.slug = 'lucky-slot'`) | `coming_soon` | Yes (`lib/games/reward-reels/`), beta |
| Pick a Card | `pick_a_card` (`games.slug = 'pick-a-card'`) | `coming_soon` | **No** — latent bug, see below |

`promotion_game_assignments (promotion_id, game_type, weight, enabled)` lets a promotion pool multiple game types; `resolvePromotionGame()` (`lib/game-pool/resolvePromotionGame.ts`) selects one via weighted random per session and persists it to `play_sessions.selected_game_type` (§6.4) — every subsequent request for that session token reads this stored value back rather than re-rolling (see §6.5, this is what keeps a guest's game/coupon consistent across reloads).

**Known gap — `pick_a_card` has no registry contract.** `games` has a live row (`slug: 'pick-a-card'`, `status: 'coming_soon'`) and `lib/games/game-registry.ts`'s `SLUG_TO_GAME_TYPE` maps it to `pick_a_card`, but `lib/games/registry.ts`'s `gameRegistry`/`getGameDefinition()` has no `pick_a_card` entry — `getGameDefinition('pick_a_card')` silently falls back to rendering the Spin Wheel component while every stored record still says `pick_a_card`. Currently dormant (`status: 'coming_soon'` keeps it out of `resolvePromotionGame`'s active-games pool, and no promotion has a `pick_a_card` assignment row), but **do not flip this game to `active` in Super Admin** until `lib/games/registry.ts` gains a real `pick_a_card` contract — doing so today would both mis-render (spin wheel UI, wrong game underneath) and fail every play with the same `play_sessions_game_type_valid` check-constraint violation described in §6.4, since that constraint's allow-list does not include `pick_a_card` either.

### 6.3 Rewards — corrected table names

**Audit finding:** v3 described this subsystem as tables `rewards` and `coupons`. Both exist in the live schema but are empty and unreferenced by application code (`rewards`: 0 rows; no live code path queries `coupons` at all). The tables actually in use, confirmed live (329 and 123 rows respectively), are:

```sql
promotion_rewards (
  id uuid PK, promotion_id uuid → promotions(id) CASCADE, restaurant_id uuid → restaurants(id) CASCADE,
  menu_item_id uuid → menu_items(id) SET NULL, custom_name text,
  reward_type text DEFAULT 'percent_discount', reward_value numeric(10,2),
  daily_limit integer DEFAULT 25, weight integer DEFAULT 10, display_order integer DEFAULT 0
)

coupon_redemptions (
  id uuid PK, promotion_id uuid NOT NULL, promotion_reward_id uuid → promotion_rewards(id),
  restaurant_id uuid NOT NULL, coupon_code text NOT NULL, status text DEFAULT 'issued',
  customer_session_id text, play_session_id uuid → play_sessions(id),
  issued_at timestamptz DEFAULT now(), redeemed_at timestamptz
)
```

Reward label resolution: `custom_name` → menu item name (via `menu_item_id`) → `'Reward'`. Coupon codes: `SPIN-XXXXXX` (6 alphanumeric, ambiguous characters excluded), generated by `createCouponCode()` in `lib/rewards.ts`. Reward selection: `pickWeightedReward()`, weighted random over `weight`; `daily_limit` caps redemptions per day.

**Recommendation:** drop or formally deprecate the unused `rewards` and `coupons` tables in a follow-up migration to remove the doc/schema ambiguity permanently — out of scope for this audit (Rule 6: no schema changes without explicit approval).

### 6.4 Play sessions and customer identity

```sql
play_sessions ( id uuid PK, restaurant_id, promotion_id uuid, session_token text UNIQUE,
  selected_game_type text CHECK (... see below), ip_address, user_agent text,
  customer_profile_id uuid → customer_profiles(id) SET NULL, terms_accepted_timestamp timestamptz,
  created_at timestamptz )

customer_profiles ( id uuid PK, phone_country_code, phone_number_raw, phone_number_e164 text UNIQUE,
  marketing_consent boolean DEFAULT false, marketing_consent_timestamp timestamptz,
  terms_accepted_timestamp timestamptz NOT NULL )
```

One `play_sessions` row per `session_token` (client-generated UUID, `getOrCreatePlaySessionToken()` in `lib/play-session-token.ts`, keyed by `restaurantSlug + promotionSlug + visitSessionId` in `localStorage`, 24h TTL). Created idempotently by `resolvePromotionGame()` — a concurrent duplicate insert (`23505`) is caught and recovered by re-reading the winning row, never surfaced as an error.

**Schema governance gap:** unlike every other table in this document, `play_sessions`' full DDL (including the `selected_game_type` check constraint) is **not fully reconstructable from `supabase/migrations/`** — it predates this repo's migration-tracking discipline and was extended live. `20260707160000_fix_play_sessions_game_type_valid.sql` is the *only* tracked migration that touches this table, and it only `ALTER`s the constraint — it does not `CREATE TABLE`. Concretely, this already caused a real production incident: the constraint's allow-list (`wheel, mystery_box, scratch_card, slot_machine, fortune_cookie, pick_a_door, open_the_door`) used a vocabulary that predated `lib/games/types.ts`'s canonical `GameType` union, so any promotion whose weighted pool selected `spin_wheel` — the single most common primary game type — failed every first-play insert for roughly four weeks (2026-06-10 to 2026-07-07) before a user-reported error surfaced it. Fixed 2026-07-07 by aligning the constraint to `wheel, spin_wheel, mystery_box, scratch_card, reward_reels, open_the_door` (legacy `wheel` kept for 13 pre-existing rows). **Before trusting any constraint/trigger on this table, verify it live** (`pg_get_constraintdef` via the Supabase MCP or SQL editor) rather than assuming `supabase/migrations/` is complete for it — see Rule 56.

Phone capture is optional and separate from marketing consent (privacy: phone ≠ consent). Captured via `CustomerIdentityScreen` before game start, skipped if `localStorage['spinbite_identity_v1']` is set. Writes go through `POST /api/public/customer-identity` using the service role key — customers are never authenticated. This is the foundation for future SMS campaigns, wallet passes, and loyalty (§11.2).

### 6.5 Redeem Now — coupon-to-cart-to-checkout bridge

**New since v4.3 — undocumented until this audit despite being live since 2026-07-05 (`feature/redeem-now-order-payment`).** No new tables; this is a client-side bridge connecting an already-won coupon (§6.3's `coupon_redemptions`, `status: 'issued'`) to the ordering cart (§7) so a guest can use their reward without re-entering anything.

**Flow:** the play page's win screen and the floating `RewardWidget` (`components/public/RestaurantPublicPage.tsx`) both build a `/r/{slug}?redeem_id=...&redeem_item=...&redeem_type=...&redeem_value=...&redeem_code=...&redeem_exp=...` link from the issued coupon. `usePendingRedemption()` (`hooks/usePendingRedemption.ts`) consumes those query params on the menu page, strips them from the URL, and persists a `PendingRedemption` record to `sessionStorage` (`spinbite_pending_redemption_v1`). A `RestaurantPublicPage` effect then auto-adds the reward's menu item to the cart exactly once, guarded by a synchronous storage-based claim (`claimAutoAdd`) — not React state — so it stays correct even under a StrictMode double-invoke or hydration-recovery remount.

**Discount math — one unit only, by design.** `lib/orders/reward-discount-math.ts`'s `computeRewardDiscount()` is explicitly scoped to a single unit's price, "never the full line total regardless of quantity in cart," because a coupon is issued one-per-play. This is shared verbatim between the client preview (`CartSheet.tsx`, `PaymentCheckoutScreen.tsx`) and the authoritative server calculation (`lib/orders/apply-coupon-discount.ts`'s `resolveCouponDiscount()`, called from `payment-orchestrator.ts` at checkout) so the previewed discount can never drift from what's actually charged. `CartSheet` additionally disables the `+` quantity control on the specific cart line carrying the active coupon — the discount was never wrong server-side, but letting a guest increment it visually implied every unit got the discounted "each" price.

**Coupon status lifecycle — "added to cart" ≠ "redeemed."** A coupon's `coupon_redemptions.status` only flips from `issued` to `redeemed` when checkout actually completes (`payment-orchestrator.ts` on payment success) — never merely by clicking "Redeem Now," which only adds the item to the cart. This distinction caused real user-facing confusion (2026-07-07): the floating widget kept offering an actionable "Redeem Now" button after the guest had already added the reward to their cart, implying it could be redeemed again, and — because `usePendingRedemption`'s `consumeUrlParams()` didn't preserve the `autoAdded` claim across repeat visits to the same redeem link — repeat taps actually did re-add the item, incrementing its cart quantity each time. Both are now fixed: `consumeUrlParams()` carries over `autoAdded`/`bannerDismissed` when the same `redemptionId` is re-consumed, and `claimAutoAdd()` syncs its claim into the hook's `pending` React state (not just storage) so the UI reflects "added to your order" immediately, without needing a reload. The widget now has three distinct states for an already-played promotion: not yet added (`Redeem Now` / `Browse Menu`), added but not checked out (`🛒 Added to your order`), and checked out (`✅ Coupon already redeemed`). This pattern — an idempotent claim must sync into whatever state actually drives the UI, not just the storage/DB record it's claimed against — is now Rule 65.

**Coupon status must be re-fetched on every reopen, not just on mount (fixed 2026-07-08).** `RewardWidget`'s `statusCoupon` was fetched once when the component mounted and never refreshed afterward. A customer who played, won a coupon, added it to cart via "Redeem Now," and then *paid for the order* (flipping `coupon_redemptions.status` to `redeemed` server-side per §6.5 above) would still see the stale `issued` copy if they reopened the floating widget without a full page reload — the "✅ Coupon already redeemed" branch already existed and rendered correctly, it simply never received fresh data to trigger it. The customer saw the coupon code and an active "Redeem Now" button again, and tapping it re-added the (already-spent) reward item to a new cart. Server-side this was never a double-discount exploit — `resolveCouponDiscount()` re-derives `status` from the DB at checkout and zeroes the discount once it isn't `issued` — but it was a real UI/trust bug: a phantom discount that would silently vanish at charge time. Fixed by re-fetching status (`fetchStatus()`) both on mount and every time `openSheet()` runs, so the widget's view of `coupon_redemptions.status` is never more than one sheet-open stale. This is now Rule 66 — see `docs/architecture/promotions-in-menu.md` for the full use-case reference this incident is now folded into.

**Game-type display consistency.** `RewardWidget` previously re-picked a random game visual/icon on every mount and every sheet-open from the promotion's enabled game pool — independent of which game the server (`resolvePromotionGame`) had actually resolved and persisted for that session. A guest could play and win on Scratch Card, then reopen the widget and see Mystery Box's icon/copy above their real, correct reward. Fixed 2026-07-07: once a `play_sessions` row exists for the browser (peeked via `peekPlaySessionToken`), the widget reads the authoritative `promotion.game_type` from the same status-check API call it already makes for `existingCoupons`, and pins to it — the random pick is now only ever shown before a guest has reached the play page at all. This is now Rule 64: once a randomized runtime choice is resolved and persisted, every surface displaying it must read the persisted value, never re-derive or re-randomize it.

---

## 7. Ordering Engine v1

Commission-free QR ordering. Two payment modes, capability-gated per restaurant (Invariant #1) — never global:

- **`ordering` only** (unchanged since v3): cash/in-restaurant payment, order created directly on cart submit via `POST /api/public/orders`.
- **`ordering` + `payment_simulation`** (new, §7.1): a simulated payment step gates order creation on a mock-provider charge success.

`orders` table includes `order_number` (atomic via `next_order_number()` RPC + `restaurant_order_counters` — `UPSERT + increment`, never `SELECT MAX + 1`), `idempotency_key` (client UUID, `UNIQUE`), and (per §5.4) `touchpoint_id`.

`order_items` snapshots `price_snapshot`, `effective_price_snapshot`, `special_active_snapshot` at order time.

`POST /api/public/orders` protections: 8 KB body limit, 20 items max, 99 qty max, 20 req/15min per-IP, 200 orders/hour per-restaurant, idempotency, server-side capability + price re-validation. Price resolution and order/order_items creation live in `lib/orders/resolve-order-items.ts` and `lib/orders/create-order.ts` — shared verbatim with the payment-gated route (§7.1) so both flows price and create orders identically.

Order tracker (`/r/order/[orderId]`) uses the order UUID as an unguessable capability token via Supabase Realtime; anonymous SELECT is scoped to this pattern.

### 7.1 Payment Simulation

**New since v4.0.** Shipped `20260701000000_payment_simulation_v1.sql`. A mock payment layer inserted between cart submission and order creation, gated by `restaurant_capabilities.payment_simulation` (default `false`). Restaurants without the capability are entirely unaffected by this section.

**Explicit non-goal:** this is not a real payment integration. No Stripe SDK, no external provider API calls, no real card data ever leaves the browser, and no card data (number, expiry, CVC) is ever persisted anywhere — not in the database, not in `localStorage`/`sessionStorage`. Its purpose is to validate the full ordering workflow against a realistic checkout UX before a real processor is integrated.

**Flow:** `POST /api/public/payments/checkout` → `lib/payments/payment-orchestrator.ts` (`processPayment()`) → server-side price/tax/tip resolution → `payments` row inserted (`status: 'pending'`) → active `PaymentProvider` (`lib/payments/providers/mock-provider.ts`, always succeeds) → on success, `createOrderWithItems()` runs (identical to the direct-order path) → `payments.order_id` backfilled. On failure (structurally supported, never triggered by the mock), no order is created and the payment is marked `failed`.

**Provider abstraction:** `lib/payments/providers/payment-provider.interface.ts` defines `PaymentProvider` (`createCheckout`, `authorizePayment`, `capturePayment`, `refundPayment`, `verifyWebhook`), mirroring the existing AI-provider pattern (`lib/intelligence/providers/`). A future `StripeProvider` implements the same interface with no change to the orchestrator or the checkout UI (`components/public/PaymentCheckoutScreen.tsx`).

**`payments` table:** `id, restaurant_id, order_id (nullable until success), provider, transaction_id, amount, currency, status, created_at, updated_at, metadata jsonb`. Tip/tax/service-fee amounts live in `metadata` — no schema changes to `orders`/`order_items`. Tax and service-fee *rates* are sourced from `restaurant_settings` (`tax_rate_percent`, `service_fee_percent`), falling back to zero if unset. RLS: owner SELECT only; all writes are service-role only (system-of-record ledger, not admin-editable).

---

## 8. Session, Presence & Behavioral Intelligence

**New since v3 — the largest gap this revision closes.** Full implementation detail lives in `/architecture/` (repo root); this section is the product-decision summary linking each subsystem to its authoritative doc.

### 8.1 Session lifecycle (live 2026-06-25)

`visit_sessions` — one row per touchpoint session, with `touchpoint_id` FK, denormalized counters, a 6-digit `session_access_code`, and a partial unique index enforcing one active session per touchpoint.

Client state machine: `SessionPhase: 'resolving' | 'confirmed' | 'session_ended' | 'resolve_failed'`. `confirmedSessionId` is set only after backend resolve completes; a 3000ms `AbortController` timeout on resolve yields `resolve_failed` with a Retry button. `orders.length` (the real orders table) is the UI source of truth for order counts — never `visit_sessions.orders_count` or `sessionStorage`. This is Rule 34/39 — the session lifecycle is a **terminal** state machine; browser cache is never authoritative.

→ Full detail: `/architecture/session_lifecycle_v1.md`

### 8.2 Session Presence Engine (live 2026-06-29)

Per-device presence via `session_guests` (server-issued 64-char hex `guest_token`, `device_fingerprint`, `status: active | inactive | disconnected | blocked`). Lifecycle: no heartbeat 3 min → `inactive`; 10 min → `disconnected` (via `update_stale_guest_presence` RPC); `disconnect_session_guests()` on session end.

Three independent realtime channels: `session-presence:{sessionId}` (admin guest count), `admin-sessions-{restaurantId}` (admin session list — documented under the name `restaurant-sessions:{restaurantId}` prior to this revision; that was never the actual topic string, see `/architecture/realtime_presence_v1.md` §3), `session-lifecycle:{sessionId}` (Supabase Broadcast REST — used instead of `postgres_changes` for customer-facing session-end because `visit_sessions` has no public SELECT policy, per Rule 40: no direct client access to session/presence tables). Session-end fallback chain: Broadcast (~200ms) → heartbeat `{active:false}` (≤30s) → order `409 SESSION_INVALID` as a last-resort safety net (Rule 41: realtime fallback design).

**Publication gap, live 2026-06-29 → fixed 2026-07-07:** both admin `postgres_changes` channels above satisfied their RLS requirement from day one but silently delivered zero events until `20260707000000_enable_realtime_visit_sessions.sql` added `visit_sessions`/`session_guests` to the `supabase_realtime` publication — a separate, RLS-independent requirement this document didn't previously call out. `orders` is still not in that publication as of this writing, so the Dining Intelligence landing page's order-change realtime refresh (§8.7) has the same gap, unresolved. Full detail and the new verification rule this produced: `/architecture/realtime_presence_v1.md` §1.1, Rule 57.

→ Full detail: `/architecture/realtime_presence_v1.md`

### 8.3 Session Events — behavioral log (live 2026-06-26)

`session_events` is a relational, typed, FK-linked log of every customer interaction (`MENU_OPENED`, `ITEM_VIEWED`, `ITEM_VIEW_DURATION`, `ITEM_ADDED_TO_CART`, `ITEM_REMOVED_FROM_CART`, `ORDER_PLACED`, `PROMOTION_VIEWED`, `PROMOTION_PLAYED`, `SESSION_ENDED`, `CATEGORY_OPENED`) — the foundation for all behavioral intelligence. Supersedes the bounded, non-queryable `session_interaction_log` JSONB column on `visit_sessions` (retained for backward compatibility only; Rule 44: no new code may write to deprecated structures).

→ Full detail: `/architecture/database_schema_map_v1.md`

### 8.4 Guest Identity Engine (live 2026-06-29)

`session_events.guest_id` and `orders.guest_id` are `session_guests.id` (server-assigned), not client-generated UUIDs, as of V1. `POST /api/public/sessions/:vsid/guest-name` captures a per-guest name (`GuestNameModal`, shown once per session).

→ Full detail: `/architecture/guest_identity_v1.md`

### 8.5 Session Intelligence V3.1 (live 2026-06-29)

`lib/session-intelligence.ts` — pure TypeScript, no DB calls. `analyzeGuestBehavior()` → `GuestBehaviorProfile`; `aggregateSessionIntelligence()` → `GuestSessionSummary` with `cross_guest_insights`. API layer enriches with guest names and computes `GuestIdentitySummary` (connected/named/ordered/anonymous). Exposed via `GET /api/admin/sessions/{id}/intelligence`; rendered in the admin Sessions page as named guests, per-guest orders, and group insights.

→ Full detail: `/architecture/intelligence_engine_v3.md`

### 8.6 Decision Runtime V1 (live 2026-06-29)

`engine/decision-runtime/runtime.ts` — `evaluateSession(sessionId, guestId?)`. Autonomous detection of two opportunity types (`high_interest_no_purchase`, `dessert_interest_after_main_order`; min confidence 0.55, 20s in-memory cooldown per session), dispatching only `waiter_notification` (all other dispatcher types remain stubs). No LLM calls, no client-side popups. Writes to `live_interventions` (actionable staff feed, `status: pending → acknowledged | dismissed | converted | expired`) and `intervention_events` (append-only audit log); broadcasts on `restaurant-decisions:{restaurantId}`.

**Rule 46 (No Blocking Intelligence Execution):** trigger points fire-and-forget — `void evaluateSession(sessionId, guestId).catch(() => {})`, never `await`ed inside a customer-facing response cycle. Trigger points: `track/route.ts` (ITEM_VIEW_DURATION, ITEM_REMOVED_FROM_CART), `orders/route.ts` (ORDER_PLACED).

→ Full detail: `/architecture/decision_engine_v1.md` and `/architecture/decision_runtime_v1.md`

### 8.7 Dining Intelligence admin surface (renamed/restructured 2026-07-02, undocumented until this audit)

`/admin/sessions` — the admin surface consuming everything in §8.1–8.6 — was restructured into the same Directory→Detail shape used by Menu Library (§4.1) and the Restaurant Directory/Workspace (§3.6): `app/admin/sessions/page.tsx` (landing — a grid of per-restaurant tiles with live summary stats: active tables/sessions/guests/orders) → `app/admin/sessions/[restaurantId]/page.tsx` (detail — `components/admin/sessions/SessionsDashboard.tsx`, Active/Completed/Abandoned tabs, each backed by a real server-side query on `visit_sessions.status`, not client-side filtering). The product name for this surface is **Dining Intelligence** — this document's §1 route table and `docs/architecture/README.md` still describe it only as "Sessions" / "live session + intelligence panel" and should be read as the same thing.

The landing page opens its own realtime channel (`dining-intelligence-summary`, watching `visit_sessions` and `orders`) to keep its stat tiles live — see `/architecture/realtime_presence_v1.md` §10 for its wiring and the `orders`-publication gap that currently makes half of it a no-op.

### 8.8 Documentation authority for this layer

Per Rule 42, the docs in `/architecture/` (root) are the canonical technical reference for this entire section and must be updated in the same PR as any migration, API route, engine function, realtime channel, or RLS policy change touching sessions, presence, or intelligence. This document (`docs/architecture/spinbite-platform-architecture-v4.md`) is the canonical reference for product decisions and invariants. See `docs/architecture/README.md` for the full cross-linked index of both trees.

---

## 9. Intelligence Layer — AI Content Generation

Unchanged from v3 (menu description generation, AI food image generation). This is distinct from §8's behavioral/session intelligence — this layer generates restaurant-facing content (descriptions, images); §8 analyzes customer behavior and drives runtime decisions. Both share the design principle that prompts/config are data, not code.

### 9.1 Design principles

1. All prompts live in the database (`intelligence_prompt_templates`), never in source code (Rule 20)
2. Provider and model are data, swappable without deployment
3. Every generation attempt is logged, success or failure (`intelligence_generation_logs`, Rule 21)
4. Cost is tracked per request at write time — survives pricing changes
5. Features are togglable via `intelligence_features.enabled` (Rule 18/19/23)
6. Cheapest capable model first — Haiku by default, escalate only when justified (Rule 24)

### 9.2 Text generation: menu description generation

Feature key `menu_description_generation`, provider Anthropic, model `claude-haiku-4-5-20251001`, route `POST /api/admin/intelligence/generate`. Flow: feature/quota check → load active prompt template → inject `restaurant_intelligence_profile` brand context → call provider → log → increment usage → return.

### 9.3 AI image generation: food photography

Feature key `restaurant_food_image_generation`, provider Google Vertex AI (`gemini-2.5-flash-image`, region `us-central1`), prompt enhancer Claude Haiku, route `POST /api/admin/generate-food-image`. Two-stage: Claude Haiku enhances the prompt → 4 parallel Vertex AI requests (`Promise.allSettled`, prompt-diversified via `VARIANT_SUFFIXES`) → images to Supabase Storage → `ai_generated_assets`. Tolerates partial failure (1–4 images = success, 0 = refund). `contents[].role` is required in every Gemini request payload — omitting it is a `400`.

Provider interface (`lib/intelligence/providers/image-provider.interface.ts`) is abstract; business logic must never couple to the Google provider directly. 1 restaurant credit is charged per generation event regardless of the 4 backend API calls.

### 9.4 Prompts-in-DB invariant

No prompt text in source code, ever (Rule 20). `intelligence_prompt_templates` is the only place prompt strings live; managed via `/super-admin/intelligence-lab`.

---

## 10. Security Architecture

Unchanged from v3.

- RLS on all application tables, single ownership pattern: `restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())`
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) only in server-side API routes, never client-exposed
- Storage buckets are path-scoped (`{uid}/{restaurantId}/...`) and validate both the caller and restaurant-ownership segments
- No open (`using (true)`) RLS on platform tables — applies to `restaurants`, `restaurant_capabilities`, `restaurant_settings`, `intelligence_*`, `promotion_game_assignments`, `orders`, `order_items`, and (new since v3) `session_guests`, `session_events`, `live_interventions`, `intervention_events`, `restaurant_touchpoints` — all owner-scoped or service-role-only writes
- `/api/public/orders` remains the highest-risk public endpoint; see §7 for its full protection stack

---

## 11. Future Architecture Roadmap

### 11.1 Customer Identity v2
Returning-customer recognition via phone lookup, loyalty accumulation, profile enrichment from order history, signed-token order access (replacing UUID-as-capability-token).

### 11.2 Communication Engine
SMS campaigns (Twilio), Apple/Google Wallet passes, web push, automated post-visit follow-up.

### 11.3 POS Integration
Webhook-based order attribution, optional table management (touchpoint-generic, not table-only per §5), kitchen display integration, POS→tracker status sync.

### 11.4 Paper Menu AI Import
Claude Vision extracts menu structure from a photograph; draft items land in the menu builder for review. Feature key `menu_photo_import` (registered, disabled).

### 11.5 AI Image Enhancement
Automatic background removal, brand-tone style transfer, batch re-generation on brand profile change.

### 11.6 Behavioral Analytics Engine — Phase 2
Phase 1 (`session_events`, §8.3) is **implemented**, not future. Phase 2: session replay and funnel visualization in the admin dashboard, promotion performance attribution report, A/B analysis for game types and reward pools, natural-language → SQL query interface over `session_events`.

### 11.7 AI Restaurant Command Center
Natural-language operations ("run a happy hour 20% off wings every Friday 4–7pm"), autonomous specials scheduling, revenue-goal-driven AI action plans. Feature key `sales_optimization` (registered, disabled).

### 11.8 Autonomous Customer Agents
Performance-monitoring agents, proactive promotion creation, churn-triggered reactivation campaigns — all gated by operator approval thresholds. Explicitly not-yet: Decision Runtime V1 (§8.6) is the first production step toward this, currently limited to one dispatcher (`waiter_notification`) and two opportunity types by hard V1 constraint.

---

## Appendix: Key Invariants

These rules must never be violated. They apply to all future engineering work.

1. **Capabilities are always per restaurant.** Never account-level. Never global.
2. **Ownership is always explicit at insert time.** `owner_id` from `auth.uid()` in the authenticated session.
3. **Touchpoints, not tables.** `restaurant_touchpoints` is the canonical entry-point entity; never architect around a `restaurant_tables` concept (Rule 31).
4. **Prompts live in the database.** No prompt text in source code.
5. **Prices are server-derived.** Client-submitted prices are never trusted.
6. **Order numbers are atomic.** Use `next_order_number()` RPC. Never `SELECT MAX + 1`.
7. **Service role key stays server-side.** Never in client components, never in `NEXT_PUBLIC_*` vars.
8. **No open RLS on platform tables.** Every write must be owner-scoped or service-role.
9. **Session lifecycle is terminal and server-confirmed.** `sessionPhase === 'confirmed'` + `confirmedSessionId` gate any session-dependent feature; browser cache is never authoritative (Rules 34, 39).
10. **No direct client access to session/presence tables.** Realtime propagation to customers goes through Broadcast or polling, never an open `postgres_changes` policy on `visit_sessions`/`session_guests` (Rule 40).
11. **Intelligence and telemetry are never on the customer-facing critical path.** Fire-and-forget only (`void evaluateSession(...).catch(() => {})`); never `await`ed inside a customer response cycle (Rule 46).
12. **All AI features are feature-flagged.** `intelligence_features.enabled` is the gate — no hardcoded feature detection.
13. **Cost is recorded at write time.** `estimated_cost_usd` uses the price active at generation, not at read time.
14. **Cheapest capable model first.** Haiku for short text; escalate to Sonnet only when complexity requires it; Opus never for routine generation.
15. **Architecture documentation must be updated in the same PR as the infrastructure change it describes** (Rule 42) — this document for product decisions/invariants, `/architecture/` (root) for session/intelligence/runtime implementation detail.
16. **Architecture audit is mandatory before any implementation.** No AI session, engineer, or developer may implement architecture changes, new features, schema modifications, API routes, or security decisions without first reading this document in full. Violations of any documented invariant require an explicit architecture decision and a version update to this document before work proceeds.
17. **Payment simulation requires ordering to be enabled — never the reverse.** `restaurant_capabilities.payment_simulation` is meaningless without `restaurant_capabilities.ordering` also enabled (§7.1). Admin UI must disable the payment-simulation toggle until ordering is on.
