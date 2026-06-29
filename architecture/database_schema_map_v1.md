# Database Schema Map V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Current — reflects all 47 migrations through 20260629000000_session_guests_v1

---

## 1. Core Platform Tables

### restaurants

Primary multi-tenant entity. Owner-scoped. Every other table has a `restaurant_id` FK.

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
  deleted_at       timestamptz -- soft delete
  created_at       timestamptz
  updated_at       timestamptz
)
```

**RLS:** Owner SELECT/UPDATE/DELETE only. Service role INSERT (setup flow).

---

### restaurant_capabilities

Per-restaurant hard feature flags. Different from settings: capabilities gate whether a feature operates at all.

```sql
restaurant_capabilities (
  restaurant_id    uuid  NOT NULL → restaurants(id) CASCADE
  capability_name  text  NOT NULL
  enabled          boolean NOT NULL DEFAULT false
  UNIQUE (restaurant_id, capability_name)
)
```

Current capabilities: `ordering`, `table_management`, `session_management`.

**RLS:** Owner SELECT/UPDATE only. No public write.

---

### restaurant_settings

Per-restaurant key-value UI/UX configuration.

```sql
restaurant_settings (
  restaurant_id  uuid  NOT NULL → restaurants(id)
  key            text  NOT NULL
  value          jsonb NOT NULL
  UNIQUE (restaurant_id, key)
)
```

Current standard keys: `show_featured_items_on_landing`, `show_prices_on_landing`, `enable_floating_reward_widget`, `widget_position`.

**RLS:** Owner SELECT/UPDATE. No public write.

---

### restaurant_touchpoints

Physical customer interaction points. Each table, kiosk, or counter is one row.

```sql
restaurant_touchpoints (
  id               uuid        PK
  restaurant_id    uuid        NOT NULL → restaurants(id) CASCADE
  name             text        NOT NULL   -- human-readable label
  type             text        NOT NULL DEFAULT 'table'
                               CHECK (type IN ('table','patio','counter','pickup'))
  touchpoint_code  text        NOT NULL   -- URL-safe; embedded in QR code
  section_name     text        -- optional grouping (e.g. "Rooftop")
  capacity         integer     -- informational only v1
  occupancy_status text        DEFAULT 'available'
                               CHECK (occupancy_status IN ('available','occupied','cleaning','reserved'))
  display_order    integer     NOT NULL DEFAULT 0
  active           boolean     NOT NULL DEFAULT true
  deleted_at       timestamptz
  UNIQUE (restaurant_id, touchpoint_code)
  UNIQUE (restaurant_id, name)
)
```

**Indexes:** `touchpoints_restaurant_active_order_idx`, `touchpoints_restaurant_code_idx`
**RLS:** Owner CRUD only. Public resolves via service role API route.

---

## 2. Session Layer Tables

### visit_sessions

One row per dining session. Shared by all guests at the same table.

```sql
visit_sessions (
  id                    uuid        PK
  restaurant_id         uuid        NOT NULL → restaurants(id) CASCADE
  touchpoint_id         uuid        NOT NULL → restaurant_touchpoints(id) RESTRICT
  status                text        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','completed','abandoned'))
  started_at            timestamptz NOT NULL DEFAULT now()
  ended_at              timestamptz           -- required when status != 'active'
  ended_by              uuid                  -- auth.uid() of admin who ended session
  last_activity_at      timestamptz NOT NULL DEFAULT now()

  -- Denormalized analytics counters
  guest_count           integer     NOT NULL DEFAULT 1  CHECK (>= 1)
  menu_items_viewed     integer     NOT NULL DEFAULT 0  CHECK (>= 0)
  orders_count          integer     NOT NULL DEFAULT 0  CHECK (>= 0)
  promotion_interactions integer    NOT NULL DEFAULT 0  CHECK (>= 0)
  coupons_issued        integer     NOT NULL DEFAULT 0  CHECK (>= 0)
  total_spend           numeric(10,2) NOT NULL DEFAULT 0 CHECK (>= 0)

  -- AI forward compat
  assigned_ai_agent     text              -- reserved; null in v1
  last_promotion_played uuid → promotions(id) SET NULL

  -- Session reference
  session_access_code   text        NOT NULL CHECK (~ '^\d{6}$')  -- 6-digit numeric code
  session_interaction_log jsonb     NOT NULL DEFAULT '[]'  -- deprecated; use session_events

  created_at            timestamptz NOT NULL DEFAULT now()
  updated_at            timestamptz NOT NULL DEFAULT now()

  -- Status/ended_at consistency enforced by CHECK
  -- Partial unique index: only one active session per touchpoint
  UNIQUE INDEX visit_sessions_one_active_per_touchpoint_idx (touchpoint_id) WHERE status='active'
)
```

**RLS:** Owner SELECT/UPDATE. No public INSERT or DELETE.
**RPCs:** `increment_session_counters()`, `append_session_interaction()`, `mark_stale_sessions_abandoned()`

---

### session_guests

One row per device per session join. Heartbeats keep `last_seen_at` fresh.

```sql
session_guests (
  id               uuid        PK
  session_id       uuid        NOT NULL → visit_sessions(id) CASCADE
  restaurant_id    uuid        NOT NULL → restaurants(id) CASCADE
  guest_token      text        NOT NULL  -- server-issued 64-char hex (2×UUID4)
  guest_name       text                  -- future: captured via identity screen
  device_fingerprint text      NOT NULL  -- browser fingerprint
  user_agent       text
  joined_at        timestamptz NOT NULL DEFAULT now()
  last_seen_at     timestamptz NOT NULL DEFAULT now()
  status           text        NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active','inactive','disconnected','blocked'))

  CONSTRAINT sg_token_length CHECK (length(guest_token) >= 32)
  UNIQUE INDEX session_guests_token_idx ON (guest_token)
)
```

**Presence lifecycle:** `active` → `inactive` (3 min silence) → `disconnected` (10 min silence). `blocked` is terminal (manual admin action).
**RPCs:** `increment_guest_count()`, `update_stale_guest_presence()`, `disconnect_session_guests()`
**RLS:** Owner SELECT only. No INSERT/UPDATE/DELETE policy — service role only.

---

## 3. Behavioral Intelligence Tables

### session_events

Append-only relational behavioral intelligence log. One row per customer interaction.

```sql
session_events (
  id           uuid        PK
  session_id   uuid        NOT NULL → visit_sessions(id) CASCADE
  restaurant_id uuid       NOT NULL → restaurants(id) CASCADE  -- denormalized for O(1) RLS
  guest_id     uuid                  -- ephemeral browser-tab UUID; null for server events
  event_type   text        NOT NULL
    CHECK (event_type IN (
      'MENU_OPENED','CATEGORY_OPENED','ITEM_VIEWED','ITEM_VIEW_DURATION',
      'ITEM_ADDED_TO_CART','ITEM_REMOVED_FROM_CART','ORDER_PLACED',
      'PROMOTION_VIEWED','PROMOTION_PLAYED','SESSION_ENDED'
    ))
  menu_item_id uuid → menu_items(id) SET NULL
  promotion_id uuid → promotions(id) SET NULL
  metadata     jsonb       NOT NULL DEFAULT '{}'
  created_at   timestamptz NOT NULL DEFAULT now()
)
```

**Indexes:** `session_events_session_timeline_idx`, `session_events_restaurant_event_time_idx`, `session_events_item_funnel_idx`, `session_events_promotion_idx`, `session_events_session_event_idx`
**RLS:** Owner SELECT only. No public INSERT/UPDATE/DELETE.

**Event metadata contracts:**

| Event | Key metadata fields |
|---|---|
| `MENU_OPENED` | `touchpoint_code` |
| `CATEGORY_OPENED` | `category_id`, `category_name` |
| `ITEM_VIEWED` | `item_name`, price/special snapshot fields |
| `ITEM_VIEW_DURATION` | `item_name`, `duration_ms` |
| `ITEM_ADDED_TO_CART` | `item_name`, `quantity`, `price` |
| `ITEM_REMOVED_FROM_CART` | `item_name`, `reason?` |
| `ORDER_PLACED` | `order_id`, `order_number`, `item_count`, `subtotal` |
| `PROMOTION_VIEWED` | `promotion_name` |
| `PROMOTION_PLAYED` | `promotion_name`, `result`, `reward_type?` |
| `SESSION_ENDED` | `reason` (manual/stale/admin), `duration_seconds` |

---

### intervention_events

Append-only log of every intervention the Decision Engine fires. Tracks full lifecycle.

```sql
intervention_events (
  id               uuid            PK
  session_id       uuid            NOT NULL → visit_sessions(id) CASCADE
  restaurant_id    uuid            NOT NULL → restaurants(id) CASCADE
  trigger_type     text            NOT NULL
    CHECK (trigger_type IN (
      'cart_abandonment','high_interest_no_purchase','long_decision_without_cart',
      'post_order_rebrowse','dessert_interest_after_main_order','multi_guest_partial_order'
    ))
  confidence_score numeric(4,3)    NOT NULL DEFAULT 0 CHECK (BETWEEN 0 AND 1)
  action_taken     text            NOT NULL
    CHECK (action_taken IN (
      'coupon_offer','promotion_popup','ai_recommendation',
      'spin_wheel_trigger','waiter_notification','combo_offer'
    ))
  shown_at         timestamptz     NOT NULL DEFAULT now()
  accepted         boolean                   -- null = not yet interacted
  dismissed        boolean                   -- null = not yet interacted
  converted        boolean                   -- true = revenue attributed
  conversion_value numeric(10,2)             -- null unless converted
  created_at       timestamptz     NOT NULL DEFAULT now()

  CONSTRAINT ie_outcome_exclusive CHECK (NOT (accepted=true AND dismissed=true))
  CONSTRAINT ie_conversion_value_guard CHECK (conversion_value IS NULL OR converted=true)
)
```

**Indexes:** `intervention_events_session_idx`, `intervention_events_restaurant_idx`, `intervention_events_action_outcome_idx`
**RLS:** Owner SELECT only. No INSERT/UPDATE policy — service role only.
**Note:** As of 2026-06-29, the dispatcher stubs never write to this table. Future sprint.

---

## 4. Commerce Tables

### orders

```sql
orders (
  id                    uuid    PK
  restaurant_id         uuid    → restaurants(id) CASCADE
  order_number          integer NOT NULL    -- per-restaurant sequential; use next_order_number() RPC
  status                text    DEFAULT 'pending'
                                -- 'pending'|'preparing'|'ready'|'completed'|'cancelled'
  order_origin          text    DEFAULT 'direct_link'
                                -- 'restaurant_qr'|'direct_link'
  table_identifier      text    -- legacy display-only text; use touchpoint_id for logic
  customer_name         text
  kitchen_notes         text
  subtotal              numeric(10,2) NOT NULL
  idempotency_key       text    NOT NULL UNIQUE
  session_id            text    -- legacy text field; use visit_session_id for FK logic
  visit_session_id      uuid → visit_sessions(id) SET NULL  -- structured session reference
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

**RLS:** No public INSERT (service role via `/api/public/orders`). Owner SELECT. Anonymous SELECT permitted on specific order UUID (order tracker page).

---

### order_items

```sql
order_items (
  id                       uuid        PK
  order_id                 uuid        → orders(id) CASCADE
  restaurant_id            uuid        → restaurants(id)
  menu_item_id             uuid        → menu_items(id) SET NULL
  name_snapshot            text        NOT NULL  -- frozen at order time
  price_snapshot           numeric(10,2) NOT NULL
  effective_price_snapshot numeric(10,2) NOT NULL  -- after special offer
  special_active_snapshot  boolean     NOT NULL
  quantity                 integer     DEFAULT 1
  line_total               numeric(10,2) NOT NULL
  special_instructions     text
)
```

**RLS:** No public INSERT. Owner SELECT.

---

### restaurant_order_counters

Atomic per-restaurant order number generator.

```sql
restaurant_order_counters (
  restaurant_id     uuid PK → restaurants(id) CASCADE
  last_order_number integer NOT NULL DEFAULT 0
)
```

**RPC:** `next_order_number(p_restaurant_id)` — UPSERT + increment, SECURITY DEFINER. Never use SELECT MAX+1.

---

## 5. Menu Tables

### menus

One canonical active menu per restaurant.

```sql
menus (id, restaurant_id, name, active, deleted_at)
```

### menu_sections

```sql
menu_sections (
  id, menu_id → menus(id) CASCADE, restaurant_id,
  name, description, display_order, active, deleted_at
)
```

### menu_items

```sql
menu_items (
  id, restaurant_id, menu_id, section_id → menu_sections(id) SET NULL,
  name, category (legacy), description, price,
  image_url, display_order, is_featured, tags text[],
  available, active, ai_metadata jsonb,

  -- Special Offer Engine
  special_enabled, special_type ('percentage'|'fixed_price'),
  special_percent, special_price, special_start_at, special_end_at, special_no_expiry,

  deleted_at, updated_at
)
```

---

## 6. Promotion + Game Tables

### promotions

```sql
promotions (
  id, restaurant_id, name, slug UNIQUE, status ('draft'|'active'|'ended'),
  placement_mode DEFAULT 'restaurant', coupon_expiry_minutes
)
```

### promotion_game_assignments

```sql
promotion_game_assignments (
  promotion_id → promotions(id) CASCADE, game_type, weight, enabled,
  UNIQUE (promotion_id, game_type)
)
```

### rewards

```sql
rewards (
  id, restaurant_id, menu_item_id → menu_items(id) SET NULL,
  label, description, terms, reward_type, weight, minimum_spend, daily_limit, active
)
```

### play_sessions

```sql
play_sessions (
  id, restaurant_id, promotion_id, session_token UNIQUE,
  customer_profile_id → customer_profiles(id) SET NULL, terms_accepted_timestamp
)
```

### coupons

```sql
coupons (
  id, restaurant_id, reward_id, code UNIQUE NOT NULL,
  status ('issued'|'redeemed'|'expired'), issued_at, expires_at NOT NULL,
  redeemed_at
)
```

---

## 7. Customer Identity Table

### customer_profiles

```sql
customer_profiles (
  id, phone_country_code, phone_number_raw, phone_number_e164 UNIQUE,
  marketing_consent, marketing_consent_timestamp, terms_accepted_timestamp NOT NULL
)
```

**RLS:** No public SELECT. Write via service role only. Linked from `play_sessions.customer_profile_id`.

---

## 8. Intelligence Layer Tables

See `/docs/architecture/spinbite-platform-architecture-v3.md` Section 7 for full schema.

| Table | Purpose |
|---|---|
| `intelligence_features` | Feature registry — one row per AI capability |
| `intelligence_prompt_templates` | All prompt text (never in source code) |
| `intelligence_provider_costs` | Provider/model pricing (updated without deploy) |
| `intelligence_usage_limits` | Per-restaurant monthly quotas |
| `restaurant_intelligence_profile` | Persistent brand context for prompt injection |
| `intelligence_experiments` | A/B framework for prompt variants |
| `intelligence_generation_logs` | Append-only audit log of every generation attempt |

**RLS on all intelligence tables:** Super-admin SELECT only. No owner or anon access. Service role for writes.

---

## 9. Key RLS Policy Summary

| Table | Public anon | Restaurant owner | Service role |
|---|---|---|---|
| restaurants | None | CRUD (own) | All |
| restaurant_touchpoints | None | CRUD (own) | All |
| visit_sessions | None | SELECT + UPDATE (own) | All |
| session_guests | None | SELECT (own) | All |
| session_events | None | SELECT (own) | All |
| intervention_events | None | SELECT (own) | All |
| orders | SELECT by UUID (order tracker) | SELECT (own) | All |
| order_items | SELECT via order join | SELECT (own) | All |
| intelligence_* | None | None | All (super-admin UI only) |
| customer_profiles | None | None | All |

---

## 10. Service-Role-Only Write Paths

These tables have no INSERT/UPDATE policies for anon or owner keys:

- `visit_sessions` INSERT — session creation via resolve route
- `session_guests` INSERT/UPDATE — presence engine via heartbeat/resolve routes
- `session_events` INSERT — track route and server-side events (ORDER_PLACED, SESSION_ENDED)
- `intervention_events` INSERT — decision engine dispatcher (future)
- `orders` INSERT — public orders route
- `order_items` INSERT — public orders route
- `coupons` INSERT/UPDATE — promotion routes
- `customer_profiles` INSERT — customer identity route
- `intelligence_generation_logs` INSERT — intelligence engine

---

## 11. RPCs (Security Definer Functions)

| Function | Purpose |
|---|---|
| `next_order_number(restaurant_id)` | Atomic order number generation |
| `increment_session_counters(session_id, ...)` | Atomic counter update on session row |
| `append_session_interaction(session_id, event)` | Append to JSONB log (bounded 200) |
| `mark_stale_sessions_abandoned(restaurant_id, timeout_hours)` | Stale session sweep per restaurant |
| `increment_guest_count(session_id)` | Atomic guest_count++ on session |
| `update_stale_guest_presence(session_id)` | Sweep active→inactive→disconnected guests |
| `disconnect_session_guests(session_id)` | Instantly disconnect all non-terminal guests |
