# Deliverable 8 — Promotion Attachment Architecture
**Branch:** `feature/menu-experience-architecture-review`  
**Date:** 2026-06-05  
**Status:** Design review — no implementation  
**Part of:** Phase 2 Technical Design Package

---

## Table of Contents

1. [The Attachment Hierarchy](#1-the-attachment-hierarchy)
2. [What Already Exists in the Schema](#2-what-already-exists-in-the-schema)
3. [Level 1 — Restaurant Attachment (MVP)](#3-level-1--restaurant-attachment-mvp)
4. [Level 2 — Menu Attachment (Future)](#4-level-2--menu-attachment-future)
5. [Level 3 — Section Attachment (Future)](#5-level-3--section-attachment-future)
6. [Level 4 — Item Attachment (Future)](#6-level-4--item-attachment-future)
7. [MVP Recommendation](#7-mvp-recommendation)
8. [Future Roadmap Progression](#8-future-roadmap-progression)
9. [Database Implications](#9-database-implications)
10. [UI Implications](#10-ui-implications)
11. [Analytics Implications](#11-analytics-implications)
12. [The Platform Story](#12-the-platform-story)

---

## 1. The Attachment Hierarchy

A promotion can be conceptually attached at four levels of granularity. Each level narrows the audience, increases targeting precision, and requires additional complexity to implement.

```
ATTACHMENT LEVELS — most general to most specific

┌─────────────────────────────────────────────────────────────────────┐
│  LEVEL 1: RESTAURANT                                                │
│  ──────────────────────────────────────────────────────────────────  │
│  Promotion → Restaurant                                              │
│                                                                     │
│  "This promotion is for everyone who walks in and scans."           │
│                                                                     │
│  Scope: All menus · All sections · All items                        │
│  Current state: ✅ IMPLEMENTED                                      │
├─────────────────────────────────────────────────────────────────────┤
│  LEVEL 2: MENU                                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  Promotion → Restaurant → Menu                                      │
│                                                                     │
│  "This lunch promotion only runs during the Lunch menu."            │
│                                                                     │
│  Scope: One menu · All its sections · All its items                 │
│  Current state: ⚠️  FK EXISTS (promotions.menu_id) — NOT WIRED     │
├─────────────────────────────────────────────────────────────────────┤
│  LEVEL 3: SECTION                                                   │
│  ──────────────────────────────────────────────────────────────────  │
│  Promotion → Restaurant → Menu → Section                            │
│                                                                     │
│  "This dessert promo only surfaces in the Desserts section."        │
│                                                                     │
│  Scope: One section · All its items                                 │
│  Current state: ❌ NOT IN SCHEMA                                    │
├─────────────────────────────────────────────────────────────────────┤
│  LEVEL 4: ITEM                                                      │
│  ──────────────────────────────────────────────────────────────────  │
│  Promotion → Restaurant → Menu → Section → Item                     │
│                                                                     │
│  "Win the Burrata free — surfaces when customer views Burrata."     │
│                                                                     │
│  Scope: Specific items that are prizes                              │
│  Current state: ⚠️  FK EXISTS (promotion_rewards.menu_item_id)     │
│                      PARTIALLY WIRED (used for reward label only)   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. What Already Exists in the Schema

Before designing anything new, it is important to understand what the existing schema has already partially built. The picture is more complete than expected.

### `promotions.menu_id` — Level 2 FK, dormant

```sql
-- From supabase/multi_promotion_system.sql
CREATE TABLE promotions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_id    UUID REFERENCES menus(id) ON DELETE SET NULL,   -- ← EXISTS
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  ...
)
```

This FK was added when the multi-promotion system was designed. It was intended to associate a promotion with a specific menu. However, **no business logic uses it today** — it is not read in any API route, not enforced in any trigger, and not exposed in the admin UI. It is a dormant scaffold.

**Implication:** Menu-level promotion targeting (Level 2) requires only business logic and UI changes. The schema FK is already there.

---

### `menu_items.menu_id` — Already present

```sql
-- From supabase/multi_promotion_system.sql
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS menu_id UUID REFERENCES menus(id) ON DELETE CASCADE;
```

Items already know which menu they belong to. This is the join needed for menu-level targeting.

---

### `promotion_rewards.menu_item_id` — Level 4 FK, partially wired

```sql
-- From supabase/promotion_builder_schema.sql
CREATE TABLE promotion_rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id     UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  restaurant_id    UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  menu_item_id     UUID REFERENCES menu_items(id) ON DELETE SET NULL,  -- ← EXISTS
  custom_name      TEXT,
  reward_type      TEXT NOT NULL DEFAULT 'percent_discount',
  reward_value     NUMERIC(10,2),
  daily_limit      INTEGER DEFAULT 25,
  weight           INTEGER DEFAULT 10,
  display_order    INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
)
```

This FK is **actively used**: when the owner adds a menu item as a reward in the promotion builder, `menu_item_id` is populated. It currently drives the reward label on the coupon and the item picker in the builder. 

What it does **not** yet drive: surfacing "Win this item free!" in the item detail sheet (designed in Deliverable 1, Screen 3). That visual connection from item → its prize status is the Level 4 UI hook — the FK exists; the rendering logic does not.

---

### Schema Discovery Summary

| Attachment Level | FK Exists? | Business Logic? | Admin UI? | Customer UI? |
|----------------|------------|-----------------|-----------|-------------|
| Restaurant (L1) | ✅ `restaurants.current_promotion_id` | ✅ DB trigger | ✅ Active | ✅ Active |
| Menu (L2) | ✅ `promotions.menu_id` | ❌ Not wired | ❌ Not exposed | ❌ Not wired |
| Section (L3) | ❌ Missing | ❌ Not built | ❌ Not built | ❌ Not built |
| Item (L4) | ✅ `promotion_rewards.menu_item_id` | ⚠️ Partial | ✅ Builder uses it | ❌ Item detail not wired |

The database is significantly more prepared for promotion targeting than the product surface suggests. Levels 1 and 4 are partially to fully wired. Level 2 needs only logic. Level 3 needs a schema addition.

---

## 3. Level 1 — Restaurant Attachment (MVP)

### How it works

One promotion is active per restaurant at any time. The promotion applies uniformly to the entire restaurant experience — all menus, all sections, all items. The system does not need to know which menu or section the customer is looking at.

### Current architecture (already correct)

```
restaurants.current_promotion_id  ←──── synced by DB trigger
         │
         ▼
    promotions
         │
         ├── promotion_rewards  (what the customer can win)
         └── promotion_game_assignments  (which games to offer)
```

```
Customer Journey:
Scan QR
  └─► /r/[slug]         → fetch restaurant.current_promotion_id
        └─► Landing page → Today's Reward Card (promotion_rewards)
              └─► /r/[slug]/menu → Floating Widget (same promotion)
                    └─► /play/...  → Game → Win → Coupon
```

### Enforcement mechanism

The `block_duplicate_live_promotion_before_write` trigger (already in production) prevents two active promotions simultaneously at the restaurant level. This is correct and complete for the MVP.

### What "one promotion" means to the customer

The Today's Reward Card on the landing page and the floating widget on the menu page always refer to the same promotion. The customer sees a coherent, single offer regardless of which menu or section they are browsing. This simplicity is a feature, not a limitation.

---

## 4. Level 2 — Menu Attachment (Future)

### Concept

A promotion is attached to a specific menu. It appears only when a customer is viewing that menu. A restaurant with three menus (Breakfast, Lunch, Dinner) could have a different promotion active on each.

```
Restaurant
  ├── Breakfast Menu  ← no active promotion
  ├── Lunch Menu      ← "Lunch Rush" promotion active
  │     └─► Today's Reward Card appears on Lunch menu tab
  │     └─► Floating Widget visible only in Lunch menu
  └── Dinner Menu     ← "Date Night" promotion active
        └─► Today's Reward Card appears on Dinner menu tab
        └─► Floating Widget visible only in Dinner menu
```

### How it would work technically

1. `promotions.menu_id` is already populated by the admin when creating the promotion
2. The `block_duplicate_live_promotion` trigger is updated to enforce uniqueness per `(restaurant_id, menu_id)` rather than per `restaurant_id` alone
3. `restaurants.current_promotion_id` is retired or expanded to a `current_promotions` lookup (or the trigger no longer maintains it; instead, queries resolve the active promotion per menu)
4. The menu page component fetches the active promotion for the selected menu tab, not for the restaurant globally

### What changes for the customer

- Switching menu tabs potentially shows a different (or no) promotion
- The floating widget appears/disappears when switching menus
- The Today's Reward Card on the landing page shows the promotion for the default menu

### Complexity

Medium. The schema FK is done. The primary work is:
- Modify the one-active-per-restaurant trigger → one-active-per-(restaurant, menu)
- Update promotion resolution logic in the menu page
- Update admin to set `menu_id` on promotion creation
- Handle `restaurant.current_promotion_id` gracefully (it currently tracks one; expand to handle menu-scoped)

---

## 5. Level 3 — Section Attachment (Future)

### Concept

A promotion is attached to a specific section within a menu. The floating widget pulses more prominently when the customer scrolls into that section. The Today's Reward Card does not appear on the landing page — instead, the section itself has a contextual promotion card embedded within it.

```
Lunch Menu
  ├── Starters      ← no promotion
  ├── Mains         ← no promotion
  └── Desserts      ← "Win a Free Dessert" promotion
        ├── Item: Tiramisu
        ├── Item: Crème Brûlée
        └── ┌──────────────────────────────────────┐
             │ 🎯 Win a Free Dessert                │
             │ Spin to win one of these treats:    │
             │ ✓ Free Tiramisu  ✓ Free Crème Brûlée│
             │ [Spin Now →]                        │
             └──────────────────────────────────────┘
```

### What changes for the customer

The promotion is not surfaced on the landing page at all (no Today's Reward Card). The customer discovers it organically as they scroll through the menu. This is the most elegant form of "promotion discovery without interruption" — the promotion only appears in the exact context it is relevant to.

### Schema change required

```sql
-- New column (not in schema today)
ALTER TABLE promotions
  ADD COLUMN section_id UUID REFERENCES menu_sections(id) ON DELETE SET NULL;
```

### Complexity

High. The trigger and promotion resolution logic become significantly more complex when promotions can be scoped to sections. The admin UI requires section-level promotion assignment. The customer UI requires section-level promotion detection as the customer scrolls (IntersectionObserver integration with promotion state).

---

## 6. Level 4 — Item Attachment (Future)

### Concept

This level already partially exists. `promotion_rewards.menu_item_id` links a reward to a specific menu item. The missing piece is surfacing this connection in the customer-facing item detail.

```
Promotion Rewards:
  ├── reward_id: abc  →  menu_item_id: Burrata  →  reward_type: free
  ├── reward_id: def  →  menu_item_id: Salmon   →  reward_type: free
  └── reward_id: ghi  →  custom_name: "10% Off" →  menu_item_id: null
```

When a customer opens the Burrata item detail sheet, the system checks: is `Burrata.id` referenced by any active `promotion_rewards.menu_item_id`? If yes, show the contextual placement:

```
┌──────────────────────────────────────────┐
│ 🎯 Win this item free!                   │
│ It's one of tonight's prizes.            │
│ [Spin to Win →]              { text link }│
└──────────────────────────────────────────┘
```

This is the most targeted form of promotion discovery. The customer is looking at the exact item they could win. The call-to-action is personally relevant. No interruption — just contextual information in the place where it means the most.

### What changes

- Item detail sheet reads `promotion_rewards` for the restaurant's active promotion
- If `menu_item_id` matches the current item → show the contextual placement
- No schema change needed. This is pure rendering logic.

### Complexity

Low for the customer-facing UI (one query check, one conditional render block). Already designed in Deliverable 1, Screen 3.

---

## 7. MVP Recommendation

### Version 1: Restaurant-Level Attachment Only

```
Restaurant
    ↓
Promotion

One active promotion per restaurant.
One reward card on the landing page.
One floating widget across all menu sections.
No menu-level targeting.
No section-level targeting.
No item-level targeting (UI hook deferred).
```

### Rationale

**Simplicity is a product quality.** Restaurant owners are managing food service, staff, and operations. The mental model of "I have one promotion running right now" is instantly understood. The mental model of "I have a different promotion on each menu tab, and different widgets per section" requires a training investment that Version 1 cannot afford.

**The constraint is also a design constraint.** Because the promotion applies to the whole restaurant, the Today's Reward Card and floating widget are always coherent. There is no state management complexity about which promotion to show based on scroll position or selected tab. The customer experience is predictable.

**The data model is not the product constraint.** The schema already has most of the FKs for future targeting. The constraint for MVP is deliberate — it is a product decision, not a technical limitation.

**The one-active-per-restaurant trigger is an asset.** It prevents conflicting promotions, simplifies the customer experience, and keeps the admin UI clean. It should remain in place for Version 1.

### What MVP excludes and why

| Feature | Excluded because |
|---------|-----------------|
| Menu-level targeting | Adds UX complexity for owner; minimal value at small scale |
| Section-level promotion cards | Requires IntersectionObserver scroll binding to promotion state |
| "Win this item free!" in item detail | Nice polish; deferred to Phase 4 as the trigger (`menu_item_id` FK) is already there |
| Multiple simultaneous promotions | Conflicts with trigger architecture; confusing for customers |

### What MVP delivers — and why it is enough

One well-placed Today's Reward Card and one well-animated floating widget, driven by a single coherent promotion, is a category-defining experience for restaurants. No restaurant today has this. The product does not need item-level targeting to be remarkable at launch.

---

## 8. Future Roadmap Progression

The promotion attachment architecture evolves in four versions, each unlocking a new tier of restaurant capability.

```
VERSION 1 (MVP — NOW)
─────────────────────
  Restaurant → Promotion
  One card. One widget. No targeting.
  Schema: Current (no changes needed)
  Trigger: One-active-per-restaurant (existing)

VERSION 2 (MENU TARGETING — 6 MONTHS POST LAUNCH)
────────────────────────────────────────────────────
  Restaurant → Menu → Promotion
  Different promotions on different menu tabs.
  Schema: promotions.menu_id (already exists, wire it up)
  Trigger: Extend to one-active-per-(restaurant, menu)
  Use case: "Lunch Rush" on Lunch menu, "Date Night" on Dinner menu

VERSION 3 (SECTION TARGETING — 12 MONTHS POST LAUNCH)
──────────────────────────────────────────────────────
  Restaurant → Menu → Section → Promotion
  Promotions surface contextually within sections.
  Schema: Add promotions.section_id (one migration)
  UI: Inline promotion cards within menu sections
  Use case: Dessert promotion that only appears in Desserts section

VERSION 4 (ITEM-LEVEL SURFACING — 12 MONTHS POST LAUNCH)
──────────────────────────────────────────────────────────
  promotion_rewards.menu_item_id → Item Detail UI
  "Win this item free!" contextual placement in item sheet.
  Schema: No change needed (FK exists)
  UI: Conditional render in ItemDetailSheet (already designed)
  Use case: Any restaurant with item-linked rewards
```

### Trigger architecture evolution

The current `block_duplicate_live_promotion_before_write` trigger enforces:
```sql
UNIQUE active promotion per restaurant_id
```

Version 2 changes this to:
```sql
UNIQUE active promotion per (restaurant_id, COALESCE(menu_id, uuid_nil()))
```

This means: one active promotion per restaurant with no menu target (restaurant-wide), OR one active promotion per (restaurant, menu) pair. They do not conflict with each other. A restaurant can have a restaurant-wide promotion AND a menu-specific promotion simultaneously in Version 2.

Version 3 extends this further to `(restaurant_id, COALESCE(menu_id, uuid_nil()), COALESCE(section_id, uuid_nil()))`.

This is a clean, additive evolution. Each version extends the uniqueness constraint without breaking earlier behavior.

---

## 9. Database Implications

### Version 1 (MVP) — Zero schema changes for promotion attachment

The current promotion schema is complete for the MVP. No new tables, no new columns, no trigger changes.

```sql
-- What MVP uses (all existing):
promotions.id
promotions.restaurant_id
promotions.status
promotions.game_type
restaurants.current_promotion_id  ← trigger-managed
promotion_rewards.id
promotion_rewards.promotion_id
promotion_rewards.menu_item_id    ← used for label; UI hook deferred
promotion_rewards.reward_type
promotion_rewards.reward_value
promotion_rewards.weight
```

### Version 2 — Wire the dormant FK

```sql
-- promotions.menu_id already exists. Update trigger only.

-- Drop existing block trigger:
DROP FUNCTION IF EXISTS block_duplicate_live_promotion() CASCADE;

-- New trigger function:
CREATE FUNCTION block_duplicate_live_promotion() RETURNS TRIGGER AS $$
DECLARE existing RECORD;
BEGIN
  IF new.status = 'active' AND (new.starts_at IS NULL OR new.starts_at <= now())
     AND (new.ends_at IS NULL OR new.ends_at > now()) THEN

    SELECT id, name INTO existing
    FROM promotions
    WHERE restaurant_id = new.restaurant_id
      AND id <> new.id
      AND status = 'active'
      AND COALESCE(menu_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(new.menu_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (starts_at IS NULL OR starts_at <= now())
      AND (ends_at IS NULL OR ends_at > now())
    ORDER BY created_at DESC LIMIT 1;

    IF existing.id IS NOT NULL THEN
      RAISE EXCEPTION 'A promotion is already live for this scope: %', existing.name
        USING errcode = 'P0001';
    END IF;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Version 3 — One new column

```sql
ALTER TABLE promotions
  ADD COLUMN section_id UUID REFERENCES menu_sections(id) ON DELETE SET NULL;

-- Then extend the trigger function to include section_id in the COALESCE uniqueness check.
```

### Version 4 — No schema change

`promotion_rewards.menu_item_id` already exists. Building "Win this item free!" is purely application code in the item detail component. Zero migration.

### Migration impact summary

| Version | Schema changes | Trigger changes | Risk |
|---------|---------------|-----------------|------|
| 1 (MVP) | None | None | None |
| 2 | None | Update trigger function | Low |
| 3 | Add `promotions.section_id` (1 column) | Update trigger function | Low |
| 4 | None | None | None |

---

## 10. UI Implications

### Version 1 (MVP) — Current + designed in Deliverables 1–7

| Surface | Behaviour |
|---------|-----------|
| `/r/[slug]` landing page | Today's Reward Card — always shown when promotion is active, regardless of menu |
| `/r/[slug]/menu` — all tabs | Floating widget — always shown; same promotion on all tabs |
| Item detail sheet | No promotion placement (deferred to Version 4) |
| Admin | Mode selector, promotion builder — no changes needed |

### Version 2 — Menu-targeted promotion

| Surface | Behaviour change |
|---------|-----------------|
| Landing page Reward Card | Show promotion for the default menu only (first by display_order) |
| Menu tabs | Each tab resolves its own active promotion; widget appears/disappears on tab switch |
| Tab indicator | Small badge on menu tab if that tab has an active promotion |
| Admin — promotion creation | "Apply to" selector: "Entire restaurant" or "[select menu]" |
| Admin — promotions list | Grouped by scope: Restaurant-wide / Lunch / Dinner |

### Version 3 — Section-targeted promotion

| Surface | Behaviour change |
|---------|-----------------|
| Landing page Reward Card | NOT shown (section promotions don't surface on landing page) |
| Floating widget | Pulses more intensely when customer scrolls into the targeted section |
| Section header | Contextual promotion card embedded within the section (between section heading and first item) |
| Admin — promotion creation | "Apply to" selector adds: "Section within a menu" |

### Version 4 — Item-level surfacing

| Surface | Behaviour change |
|---------|-----------------|
| Item detail sheet | "Win this item free!" contextual block when `menu_item_id` matches |
| Menu item card | Optional: subtle "Prize!" badge on card thumbnail (future consideration) |
| Admin | No change (already sets `menu_item_id` in promotion builder) |

---

## 11. Analytics Implications

### Version 1 — Baseline metrics (currently tracking, or should be)

| Metric | Source | Value |
|--------|--------|-------|
| Landing page visits | page view event | Top of funnel |
| Today's Reward Card impressions | component mount event | Card visibility rate |
| "Play Now" taps on card | click event | Card → game conversion |
| Menu page visits | page view event | Menu engagement |
| Floating widget impressions | component mount event | Widget visibility rate |
| Widget taps | click event | Widget → game conversion |
| Game plays | `play_sessions` table | Engagement |
| Coupons issued | `coupon_redemptions` table | Win rate |
| Coupons redeemed | `coupon_redemptions.status` | Redemption rate |

**Key V1 funnel:**
```
QR Scan → Landing Page → Reward Card Tap → Game Play → Coupon Issued → Coupon Redeemed
  100%        85%              35%              30%           28%              15%
                          (estimated)      (estimated)   (estimated)      (estimated)
```

These conversion rates are targets to optimize against. The funnel is clean in Version 1 because there is exactly one path.

---

### Version 2 — Menu-level insights

Once promotions can be menu-targeted, new questions become answerable:

| Question | How answered |
|----------|-------------|
| Which menu drives the most plays? | `play_sessions.selected_game_type` × `promotions.menu_id` |
| Does a lunch promotion convert better than a dinner promotion? | Compare `issued/viewed` rate by `promotions.menu_id` |
| Do customers who arrive at Dinner play less often? | Compare card tap rate by menu |

**New metric:** Menu promotion conversion rate — customers who view a menu tab with an active promotion and tap "Play Now" vs. those who do not.

---

### Version 3 — Section-level insights

| Question | How answered |
|----------|-------------|
| Which section drives the most organic promotion discovery? | Scroll depth event × section_id |
| Do dessert promotions convert better than starter promotions? | Compare by `promotions.section_id` |
| How long do customers browse before tapping the widget in a section? | Time-in-section event |

---

### Version 4 — Item-level insights

This is where analytics becomes genuinely powerful for restaurant owners:

| Question | How answered |
|----------|-------------|
| Does showing "Win this free!" in item detail increase plays? | A/B test: item detail placement vs. no placement |
| Which prize items drive the most plays when customers view them? | `play_sessions` × `promotion_rewards.menu_item_id` |
| Do customers who win Item A return to browse more of the menu? | `play_sessions` → menu page return event |
| What is the attach rate: customers who view a prize item and then play? | View event on prize item × subsequent play |

**The item-level funnel becomes:**
```
View Burrata item → "Win this free!" seen → "Spin to Win" tapped → Play → Win Burrata coupon → Redeem
```

This is a closed-loop attribution story: the restaurant knows that a customer saw Burrata, was motivated to play by the prize context, won Burrata, and redeemed it. That attribution is enormously valuable for menu engineering and promotion design.

---

### Analytics infrastructure recommendation

Version 1 analytics can be implemented with:
- Client-side events to a simple analytics table in Supabase (low cost, no third-party required)
- Or a lightweight integration with PostHog or Mixpanel (recommended for funnel analysis)

The event schema should be designed once in Version 1 and extended — not replaced — as new levels are added. The key event properties to capture from day one:

```typescript
type AnalyticsEvent = {
  event:          string           // 'page_view' | 'card_impression' | 'widget_tap' | ...
  restaurant_id:  string
  promotion_id?:  string
  menu_id?:       string           // null in V1, populated in V2
  section_id?:    string           // null in V1–V2, populated in V3
  menu_item_id?:  string           // null in V1–V3, populated in V4
  session_token?: string           // links to play_sessions
  timestamp:      string
}
```

Including `menu_id`, `section_id`, and `menu_item_id` as nullable fields from Version 1 means the analytics table never needs a schema migration when new levels are added. The fields are already there; they just start receiving values.

---

## 12. The Platform Story

### Where SpinBite is today

SpinBite is a QR game platform. Restaurants use it to run promotional spin wheels. Customers scan, spin, and win. The entire customer journey takes 60–90 seconds. Then the customer puts their phone down and the engagement ends.

```
TODAY

Scan QR
  → 60 seconds of game
  → Coupon
  → Done

Restaurant receives:
  · One coupon issued
  · One redemption event
  · No customer profile (in most cases)
  · No menu engagement
  · No return visit intent
```

### Where this release takes SpinBite

After implementing the approved architecture, the story is categorically different.

```
AFTER THIS RELEASE

Scan QR
  → Restaurant identity (logo, hero, name)
  → Menu browse (sections, images, descriptions, prices)
  → Discover promotion naturally (Today's Reward Card)
  → Play game
  → Win reward
  → Continue browsing menu with coupon in hand
  → Phone number captured (consent-based)

Restaurant receives:
  · Customer profile with phone (loyalty foundation)
  · Menu engagement data (what items were viewed)
  · Promotion conversion data (card → play → win → redeem)
  · Return visit intent (customer browsed menu, knows what to order next time)
  · Branded digital storefront (QR code is now worth printing prominently)
```

### The product tier map

The promotion attachment levels are not just a technical roadmap. They are a **product packaging story** that maps directly to restaurant segment and willingness to pay.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  STARTER                                                                 │
│  Restaurant-level promotion · One card · One widget                      │
│  "I want to run a spin-to-win promotion for my restaurant."              │
│  Target: Single-location restaurants, food trucks, cafés                 │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  GROWTH                                                                  │
│  Menu-level promotion targeting · Multiple menus · Different offers      │
│  "I want a lunch promo and a dinner promo — different rewards."          │
│  Target: Multi-daypart restaurants (breakfast/lunch/dinner)              │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  PRO                                                                     │
│  Section-level + item-level surfacing · Analytics dashboard              │
│  "I want the dessert promo to surface only in the desserts section."     │
│  "Show me which items drive the most plays."                             │
│  Target: Full-service restaurants, chains                                │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  ENTERPRISE                                                              │
│  AI menu import · Contextual promotions · Loyalty · CRM · SMS           │
│  "Import my 200-item menu. Target first-time customers differently."     │
│  Target: Multi-location chains, franchise groups, hospitality groups     │
└──────────────────────────────────────────────────────────────────────────┘
```

Every level of promotion granularity that the architecture supports is a billing tier that restaurants can grow into. The Starter restaurant signs up today and gets remarkable value. As their sophistication grows, the platform grows with them — without them needing to switch products.

### The one-sentence investor version

> SpinBite transforms every restaurant's QR code into a branded digital storefront, a gamified loyalty engine, and a customer acquisition channel — starting with a beautiful menu experience and a spin-to-win promotion, growing into the engagement and CRM platform that restaurants will not want to leave.

---

### What the architecture makes possible — at a glance

| Capability | V1 | V2 | V3 | V4 |
|-----------|----|----|----|----|
| Digital menu via QR | ✅ | ✅ | ✅ | ✅ |
| Restaurant landing page | ✅ | ✅ | ✅ | ✅ |
| Today's Reward Card | ✅ | ✅ | ✅ | ✅ |
| Floating reward widget | ✅ | ✅ | ✅ | ✅ |
| Customer phone capture | ✅ | ✅ | ✅ | ✅ |
| Menu-level promotion targeting | ❌ | ✅ | ✅ | ✅ |
| Section-level contextual promo | ❌ | ❌ | ✅ | ✅ |
| Item-level "Win this free!" | ❌ | ❌ | ❌ | ✅ |
| AI menu import | ❌ | ❌ | ❌ | future |
| Loyalty / CRM | ❌ | ❌ | ❌ | future |

The database schema supports V1 today with no changes to the promotion tables. V2 requires only wiring existing FKs. V3 requires one column. V4 requires no schema change at all. The architecture is not over-engineered for today — it is right-sized for today with a clear, low-friction path to everything that comes next.

---

*This completes the Phase 2 design package. Eight deliverables. One approved direction. Implementation can begin.*
