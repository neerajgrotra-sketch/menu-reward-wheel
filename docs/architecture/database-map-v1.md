# SpinBite Database Map v1

> **SUPERSEDED.** See [`/architecture/database_schema_map_v1.md`](/architecture/database_schema_map_v1.md) (root) for the current full schema reference, cross-linked from [`docs/architecture/README.md`](./README.md). Kept for historical reference only.

_Supabase project: viaoholpnysccaijfpox (Restaurant-gamify)_  
_Types last regenerated: 2026-06-08_  
_Audit date: 2026-06-15_

---

## Core Tables

### `restaurants`

Central entity. One row per restaurant location.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | text UNIQUE | URL identifier, used in `/r/[restaurantSlug]` |
| `name` | text | |
| `owner_id` | uuid | FK → `auth.users` (not declared as FK in schema) |
| `current_promotion_id` | uuid | FK → `promotions` (soft pointer to live promotion) |
| `experience_mode` | text | Controls QR menu behavior mode |
| `brand_color` | text | Hex, drives public page theming |
| `accent_color` | text | Secondary brand color |
| `secondary_color` | text | Tertiary brand color |
| `hero_image_url` | text | Banner image |
| `logo_url` | text | Restaurant logo |
| `image_url` | text | Legacy image field |
| `hours` | jsonb | `{monday: {open, close, closed}, …}` structured object |
| `address_line1`, `city`, `province_state`, `postal_code`, `country` | text | Contact info |
| `phone`, `contact_email`, `website_url`, `instagram_url`, `facebook_url`, `google_maps_url` | text | Social/contact |
| `cuisine_type`, `description`, `owner_name`, `main_goal`, `average_ticket`, `pos_system` | text | Profile metadata |
| `location_count` | int | Currently unused in routing logic |
| `deleted_at` | timestamptz | Soft delete marker |

**Dangerous area:** `owner_id` is stored as `uuid` but there is no declared FK constraint to `auth.users`. Deleting a user from Supabase Auth will NOT cascade-delete their restaurants.

**RLS:** `owner_id = auth.uid()` for UPDATE. SELECT is public (needed for QR menu). INSERT requires authenticated user.

---

### `menus`

One restaurant can have multiple menus (breakfast, lunch, dinner, specials).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `restaurant_id` | uuid FK → `restaurants` | |
| `slug` | text | |
| `name` | text | |
| `menu_type` | text | Nullable; type classifier |
| `display_order` | int | Sort order |
| `active` | boolean | Only active menus are served publicly |

---

### `menu_sections`

Sections within a menu (e.g., Starters, Mains, Desserts).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `menu_id` | uuid FK → `menus` | |
| `restaurant_id` | uuid FK → `restaurants` | Denormalized for RLS convenience |
| `name` | text | |
| `display_order` | int | |
| `active` | boolean | |
| `deleted_at` | timestamptz | Soft delete |

---

### `menu_items`

Individual items on a menu.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `menu_id` | uuid FK → `menus` | |
| `section_id` | uuid FK → `menu_sections` | |
| `restaurant_id` | uuid FK → `restaurants` | Denormalized |
| `owner_id` | uuid | Nullable; legacy field |
| `name` | text | |
| `description` | text | |
| `price` | numeric | |
| `image_url` | text | |
| `available` | boolean | Public visibility flag |
| `is_featured` | boolean | Featured item tag |
| `tags` | text[] | Merchandising tags (Chef Special, Popular, etc.) |
| `display_order` | int | |
| `category` | text | Legacy category field (pre-sections) |
| `ai_metadata` | jsonb | Reserved for future AI enrichment |
| `active` | boolean | |
| `deleted_at` | timestamptz | Soft delete |

**Architecture rule:** No promotion columns on `menu_items`. Promotions are overlays via separate tables. Do not add `discount_price`, `is_promoted`, `promotion_id` here.

---

### `promotions`

