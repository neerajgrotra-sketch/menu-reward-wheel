# SpinBite Platform Architecture v3

**Document version:** 3.0
**Date:** 2026-06-22
**Status:** Source of truth — supersedes v2
**Audience:** Engineering, product, CTO

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Authentication Architecture](#2-authentication-architecture)
3. [Multi-Tenant Restaurant Architecture](#3-multi-tenant-restaurant-architecture)
4. [Menu Architecture](#4-menu-architecture)
5. [Promotion Engine](#5-promotion-engine)
6. [Ordering Engine v1](#6-ordering-engine-v1)
7. [Intelligence Layer](#7-intelligence-layer)
8. [Security Architecture](#8-security-architecture)
9. [Future Architecture Roadmap](#9-future-architecture-roadmap)

---

## 1. Platform Overview

SpinBite is a multi-tenant restaurant revenue platform. A single operator account manages one or more physical restaurant locations. Each location gets an independent public QR menu, a promotion and game engine, ordering capability, and AI-powered content generation.

### Core product surfaces

| Surface | Route | Audience |
|---|---|---|
| Public QR Menu | `/r/[restaurantSlug]` | Customers |
| Order Tracker | `/r/order/[orderId]` | Customers |
| Promotion Play | `/play/[restaurantSlug]/[promotionSlug]` | Customers |
| Admin Dashboard | `/admin` | Restaurant owners |
| Restaurant Management | `/admin/restaurants` | Restaurant owners |
| Menu Builder | `/admin/menu` | Restaurant owners |
| Promotions | `/admin/promotions` | Restaurant owners |
| Orders Inbox | `/admin/orders` | Restaurant owners |
| Super Admin | `/super-admin` | SpinBite staff |

### Technology stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password) |
| Storage | Supabase Storage |
| AI — text | Anthropic Claude (Haiku / Sonnet) |
| AI — image | Google Vertex AI (Imagen 3) |
| Hosting | Vercel |
| Language | TypeScript |

---

## 2. Authentication Architecture

### 2.1 Current signup flow (v3 — as of 2026-06-22)

```
/auth (signup mode)
  ↓
supabase.auth.signUp({ email, password })
  ↓
supabase.auth.signInWithPassword({ email, password })
  ↓
goAfterAuth()
  ├─ owns any restaurants? YES → /admin
  └─ NO → /admin/restaurants  (then "+ Add Restaurant" → /setup)
```

Restaurant creation only happens **after** authentication. `owner_id` is assigned explicitly at insert time in `/setup`. There is no path to create a restaurant before a user session exists.

### 2.2 Ownership model

Every restaurant record has an `owner_id` column typed `uuid NOT NULL` that references `auth.users(id)`. This is the single source of truth for all multi-tenant access control.

```sql
restaurants.owner_id = auth.uid()
```

All RLS policies, API route guards, and UI data loads derive from this single join. There are no secondary ownership mechanisms.

### 2.3 Removed: legacy signup flow

`app/signup/page.tsx` was deleted in the 2026-06-22 architecture cleanup. This page created restaurant records without an authenticated session and without setting `owner_id`. It was a pre-MVP legacy path that was incompatible with multi-tenant ownership.

### 2.4 Removed: email-claim architecture

`goAfterAuth()` previously ran the following query after every login:

```sql
UPDATE restaurants
SET owner_id = auth.uid()
WHERE owner_id IS NULL
  AND contact_email = user.email
```

This query was deleted. Ownership is never inferred from email. A restaurant can only be owned by the user who created it, via explicit `owner_id` assignment at insert time in `/setup`.

### 2.5 Duplicate restaurant prevention

`app/setup/page.tsx` enforces uniqueness at the application layer before every insert:

1. Query all non-deleted restaurants owned by the authenticated user
2. Normalize both the incoming name and existing names (`toLowerCase().trim()`)
3. If a match is found: return an error — `"A restaurant with this name already exists. Use a distinct name for each location."`
4. Only if no match: proceed to insert

The submit button is disabled immediately when the user clicks (`setSaving(true)` fires synchronously before the first `await`), blocking double-submit. An explicit `if (saving) return` guard at the top of `saveRestaurant()` closes the race window.

Multi-location is intentionally supported: the same owner can create `Punjabi By Nature Oakville` and `Punjabi By Nature Toronto` because normalized names differ. Creating two records with identical names is blocked.

### 2.6 Roles

| Role | How set | Capabilities |
|---|---|---|
| `restaurant_owner` | Default on `profiles` table at signup | Owns restaurants, manages menus and promotions |
| `super_admin` | Manual update to `profiles.role` | Full platform access, Intelligence Lab, game registry, prompt management |

`is_super_admin()` is a Supabase SQL function that checks `profiles.role = 'super_admin'` for `auth.uid()`. It is referenced in RLS policies for all platform-level tables.

---

## 3. Multi-Tenant Restaurant Architecture

### 3.1 Core principle

**Every capability, setting, and configuration is per restaurant, never per account.**

An owner account is a container. The restaurant is the unit of configuration. This applies without exception to:

- Feature flags (`restaurant_capabilities`)
- UI/UX settings (`restaurant_settings`)
- Ordering toggle
- AI generation quota
- Intelligence profile
- Menu content
- Promotions
- QR codes
- Orders

### 3.2 Restaurants table (key columns)

```sql
restaurants (
  id               uuid        PK
  owner_id         uuid        NOT NULL → auth.users(id)
  name             text        NOT NULL
  slug             text        UNIQUE NOT NULL
  experience_mode  text        -- 'promotion_only' | 'menu_only' | 'menu_and_promotion'
  brand_color      text
  secondary_color  text
  accent_color     text
  description      text
  hero_image_url   text
  logo_url         text
  hours            jsonb       -- { "monday": { "open": "11:00", "close": "22:00", "closed": false }, ... }
  phone            text
  address_line1    text
  city             text
  province_state   text
  postal_code      text
  country          text
  website_url      text
  instagram_url    text
  facebook_url     text
  google_maps_url  text
  deleted_at       timestamptz
  created_at       timestamptz
  updated_at       timestamptz
)
```

Soft delete via `deleted_at`. All queries filter `WHERE deleted_at IS NULL`.

Slug generation: `slugify(name) + '-' + last5digitsOfTimestamp`. The timestamp suffix guarantees uniqueness even when names collide across accounts.

### 3.3 Experience modes

| Mode | Public menu behavior |
|---|---|
| `promotion_only` | Shows the spin wheel / game only — no menu browsing |
| `menu_only` | Shows the menu, no game or promotion |
| `menu_and_promotion` | Full menu + floating promotion widget |

Set per restaurant in the Profile tab. Determines which components render at `/r/[restaurantSlug]`.

### 3.4 restaurant_settings (key-value store)

Per-restaurant UI/UX feature flags. Stored as JSONB key-value pairs.

```sql
restaurant_settings (
  restaurant_id  uuid  NOT NULL → restaurants(id)
  key            text  NOT NULL
  value          jsonb NOT NULL
  UNIQUE (restaurant_id, key)
)
```

Current standard keys:

| Key | Type | Default | Effect |
|---|---|---|---|
| `show_featured_items_on_landing` | boolean | true | Featured items strip on public menu |
| `show_prices_on_landing` | boolean | true | Prices on featured item cards |
| `enable_floating_reward_widget` | boolean | false | Floating reward button on menu page |
| `widget_position` | string | `"bottom_right"` | Corner for floating widget |

RLS: authenticated owners read/write only their own restaurants' settings.

### 3.5 restaurant_capabilities

Capability flags for hard on/off features. Different from `restaurant_settings` in intent: settings control presentation; capabilities control whether a feature operates at all.

```sql
restaurant_capabilities (
  restaurant_id    uuid  NOT NULL → restaurants(id)
  capability_name  text  NOT NULL
  enabled          boolean NOT NULL DEFAULT false
  UNIQUE (restaurant_id, capability_name)
)
```

Current capabilities:

| Capability | Default | Controls |
|---|---|---|
| `ordering` | `false` | Whether customers can add to cart and submit orders |

Toggle location: `/admin/restaurants` → restaurant card → Settings tab → ORDERING section. Saves immediately on click (writes to `restaurant_capabilities`, not `restaurant_settings` — no Save button required).

RLS: owners can SELECT and UPDATE their own restaurant's capabilities. No public insert. All writes from admin UI; no customer-facing write path.

### 3.6 Admin UI structure

Each restaurant renders as a card at `/admin/restaurants` with four tabs:

| Tab | Component | Purpose |
|---|---|---|
| Profile | `RestaurantProfileTab` | Experience mode, colors, description, hero image |
| Contact | `RestaurantContactTab` | Phone, address, hours, social links |
| Settings | `RestaurantSettingsTab` | UI flags, ordering toggle, danger zone |
| QR | `RestaurantQrTab` | QR code generation and print |

The parent page (`app/admin/restaurants/page.tsx`) loads all restaurants for the owner, maintains per-restaurant form state, and passes `restaurantId` explicitly to every tab component. No tab ever derives restaurant context from a global account state or uses `.limit(1)`.

---

## 4. Menu Architecture

### 4.1 Hierarchy

```
Restaurant
  └── Menu (one active per restaurant)
        └── MenuSection (categories, display-ordered)
              └── MenuItem (individual dishes)
```

### 4.2 menus table

One canonical menu per restaurant. The `active` flag marks the live menu. Only one active menu per restaurant is enforced at the application layer.

### 4.3 menu_sections table

```sql
menu_sections (
  id             uuid  PK
  menu_id        uuid  → menus(id) CASCADE
  restaurant_id  uuid  → restaurants(id) CASCADE
  name           text  NOT NULL
  description    text
  display_order  integer DEFAULT 0
  active         boolean DEFAULT true
  deleted_at     timestamptz
)
```

Soft delete. Deleting a section orphans its items (`section_id → NULL`) rather than cascade-deleting them, preserving analytics history.

### 4.4 menu_items table (key columns)

```sql
menu_items (
  id               uuid         PK
  restaurant_id    uuid         → restaurants(id) CASCADE
  menu_id          uuid         → menus(id)
  section_id       uuid         → menu_sections(id) SET NULL
  name             text         NOT NULL
  category         text         -- legacy free-text fallback
  description      text
  price            numeric(10,2)
  image_url        text
  display_order    integer      DEFAULT 0
  is_featured      boolean      DEFAULT false
  tags             text[]       DEFAULT '{}'
  available        boolean      DEFAULT true  -- sold out today
  active           boolean      DEFAULT true  -- archived
  ai_metadata      jsonb        DEFAULT '{}'

  -- Special Offer Engine columns
  special_enabled   boolean     DEFAULT false
  special_type      text        -- 'percentage' | 'fixed_price'
  special_percent   numeric(5,2)   -- 1–99
  special_price     numeric(10,2)  -- must be > 0
  special_start_at  timestamptz
  special_end_at    timestamptz
  special_no_expiry boolean     DEFAULT false

  deleted_at       timestamptz
  updated_at       timestamptz
)
```

### 4.5 Special Offer Engine

Time-based pricing is stored directly on `menu_items` — no separate table.

- `special_enabled = true` activates the pricing override
- `special_type = 'percentage'` applies `price * (1 - special_percent/100)`
- `special_type = 'fixed_price'` overrides with `special_price`
- DB constraints enforce `special_percent IN [1,99]` and `special_price > 0`
- `special_no_expiry = true` means the offer never expires regardless of timestamps
- Effective price is calculated server-side at request time via `calculateSpecialPrice()` in `lib/menu/special-offer.ts`
- Order items snapshot `effective_price_snapshot` and `special_active_snapshot` at order time — pricing is frozen to the moment of order, not re-derived

### 4.6 ai_metadata JSONB contract

```json
{
  "description_source":       "manual | ai",
  "description_model":        null,
  "description_generated_at": null,
  "description_reviewed":     false,
  "image_source":             "manual | ai",
  "image_model":              null,
  "image_generated_at":       null,
  "original_image_url":       null,
  "import_source":            "manual",
  "import_job_id":            null
}
```

All AI features write into this envelope. No new columns needed when new AI capabilities are added.

### 4.7 Public menu rendering

Route: `/r/[restaurantSlug]`
Component: `components/public/RestaurantPublicPage.tsx`

Rendering logic:
1. Load restaurant by slug
2. Check `experience_mode` — determine which surfaces to render
3. Load menu sections and items (filtered: `active = true`, `deleted_at IS NULL`)
4. Compute effective prices server-side for all items with active specials
5. Render featured items strip if `show_featured_items_on_landing = true`
6. Render add-to-cart controls only if `ordering` capability is `enabled = true`
7. Render floating reward widget if `enable_floating_reward_widget = true` and mode includes promotion

---

## 5. Promotion Engine

### 5.1 Promotions table

```sql
promotions (
  id              uuid    PK
  restaurant_id   uuid    → restaurants(id)
  name            text
  slug            text    UNIQUE
  status          text    -- 'draft' | 'active' | 'ended'
  placement_mode  text    DEFAULT 'restaurant'  -- future: 'menu' | 'section' | 'item'
  coupon_expiry_minutes  integer
)
```

One active promotion per restaurant at a time. Enforced by trigger: launching a promotion auto-ends any other active promotion for that restaurant and sets `restaurants.current_promotion_id`.

### 5.2 Game engine

Games are registered in the `games` table (super-admin managed). Each game type is a named capability:

| Game | Slug | Status |
|---|---|---|
| Spin Wheel | `spin-wheel` | Active |
| Scratch & Win | `scratch-win` | Coming soon |
| Mystery Box | `mystery-box` | Coming soon |

### 5.3 Promotion game assignments

```sql
promotion_game_assignments (
  promotion_id  uuid  → promotions(id) CASCADE
  game_type     text  NOT NULL
  weight        integer DEFAULT 1
  enabled       boolean DEFAULT true
  UNIQUE (promotion_id, game_type)
)
```

A promotion can assign multiple game types. At play time, `resolvePromotionGame()` selects a game via weighted random selection over enabled assignments.

### 5.4 Reward engine

```sql
rewards (
  id            uuid     PK
  restaurant_id uuid     → restaurants(id)
  menu_item_id  uuid     → menu_items(id) SET NULL
  label         text     NOT NULL
  description   text     NOT NULL
  terms         text
  reward_type   text     DEFAULT 'CHEF_SPECIAL'
  weight        integer  DEFAULT 10
  minimum_spend numeric
  daily_limit   integer
  active        boolean  DEFAULT true
)
```

Reward selection is weighted. Rewards with `weight = 0` never appear. `daily_limit` caps redemptions per day.

### 5.5 Play sessions and coupons

```sql
play_sessions (
  id                      uuid    PK
  restaurant_id           uuid    → restaurants(id)
  promotion_id            uuid    → promotions(id)
  session_token           text    UNIQUE
  customer_profile_id     uuid    → customer_profiles(id) SET NULL
  terms_accepted_timestamp timestamptz
)

coupons (
  id           uuid     PK
  restaurant_id uuid    → restaurants(id)
  reward_id    uuid     → rewards(id)
  code         text     UNIQUE NOT NULL
  status       text     DEFAULT 'issued'  -- 'issued' | 'redeemed' | 'expired'
  issued_at    timestamptz
  expires_at   timestamptz NOT NULL
  redeemed_at  timestamptz
)
```

Each play session generates one coupon. Session token is a client-held UUID used as an access key — customers are not authenticated.

### 5.6 Customer identity

```sql
customer_profiles (
  id                          uuid  PK
  phone_country_code          text
  phone_number_raw            text
  phone_number_e164           text  UNIQUE
  marketing_consent           boolean DEFAULT false
  marketing_consent_timestamp timestamptz
  terms_accepted_timestamp    timestamptz NOT NULL
)
```

Phone number capture is optional and separate from marketing consent. Identity is captured at the start of a promotion play session and linked via `play_sessions.customer_profile_id`. All writes go through service role key — customers are never authenticated.

---

## 6. Ordering Engine v1

### 6.1 Architecture summary

Commission-free QR ordering. Customers add items to a cart on the public menu page and submit orders directly to the restaurant. No payment processing in v1 — cash or in-restaurant payment on pickup.

### 6.2 Capability gate

Ordering is gated per restaurant via `restaurant_capabilities`:

```sql
restaurant_capabilities
  WHERE restaurant_id = <id>
    AND capability_name = 'ordering'
    AND enabled = true
```

The public menu reads this flag before rendering add-to-cart controls. If `enabled = false`, the menu renders in browse-only mode — no cart, no order button.

The toggle is in: `/admin/restaurants` → restaurant card → Settings tab → **ORDERING** section.

**Never global. Always per restaurant.**

### 6.3 orders table

```sql
orders (
  id                    uuid    PK
  restaurant_id         uuid    → restaurants(id) CASCADE
  order_number          integer NOT NULL
  status                text    DEFAULT 'pending'
                                -- 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  order_origin          text    DEFAULT 'direct_link'
                                -- 'restaurant_qr' | 'direct_link'
  table_identifier      text
  customer_name         text
  kitchen_notes         text
  subtotal              numeric(10,2) NOT NULL
  idempotency_key       text    NOT NULL UNIQUE
  session_id            text
  coupon_id             uuid
  promotion_session_id  uuid
  preparing_at          timestamptz
  ready_at              timestamptz
  completed_at          timestamptz
  cancelled_at          timestamptz
  created_at            timestamptz
  updated_at            timestamptz
)
```

### 6.4 order_items table

```sql
order_items (
  id                       uuid        PK
  order_id                 uuid        → orders(id) CASCADE
  restaurant_id            uuid        → restaurants(id)
  menu_item_id             uuid        → menu_items(id) SET NULL
  name_snapshot            text        NOT NULL
  price_snapshot           numeric(10,2) NOT NULL
  effective_price_snapshot numeric(10,2) NOT NULL
  special_active_snapshot  boolean     NOT NULL
  quantity                 integer     DEFAULT 1
  line_total               numeric(10,2) NOT NULL
  special_instructions     text
)
```

Price and special offer state are **snapshotted at order time**. If the restaurant later changes a price or deactivates a special, historical orders remain accurate.

### 6.5 Atomic order number generation

Order numbers are per-restaurant sequential integers (1, 2, 3…) displayed to kitchen staff. A race condition exists when two orders arrive simultaneously for the same restaurant — `SELECT MAX(order_number) + 1` is not atomic.

Solution: `restaurant_order_counters` + `next_order_number()` function.

```sql
restaurant_order_counters (
  restaurant_id      uuid  PK → restaurants(id) CASCADE
  last_order_number  integer NOT NULL DEFAULT 0
)
```

```sql
CREATE FUNCTION public.next_order_number(p_restaurant_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.restaurant_order_counters (restaurant_id, last_order_number)
  VALUES (p_restaurant_id, 1)
  ON CONFLICT (restaurant_id) DO UPDATE
    SET last_order_number = restaurant_order_counters.last_order_number + 1
  RETURNING last_order_number INTO result;
  RETURN result;
END;
$$;
```

`UPSERT + increment` is a single atomic statement. No SELECT MAX. No race condition. `SECURITY DEFINER` runs as the postgres role, bypassing RLS on the counter table.

### 6.6 Public orders API (`/api/public/orders`)

All customer-facing order writes go through this API route using the service role key. Customers are never given a Supabase client that bypasses RLS.

**Protections applied:**

| Protection | Implementation |
|---|---|
| Body size limit | `MAX_BODY_BYTES = 8 KB` — rejects oversized payloads |
| Item count limit | `MAX_ITEMS = 20` per order |
| Quantity limit | `MAX_QUANTITY = 99` per item |
| Per-IP rate limit | 20 requests per 15 minutes (in-memory, per Lambda instance) |
| Per-restaurant rate limit | 200 orders per hour (DB-backed, globally accurate) |
| Idempotency | `idempotency_key` is a client-generated UUID, stored with `UNIQUE` constraint — duplicate submissions return the original order |
| Capability check | `restaurant_capabilities.ordering = true` verified at API time, not just at UI render |
| Price re-validation | Server re-reads and re-computes prices — client-submitted prices are ignored |
| Special offer re-validation | `isSpecialOfferActive()` + `calculateSpecialPrice()` run server-side at request time |

### 6.7 Cart persistence

Cart state is held client-side (React state / `localStorage`). No server-side cart table. Cart is ephemeral — it does not survive browser close without explicit persistence. v1 design decision: no cart recovery needed for a fast QR ordering flow.

### 6.8 Order tracker

Route: `/r/order/[orderId]`

Customer-facing live order status page. Uses Supabase Realtime subscription on `orders` row for the given order UUID. Order UUID is the access token — unguessable, shared via post-order redirect URL.

RLS policy: anonymous SELECT is permitted on `orders` and `order_items` (the UUID is effectively a capability token). This policy will be scoped to a signed token check when customer identity ships.

### 6.9 Admin orders inbox

Route: `/admin/orders`

Real-time order management dashboard for restaurant staff. Uses Supabase Realtime to stream new and updated orders. Status transitions: `pending → preparing → ready → completed` or `cancelled`. Authenticated route — owner's RLS policy enforces that only their restaurant's orders are visible.

---

## 7. Intelligence Layer

### 7.1 Design principles

1. All prompts live in the database, never in source code
2. Provider and model are data, not code — swappable without deployment
3. Every generation attempt is logged (append-only)
4. Cost is tracked per request and stored at write time — survives pricing changes
5. Features are togglable without code changes via `intelligence_features.enabled`
6. A/B experiments compare prompt variants; winner promotion requires no code change
7. The cheapest capable model is always preferred (Haiku-first, Sonnet for complex tasks)

### 7.2 Database schema

#### intelligence_features

Feature registry. Each row is a named AI capability.

```sql
intelligence_features (
  feature_key  text  UNIQUE NOT NULL
  name         text  NOT NULL
  description  text
  enabled      boolean DEFAULT false
)
```

Current features:

| feature_key | Status | Purpose |
|---|---|---|
| `menu_description_generation` | enabled | Claude Haiku generates menu item descriptions |
| `food_image_prompt_enhancement` | enabled | Claude Haiku enhances dish names into visual descriptions |
| `restaurant_food_image_generation` | disabled | Google Imagen 3 generates food photography |
| `promotion_generation` | disabled | Future: generate promotion copy |
| `campaign_generation` | disabled | Future: generate marketing campaigns |
| `pricing_recommendation` | disabled | Future: suggest pricing |
| `customer_segmentation` | disabled | Future: segment customers |
| `sales_optimization` | disabled | Future: optimize revenue |
| `menu_photo_import` | disabled | Future: extract menu from photo |

#### intelligence_prompt_templates

All prompt text is stored here. Source code contains zero prompt strings.

```sql
intelligence_prompt_templates (
  feature_key           text     → intelligence_features(feature_key)
  name                  text
  provider              text     -- 'anthropic' | 'openai' | 'gemini' | 'google' | 'replicate'
  model                 text
  system_prompt         text
  user_prompt_template  text
  temperature           numeric(3,2)
  max_tokens            integer
  active                boolean  DEFAULT false
  version               integer  DEFAULT 1
)
-- Constraint: only one active template per feature at a time
UNIQUE INDEX ON (feature_key) WHERE active = true
```

#### intelligence_provider_costs

Pricing is data. Update this table when providers change rates — no code deploy.

```sql
intelligence_provider_costs (
  provider              text
  model                 text
  input_cost_per_1m     numeric(12,6)   -- USD per 1M input tokens
  output_cost_per_1m    numeric(12,6)   -- USD per 1M output tokens
  cost_per_generation   numeric(12,6)   -- USD per image (image models only)
  UNIQUE (provider, model)
)
```

Current seeded pricing (USD):

| Provider | Model | Input/1M | Output/1M | Per image |
|---|---|---|---|---|
| Anthropic | claude-haiku-4-5-20251001 | $0.80 | $4.00 | — |
| Anthropic | claude-sonnet-4-6 | $3.00 | $15.00 | — |
| Anthropic | claude-opus-4-8 | $15.00 | $75.00 | — |
| Google | imagen-3 | — | — | $0.020 |
| Replicate | flux-pro-1.1 | — | — | $0.055 |
| OpenAI | dall-e-3-standard | — | — | $0.040 |
| OpenAI | dall-e-3-hd | — | — | $0.080 |

#### intelligence_usage_limits

Per-restaurant quotas. Auto-provisioned on first request.

```sql
intelligence_usage_limits (
  restaurant_id         uuid  UNIQUE → restaurants(id)
  monthly_limit         integer DEFAULT 100     -- text generations/month
  requests_per_minute   integer DEFAULT 5
  current_month_usage   integer DEFAULT 0
  usage_reset_at        timestamptz
  image_monthly_limit       integer DEFAULT 20  -- image generation credits/month
  image_current_month_usage integer DEFAULT 0
)
```

#### restaurant_intelligence_profile

Persistent brand context auto-injected into every prompt for a restaurant. Filled once, benefits all features.

```sql
restaurant_intelligence_profile (
  restaurant_id        uuid  UNIQUE → restaurants(id)
  cuisine_type         text
  brand_tone           text  -- 'casual' | 'elevated' | 'playful' | 'formal' | 'rustic' | 'modern' | 'family'
  restaurant_style     text
  customer_demographic text
  price_range          text  -- '$' | '$$' | '$$$' | '$$$$'
  target_customer      text
  service_style        text  -- 'counter_service' | 'table_service' | 'fast_casual' | 'fine_dining' | 'takeout_only' | 'delivery_only'
)
```

#### intelligence_experiments

A/B framework for prompt templates.

```sql
intelligence_experiments (
  feature_key       text    → intelligence_features(feature_key)
  name              text
  template_a_id     uuid    → intelligence_prompt_templates(id)
  template_b_id     uuid    → intelligence_prompt_templates(id)
  traffic_split_pct integer DEFAULT 50  -- % of requests routed to variant B
  winner            text    -- 'a' | 'b' (set to conclude experiment)
  active            boolean DEFAULT false
  UNIQUE INDEX ON (feature_key) WHERE active = true
)
```

#### intelligence_generation_logs

Append-only audit log. Every generation attempt — success or failure — writes one row.

```sql
intelligence_generation_logs (
  restaurant_id        uuid
  user_id              uuid
  feature_key          text
  prompt_template_id   uuid
  experiment_id        uuid
  experiment_variant   text    -- 'a' | 'b'
  provider             text
  model                text
  input_tokens         integer
  output_tokens        integer
  estimated_cost_usd   numeric(10,6)
  latency_ms           integer
  success              boolean NOT NULL
  error_message        text
  created_at           timestamptz
)
```

Cost is stored at write time from `intelligence_provider_costs` — historical records remain accurate when provider pricing changes.

### 7.3 Text generation: menu description generation

**Feature key:** `menu_description_generation`
**Provider:** Anthropic
**Model:** claude-haiku-4-5-20251001
**Route:** `POST /api/admin/intelligence/generate`

Flow:
1. Load feature from `intelligence_features` — reject if `enabled = false`
2. Check monthly quota from `intelligence_usage_limits`
3. Load active prompt template for `menu_description_generation`
4. Load `restaurant_intelligence_profile` for brand context
5. Interpolate template variables: `item_name`, `restaurant_name`, `cuisine_type`, `brand_tone`, `category_name`, `tags`
6. Call Anthropic API via `anthropic.messages.create()`
7. Write to `intelligence_generation_logs` (success or failure)
8. Increment `intelligence_usage_limits.current_month_usage`
9. Return generated text

### 7.4 AI image generation: food photography

**Feature key:** `restaurant_food_image_generation`
**Provider:** Google Vertex AI (Imagen 3)
**Prompt enhancer:** Claude Haiku (feature key: `food_image_prompt_enhancement`)
**Route:** `POST /api/admin/generate-food-image`

Two-stage pipeline:
```
Stage 1 — Prompt Enhancement (Claude Haiku)
  Input: item_name, item_description, restaurant context
  Output: enhanced_description (visual noun phrase list)

Stage 2 — Image Generation (Google Imagen 3, Gemini Pro fallback)
  Input: item_name + enhanced_description + restaurant context
  Output: 4 image variants (base64 PNG)
  Stored: Supabase Storage → ai-generated-images bucket
  Tracked: ai_generated_assets table (one row per variant)
```

Parallel fan-out: 4 image variants are requested simultaneously. Provider failure falls back to Gemini Pro.

**Per-request cost:** ~$0.081 (4 × $0.020 Imagen 3 + ~$0.001 Haiku enhancement)

### 7.5 Provider abstraction

Image providers are abstracted behind a common interface. The active provider is determined by environment variables and feature flags. Adding a new provider (e.g. Replicate Flux) requires:
1. Seeding a row in `intelligence_provider_costs`
2. Adding provider credentials to Vercel env vars
3. Implementing the provider interface in the route handler
4. No schema changes

### 7.6 Prompts-in-DB invariant

No prompt text lives in source code. The Intelligence Lab (`/super-admin/intelligence-lab`) is the UI for managing prompt templates. Super admins can:
- Activate a new template version (deactivates the current active one)
- Create A/B experiments
- Monitor generation logs and costs

---

## 8. Security Architecture

### 8.1 Row-Level Security model

All application tables have RLS enabled. The ownership model is always derived from:

```sql
restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
```

This single pattern appears consistently across all RLS policies. There are no exceptions or secondary ownership paths.

### 8.2 Service role usage

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses RLS. It is used only in:

- Server-side Next.js API routes (`/api/public/*`, `/api/admin/*`)
- Never exposed to the client
- Never available in browser code

The anon key (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is used in client components and is subject to all RLS policies.

### 8.3 Storage bucket policies

Four storage buckets, all with owner-scoped policies:

| Bucket | Path convention | Policy |
|---|---|---|
| `restaurant-logos` | `{uid}/{restaurantId}/{filename}` | Owner INSERT/SELECT; public SELECT |
| `restaurant-heroes` | `{uid}/{restaurantId}/{filename}` | Owner INSERT; public SELECT |
| `menu-item-images` | `{uid}/{restaurantId}/{filename}` | Owner INSERT; public SELECT |
| `ai-generated-images` | `{restaurantId}/{jobId}/{variant}` | Service role INSERT; owner SELECT |

Storage upload policies validate **both** the user ID path segment and the restaurant ID path segment — the restaurant must be owned by the caller. This closes the path-traversal vulnerability (H-6) identified in the June 2026 security audit.

### 8.4 Public API protection

`/api/public/orders` — the highest-risk public endpoint (no authentication required):

| Layer | Protection |
|---|---|
| Body size | Max 8 KB |
| Item count | Max 20 items |
| Quantity | Max 99 per item |
| IP rate limit | 20 requests / 15 min (in-memory) |
| Restaurant rate limit | 200 orders / 1 hour (DB-backed) |
| Idempotency | `UNIQUE` constraint on `idempotency_key` |
| Capability check | API re-validates `ordering` capability — not trusted from client |
| Price validation | Server re-derives all prices — client prices ignored |

### 8.5 Duplicate prevention

Application-layer duplicate prevention in `/setup` (restaurant creation):

1. Query all non-deleted restaurants owned by the authenticated user
2. Normalize names: `toLowerCase().trim()`
3. Block if a match exists
4. Lock out concurrent submissions via `saving` state set before first `await`

No DB-level unique constraint on `(owner_id, name)` — multi-location with distinct names is intentionally permitted.

### 8.6 No open RLS on platform tables

The following tables have **no public or anon INSERT/UPDATE policies**:

- `restaurants` (owner-only write)
- `restaurant_capabilities` (owner-only write)
- `restaurant_settings` (owner-only write)
- `intelligence_features` (super-admin only)
- `intelligence_prompt_templates` (super-admin only)
- `promotion_game_assignments` (owner-only write)
- `image_generation_jobs` (service role only)
- `ai_generated_assets` (service role only)
- `intelligence_generation_logs` (service role only)
- `orders` (service role only — no public INSERT)
- `order_items` (service role only — no public INSERT)

The legacy `schema.sql` included open public INSERT on `restaurants`, `menu_items`, `rewards`, and `coupons`. These policies were removed in the Phase A/B/C security hardening migrations (June 2026).

### 8.7 Input validation

All inputs validated at API route entry:
- String fields trimmed
- Numeric fields parsed and range-checked
- Enum values validated against allowlists
- Object payload size limited before deserialization
- SQL injection not possible via parameterized Supabase client

---

## 9. Future Architecture Roadmap

### 9.1 Customer Identity v2

- Returning customer recognition via phone number lookup
- Loyalty point accumulation
- Customer profile enrichment from order history
- Signed token-based order access (replacing UUID-as-capability-token)

### 9.2 Communication Engine

- SMS campaigns via Twilio
- Apple/Google Wallet passes
- Push notifications (web push)
- Automated post-visit follow-up sequences

### 9.3 POS Integration

- Webhook-based order attribution to POS transactions
- Table management (optional mode — not mandatory)
- Kitchen display system integration
- Order status sync from POS to SpinBite order tracker

### 9.4 Paper Menu AI Import

- Photograph a physical menu
- Claude Vision extracts menu structure (sections, items, prices, descriptions)
- Draft items imported to menu builder for review
- Feature key: `menu_photo_import` (registered, disabled)

### 9.5 AI Image Enhancement

- Automatic background removal for uploaded item photos
- Style transfer to match restaurant brand tone
- Batch re-generation triggered by brand profile changes

### 9.6 Behavioral Analytics Engine (Phase 1 — Live 2026-06-26)

**Implemented.** `session_events` is the relational behavioral intelligence log. Every customer interaction generates a typed, FK-linked, queryable row. This is the foundation for all AI-driven restaurant intelligence.

#### session_events table

```sql
session_events (
  id              uuid          PK
  session_id      uuid          NOT NULL → visit_sessions(id) CASCADE
  restaurant_id   uuid          NOT NULL → restaurants(id) CASCADE  -- denormalized for O(1) RLS
  guest_id        uuid          -- ephemeral client-generated UUID per browser tab; null = server event
  event_type      text          NOT NULL  -- CHECK constraint enforces enum
  menu_item_id    uuid          → menu_items(id) SET NULL
  promotion_id    uuid          → promotions(id) SET NULL
  metadata        jsonb         NOT NULL DEFAULT '{}'
  created_at      timestamptz   NOT NULL DEFAULT now()
)
```

#### Event type registry

| Event | Fired by | Key metadata |
|---|---|---|
| `MENU_OPENED` | Client (session confirm) | `touchpoint_code` |
| `CATEGORY_OPENED` | Client | `category_id`, `category_name` |
| `ITEM_VIEWED` | Client (item modal open) | `item_name` |
| `ITEM_VIEW_DURATION` | Client (item modal close) | `item_name`, `duration_ms` |
| `ITEM_ADDED_TO_CART` | Client | `item_name`, `quantity`, `price` |
| `ITEM_REMOVED_FROM_CART` | Client | `item_name`, `reason?` |
| `ORDER_PLACED` | Server (POST /api/public/orders) | `order_id`, `order_number`, `item_count`, `subtotal` |
| `PROMOTION_VIEWED` | Client | `promotion_name` |
| `PROMOTION_PLAYED` | Server (promotion play route) | `promotion_name`, `result`, `reward_type?` |
| `SESSION_ENDED` | Server (PATCH /api/admin/sessions/:id/end) | `reason`, `duration_seconds` |

#### guest_id

A client-generated `crypto.randomUUID()` stored in `sessionStorage` scoped per session (`spinbite_guest_{sessionId}`). Identifies a browser tab within a multi-device dining session — not customer identity. Reused across page refreshes (same tab), fresh on new tab. Null for all server-side events.

#### Key analytics queries this enables

```sql
-- Items viewed but never ordered in same session
SELECT se.menu_item_id, mi.name, COUNT(*) AS view_count
FROM session_events se
JOIN menu_items mi ON mi.id = se.menu_item_id
WHERE se.restaurant_id = :rid AND se.event_type = 'ITEM_VIEWED'
  AND NOT EXISTS (
    SELECT 1 FROM session_events oe
    WHERE oe.session_id = se.session_id
      AND oe.event_type = 'ORDER_PLACED'
  )
GROUP BY se.menu_item_id, mi.name ORDER BY view_count DESC;

-- Average time-on-item per menu item
SELECT menu_item_id, AVG((metadata->>'duration_ms')::int) AS avg_ms
FROM session_events
WHERE restaurant_id = :rid AND event_type = 'ITEM_VIEW_DURATION'
GROUP BY menu_item_id ORDER BY avg_ms DESC;

-- Session funnel: viewed → added → ordered
SELECT
  COUNT(*) FILTER (WHERE event_type = 'ITEM_VIEWED')          AS views,
  COUNT(*) FILTER (WHERE event_type = 'ITEM_ADDED_TO_CART')   AS adds,
  COUNT(*) FILTER (WHERE event_type = 'ORDER_PLACED')         AS orders
FROM session_events WHERE restaurant_id = :rid;
```

#### Relationship to session_interaction_log

The `session_interaction_log` JSONB column on `visit_sessions` is V1 (bounded to 200 entries, not queryable). All new instrumentation writes to `session_events`. The JSONB log is retained for backward compatibility but is deprecated for new features.

#### Future: Phase 2 roadmap
- Session replay and funnel visualization in admin dashboard
- Promotion performance attribution report
- A/B test analysis for game types and reward pools
- AI query interface: natural language → SQL over session_events

### 9.7 AI Restaurant Command Center

- Natural language operations: "run a happy hour 20% off wings every Friday 4–7pm"
- Autonomous schedule management for specials and promotions
- Revenue goal setting with AI-proposed action plans
- Feature key: `sales_optimization` (registered, disabled)

### 9.8 Autonomous Customer Agents

- AI agents that monitor restaurant performance and make recommendations
- Proactive promotion creation in response to slow periods
- Customer reactivation campaigns triggered by churn signals
- Guardrails: all autonomous actions subject to operator approval thresholds

---

## Appendix: Key invariants

These rules must never be violated. They apply to all future engineering work.

1. **Capabilities are always per restaurant.** Never account-level. Never global.
2. **Ownership is always explicit at insert time.** `owner_id` must be set from `auth.uid()` in the authenticated session.
3. **Prompts live in the database.** No prompt text in source code.
4. **Prices are server-derived.** Client-submitted prices are never trusted.
5. **Order numbers are atomic.** Use `next_order_number()` RPC. Never `SELECT MAX + 1`.
6. **Service role key stays server-side.** Never in client components, never in `NEXT_PUBLIC_*` vars.
7. **No open RLS on platform tables.** Every write must be owner-scoped or service-role.
8. **All AI features are feature-flagged.** `intelligence_features.enabled` is the gate — no hardcoded feature detection.
9. **Cost is recorded at write time.** `estimated_cost_usd` in generation logs uses the price active at generation, not at read time.
10. **Cheapest capable model first.** Use Haiku for short text. Escalate to Sonnet only when complexity requires it. Never use Opus for routine generation.
11. **Architecture audit is mandatory before any implementation.** No AI session, Claude session, engineer, or developer may implement architecture changes, new features, schema modifications, API routes, or security decisions without first reading this document in full. All decisions must remain consistent with the multi-tenant ownership model, security boundaries, provider abstraction rules, capability model, and all invariants listed here. This document is the single source of truth. Violations of any documented invariant require an explicit architecture decision and a version update to this document before work proceeds.
