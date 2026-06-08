# SpinBite Phase 2 – Detailed UX & Technical Design
**Branch:** `feature/menu-experience-architecture-review`  
**Date:** 2026-06-05  
**Status:** Final design package — approved direction, awaiting implementation sign-off  
**Prerequisite docs:** [Architecture Review](./architecture-review-menu-experience.md) · [UX Architecture](./ux-architecture-restaurant-experience.md)

---

## Table of Contents

1. [Deliverable 1 — Mobile UX Wireframes](#deliverable-1--mobile-ux-wireframes)
2. [Deliverable 2 — Database Design](#deliverable-2--database-design)
3. [Deliverable 3 — Admin Portal Design](#deliverable-3--admin-portal-design)
4. [Deliverable 4 — Routing Architecture](#deliverable-4--routing-architecture)
5. [Deliverable 5 — Branding Architecture](#deliverable-5--branding-architecture)
6. [Deliverable 6 — Future Roadmap Compatibility](#deliverable-6--future-roadmap-compatibility)
7. [Deliverable 7 — Revised Delivery Plan](#deliverable-7--revised-delivery-plan)

---

## Deliverable 1 — Mobile UX Wireframes

All wireframes target 390 × 844 pt (iPhone 14 reference). Annotations in `{ }` describe visual treatment. The design principle is strict: **restaurant identity leads, promotion follows**.

---

### Screen 1 — Restaurant Landing Page (Mode 2 & 3)

The approved content order: Hero → Featured Items → Today's Reward Card → Menu CTA → About. Featured items appear before the reward card. The restaurant's content is seen first; the promotion is discovered second.

```
┌─────────────────────────────────────────────────────┐ ← 390px
│                                                     │
│  { HERO IMAGE — full bleed, 58vh, object-fit:cover }│
│                                                     │
│  { parallax: image scrolls at 0.6× speed }         │
│                                                     │
│                                                     │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ { frosted glass card — backdrop-blur:16px   │   │
│  │   background: brand_color at 15% opacity    │   │
│  │   border-radius: 16px, margin: 0 16px }     │   │
│  │                                             │   │
│  │  ┌────┐  Bella Italia             ★★★★☆    │   │
│  │  │LOGO│  Italian Cuisine · Toronto          │   │  ← logo 48×48 circle
│  │  └────┘  📍 123 Queen St W                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─────────────────────────────────────────────────────┤  ← hero / content break
│                                                     │
│  Featured Items                    { 16px heading } │
│  { subtitle: "From our menu" — 13px, muted }        │
│                                                     │
│  ◄──────────── horizontal scroll ──────────────►   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────   │
│  │          │ │          │ │  ⭐       │ │         │
│  │  [photo] │ │  [photo] │ │  [photo] │ │ [photo] │  ← 140×140 rounded
│  │          │ │          │ │          │ │         │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────   │
│  │ Burrata  │ │ Calamari │ │ Salmon   │ │ Tiram.. │
│  │ $16      │ │ $14      │ │ $28      │ │ $9      │
│  └──────────┘ └──────────┘ └──────────┘ └──────   │
│                                                     │
│  { ⭐ badge = is_featured. tap any card = item      │
│    detail bottom sheet }                            │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  { TODAY'S REWARD CARD — Mode 3 only }              │
│  ┌─────────────────────────────────────────────┐   │
│  │ { top border: 4px solid brand_color }       │   │
│  │ { background: white, border-radius: 16px    │   │
│  │   box-shadow: 0 4px 16px rgba(0,0,0,0.08) } │   │
│  │                                             │   │
│  │  🎯  Tonight's Reward     { brand_color }   │   │  ← icon matches game type
│  │  ─────────────────────────────────────────  │   │
│  │  Play our game and you could win:           │   │
│  │                                             │   │
│  │    ✓  Free Appetizer                        │   │  ← ✓ in green (#22c55e)
│  │    ✓  Free Soft Drink                       │   │    text in #1a1a1a
│  │    ✓  10% Off Your Order                    │   │
│  │    ✓  BOGO Entrée                           │   │
│  │                                             │   │
│  │  ⏱  Valid 20 min after winning              │   │  ← 12px muted
│  │                                             │   │
│  │  ┌─────────────────────────────────────┐   │   │
│  │  │  🎯  Spin the Wheel to Win          │   │   │  ← brand_color bg
│  │  │  { 48px height, border-radius: 12px }│   │   │    white text
│  │  └─────────────────────────────────────┘   │   │
│  │                                             │   │
│  │  Free to play · No purchase required        │   │  ← 11px, #9ca3af
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  { card NOT shown in Mode 2 }                       │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │        🍽️  View Full Menu                  │   │  ← ghost button
│  │  { border: 1.5px solid brand_color          │   │    brand_color text
│  │    color: brand_color, border-radius: 12px  │   │    full width
│  │    height: 52px }                           │   │    16px margin
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  About                         { 16px heading }     │
│                                                     │
│  Authentic Italian cuisine serving the finest       │
│  seasonal ingredients since 1998. Handmade pasta    │
│  made fresh daily.              { 14px, #374151 }  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  📍  123 Queen St W, Toronto ON M5H 2M4    [→]     │  ← tappable → maps
│  📞  (416) 555-1234                        [→]     │  ← tappable → dialer
│  🌐  bellaitalia.ca                        [→]     │  ← tappable → browser
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Hours                                              │
│  Today  Thu  11:00 am – 10:00 pm  { Open now badge }│  ← today highlighted
│         [Show all hours ▾]                          │    green "Open" badge
│                                                     │
│  { Expanded state shows M–Su grid }                 │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  [📸]  [👥]  [🗺️]       { 44px icon buttons }      │  ← social links
│  Insta  FB   Maps                                   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Powered by SpinBite              { 10px, #d1d5db } │  ← muted footer
└─────────────────────────────────────────────────────┘
```

**Interaction notes:**
- Hero image has `loading="eager"` (above fold); all other images `loading="lazy"`
- Frosted info card uses `backdrop-filter: blur(16px) saturate(180%)`
- If no hero image uploaded: gradient background using `linear-gradient(135deg, brand_color 0%, darkened brand_color 100%)`
- Rating stars are decorative placeholders (`★★★★☆`) — not wired to a data source in this phase
- "Show all hours" accordion expands inline; no modal

---

### Screen 2 — Menu Page

```
┌─────────────────────────────────────────────────────┐
│ { STICKY HEADER — background: white, shadow on      │
│   scroll, height: 56px, z-index: 40 }               │
│                                                     │
│  ←   ┌────┐  Bella Italia                    [🎁]  │  ← back to landing
│      │LOGO│  { 32px logo }  { 15px bold }          │    floating widget
│      └────┘                                  [🎁]  │    56px circle FAB
│                                      { bottom:24px  │    brand_color
├─────────────────────────────────────────────────────┤   right:20px
│                                        fixed pos }  │
│ { MENU SELECTOR TABS — shown only if >1 active menu }│
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Lunch ● │  │  Dinner  │  │  Drinks  │          │  ← active tab:
│  └──────────┘  └──────────┘  └──────────┘          │    underline brand_color
│  { 14px, border-bottom: 2px solid brand_color for   │    text brand_color
│    active. Horizontal scroll if >3 menus }          │
│                                                     │
├─────────────────────────────────────────────────────┤
│ { SECTION PILL NAV — sticky below menu tabs,        │
│   background: white, z-index: 30 }                  │
│                                                     │
│  ◄ [Starters ●] [Mains] [Pasta] [Pizza] [Desserts] ►│  ← horizontal scroll
│  { active pill: brand_color bg, white text          │    no wrap
│    inactive: #f3f4f6 bg, #374151 text               │
│    border-radius: 20px, 12px × 32px padding         │
│    IntersectionObserver → updates active on scroll }│
│                                                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Starters ──────────────────────────────────────── │  ← section heading
│  { 13px uppercase, #9ca3af, letter-spacing: 0.08em }│    sticky to section
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │  ┌──────┐  Calamari              $14.00     │   │  ← item card
│  │  │[img] │  Crispy rings, lemon aioli...     │   │    80×80 rounded-12
│  │  │80×80 │  { 2-line clamp description }     │   │    tap = item detail
│  │  └──────┘  [Gluten-Free] [Popular]          │   │    sheet
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ { ⭐ gold border-left: 3px solid #f59e0b }   │   │  ← FEATURED ITEM
│  │                                             │   │    gold left border
│  │  ┌──────┐  ⭐ Burrata            $16.00     │   │    ⭐ before name
│  │  │[img] │  Buffalo mozzarella, heirloom...  │   │
│  │  │80×80 │  { 2-line clamp }                 │   │
│  │  └──────┘  [Vegetarian] [New]               │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │  ┌──────┐  Soup of the Day       $8.00      │   │  ← no image fallback:
│  │  │  🍲   │  Ask your server for today's...  │   │    cuisine emoji in
│  │  │ icon  │                                  │   │    #f3f4f6 bg
│  │  └──────┘  [Vegetarian]                     │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Mains ───────────────────────────────────────────  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │                                             │   │
│  │  ┌──────┐  Grilled Salmon        $28.00     │   │
│  │  │[img] │  Atlantic salmon, lemon butter... │   │
│  │  │80×80 │                                   │   │
│  │  └──────┘  [Gluten-Free]                    │   │
│  │                                             │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  { UNAVAILABLE ITEM — overlaid gray tint }  │   │  ← available = false
│  │  ┌──────┐  Osso Buco             $34.00     │   │    50% opacity
│  │  │[img] │  Braised veal shank... [SOLD OUT] │   │    "Sold Out" badge
│  │  │ 50%  │                                   │   │    no tap interaction
│  │  └──────┘                                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│                                                     │
│                                              ┌────┐ │
│                                              │ 🎁 │ │  ← floating widget
│                                              │ ①  │ │    fixed position
│                                              └────┘ │    56px, brand_color
│                                                     │    "1" badge = red dot
└─────────────────────────────────────────────────────┘
```

**Interaction notes:**
- Tags render as chips: `border-radius: 20px`, `font-size: 11px`, `padding: 2px 8px`
- Tag color map: Gluten-Free=#dcfce7/green, Vegan=#dcfce7/green, Vegetarian=#f0fdf4/green, Spicy=#fef2f2/red, Popular=#fffbeb/amber, New=#eff6ff/blue, Chef's Pick=#f5f3ff/purple
- Item card `min-height: 88px`, `padding: 12px 16px`
- Sold Out items: `pointer-events: none`, overlay with `background: rgba(255,255,255,0.6)`
- Section heading uses `position: sticky; top: {header + tabs + pills height}px` — actual value computed at runtime
- IntersectionObserver threshold `0.4` updates active section pill as user scrolls

---

### Screen 3 — Menu Item Detail (Bottom Sheet)

```
┌─────────────────────────────────────────────────────┐
│ { SCRIM — position: fixed, inset: 0                 │
│   background: rgba(0,0,0,0.4)                       │
│   tap to dismiss }                                  │
│  ┌───────────────────────────────────────────────┐  │
│  │           ────                                │  │  ← drag handle
│  │  { border-radius: 24px 24px 0 0               │  │    32×4px #e5e7eb
│  │    background: white                           │  │
│  │    max-height: 90vh, overflow-y: scroll }      │  │
│  │                                               │  │
│  │                             [✕]               │  │  ← dismiss button
│  │  ┌───────────────────────────────────────┐   │  │    top-right, 44×44
│  │  │                                       │   │  │
│  │  │                                       │   │  │
│  │  │         [ ITEM PHOTO ]                │   │  │  ← 100% width
│  │  │         { 220px height                │   │  │    220px height
│  │  │           object-fit: cover }         │   │  │    object-fit:cover
│  │  │                                       │   │  │
│  │  └───────────────────────────────────────┘   │  │
│  │                                               │  │
│  │  ⭐ Featured                  { gold, 13px }  │  │  ← only if is_featured
│  │                                               │  │
│  │  Burrata                          $16.00      │  │  ← 22px bold / 22px bold
│  │  { #1a1a1a }                    { brand_color }│  │
│  │                                               │  │
│  │  [Vegetarian]  [New]  [Chef's Pick]           │  │  ← tag chips
│  │  { same color system as menu page }           │  │
│  │                                               │  │
│  │  { AVAILABILITY BADGE — only if !available }  │  │
│  │  ┌──────────────────────────────────────┐    │  │
│  │  │ ⚠️  Not available right now          │    │  │  ← #fef3c7 bg
│  │  └──────────────────────────────────────┘    │  │    #92400e text
│  │                                               │  │
│  │  ─────────────────────────────────────────── │  │
│  │                                               │  │
│  │  Fresh buffalo mozzarella served with         │  │  ← full description
│  │  heirloom tomatoes, fresh basil, and          │  │    14px, #374151
│  │  house-made pesto. Drizzled with extra        │  │    line-height: 1.6
│  │  virgin Sicilian olive oil.                   │  │    no truncation
│  │                                               │  │
│  │  { If no description: section hidden }        │  │
│  │                                               │  │
│  │  ─────────────────────────────────────────── │  │
│  │                                               │  │
│  │  { PROMOTION PLACEMENT — Mode 3 only,         │  │
│  │    only if item is a promotion_reward }        │  │
│  │  ┌──────────────────────────────────────┐    │  │
│  │  │ 🎯 Win this item free!               │    │  │  ← very subtle
│  │  │ It's one of tonight's prizes.        │    │  │    brand_color/10 bg
│  │  │ [Spin to Win →]         { text link }│    │  │    brand_color border
│  │  └──────────────────────────────────────┘    │  │    not aggressive
│  │                                               │  │
│  │  { Placement rule: only show if               │  │
│  │    promotion_rewards.menu_item_id = item.id   │  │
│  │    AND promotion is active                    │  │
│  │    AND mode = menu_and_promotion }            │  │
│  │                                               │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Interaction notes:**
- Sheet opens via `transform: translateY(100%) → translateY(0)`, duration 320ms, `cubic-bezier(0.32, 0.72, 0, 1)` (iOS-style spring)
- Drag handle: user can drag down ≥ 20% of sheet height to dismiss; momentum-based
- Keyboard: `Escape` dismisses on desktop
- `aria-modal="true"`, focus trapped inside sheet
- Image falls back to: cuisine-category icon on `#f3f4f6` background if `image_url` is null

---

### Screen 4 — Reward Widget States

**State A: Resting (floating, menu page)**

```
┌─────────────────────────────────────────────────────┐
│ Menu Page (in background)                           │
│  ...menu items...                                   │
│                                                     │
│                                              ┌────┐ │
│                                              │    │ │  56px × 56px circle
│                                              │ 🎁 │ │  brand_color background
│                                              │    │ │  white icon
│                                              └────┘ │  box-shadow:
│                                               ●     │  0 4px 20px rgba(brand,0.4)
│                                       { red badge } │
│                                       { 16px dot   } │  ← red badge #ef4444
│                                       { "1" white  } │    absolute top-right
│                                                     │
│  { CSS animation: shadow-pulse }                    │
│  @keyframes shadow-pulse {                          │
│    0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,.2)}│
│    50%      { box-shadow: 0 4px 28px rgba(brand,.5)}│
│  }  animation: shadow-pulse 4s ease-in-out infinite │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**State B: Attention Bounce (every 15–20s, randomised)**

```
  { CSS keyframes: reward-bounce }
  @keyframes reward-bounce {
    0%   { transform: translateY(0)   }
    20%  { transform: translateY(-10px) }
    40%  { transform: translateY(-4px)  }
    60%  { transform: translateY(-8px)  }
    80%  { transform: translateY(-2px)  }
    100% { transform: translateY(0)    }
  }
  duration: 700ms, easing: ease-in-out
  fires once, then returns to resting state
  interval: random between 15000ms and 20000ms
  respects: prefers-reduced-motion: reduce → no bounce
```

**State C: Expanded Panel (tap on widget)**

```
┌─────────────────────────────────────────────────────┐
│ { SCRIM — rgba(0,0,0,0.3), tap to dismiss }         │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  ┌───────────────────────────────────────────────┐  │
│  │             ────                              │  │  ← drag handle
│  │  { slides up from bottom, spring animation   │  │
│  │    translateY(100%) → translateY(0)           │  │
│  │    320ms cubic-bezier(0.32,0.72,0,1) }       │  │
│  │                                               │  │
│  │  🎯  Tonight's Reward           [✕]           │  │  ← title + dismiss
│  │  { brand_color icon + 18px bold }             │  │
│  │  ─────────────────────────────────────────── │  │
│  │                                               │  │
│  │  Play our game and you could win:             │  │
│  │                                               │  │
│  │    ✓  Free Appetizer                          │  │  ← same reward list
│  │    ✓  Free Soft Drink                         │  │    as landing card
│  │    ✓  10% Off Your Order                      │  │
│  │    ✓  BOGO Entrée                             │  │
│  │                                               │  │
│  │  ⏱  Valid 20 minutes after winning            │  │
│  │                                               │  │
│  │  ┌─────────────────────────────────────────┐ │  │
│  │  │    🎯  Spin the Wheel to Win             │ │  │  ← brand_color CTA
│  │  └─────────────────────────────────────────┘ │  │    48px height
│  │                                               │  │
│  │       Continue Browsing                       │  │  ← text link
│  │  { 13px, #6b7280, no underline, tap to close }│  │    no pressure
│  │                                               │  │
│  │  Free to play · No purchase required          │  │  ← 11px muted
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Widget lifecycle rules:**
- Shown: only on menu page in Mode 3 when an active promotion exists
- Hidden: after customer taps "Spin the Wheel" (they have chosen to play)
- Dismissed: if customer taps ✕ on panel, panel closes but widget icon remains visible
- Permanently hidden per session: if customer has already played all their spins (`playsRemaining = 0`)
- State persisted in React context (not localStorage) — resets on page reload

---

## Deliverable 2 — Database Design

### 2.1 Design Principles

- **Additive only** — no existing columns dropped or renamed in this phase
- **Soft delete for menu content** — items and sections use `deleted_at` instead of hard delete, preserving analytics references
- **AI-ready via JSONB envelope** — one `ai_metadata` column on `menu_items` absorbs all future AI fields without further migrations
- **Settings table for per-restaurant feature flags** — avoids column bloat on `restaurants` for toggle-style settings
- **Forward-compatible FK design** — all new tables are restaurant-scoped with `restaurant_id` for RLS simplicity

---

### 2.2 Migration 1 — Restaurant Experience Foundation

**File:** `supabase/migrations/20260606000000_restaurant_experience_foundation.sql`

```sql
-- ─── restaurants: new columns ────────────────────────────────────────────────

ALTER TABLE restaurants
  -- Mode selector
  ADD COLUMN experience_mode TEXT NOT NULL DEFAULT 'promotion_only'
    CONSTRAINT restaurants_experience_mode_check
    CHECK (experience_mode IN ('promotion_only', 'menu_only', 'menu_and_promotion')),

  -- Visual identity
  ADD COLUMN hero_image_url   TEXT,
  ADD COLUMN secondary_color  TEXT,
  ADD COLUMN accent_color     TEXT,

  -- Restaurant bio
  ADD COLUMN description      TEXT,

  -- Structured hours (see JSONB schema below)
  ADD COLUMN hours            JSONB,

  -- Contact
  ADD COLUMN website_url      TEXT,
  ADD COLUMN instagram_url    TEXT,
  ADD COLUMN facebook_url     TEXT,
  ADD COLUMN google_maps_url  TEXT,

  -- Soft delete (restaurants not hard-deleted by cascade at this stage)
  ADD COLUMN deleted_at       TIMESTAMPTZ,
  ADD COLUMN updated_at       TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX restaurants_experience_mode_idx
  ON restaurants(experience_mode)
  WHERE deleted_at IS NULL;

CREATE INDEX restaurants_slug_mode_idx
  ON restaurants(slug, experience_mode)
  WHERE deleted_at IS NULL;

-- ─── updated_at trigger ──────────────────────────────────────────────────────

CREATE TRIGGER set_restaurants_updated_at
  BEFORE UPDATE ON restaurants
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

**`hours` JSONB schema contract:**

```json
{
  "monday":    { "open": "11:00", "close": "22:00", "closed": false },
  "tuesday":   { "open": "11:00", "close": "22:00", "closed": false },
  "wednesday": { "open": "11:00", "close": "22:00", "closed": false },
  "thursday":  { "open": "11:00", "close": "22:00", "closed": false },
  "friday":    { "open": "11:00", "close": "23:00", "closed": false },
  "saturday":  { "open": "12:00", "close": "23:00", "closed": false },
  "sunday":    { "open": "12:00", "close": "21:00", "closed": false }
}
```

Times are 24-hour strings `"HH:MM"`. `closed: true` means the restaurant is closed that day (open/close values ignored). Timezone is stored in the existing `restaurants.timezone` column (already present from promotion scheduling).

---

### 2.3 Migration 2 — Restaurant Settings Table

**File:** `supabase/migrations/20260606010000_restaurant_settings.sql`

```sql
CREATE TABLE restaurant_settings (
  id            UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  key           TEXT      NOT NULL,
  value         JSONB     NOT NULL DEFAULT 'null'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT restaurant_settings_unique_key UNIQUE (restaurant_id, key)
);

CREATE INDEX restaurant_settings_restaurant_id_idx
  ON restaurant_settings(restaurant_id);

CREATE TRIGGER set_restaurant_settings_updated_at
  BEFORE UPDATE ON restaurant_settings
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE restaurant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own restaurant settings"
  ON restaurant_settings FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners write own restaurant settings"
  ON restaurant_settings FOR ALL
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );
```

**Standard setting keys (upserted by admin UI, not enforced by schema):**

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `hero_layout` | `"fullbleed" \| "banner"` | `"fullbleed"` | Landing page hero treatment |
| `widget_position` | `"bottom_right" \| "bottom_left"` | `"bottom_right"` | Floating widget anchor |
| `show_prices_on_landing` | `boolean` | `true` | Show price on featured item cards |
| `reward_card_position` | `"above_featured" \| "below_featured"` | `"below_featured"` | Card placement on landing |
| `ai_features_enabled` | `boolean` | `false` | Gate for AI description gen |

---

### 2.4 Migration 3 — Menu Display Order and Slug

**File:** `supabase/migrations/20260606020000_menu_display_order.sql`

```sql
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_type     TEXT DEFAULT 'all_day',
  ADD COLUMN               display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN               slug          TEXT,
  ADD COLUMN               updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- Back-fill slugs from existing menu names
UPDATE menus
SET slug = lower(regexp_replace(
  regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'),
  '\s+', '-', 'g'
));

-- Handle duplicate slugs within same restaurant
-- (uses window function to append -2, -3 etc. where needed)
WITH ranked AS (
  SELECT id, restaurant_id, slug,
         row_number() OVER (PARTITION BY restaurant_id, slug ORDER BY created_at) AS rn
  FROM menus
  WHERE slug IS NOT NULL
)
UPDATE menus m
SET slug = CASE WHEN r.rn = 1 THEN r.slug ELSE r.slug || '-' || r.rn::text END
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

ALTER TABLE menus
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT menus_restaurant_slug_unique UNIQUE (restaurant_id, slug);

CREATE INDEX menus_restaurant_id_display_order_idx
  ON menus(restaurant_id, display_order)
  WHERE active = true;

CREATE TRIGGER set_menus_updated_at
  BEFORE UPDATE ON menus
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
```

---

### 2.5 Migration 4 — Menu Sections

**File:** `supabase/migrations/20260606030000_menu_sections.sql`

```sql
CREATE TABLE menu_sections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id       UUID        NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  restaurant_id UUID        NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  display_order INTEGER     NOT NULL DEFAULT 0,
  active        BOOLEAN     NOT NULL DEFAULT true,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX menu_sections_menu_id_order_idx
  ON menu_sections(menu_id, display_order)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX menu_sections_restaurant_id_idx
  ON menu_sections(restaurant_id)
  WHERE deleted_at IS NULL;

-- ─── trigger ─────────────────────────────────────────────────────────────────

CREATE TRIGGER set_menu_sections_updated_at
  BEFORE UPDATE ON menu_sections
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;

-- Public (customer menu page, landing page)
CREATE POLICY "Public read active menu sections"
  ON menu_sections FOR SELECT
  USING (deleted_at IS NULL AND active = true);

-- Owner read (admin — includes soft-deleted rows for restore workflow)
CREATE POLICY "Owners read own menu sections including deleted"
  ON menu_sections FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

-- Owner write
CREATE POLICY "Owners manage own menu sections"
  ON menu_sections FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners update own menu sections"
  ON menu_sections FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners delete own menu sections"
  ON menu_sections FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );
```

**Soft delete behaviour for sections:**
- Deleting a section sets `deleted_at = now()` — it does NOT cascade to items
- `menu_items.section_id` has `ON DELETE SET NULL` — so item records survive, `section_id` becomes NULL
- Admin sees soft-deleted sections with a "Restore" option for 30 days
- Hard delete available via a separate admin action after 30 days

---

### 2.6 Migration 5 — Menu Items Enrichment

**File:** `supabase/migrations/20260606040000_menu_items_enrichment.sql`

```sql
ALTER TABLE menu_items
  -- Section hierarchy
  ADD COLUMN section_id    UUID        REFERENCES menu_sections(id) ON DELETE SET NULL,

  -- Rich content
  ADD COLUMN image_url     TEXT,
  ADD COLUMN display_order INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN is_featured   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN tags          TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN available     BOOLEAN     NOT NULL DEFAULT true,

  -- AI-ready envelope (avoids future schema migrations for AI features)
  ADD COLUMN ai_metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Soft delete
  ADD COLUMN deleted_at    TIMESTAMPTZ,
  ADD COLUMN updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX menu_items_section_id_order_idx
  ON menu_items(section_id, display_order)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX menu_items_menu_id_order_idx
  ON menu_items(menu_id, display_order)
  WHERE deleted_at IS NULL AND active = true;

CREATE INDEX menu_items_featured_idx
  ON menu_items(restaurant_id, is_featured)
  WHERE is_featured = true AND deleted_at IS NULL AND active = true;

CREATE INDEX menu_items_tags_idx
  ON menu_items USING gin(tags)
  WHERE deleted_at IS NULL;

-- ─── trigger ─────────────────────────────────────────────────────────────────

CREATE TRIGGER set_menu_items_updated_at
  BEFORE UPDATE ON menu_items
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ─── update existing RLS to respect soft delete ───────────────────────────────
-- (Supabase does not support ALTER POLICY; drop and recreate)

DROP POLICY IF EXISTS "Public read menu_items" ON menu_items;

CREATE POLICY "Public read active menu items"
  ON menu_items FOR SELECT
  USING (active = true AND deleted_at IS NULL);

-- Admin still reads soft-deleted items for restore workflow
CREATE POLICY "Owners read own menu items including deleted"
  ON menu_items FOR SELECT
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM restaurants WHERE owner_id = auth.uid()
    )
  );
```

**`ai_metadata` JSONB schema contract (initial):**

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

All fields default to null/false/manual. When AI features are built, the application writes into this JSONB field — no schema migration needed.

---

### 2.7 Migration 6 — Storage Buckets

**File:** `supabase/migrations/20260606050000_storage_buckets.sql`

```sql
-- ─── restaurant-heroes bucket ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant-heroes',
  'restaurant-heroes',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Upload path: {user_id}/{restaurant_id}/hero.{ext}
-- One hero per restaurant (overwrites previous on re-upload)

CREATE POLICY "Public read hero images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-heroes');

CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.owner_id = auth.uid()
        AND r.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "Owners replace/delete hero images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners delete hero images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── menu-item-images bucket ─────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-item-images',
  'menu-item-images',
  true,
  5242880,   -- 5 MB
  ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- Upload path: {user_id}/{restaurant_id}/items/{item_id}/{timestamp}.{ext}

CREATE POLICY "Public read menu item images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-item-images');

CREATE POLICY "Owners upload menu item images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-item-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.owner_id = auth.uid()
        AND r.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "Owners replace/delete menu item images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-item-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

### 2.8 Full Schema Summary After All Migrations

```
restaurants
├── id, owner_id, name, slug, brand_color     ← existing
├── secondary_color, accent_color             ← NEW Phase 2
├── experience_mode                           ← NEW Phase 2
├── hero_image_url, description               ← NEW Phase 2
├── hours (JSONB), timezone                   ← hours NEW, timezone existing
├── logo_url                                  ← existing
├── address_line1, city, province_state,      ← existing
│   postal_code, country, phone
├── website_url, instagram_url,               ← NEW Phase 2
│   facebook_url, google_maps_url
├── current_promotion_id                      ← existing (trigger-managed)
├── deleted_at, updated_at                    ← NEW Phase 2
└── created_at                                ← existing

restaurant_settings                           ← NEW Phase 2
└── id, restaurant_id, key, value (JSONB),
    created_at, updated_at

menus
├── id, restaurant_id, name, description,     ← existing
│   active, created_at
├── menu_type, display_order, slug            ← NEW Phase 2
└── updated_at                                ← NEW Phase 2

menu_sections                                 ← NEW Phase 2
└── id, menu_id, restaurant_id, name,
    description, display_order, active,
    deleted_at, created_at, updated_at

menu_items
├── id, restaurant_id, menu_id, name,         ← existing
│   category, price, description, active,
│   created_at
├── section_id, image_url, display_order,     ← NEW Phase 2
│   is_featured, tags, available
├── ai_metadata (JSONB)                       ← NEW Phase 2
└── deleted_at, updated_at                    ← NEW Phase 2

Storage buckets (new):
├── restaurant-heroes   (10MB, public)
└── menu-item-images    (5MB, public)
```

---

### 2.9 Audit Considerations

**What to audit:**
- Changes to `restaurants.experience_mode` (mode changes are significant)
- Image uploads/deletions (content governance)
- Soft deletes and restores on menu_items and menu_sections

**How:** PostgreSQL audit logging is available via the `supabase_audit` schema extension (available in Supabase Pro). For the initial phase, rely on `updated_at` + `deleted_at` timestamps. A full audit log table is recommended for Phase 5 if the platform grows to enterprise restaurant clients.

---

## Deliverable 3 — Admin Portal Design

### 3.1 Information Architecture

The admin portal gains two enhanced areas and one new area:

```
/admin
├── Dashboard (unchanged)
├── Restaurants              ← ENHANCED — now has Profile sub-sections
│   ├── Create Restaurant
│   ├── Restaurant Card
│   │   ├── Tab: Profile     ← NEW (mode, hero, description, colors)
│   │   ├── Tab: Contact     ← NEW (hours, address, social, phone)
│   │   └── Tab: Settings    ← NEW (restaurant_settings key-value)
│   └── Preview Experience   ← NEW
├── Menu Builder             ← ENHANCED — sections, images, full item form
│   ├── Menu Selector
│   ├── Section Manager
│   └── Item Manager
├── Promotions (unchanged)
├── Coupons (unchanged)
└── Validate (unchanged)
```

---

### 3.2 Workflow A — Restaurant Profile Setup

**Entry point:** `/admin/restaurants` → select restaurant → "Profile" tab

```
STEP 1: EXPERIENCE MODE SELECTION
────────────────────────────────────────────────────────────────────
  Choose how customers experience your restaurant:

  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
  │   🎯                 │  │   🍽️                 │  │   🎯🍽️              │
  │   Promotion Only     │  │   Menu Only           │  │   Menu + Promotion   │
  │                      │  │                       │  │   ✓ SELECTED         │
  │   QR → Game → Win    │  │   QR → Menu →         │  │   QR → Landing →     │
  │                      │  │   Browse Items        │  │   Menu → Game → Win  │
  │   For campaigns and  │  │   For digital menus   │  │   Full experience    │
  │   promotions only    │  │   without promotions  │  │   Recommended ★      │
  └──────────────────────┘  └──────────────────────┘  └──────────────────────┘

  { Tapping a card selects it immediately and reveals relevant setup sections }
  { "Recommended ★" badge on Menu + Promotion }
  { Warning shown if switching away from active mode with live promotion }


STEP 2: HERO IMAGE (shown if mode ≠ promotion_only)
────────────────────────────────────────────────────────────────────

  ┌───────────────────────────────────────────────────────────────┐
  │                                                               │
  │  { if hero_image_url set: shows current image with overlay }  │
  │  { if not set: dashed border placeholder }                    │
  │                                                               │
  │   ┌─────────────────────────────────────────────────────┐    │
  │   │  📷  Drag and drop an image, or click to select     │    │
  │   │       Recommended: 1600 × 900px (16:9)              │    │
  │   │       JPEG or WebP · Max 10 MB                      │    │
  │   └─────────────────────────────────────────────────────┘    │
  │                                                               │
  │  [ Replace Image ]  [ Remove ]   { shown if image exists }   │
  └───────────────────────────────────────────────────────────────┘

  UPLOAD FLOW:
  1. File selected (drag/click)
  2. Client-side validation: format (JPEG/WebP/PNG), size (≤10MB)
  3. Show local preview immediately (URL.createObjectURL)
  4. User sees [Upload] button
  5. On click: supabase.storage.from('restaurant-heroes').upload(path, file)
  6. On success: update restaurants.hero_image_url
  7. On error: show error message, keep old image
  8. Old image deleted from storage only after new upload succeeds


STEP 3: DESCRIPTION (shown if mode ≠ promotion_only)
────────────────────────────────────────────────────────────────────

  About your restaurant
  ┌───────────────────────────────────────────────────────────────┐
  │ Authentic Italian cuisine serving the finest seasonal         │
  │ ingredients since 1998. Handmade pasta made fresh daily.      │
  │                                                    230 / 300  │
  └───────────────────────────────────────────────────────────────┘
  { Character counter; soft limit 300 chars with warning at 280 }


STEP 4: BRANDING
────────────────────────────────────────────────────────────────────

  Colors
  ┌──────────────────────────────────────────────────────────────┐
  │  Primary Color         Secondary Color       Accent Color    │
  │  ┌────┐ #F97316        ┌────┐ Auto           ┌────┐ Auto    │
  │  │████│ [Edit]         │░░░░│ [Override]      │░░░░│[Override]│
  │  └────┘                └────┘                 └────┘        │
  │                                                              │
  │  { Primary = existing brand_color field }                    │
  │  { Secondary/Accent: auto-derived if not overridden }        │
  │  { Live preview patch shows text-on-background contrast }    │
  │  { Warning if contrast ratio < 4.5:1 (WCAG AA) }           │
  └──────────────────────────────────────────────────────────────┘

  Logo
  ┌──────────────────────────────────────────────────────────────┐
  │  ┌────┐  Current logo    [ Replace ]  [ Remove ]             │
  │  │LOGO│                                                      │
  │  └────┘  PNG, SVG, or WebP · Max 2MB                        │
  └──────────────────────────────────────────────────────────────┘


STEP 5: SAVE AND PREVIEW
────────────────────────────────────────────────────────────────────

  [ Save Changes ]    [ Preview as Customer → ]

  { Preview opens a new tab at /r/[slug] in a read-only preview mode }
  { The preview shows the current saved state, not unsaved changes }
```

---

### 3.3 Workflow B — Contact & Hours Setup

**Tab: Contact** on restaurant card

```
HOURS
────────────────────────────────────────────────────────────────────

  ┌──────────────────────────────────────────────────────────────┐
  │  Mon  [ Open ]  Opens: [11:00 ▾]  Closes: [22:00 ▾]        │
  │  Tue  [ Open ]  Opens: [11:00 ▾]  Closes: [22:00 ▾]        │
  │  Wed  [ Open ]  Opens: [11:00 ▾]  Closes: [22:00 ▾]        │
  │  Thu  [ Open ]  Opens: [11:00 ▾]  Closes: [22:00 ▾]        │
  │  Fri  [ Open ]  Opens: [11:00 ▾]  Closes: [23:00 ▾]        │
  │  Sat  [ Open ]  Opens: [12:00 ▾]  Closes: [23:00 ▾]        │
  │  Sun  [CLOSED]  { grayed out, times hidden }                │
  └──────────────────────────────────────────────────────────────┘

  { Open/Closed is a toggle; Closed hides the time pickers }
  { Times are dropdowns in 30-min increments: 6:00 AM – 3:00 AM }
  { Timezone: derived from restaurants.timezone field (existing) }


CONTACT DETAILS
────────────────────────────────────────────────────────────────────

  Phone          [ (416) 555-1234          ]  { tappable by customer }
  Website        [ https://bellaitalia.ca  ]  { validated URL format }
  Google Maps    [ https://maps.google...  ]  { paste from Maps share link }

SOCIAL LINKS
────────────────────────────────────────────────────────────────────

  Instagram      [ https://instagram.com/bellaitalia ]
  Facebook       [ https://facebook.com/bellaitalia  ]

  { All fields optional; empty = not shown on landing page }
  { URLs auto-prefixed with https:// if user types without it }
```

---

### 3.4 Workflow C — Menu Builder (Enhanced)

**Entry point:** `/admin/menu`

**Layout change:** current page is a single-column list. New layout is two-panel on tablet+, stacked on mobile.

```
┌─────────────────────────────────────────────────────────────────┐
│  Menu Builder             [ Restaurant: Bella Italia ▾ ]        │
├──────────────────────┬──────────────────────────────────────────┤
│  MENUS & SECTIONS    │  ITEMS                                   │
│  (Left panel, 300px) │  (Right panel, fills remaining width)    │
├──────────────────────┤                                          │
│  ┌──────────────┐    │  Starters                                │
│  │ ● Lunch Menu │    │  { section currently selected }          │
│  │   [+] Add    │    │                                          │
│  │   section    │    │  ┌────────────────────────────────────┐  │
│  │              │    │  │ [img] Calamari          $14.00  ⋮  │  │
│  │   ▼ Starters │◄── │  │ [img] Burrata ⭐         $16.00  ⋮  │  │
│  │   ▶ Mains    │    │  │ [img] Soup of the Day    $8.00  ⋮  │  │
│  │   ▶ Pasta    │    │  └────────────────────────────────────┘  │
│  │   ▶ Desserts │    │                                          │
│  │              │    │  [ + Add Item to Starters ]              │
│  ├──────────────┤    │                                          │
│  │ ▶ Dinner     │    │  { ⋮ = drag handle for reordering }      │
│  │ ▶ Drinks     │    │  { ⭐ = is_featured badge }               │
│  └──────────────┘    │                                          │
│                      │                                          │
│  [ + New Menu ]      │                                          │
└──────────────────────┴──────────────────────────────────────────┘
```

**Section actions (right-click or ⋮ menu on section row):**
- Rename section (inline edit)
- Move up / Move down (updates display_order)
- Delete section (confirmation dialog: "Items will not be deleted — they will become unsectioned")
- View deleted sections ("1 deleted section — Restore?")

**Item list interactions:**
- Drag handle (⋮⋮) to reorder items within a section (updates display_order)
- Tap item row → opens Item Edit Panel (slide-in from right)
- ⭐ badge shows if `is_featured = true`
- Grayed item = `available = false` or `active = false`

---

### 3.5 Workflow D — Item Edit Panel

Slides in from right (desktop) or opens as full-screen sheet (mobile). Replaces the current inline editing.

```
ITEM EDIT PANEL
────────────────────────────────────────────────────────────────────

  [ ← Back ]    Edit Item    [ Delete ]

  IMAGE
  ┌─────────────────────────────────────────────────────────────┐
  │  ┌───────────┐  { if image_url set: thumbnail preview }     │
  │  │  [photo]  │  [ Change Image ]  [ Remove ]                │
  │  └───────────┘  { if no image: upload zone }                │
  │                                                             │
  │  ┌─────────────────────────────────────────────────────┐   │
  │  │  📷  Drag image here, or tap to select              │   │
  │  │  JPEG, WebP, or PNG · Recommended 1:1 · Max 5MB    │   │
  │  └─────────────────────────────────────────────────────┘   │
  └─────────────────────────────────────────────────────────────┘

  BASIC DETAILS
  ┌─────────────────────────────────────────────────────────────┐
  │  Name*         [ Burrata                                  ] │
  │  Price*        [ $  16.00                                 ] │  ← CAD, numeric
  │  Section       [ Starters                             ▾  ] │  ← dropdown
  │                  { or "No section (uncategorised)" }        │
  └─────────────────────────────────────────────────────────────┘

  DESCRIPTION
  ┌─────────────────────────────────────────────────────────────┐
  │  Fresh buffalo mozzarella served with heirloom tomatoes,   │
  │  fresh basil, and house-made pesto. Drizzled with extra     │
  │  virgin Sicilian olive oil.                    194 / 400    │
  └─────────────────────────────────────────────────────────────┘
  { Required for featured items; optional otherwise }
  { AI Generate button here in Phase 5+ when ai_features_enabled }

  TAGS
  [ Vegetarian ✓ ] [ Vegan ] [ Gluten-Free ] [ Spicy ]
  [ Popular ✓    ] [ New   ] [ Chef's Pick ]
  { Multi-select chips; selected = filled, unselected = outline }
  { Stored as text[] in menu_items.tags }

  STATUS
  ┌──────────────────────────────────────────────┐
  │  Active              [  ●  ] ON              │  ← active column
  │  Available now       [  ●  ] ON              │  ← available column
  │  Featured on landing [     ] OFF             │  ← is_featured column
  └──────────────────────────────────────────────┘
  { "Featured on landing": max 8 items recommended per restaurant }
  { Warning if >8 items are featured }

  DISPLAY ORDER
  ┌──────────────────────────────────────────────┐
  │  Position in Starters:  3  of 6              │
  │  [ ↑ Move Up ]  [ ↓ Move Down ]              │
  └──────────────────────────────────────────────┘
  { Drag-and-drop on list view is preferred; this is a fallback }

  ─────────────────────────────────────────────────────

  [ Save Changes ]    { primary button }
  [ Cancel ]          { text link }
```

---

### 3.6 Workflow E — Preview Experience

**Button:** "Preview as Customer →" in restaurant profile or menu builder

**Behaviour:**
- Opens `/r/[restaurantSlug]?preview=true` in a new tab
- The `preview` query param (authenticated session only) disables aggressive caching
- Shows the page exactly as a customer would see it
- A non-dismissable preview banner at top: "Preview Mode — Not visible to customers"
- All interactive elements (Play Now, phone dial, map links) are disabled in preview mode

**In-admin preview (alternative):** A collapsible sidebar or overlay panel in the admin that renders a scaled-down (375px) phone-frame mockup of the landing page using current saved data. Lower fidelity but faster to access.

---

## Deliverable 4 — Routing Architecture

### 4.1 Final Recommended Route Table

| Route | Method | Mode | Purpose | Auth | Rendering |
|-------|--------|------|---------|------|-----------|
| `/r/[restaurantSlug]` | GET | 1 | 301 redirect → `/play/[slug]/[promo]` | Public | Server redirect |
| `/r/[restaurantSlug]` | GET | 2 | Restaurant landing page (no promotion) | Public | Server component |
| `/r/[restaurantSlug]` | GET | 3 | Restaurant landing page + Today's Reward card | Public | Server component |
| `/r/[restaurantSlug]/menu` | GET | 2, 3 | Full menu page | Public | Server component |
| `/r/[restaurantSlug]/menu/[menuSlug]` | GET | 2, 3 | Deep link to specific menu tab | Public | Server component |
| `/r/[restaurantSlug]/play` | GET | 1, 3 | Convenience redirect → active promotion play | Public | Server redirect |
| `/play/[restaurantSlug]/[promotionSlug]` | GET | All | Game play page | Public | Client component |
| `/r/[restaurantSlug]/item/[itemId]` | GET | 2, 3 | Item detail page (Phase 5, for sharing/SEO) | Public | Server component |

---

### 4.2 Mode-Aware Routing Logic for `/r/[restaurantSlug]`

```
Server Component: /r/[restaurantSlug]/page.tsx

1. Fetch restaurant by slug (anon key)
2. If restaurant not found → notFound()

3. If experience_mode = 'promotion_only':
     Fetch active promotion (current_promotion_id or latest active)
     If found → redirect('/play/[slug]/[promoSlug]', { status: 301 })
     If not found → render <NoActivePromotionPage restaurant={r} />
     (IDENTICAL to current behavior)

4. If experience_mode = 'menu_only':
     Fetch featured items, menus (no promotion fetch)
     Render <RestaurantLandingPage restaurant={r} promotion={null} />

5. If experience_mode = 'menu_and_promotion':
     Fetch featured items, menus, active promotion, promotion rewards
     Render <RestaurantLandingPage restaurant={r} promotion={p} rewards={rewards} />
```

The critical detail: Mode 1 is an **early return with redirect** at the top of the component. Modes 2 and 3 reach the JSX render path. This keeps the hot path for Mode 1 restaurants identical to today — no extra DB queries, no rendering overhead.

---

### 4.3 `/r/[restaurantSlug]/menu` Route

```
Server Component: /r/[restaurantSlug]/menu/page.tsx

1. Fetch restaurant by slug
2. If experience_mode = 'promotion_only' → redirect('/r/[slug]')
3. Fetch all active menus for restaurant (ordered by display_order)
4. Fetch all active sections for each menu (ordered by display_order)
5. Fetch all active, non-deleted items per section (ordered by display_order)
6. Fetch active promotion (for floating widget, Mode 3 only)
7. Render <MenuPage restaurant={r} menus={menus} promotion={p} />

Default menu selection: first menu by display_order
If [menuSlug] sub-route: select that specific menu, 404 if not found
```

---

### 4.4 `/r/[restaurantSlug]/play` Convenience Route

New short redirect that allows restaurants to print a second QR code that goes directly to the game, even as the promotion slug changes over time.

```
Server Component: /r/[restaurantSlug]/play/page.tsx

1. Fetch restaurant by slug
2. If experience_mode = 'menu_only' → redirect('/r/[slug]')
3. Fetch active promotion via current_promotion_id
4. If found → redirect('/play/[slug]/[promo_slug]')
5. If not found → redirect('/r/[slug]')
```

This is a two-query redirect. It adds 1 DB round-trip compared to the printed `/play/[slug]/[promo]` QR, but means the restaurant can print a permanent `/r/[slug]/play` QR that always works even when the promotion changes.

---

### 4.5 Pros and Cons of Alternative Routing Approaches

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| `/r/[slug]` as universal entry (recommended) | Existing printed QRs work; single namespace | One component handles three very different behaviors | **Chosen** |
| `/[restaurantSlug]` at root | Clean URLs, SEO ideal | Conflicts with `/auth`, `/admin`, `/faq`, `/api`, etc. | Rejected |
| `/go/[slug]` new namespace | No conflicts, clean | Existing QR codes print `/r/[slug]` and stop working | Rejected |
| `/menu/[slug]` separate namespace | Clear semantic | Requires two QR codes printed; no upgrade path for Mode 1 | Phase 5 option |
| Item detail as bottom sheet only | Simpler, no URL | Not shareable; poor SEO for future discovery | Use for MVP; add URL route in Phase 5 |

---

### 4.6 Data Fetching Architecture Per Route

All customer-facing routes use the **anon Supabase key** — no authentication required. All queries must be filtered to `active = true AND deleted_at IS NULL` to prevent exposing draft/deleted content.

The existing `/api/public/promotion-play` API route continues unchanged for game session initialization.

No service role key is needed for any new public routes. The service role key usage remains confined to: `/r/[restaurantSlug]` (Mode 1 redirect, existing), `/api/coupons/issue`, and `/api/public/promotion-play`.

---

## Deliverable 5 — Branding Architecture

### 5.1 Current State

`restaurants.brand_color TEXT DEFAULT '#f97316'` — one hex color used throughout the existing play page.

### 5.2 Extended Color System

Three-color architecture for restaurant branding:

| Column | Purpose | Derives from |
|--------|---------|-------------|
| `brand_color` | Primary brand color | Admin-set (existing) |
| `secondary_color` | Supporting, lighter tones (section headers, hover states) | Auto-derived OR admin override |
| `accent_color` | Highlight, interactive emphasis (tags, featured badges) | Auto-derived OR admin override |

**Auto-derivation rules (computed at render time if not admin-set):**

```
Given primary_color = #f97316 (HSL: 25°, 95%, 53%)

secondary_color = HSL(hue + 0°, sat × 0.4, lightness + 28%)
                = HSL(25°, 38%, 81%)  →  #f5c49e

accent_color    = HSL(hue − 15°, sat × 0.9, lightness − 12%)
                = HSL(10°, 86%, 41%)  →  #c23a0f
```

These are approximations — a proper implementation uses a color library (e.g., `culori` or `tinycolor2`) at render time on the server. The key principle: if an owner only sets one color, the system generates a coherent palette automatically.

---

### 5.3 CSS Custom Properties Architecture

CSS custom properties are injected into the `<html>` element by the restaurant page server component. This scopes all branding to the customer-facing pages without affecting admin UI.

```html
<!-- Injected by RestaurantLandingPage server component -->
<style>
  :root {
    --r-primary:         #f97316;
    --r-primary-fg:      #ffffff;  /* white or black, computed for WCAG AA */
    --r-secondary:       #f5c49e;
    --r-secondary-fg:    #7c2d12;
    --r-accent:          #c23a0f;
    --r-accent-fg:       #ffffff;
    --r-primary-subtle:  rgba(249, 115, 22, 0.08);  /* for card tints */
    --r-primary-border:  rgba(249, 115, 22, 0.3);   /* for borders */
  }
</style>
```

**Contrast computation for `-fg` values:**

WCAG AA requires a contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text. The `-fg` value is computed server-side:

```
relative_luminance(color) → if > 0.179 → use #000000 (dark text)
                           → if ≤ 0.179 → use #ffffff (light text)
```

This single rule handles both dark and light primary colors correctly without any frontend JS.

---

### 5.4 Component Branding Map

| Component | Uses |
|-----------|------|
| Hero overlay card | `var(--r-primary)` at 15% opacity as background tint |
| Restaurant name on hero | `#ffffff` (always white — hero is always dark enough) |
| Today's Reward Card border | `4px solid var(--r-primary)` |
| Reward Card CTA button | `background: var(--r-primary); color: var(--r-primary-fg)` |
| Reward Card checkmarks | `#22c55e` (green — universal success signal, NOT brand color) |
| "View Full Menu" button | `border: 1.5px solid var(--r-primary); color: var(--r-primary)` |
| Menu active tab underline | `border-bottom: 2px solid var(--r-primary)` |
| Active section pill | `background: var(--r-primary); color: var(--r-primary-fg)` |
| Featured item border | `border-left: 3px solid #f59e0b` (gold — universal featured signal) |
| Floating widget | `background: var(--r-primary); color: var(--r-primary-fg)` |
| Tag chips (Gluten-Free etc.) | Fixed semantic colors — NOT brand color (green for dietary, etc.) |
| SpinBite footer | `#9ca3af` (always muted — SpinBite brand never competes) |

---

### 5.5 Dark/Light Compatibility

All customer-facing pages use a white `#ffffff` background. There is no dark mode support in this phase — restaurant menus are universally designed for light contexts. Dark mode is deferred to Phase 5+ as an optional setting per restaurant.

The hero image may be dark or light — the frosted overlay card and the restaurant name use `#ffffff` text, which requires that the hero image is dark enough. Mitigation: apply a `linear-gradient(to bottom, rgba(0,0,0,0) 50%, rgba(0,0,0,0.5) 100%)` overlay on the hero image to guarantee the card readability area has sufficient contrast regardless of photo content.

---

### 5.6 Logo Usage Rules

| Context | Logo treatment |
|---------|---------------|
| Hero overlay card | Circular crop, 48px, white ring shadow |
| Sticky header (menu page) | Circular crop, 32px |
| Floating widget label (future) | Not used — icon only |
| Coupon page (existing) | Not changed in this phase |
| If no logo | Restaurant initials in a circle, `background: var(--r-primary)`, `color: var(--r-primary-fg)` |

---

### 5.7 SpinBite Brand Presence

SpinBite's brand is minimal and unobtrusive on customer-facing pages. The goal: the customer should feel like they are using the restaurant's app, powered by a technology they may not notice.

| Location | SpinBite presence |
|----------|-----------------|
| Landing page footer | "Powered by SpinBite" · 10px · `#d1d5db` |
| Menu page | None |
| Item detail sheet | None |
| Game play page (existing) | Unchanged |
| Coupon page (existing) | Unchanged |

In future, a "Powered by SpinBite" branding toggle in `restaurant_settings` allows white-label accounts to disable even the footer attribution. This is built into the settings architecture now without requiring schema changes.

---

## Deliverable 6 — Future Roadmap Compatibility

### 6.1 AI Menu Import

**Architecture requirement:** The system must support bulk creation of `menu_sections` and `menu_items` from an AI import job without requiring schema changes.

**Current design supports this via:**
- `menu_items.ai_metadata.import_source = 'ai_import'` identifies AI-created items
- `menu_items.ai_metadata.import_job_id` links to the import job
- `menus.menu_type` field can classify imported vs. manual menus
- All existing fields (`name`, `price`, `description`, `tags`, `section_id`) are writable by an import job using the service role

**Future table (not built now):**
```sql
-- ai_import_jobs (Phase 5+)
CREATE TABLE ai_import_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending|processing|complete|failed
  source_type   TEXT NOT NULL,  -- 'pdf_menu'|'url'|'image'|'text'
  source_data   JSONB,          -- raw input
  result_data   JSONB,          -- parsed output before commit
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
```

**Recommendation:** Do not build this table in Phase 2. The `ai_metadata` JSONB envelope on `menu_items` is sufficient to track provenance. Build the import job table when AI import is actually developed.

---

### 6.2 AI Description Generation

**How it fits:** An "AI Generate" button in the Item Edit Panel writes to `menu_items.description` and sets `ai_metadata.description_source = 'ai'`. No new columns needed. The admin can edit or revert.

**Pre-condition flag:** `restaurant_settings` key `ai_features_enabled = true` gates the button in the admin UI. This allows a controlled rollout per restaurant.

**Recommended model:** Claude Sonnet (fast, high quality for short-form food descriptions). The generation call can be a Supabase Edge Function or a Next.js API route.

---

### 6.3 AI Food Image Enhancement / Generation

**How it fits:** AI-enhanced images upload to the same `menu-item-images` bucket under a `/ai/` subfolder. The `menu_items.ai_metadata` tracks `original_image_url` before enhancement and `image_source = 'ai_enhanced'`. The primary `image_url` is replaced with the enhanced version — the customer always sees the best image.

**Rollback:** `ai_metadata.original_image_url` preserves the original upload URL in storage. The admin can revert from the Item Edit Panel.

---

### 6.4 Customer Loyalty

**Current foundation:** `customer_profiles` (phone, consent), `play_sessions` (links to customer_profile_id), `coupon_redemptions` (links to play_session_id). The complete visit history is already captured.

**Future additions (not built now):**
- `customer_profiles.loyalty_tier TEXT DEFAULT 'bronze'`
- `customer_profiles.lifetime_visits INTEGER DEFAULT 0`
- `customer_profiles.lifetime_rewards INTEGER DEFAULT 0`
- A `loyalty_events` table for the audit log

**Recommendation:** The current architecture is loyalty-ready. Do not pre-build loyalty fields — add them in the loyalty phase. The FKs are clean and the data is already being collected.

---

### 6.5 Wallet Integration (Apple Wallet / Google Wallet)

**How it fits:** Add `wallet_pass_url TEXT` to `coupon_redemptions` (future migration). No current schema change needed. The existing coupon QR code is the fallback; the wallet pass is an enhancement.

**Current architecture supports this:** the coupon `code`, `issued_at`, `expires_at`, `promotion_rewards` relationship, and `restaurants.logo_url` are all the data a wallet pass needs.

---

### 6.6 SMS Marketing

**Current foundation:** `customer_profiles.phone_number_e164` (E.164 format) and `customer_profiles.marketing_consent` (boolean).

**Gap for SMS:** A single `marketing_consent` boolean is too coarse for multi-channel compliance. Canadian CASL and US TCPA require channel-specific opt-in.

**Recommendation (Phase 5+):** Add `marketing_consent_channels TEXT[] DEFAULT '{}'` to `customer_profiles`. Values: `'sms'`, `'email'`, `'push'`. The existing `marketing_consent` becomes a legacy field. No change in Phase 2.

---

### 6.7 Contextual Promotions

**Current constraint:** One active promotion per restaurant at a time (enforced by DB trigger).

**Future requirement:** Time-based promotions (lunch deal 11am–2pm), customer-segment promotions (first-time vs. returning), menu-section-specific promotions (dessert discount).

**Recommendation:** The `promotions` table already has `starts_at`/`ends_at` fields. Future work adds:
- `target_hours JSONB` — `{ "from": "11:00", "to": "14:00" }` for time-of-day restrictions
- `target_customer_segment TEXT DEFAULT 'all'` — `'all'|'first_time'|'returning'`
- Remove the one-active-per-restaurant trigger (replace with smart selection logic)

No current schema change needed. The trigger architecture is well-contained and can be dropped/replaced when contextual promotions are built.

---

### 6.8 Architecture Decisions That Prevent Future Rework

| Decision | Why it matters later |
|----------|---------------------|
| `ai_metadata JSONB` on `menu_items` | Every future AI feature writes here — zero additional migrations needed |
| `restaurant_settings` key-value table | Feature flags, A/B settings, per-restaurant configs never require ALTER TABLE |
| `experience_mode` enum on `restaurants` | Adding Mode 4 (e.g., "ordering") is a CHECK constraint change + new render path — clean |
| `tags TEXT[]` with GIN index | Tag-based filtering (search, dietary filter) works without a join table |
| `deleted_at` soft delete | Historical analytics can reference deleted items; restore is free |
| `customer_profiles.phone_number_e164` | Loyalty, SMS, and CRM all anchor to this — the unique identifier is already E.164 |
| `/r/[slug]` as universal entry | Permanent QR codes never expire — the routing logic evolves behind the URL |
| CSS custom property approach | Theme switching, dark mode, white-label branding are CSS-only changes |

---

## Deliverable 7 — Revised Delivery Plan

### 7.1 Phase Breakdown

---

#### Phase 1 — Restaurant Profile Foundation

**Duration:** 6–8 days  
**Complexity:** Low  
**Risk:** Low — all additive DB changes; no public-facing routes modified  
**Dependencies:** None (can start immediately)

**Scope:**
- Apply all 6 database migrations (Section 2.2–2.7)
- Generate updated TypeScript types from Supabase
- Admin: Restaurant card tabs (Profile, Contact, Settings)
- Admin: Experience Mode selector (3-option card UI)
- Admin: Hero image upload component (mirrors logo upload pattern)
- Admin: Description textarea with character counter
- Admin: Color pickers (primary existing, secondary/accent new)
- Admin: Hours editor (7-day grid)
- Admin: Contact fields (website, Instagram, Facebook, Google Maps)
- Admin: `restaurant_settings` write/read for initial keys

**No public route changes.**

**Milestone:** An owner can fully configure their restaurant's experience mode, upload a hero image, set description, hours, colors, and social links from the admin portal.

---

#### Phase 2 — Restaurant Landing Page

**Duration:** 8–12 days  
**Complexity:** Medium  
**Risk:** Medium — `/r/[slug]` routing change must preserve Mode 1 redirect behavior  
**Dependencies:** Phase 1 (needs new DB columns to be populated)

**Scope:**
- Refactor `/r/[restaurantSlug]/page.tsx` from pure redirect to mode-aware server component
- New component: `RestaurantHero` — full-bleed image + frosted overlay card
- New component: `TodaysRewardCard` — reward list + CTA (Mode 3 only)
- New component: `FeaturedItemsStrip` — horizontal scroll of featured menu items
- New component: `ViewMenuCTA` — full-width ghost button
- New component: `RestaurantAbout` — description, hours, contact, social
- New component: `HoursDisplay` — today's hours + accordion for full week + timezone-aware "Open now" badge
- New route: `/r/[restaurantSlug]/play` — convenience redirect to active promotion
- Reward list sourcing logic: filter `promotion_rewards` to top 4–5 displayable items (exclude try-again type, sort by reward_type: free > percent_discount)
- Open Graph meta tags: `og:title`, `og:description`, `og:image` (uses hero_image_url)

**Milestone:** Mode 2 restaurants show a full landing page. Mode 3 restaurants show the landing page with Today's Reward card. Mode 1 restaurants are completely unchanged.

---

#### Phase 3 — Menu Experience

**Duration:** 10–14 days  
**Complexity:** Medium–High  
**Risk:** Medium — item detail bottom sheet is animation-complex; admin menu builder refactor is significant  
**Dependencies:** Phase 1 DB migrations (sections, items enrichment)  
**Parallel:** Can run concurrently with Phase 2 if two developers available

**Scope:**
- Admin: Two-panel menu builder layout
- Admin: Section CRUD (add, rename, reorder, soft-delete, restore)
- Admin: Item Edit Panel (slide-in) replacing current inline editing
- Admin: Image upload for menu items (new bucket)
- Admin: Tags multi-select, featured toggle, available toggle, display order
- New route: `/r/[restaurantSlug]/menu`
- New route: `/r/[restaurantSlug]/menu/[menuSlug]`
- New component: `MenuTabSelector` — multiple menu tabs
- New component: `SectionPillNav` — sticky scrollable section pills with IntersectionObserver
- New component: `MenuItemCard` — horizontal card with image, name, price, tags
- New component: `ItemDetailSheet` — bottom sheet with spring animation, drag-to-dismiss
- Item availability display (Sold Out overlay)
- Promotion placement in Item Detail Sheet (Mode 3: "Win this item free!")
- Fallback states: no image (emoji icon), no sections (flat item list), no items ("Menu coming soon")

**Milestone:** A restaurant with sections, item images, and dietary tags displays a premium mobile menu. Customers can tap any item for full detail. Admin can manage the full menu hierarchy.

---

#### Phase 4 — Promotion Integration

**Duration:** 5–7 days  
**Complexity:** Low–Medium  
**Risk:** Low — new isolated components; no changes to existing game or coupon flows  
**Dependencies:** Phase 2 (landing page must exist) + Phase 3 (menu page must exist)

**Scope:**
- New component: `FloatingRewardWidget` — animated FAB, all animation states
- New component: `TodaysRewardPanel` — bottom sheet variant of reward card
- `FloatingRewardWidget` integration on menu page (Mode 3 only)
- Widget lifecycle: hide after all plays used, hide after player taps "Play Now"
- Widget animation: `shadow-pulse` (4s), `reward-bounce` (15–20s random), `attention-glow` (60s idle)
- `prefers-reduced-motion` respect: all CSS animations disabled
- Update `/play/[slug]/[promo]/page.tsx` — "Browse the Full Menu" card below coupon QR
- Session state: widget dismissed state tracked in React context

**Milestone:** Mode 3 complete. Customer scans QR → landing page → Today's Reward Card → browses menu with ambient floating widget → taps widget → reward panel → plays game → wins → sees "Browse Full Menu" link → returns to menu.

---

#### Phase 5 — Preview, Polish, and SEO

**Duration:** 5–7 days  
**Complexity:** Low  
**Risk:** Low  
**Dependencies:** Phases 2–4

**Scope:**
- Admin "Preview as Customer" button → `/r/[slug]?preview=true` (authenticated preview mode)
- Supabase Image Transform for hero images: serve `?width=800&quality=75` for mobile, `?width=1600&quality=80` for desktop
- Open Graph image for menu page (uses hero as og:image)
- `<link rel="canonical">` on restaurant and menu pages
- `structured-data` JSON-LD for restaurant (Schema.org `Restaurant` type)
- Animation polish: review all transitions on low-end Android devices
- Item detail sheet: keyboard navigation, `aria-modal`, focus trap
- Hours display edge cases: overnight hours (e.g., "11pm – 2am"), holidays (future stub)
- Loading skeleton states for featured items and menu items
- Error boundaries on landing and menu pages

**Milestone:** Production-quality, performant, accessible restaurant experience. Ready for SEO indexing.

---

### 7.2 Critical Path

```
Day 1                                                              Day ~42
│                                                                       │
▼                                                                       ▼
┌──────────────────┐
│ Phase 1          │  6–8 days
│ DB + Admin       │  (blocks everything)
└────────┬─────────┘
         │
         ├──────────────────────────────────────┐
         ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐
│ Phase 2          │  8–12 days       │ Phase 3          │  10–14 days
│ Landing Page     │  ← CRITICAL PATH │ Menu Experience  │  ← PARALLEL
└────────┬─────────┘                  └────────┬─────────┘
         │                                     │
         └─────────────────┬───────────────────┘
                           ▼
                 ┌──────────────────┐
                 │ Phase 4          │  5–7 days  ← CRITICAL PATH
                 │ Promo Integration│
                 └────────┬─────────┘
                          ▼
                 ┌──────────────────┐
                 │ Phase 5          │  5–7 days
                 │ Polish & SEO     │
                 └──────────────────┘

Critical path (single developer):
  Phase 1 → Phase 2 → Phase 4 → Phase 5
  = 24–34 days on critical path

With Phase 3 parallel:
  Total elapsed (two developers):
  Phase 1 (8d) + Phase 2 (12d) + Phase 4 (7d) + Phase 5 (7d) = 34 days
  Phase 3 runs during Phase 2 window: no additional elapsed time

Solo developer total: 34–48 days (7–10 weeks)
Two developer total: 26–36 days (6–8 weeks)
```

---

### 7.3 Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|------------|--------|------------|
| R1 | Mode 1 redirect regression | Medium | Critical | Unit test the early-return redirect path; feature flag the Mode 2/3 render path behind `experience_mode !== 'promotion_only'` |
| R2 | `menu_type` column missing from live DB | Medium | Low | `ADD COLUMN IF NOT EXISTS` in migration; verify on staging before prod |
| R3 | Hero images slow on mobile (10MB) | High | Medium | Supabase Image Transform serves `?width=800` at ~150KB; implement in Phase 5 |
| R4 | Item detail sheet performance on Android | Medium | Medium | Use CSS transforms only; avoid `top`/`left` animation; test on Moto G4 equivalent |
| R5 | Admin menu builder page grows unwieldy | High | Medium | Split into sub-components before Phase 3 begins; establish component file structure first |
| R6 | Owner-set colors fail WCAG contrast | High | Medium | Contrast ratio check at color input time; warn in admin; auto-adjust `-fg` token |
| R7 | Restaurant with no featured items shows empty strip | High | Low | Hide the strip if `is_featured` count = 0; show "View Full Menu" CTA directly |
| R8 | Section pill nav height varies by content | Low | Medium | Compute sticky top offset dynamically using ref heights; test with 1, 3, and 8+ sections |
| R9 | `/r/[slug]/play` used by Mode 2 restaurant accidentally | Low | Low | Redirect to `/r/[slug]` if experience_mode = 'menu_only'; no error shown |
| R10 | `hours` JSONB format evolves over time | Low | Medium | Use a TypeScript type guard on read; default to empty object `{}` if malformed; treat missing days as "hours unknown" |

---

### 7.4 Definition of Done

A phase is complete when:
1. All migrations applied to staging Supabase project and verified
2. TypeScript types regenerated and all type errors resolved
3. New admin UI is fully functional for a test restaurant (CRUD operations verified)
4. All three experience modes tested end-to-end on a physical iPhone (Safari)
5. Lighthouse mobile score ≥ 85 on landing and menu pages
6. No regressions in existing Mode 1 flow (promotion-only restaurant, play page, coupon issuance, validation)
7. `prefers-reduced-motion` verified: no animations play with media query active
8. All new DB queries explain-analyzed for index usage

---

*This document constitutes the complete CTO-level design package for SpinBite Phase 2. No implementation code has been written. Implementation should not begin until this document is reviewed, any open questions resolved, and explicit approval given.*