A promotion campaign that wraps a game, reward pool, and schedule.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `restaurant_id` | uuid FK → `restaurants` | |
| `menu_id` | uuid FK → `menus` | Optional; links to a specific menu |
| `slug` | text | URL slug for `/play/` route |
| `name` | text | |
| `status` | text | `draft` \| `active` \| `ended` |
| `game_type` | text | Primary/fallback game type |
| `placement_mode` | text | How promotion surfaces in QR menu |
| `starts_at` | timestamptz | Optional scheduling |
| `ends_at` | timestamptz | Optional expiry |
| `max_spins` | int | Max plays per session |
| `coupon_expiry_minutes` | int | Default 20 |
| `stop_on_win` | boolean | Stop allowing play once a reward is won |
| `daily_redeem_limit` | int | Per-day coupon cap |
| `public_url` | text | Computed public play URL |
| `timezone` | text | Promotion timezone |

**DB enforcement:** Trigger `block_live_replacement_before_trigger` prevents replacing a live promotion without ending the current one. Trigger `sync_current_promotion_on_end` syncs `restaurants.current_promotion_id` when a promotion ends.

---

### `promotion_rewards`

The reward pool for a promotion (what customers can win).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → `promotions` | |
| `restaurant_id` | uuid FK → `restaurants` | Denormalized |
| `reward_type` | text | `free` \| `discount` \| custom |
| `reward_value` | numeric | Percentage for discount type |
| `menu_item_id` | uuid FK → `menu_items` | Optional; links reward to a specific item |
| `custom_name` | text | Override display name |
| `weight` | int | Probability weight for reward selection |
| `daily_limit` | int | Per-day cap for this reward |
| `display_order` | int | |

---

### `promotion_game_assignments`

Multi-game pool for a promotion. Each row adds one game type to the promotion's game pool.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → `promotions` CASCADE DELETE | |
| `game_type` | text | e.g., `mystery_box`, `scratch_card` |
| `weight` | int | Probability weight (default 1) |
| `enabled` | boolean | |

**Unique constraint:** `(promotion_id, game_type)` — no duplicate game types per promotion.

**How it works:** `resolvePromotionGame()` reads this table + the promotion's primary `game_type` to build a weighted pool. On first visit, it randomly selects a game and locks it to `play_sessions.selected_game_type`.

---

### `play_sessions`

One row per customer game session (device × promotion × time).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `promotion_id` | uuid FK → `promotions` | |
| `session_token` | text UNIQUE | UUID generated client-side on first visit |
| `selected_game_type` | text | Locked game type for this session |
| `customer_id` | uuid | Legacy field; nullable |
| `customer_profile_id` | uuid FK → `customer_profiles` | Set after phone capture |
| `ip_address` | text | |
| `user_agent` | text | |
| `terms_accepted_timestamp` | timestamptz | Set when identity screen is dismissed |
| `expires_at` | timestamptz | |

---

### `coupon_redemptions`

Every coupon ever issued. Source of truth for play count and reward history.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `coupon_code` | text | Human-readable code |
| `promotion_id` | uuid FK → `promotions` | |
| `promotion_reward_id` | uuid FK → `promotion_rewards` | |
| `restaurant_id` | uuid FK → `restaurants` | Denormalized |
| `play_session_id` | uuid FK → `play_sessions` | Links coupon to the session (nullable: pre-migration coupons) |
| `customer_session_id` | text | Legacy field |
| `status` | text | `issued` \| `redeemed` |
| `issued_at` | timestamptz | |
| `redeemed_at` | timestamptz | Set by staff validation |

---

### `customer_profiles`

Identity record created only when a customer provides their phone number at claim time.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `phone_number_e164` | text UNIQUE | Canonical E.164 format |
| `phone_number_raw` | text | As entered by customer |
| `phone_country_code` | text | Dialing prefix |
| `marketing_consent` | boolean | Opt-in status |
| `marketing_consent_timestamp` | timestamptz | When consent was given |
| `terms_accepted_timestamp` | timestamptz | |

**Design invariant:** Phone captured at claim, not at play. Anonymous play is the default. Identity is progressive enrichment.

---

### `profiles`

Restaurant owner / admin accounts.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK (= `auth.users.id`) | |
| `email` | text | |
| `role` | text | `admin` \| `super_admin` |

---

### `games`

Super-admin managed game registry. Defines available game types at the platform level.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | text UNIQUE | Matches game type string (`spin_wheel`, `mystery_box`, etc.) |
| `name` | text | |
| `status` | text | `active` \| `beta` \| `hidden` |
| `supports_weighting` | boolean | |
| `supports_coupon` | boolean | |
| `supports_try_again` | boolean | |
| `stop_on_win_default` | boolean | |
| `max_rewards`, `min_rewards`, `max_products`, `min_products` | int | Validation constraints |
| `default_spins` | int | |
| `default_coupon_expiry_minutes` | int | |
| `game_config` | jsonb | Platform-level config blob |
| `icon` | text | Emoji icon |

---

### `restaurant_settings`

Key-value store for per-restaurant configuration. Flexible escape hatch for settings not worth a dedicated column.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `restaurant_id` | uuid FK → `restaurants` | |
| `key` | text | Setting key |
| `value` | jsonb | Value blob |

---

### `campaigns`

Stub table. Reserved for future communication campaign routing. Currently has only `id`, `name`, `restaurant_id`, `active`.

---

### `rewards`

Legacy reward table. **Superseded by `promotion_rewards`.** Still present in schema but the active promotion system uses `promotion_rewards`. Check for any remaining references before removing.

---

### `site_content`

CMS copy for SpinBite marketing pages. Managed by super-admin.

| Column | Type | Notes |
|--------|------|-------|
| `page_key` | text | e.g., `home` |
| `section_key` | text | e.g., `hero` |
| `field_key` | text | e.g., `headline` |
| `value` | text | The content |
| `field_type` | text | `text` \| `html` |

---

### `site_media`

YouTube video embeds for marketing pages. Managed by super-admin.

---

### `faqs`

FAQ content for the public `/faq` page. Managed by super-admin.

---

### `guest_sessions`

Earlier session table. **May be superseded by `play_sessions`.** Has `played` boolean, `state` field. Investigate whether it is still written to by any code path before removing.

---

## DB Functions

| Function | Purpose |
|----------|---------|
| `delete_promotion_cascade(target_promotion_id)` | Safe cascade delete of a promotion and all dependents |
| `delete_restaurant_cascade(target_restaurant_id)` | Safe cascade delete of a restaurant and all dependents |
| `is_super_admin()` | Returns true if the calling user has `role = 'super_admin'` in `profiles` |

---

## RLS Summary

| Table | Public SELECT | Auth UPDATE | Auth INSERT |
|-------|--------------|-------------|-------------|
| `restaurants` | YES | owner only | authenticated |
| `menus` | YES | owner only | owner only |
| `menu_sections` | YES | owner only | owner only |
| `menu_items` | YES | owner only | owner only |
| `promotions` | YES | owner only | owner only |
| `promotion_rewards` | YES | owner only | owner only |
| `play_sessions` | NO | service role | service role |
| `coupon_redemptions` | NO | service role | service role |
| `customer_profiles` | NO | service role | service role |

**Public routes use service role client** (bypasses RLS). This is intentional — the promotion play API and coupon issue API need cross-restaurant data access without exposing data to the browser.

---

## Dangerous Schema Areas

1. **`restaurants.owner_id` has no FK constraint** — user deletion does not cascade.
2. **`guest_sessions` table** — unclear if still active. May be a dead table from an earlier session architecture.
3. **`rewards` table** — legacy. `promotion_rewards` is the active table. Potential confusion for anyone reading the schema fresh.
4. **`menu_items.category`** — pre-sections legacy field. Sections (`menu_sections`) are now the canonical grouping.
5. **`coupon_redemptions.play_session_id` nullable** — pre-migration coupons have null here, breaking some session-recovery queries.
6. **`promotions.game_type`** — stores the primary/fallback game type but `promotion_game_assignments` is now the authoritative multi-game pool. These two can drift.
