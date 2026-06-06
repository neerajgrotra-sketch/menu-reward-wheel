# SpinBite: Restaurant Engagement Platform — UX Architecture
**Branch:** `feature/menu-experience-architecture-review`  
**Date:** 2026-06-05  
**Status:** Proposal — awaiting review and approval before implementation  
**Builds on:** [Menu Experience Architecture Review](./architecture-review-menu-experience.md)

---

## Table of Contents

1. [Strategic Vision](#1-strategic-vision)
2. [Restaurant Mode Architecture](#2-restaurant-mode-architecture)
3. [User Journey Diagrams](#3-user-journey-diagrams)
4. [Restaurant Landing Page Design](#4-restaurant-landing-page-design)
5. [Menu Experience Design](#5-menu-experience-design)
6. [Reward Discovery Concepts](#6-reward-discovery-concepts)
7. [Today's Reward Card — Signature Feature](#7-todays-reward-card--signature-feature)
8. [Floating Reward Widget](#8-floating-reward-widget)
9. [Mobile Wireframes](#9-mobile-wireframes)
10. [Database Implications](#10-database-implications)
11. [Routing Implications](#11-routing-implications)
12. [Phased Implementation Plan](#12-phased-implementation-plan)
13. [Complexity Estimates](#13-complexity-estimates)

---

## 1. Strategic Vision

SpinBite's current identity is a QR promotion platform: scan, spin, win. That model works and must be preserved. But it leaves enormous value on the table.

A customer who scans a QR code is the most engaged customer that restaurant has. They are physically present, they are curious, and they have their phone in hand. Today, SpinBite delivers a game and then loses them. With the right architecture, SpinBite delivers a game and keeps them — as a menu browser, a repeat visitor, and eventually a loyalty profile.

The transformation is not to replace the promotion. It is to wrap it in a restaurant experience that makes the promotion feel like a natural, welcome part of a premium digital storefront.

### The Platform Shift

```
TODAY                              TOMORROW
─────────────────────────────      ─────────────────────────────────────
QR Promotion Platform              Restaurant Engagement Platform

Customer scans                     Customer scans
→ Game                             → Restaurant Landing Page
→ Coupon                           → Browse Menu
→ Gone                             → Discover Promotion (no interruption)
                                   → Play Game
                                   → Win Coupon
                                   → Browse Menu more
                                   → Return visit intent created
```

### Core Design Principles

1. **Menu first, promotion second** — The restaurant experience leads. The game is a reward for engagement, not a gatekeeping interruption.
2. **No forced flows** — Customers who only want to browse should browse freely. Customers who only want to play should play immediately. The system accommodates both.
3. **Promotion discovery, not promotion injection** — The reward is always visible but never demanding. It creates curiosity, not pressure.
4. **Restaurant brand takes center stage** — SpinBite provides the platform; the restaurant's identity (logo, hero, colors, voice) is what the customer sees first.
5. **Excitement without spam** — Inspiration drawn from Duolingo, Starbucks, and McDonald's Rewards, but visually executed at the quality level of OpenTable or a premium restaurant's own website.

---

## 2. Restaurant Mode Architecture

Each restaurant is configured to operate in one of three experience modes. The mode controls the entire customer journey from QR scan to departure.

### Mode 1 — Promotion Only

**Best for:** Restaurants that primarily use SpinBite for promotional campaigns and have no need for a digital menu.  
**Behavior:** Identical to current SpinBite behavior. QR code goes straight to the game.

```
Configured via: restaurants.experience_mode = 'promotion_only'
```

**Customer flow:**
```
QR Scan
  └─► /r/[slug]
        ├── Active promotion found → redirect → /play/[slug]/[promoSlug]
        │     └─► Game → Win → Coupon displayed
        └── No active promotion  → "No promotion active" message
```

**Admin setup required:**
- Promotion configured and active ✓
- No other setup needed ✓

---

### Mode 2 — Menu Only

**Best for:** Restaurants that want a beautiful digital menu accessible by QR but do not run promotions.  
**Behavior:** QR code delivers a premium restaurant landing page and full interactive menu.

```
Configured via: restaurants.experience_mode = 'menu_only'
```

**Customer flow:**
```
QR Scan
  └─► /r/[slug]
        └─► Restaurant Landing Page
              ├── Hero image, description, hours, contact
              ├── Featured menu items (horizontal scroll)
              └── [View Full Menu →]
                    └─► Menu Page (/r/[slug]/menu)
                          ├── Section tabs (Starters, Mains, Desserts...)
                          ├── Item cards with images, descriptions, tags
                          └── Item detail (tap → bottom sheet)
```

**Admin setup required:**
- Restaurant profile complete (hero image, description, hours) ✓
- At least one menu with items ✓
- No promotion required ✓

---

### Mode 3 — Menu + Promotion (Flagship)

**Best for:** Restaurants that want to offer the full SpinBite engagement experience. This is SpinBite's category-defining product.  
**Behavior:** QR code delivers the restaurant experience. The promotion is discovered as part of that experience, not forced as the entry point.

```
Configured via: restaurants.experience_mode = 'menu_and_promotion'
```

**Customer flow:**
```
QR Scan
  └─► /r/[slug]
        └─► Restaurant Landing Page
              ├── Hero image, restaurant info
              ├── ┌─────────────────────┐
              │   │ TODAY'S REWARD CARD │  ← signature feature
              │   │ Win free appetizer  │
              │   │ [Play Now →]        │
              │   └─────────────────────┘
              ├── Featured menu items
              └── [View Full Menu →]
                    └─► Menu Page (/r/[slug]/menu)
                          ├── Full menu with sections and items
                          ├── [🎁] Floating reward widget (bottom-right)
                          │         └─► Tap → Today's Reward slide-up panel
                          │                   └─► [Play Now →] → /play/...
                          └── Item detail bottom sheet

          Path A: Customer plays immediately from landing page
            ├── [Play Now] on Today's Reward Card
            └─► /play/[slug]/[promoSlug] → Win → Coupon
                  └── [View Full Menu →] (link on coupon page)

          Path B: Customer browses menu first, then plays
            ├── [View Full Menu] on landing page
            ├── Browses menu (floating 🎁 visible throughout)
            ├── Taps 🎁 icon (or organic curiosity)
            ├── Today's Reward panel slides up
            ├── [Play Now] → /play/[slug]/[promoSlug]
            └── Win → Coupon → [View Full Menu] returns them
```

**Admin setup required:**
- Restaurant profile complete (hero, description, hours) ✓
- At least one active menu ✓
- At least one active promotion ✓

---

### Mode Selection Decision Matrix

| Situation | Recommended Mode |
|-----------|-----------------|
| Restaurant only runs seasonal promotions, has no need for a menu QR | Mode 1 |
| Restaurant wants a digital menu accessible by QR, no game | Mode 2 |
| Restaurant wants the full experience — menu + game discovery | Mode 3 |
| Restaurant is new to SpinBite, setting up for the first time | Mode 1 (default, upgrade path to Mode 3) |
| Restaurant has a beautifully photographed menu | Mode 2 or Mode 3 |
| Restaurant runs a loyalty-style promotion tied to menu items | Mode 3 |

---

## 3. User Journey Diagrams

### Journey 1 — Mode 1: Promotional Customer (Existing Behavior Preserved)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER                              SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📱 Scans QR code on table tent   ──►  /r/[slug]                   │
│                                        ↓                            │
│                                        Fetch restaurant by slug     │
│                                        Check experience_mode        │
│                                        mode = 'promotion_only'      │
│                                        Find active promotion        │
│                                        ↓                            │
│                                        301 → /play/[slug]/[promo]  │
│  🎮 Sees game screen              ◄──  Game loads with rewards      │
│                                                                     │
│  ▶ Taps "Spin" / plays game       ──►  Weighted reward selected     │
│                                        Coupon code generated        │
│                                        /api/coupons/issue           │
│  🏆 Sees winning coupon           ◄──  Coupon QR displayed          │
│  📲 Shows coupon to staff              Countdown timer starts       │
│  ✅ Staff scans → redeemed        ──►  /admin/validate → redeemed   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Journey 2 — Mode 2: Menu Browser

```
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER                              SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📱 Scans QR code at entrance     ──►  /r/[slug]                   │
│                                        mode = 'menu_only'           │
│                                        Fetch restaurant profile     │
│                                        Fetch featured items         │
│                                        Render landing page          │
│  🍽️ Sees restaurant page          ◄──  Hero, name, hours, location  │
│                                                                     │
│  👆 Taps "View Full Menu"         ──►  /r/[slug]/menu              │
│                                        Fetch menus + sections       │
│                                        Fetch menu_items with images │
│  📜 Browses menu by section       ◄──  Rendered menu page           │
│                                                                     │
│  👆 Taps item (e.g. Burrata)      ──►  Item detail sheet opens     │
│  📖 Reads description, sees image ◄──  Full image, desc, tags       │
│  ✖ Dismisses sheet                     Sheet closes                 │
│                                                                     │
│  📞 Taps phone number on landing  ──►  Native phone dialer opens    │
│     page footer                                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Journey 3 — Mode 3: Menu + Promotion (Path A — Plays First)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER                              SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📱 Scans QR on table tent        ──►  /r/[slug]                   │
│                                        mode = 'menu_and_promotion'  │
│                                        Fetch restaurant + promo     │
│                                        Render landing page          │
│  🍽️ Sees restaurant landing page  ◄──  Hero + info overlay         │
│                                                                     │
│  👀 Notices "Today's Reward" card      Card shows:                  │
│     showing real prizes                  ✅ Free Appetizer          │
│                                          ✅ Free Soft Drink         │
│                                          ✅ 10% Off Order           │
│                                          [🎯 Play Now]              │
│                                                                     │
│  👆 Taps "Play Now"               ──►  Navigate → /play/[slug]/... │
│  🎮 Game loads and plays          ◄──  (Mode 1 flow from here)     │
│  🏆 Wins coupon                        Coupon displayed             │
│                                                                     │
│  👆 Taps "View Full Menu"         ──►  /r/[slug]/menu              │
│     on coupon page                     Browses menu while waiting   │
│                                        for food                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Journey 3 — Mode 3: Menu + Promotion (Path B — Browses First)

```
┌─────────────────────────────────────────────────────────────────────┐
│  CUSTOMER                              SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📱 Scans QR on table tent        ──►  /r/[slug]                   │
│                                        mode = 'menu_and_promotion'  │
│  🍽️ Sees restaurant landing page  ◄──  Hero + Today's Reward card  │
│                                                                     │
│  👆 Skips card, taps "View Menu"  ──►  /r/[slug]/menu              │
│  📜 Browses menu sections         ◄──  Floating 🎁 icon visible     │
│                                        (bottom-right, pulsing)      │
│                                                                     │
│  👆 Taps Calamari item            ──►  Detail sheet opens           │
│  👆 Taps Burrata item             ──►  Another detail sheet         │
│  👆 Taps Salmon item              ──►  Another detail sheet         │
│                                                                     │
│  [15 seconds of browsing]                                           │
│                                        🎁 icon gently bounces      │
│                                                                     │
│  👀 Notices 🎁 icon bouncing           (no popup, no interruption)  │
│  👆 Taps 🎁 icon                  ──►  Today's Reward panel slides  │
│                                        up from bottom               │
│  👀 Reads reward options          ◄──  Panel shows:                 │
│                                          Today's prizes             │
│                                          [🎯 Play Now]              │
│                                          [Continue Browsing ✕]      │
│                                                                     │
│  👆 Taps "Play Now"               ──►  Navigate → /play/[slug]/... │
│  🏆 Wins coupon                        Coupon displayed             │
│  👆 Taps "View Full Menu"         ──►  Returns to menu              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Restaurant Landing Page Design

### Design Philosophy

The landing page should feel like the restaurant's own website, not like a third-party app wrapper. SpinBite's branding is subtle — the restaurant's hero image, logo, colors, and voice are dominant. Think of how OpenTable shows restaurant pages: the platform recedes; the restaurant leads.

Reference quality targets:
- **OpenTable** — Clean, premium, photo-forward restaurant pages
- **Uber Eats restaurant pages** — Information density without clutter
- **Google business profiles** — Hours, phone, address all instantly accessible
- **High-end restaurant sites** — Full-bleed hero, large typography, deliberate whitespace

### Page Structure (Top to Bottom)

```
Section 1: Hero Area           — Full-bleed image, restaurant identity
Section 2: Today's Reward Card — Only in Mode 3 with active promotion
Section 3: Featured Items      — Horizontal scroll, tap-to-detail
Section 4: Menu CTA            — Only in Mode 2 & 3
Section 5: About               — Description, hours, contact, social
```

### Section 1: Hero Area

The hero image spans the full viewport width, approximately 55–65% of viewport height. It uses the restaurant's uploaded hero photo (a table scene, the interior, the food, the exterior — owner's choice).

Over the hero, in the lower-left corner, a translucent frosted-glass information card overlaps the image:
- Restaurant logo (circular, 48px)
- Restaurant name (large, bold, white)
- Cuisine type + city (small, muted white)
- Star rating placeholder (shown greyed: "Reviews coming soon")

The frosted card uses a backdrop-blur with the restaurant's `brand_color` as a tinted base. This gives each restaurant a unique feeling without requiring custom code.

At the very top: a minimal SpinBite wordmark (14px, white, transparent) in one corner — present but unobtrusive. No navigation bar needed on mobile (the landing page is a single destination, not a multi-page app for the customer).

### Section 2: Today's Reward Card

Only shown in Mode 3 when an active promotion exists. Detailed design in [Section 7](#7-todays-reward-card--signature-feature).

Position: immediately below the hero fold. This is the highest-value real estate on the page. The goal is that a customer who scrolls just slightly past the hero immediately sees "Today's Reward" — before anything else.

### Section 3: Featured Items

A horizontal scrolling strip of menu item cards. Shows items where `menu_items.is_featured = true`. Recommended: 4–8 items.

Each card:
- Item photo (square, 140px × 140px)
- Item name (bold, 14px)
- Price (14px, muted)
- One featured tag if applicable (Popular, Chef's Pick, New)

Tap on any card: opens item detail bottom sheet (same component as menu page).

Below the strip: a single CTA button: **[View Full Menu →]**

If no items are marked as featured, this section is hidden and the "View Full Menu" CTA appears standalone.

### Section 4: About

A clean, compact information block:
- Short description (2–3 sentences, max 200 characters)
- 📍 Address (tappable → opens native maps)
- 📞 Phone (tappable → opens native dialer)
- 🌐 Website (tappable → opens browser)
- 🕐 Hours (today's hours highlighted; toggle to show full week)
- Social links: Instagram, Facebook icons (if configured)

### Page Scroll Behavior

The hero area is sticky only partially: as the user scrolls down, the hero parallax-scrolls at 60% speed (the image moves slower than the scroll). The info card transitions from the overlaid position to a compact sticky header at the top of the page showing just the restaurant logo and name. This is the same pattern used by OpenTable and Google Maps.

---

## 5. Menu Experience Design

### Navigation Model

The menu page (`/r/[slug]/menu`) is a distinct route from the landing page, accessed by the "View Full Menu" CTA. The back button returns to the landing page.

If the restaurant has multiple menus (Breakfast, Lunch, Dinner), a horizontal tab bar appears at the top. Active tab is underlined with the restaurant's `brand_color`. The selected menu's sections and items render below.

Below the menu selector: a sticky, horizontally scrolling section pill navigation. Each pill is a section name (Starters, Mains, Pasta, Pizza, Desserts, Drinks). Tapping a pill smooth-scrolls to that section. As the user scrolls the page, the pill for the currently visible section becomes active (highlighted with `brand_color`).

This two-level navigation (menu tabs + section pills) is the same pattern used by Uber Eats, DoorDash, and virtually every successful food delivery app. It is familiar, low-friction, and scales from 2 sections to 20+.

### Item Cards

Each item in a section is a horizontal card:

```
Left:  Item image (80px × 80px, rounded, fallback: cuisine-type icon)
Right: Item name (bold, 15px)
       Short description (2 lines max, 13px, muted)
       Price (bold, 15px, brand_color)
       Tag chips (GF, V, 🌶️, ⭐ Popular, New, Chef's)
```

Featured items (`is_featured = true`) receive a subtle gold border and a ⭐ badge in the top-left of their image.

### Item Detail Bottom Sheet

Tapping any item opens a bottom sheet that slides up from the bottom of the viewport (CSS: `translate-y(0)` with spring animation). The sheet is draggable down to dismiss.

Sheet contents:
- Full-width item photo (200px height, object-fit: cover)
- Item name (large, bold)
- Price
- All dietary/tag chips
- Full description text (no truncation)
- ── Pairs well with ── (optional: curated or algorithm-driven cross-sells, future feature)
- Dismiss handle (or [✕] button top-right)

The background behind the sheet dims to 40% opacity. Tap outside to dismiss.

### Availability States

Items can be unavailable for a session (e.g., sold out, not served at this time of day). Available states to display:
- **Available** — Normal display
- **Unavailable** — Item card shown grayed out with "Not available right now" overlay
- (Future) **Time-limited** — "Served until 11am" badge

---

## 6. Reward Discovery Concepts

### The Core Problem

Modal popups, interstitials, and forced game screens create negative emotion. Research from Duolingo, Starbucks, and behavioral UX studies consistently shows that intrusive interruptions hurt conversion and brand perception, even when they deliver value. The customer must feel like they are choosing to engage.

The challenge: make the promotion impossible to miss without making it impossible to avoid.

### Option A — Floating Gift Icon (Ambient Reminder)

**Concept:** A small, branded floating action button in the bottom-right corner of the menu page. Visible at all times while browsing. Does not interrupt; waits for the customer to notice.

**Visual:** A circular button (52px diameter) with a subtle drop shadow, using the restaurant's `brand_color`. Icon: 🎁 or a custom SpinBite prize icon. A small "1" notification badge in the top-right of the circle.

**Animation:** Three states:
1. **Resting** — visible, gentle shadow pulse every 4 seconds (scale 1.0 → 1.04 → 1.0)
2. **Attention** — every 15–20 seconds, a gentle bounce (translateY -8px → 0) lasting 600ms
3. **Highlighted** — after 60 seconds without interaction, the icon glows briefly (box-shadow expands) to recapture attention

**On tap:** Today's Reward panel slides up from the bottom (see [Section 8](#8-floating-reward-widget))

**Pros:** Non-intrusive, persistent, familiar pattern (WhatsApp FAB, etc.)  
**Cons:** Some users may not notice it; small tap target on small screens

---

### Option B — Reward Badge in Section Header

**Concept:** A special "Promotion" section injected at the top of the menu (before Starters). Styled like a menu section but with a distinct background (gradient using `brand_color`).

```
┌─────────────────────────────────┐
│ 🎯 Tonight's Promo              │
│ ─────────────────────────────── │
│ [img] Free Appetizer            │
│       Spin to win!  [Play →]    │
│                                 │
│ [img] Free Soft Drink           │
│       Spin to win!  [Play →]    │
└─────────────────────────────────┘
```

**Pros:** Feels native to the menu; the promotion rewards appear as if they are actual menu items  
**Cons:** Could feel like advertising within the menu; potential confusion about whether items can be ordered

---

### Option C — Sticky Reward Widget at Bottom

**Concept:** A thin persistent banner anchored to the very bottom of the viewport, above the device's home indicator. Always visible, never expands unless tapped.

```
┌─────────────────────────────────┐
│ 🎯 Today's Reward  [Play Now →] │  ← 48px tall, brand_color bg
└─────────────────────────────────┘
```

**Pros:** Impossible to miss; low visual footprint; tapping is clear  
**Cons:** Takes up permanent screen space; may be confused with a cookie banner or app bar

---

### Option D — Menu-Integrated Promotion Cards

**Concept:** Promotion cards are inserted inline within the menu scroll — e.g., between the Starters section and the Mains section. They look like menu items but have a distinct visual treatment.

```
── Starters ─────────────────────

 [item] [item] [item]

┌─────────────────────────────────┐
│ 🎁 Spin to Win a Free Starter! │  ← inline card, brand accent
│ Play our game with your meal.   │
│             [Spin Now →]        │
└─────────────────────────────────┘

── Mains ────────────────────────
```

**Pros:** Discovered naturally as the customer scrolls; no separate UI element needed  
**Cons:** Interrupts menu flow; sophisticated customers may scroll past ad-like content

---

### Recommended Combination: Card + Icon

The strongest approach combines two mechanisms with different discovery moments:

1. **Today's Reward Card on the landing page** — delivers explicit, context-rich information at the highest-traffic point of the journey (immediately after QR scan). Customers who want to play do so immediately. Customers who want to browse first continue without friction.

2. **Floating Gift Icon on the menu page** — provides a persistent, non-intrusive ambient reminder during browsing. Customers who forgot about the promotion rediscover it at their own pace. The icon never blocks content.

This two-touch approach mirrors Starbucks Rewards (stars visible on home screen) and McDonald's app (deals accessible without being forced). The promotion is always one tap away, never in the way.

---

## 7. Today's Reward Card — Signature Feature

The Today's Reward Card is SpinBite's most important new UI element. It must communicate three things immediately:
1. There is a game you can play
2. These are the real prizes you can win
3. It takes one tap to start

### Design Specifications

**Placement:** On the restaurant landing page, immediately below the hero image fold. The customer sees this within 1–2 seconds of the page loading.

**Card anatomy:**

```
┌────────────────────────────────────────┐
│  🎯  Today's Reward                    │  ← icon + title, brand_color
│ ─────────────────────────────────────  │
│  Play our game and you could win:      │  ← invitation language
│                                        │
│   ✓  Free Appetizer                    │  ← actual reward labels
│   ✓  Free Soft Drink                   │     pulled from promotion_rewards
│   ✓  10% Off Your Order               │
│   ✓  BOGO Entrée                       │
│                                        │
│   ⏱  Valid 20 minutes after winning   │  ← coupon_expiry_minutes
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   🎯  Spin the Wheel to Win      │  │  ← CTA, full-width button
│  └──────────────────────────────────┘  │     brand_color background
│                                        │
│  Free to play · No purchase required  │  ← subtle sub-copy
└────────────────────────────────────────┘
```

**Visual style:**
- Card background: white with a very subtle top border in `brand_color` (4px)
- Alternately: a very light tint of `brand_color` (5–8% opacity) as background
- Title: `brand_color`, medium weight
- Reward list: dark text, ✓ checkmarks in `brand_color` or green
- CTA button: `brand_color` background, white text, full-width, 48px height
- Bottom sub-copy: 11px, muted gray
- Border radius: 16px (matches card style of DoorDash/Uber Eats)
- Drop shadow: soft (0 4px 16px rgba(0,0,0,0.08))

**Content source:**
- Reward labels: pulled from `promotion_rewards` for the active promotion, filtered to `active = true`, ordered by `display_order`
- Show max 4–5 rewards (most restaurants have 6–10 on the wheel; show the best/most desirable)
- Expiry text: derived from `promotions.coupon_expiry_minutes`
- CTA label: derived from the game type ("Spin the Wheel", "Open a Mystery Box", "Scratch Your Card")

**Language tone:**
- "Play our game and you could win:" — invitation, not demand
- NOT: "WIN FREE FOOD!!!" — too aggressive
- NOT: "Exclusive limited offer" — fake urgency
- YES: "Tonight we're offering our guests..." — warm, restaurant-voice appropriate

### Reward Count Decision

Show between 3 and 5 rewards on the card. If the promotion has more rewards (which is likely — the wheel needs 6–10 segments), show only the most attractive ones.

Selection logic for display:
1. Show rewards where `reward_type IN ('free', 'percent_discount')` first
2. Within that, sort by visual appeal: free > discount (highest value first) > try_again
3. Never show "Try Again" segment on the card (deflating)
4. Cap at 5 visible items; if there are more, do not show a count ("and 3 more") — simplicity wins

---

## 8. Floating Reward Widget

### Position and Sizing

Fixed position: `bottom: 24px; right: 20px; z-index: 50`  
Size: 56px × 56px circular button  
Shadow: `0 4px 20px rgba(0,0,0,0.2)`

### Anatomy

- **Base circle:** `brand_color` background
- **Icon:** 🎁 at 24px, white — or a custom SpinBite SVG prize icon
- **Badge:** Red circle (16px) at top-right of the button, white "1" text at 10px

### Animation States

```
State 1: RESTING (default)
  box-shadow: 0 4px 20px rgba(brand_color, 0.3)
  No movement
  CSS: @keyframes shadow-pulse — subtle glow cycle every 4s

State 2: BOUNCE (every 15–20s, randomized to avoid feeling mechanical)
  translateY: 0 → -10px → 2px → 0
  Duration: 600ms
  Easing: cubic-bezier(0.36, 0.07, 0.19, 0.97)

State 3: ATTENTION (after 60s without tap, if customer is still on page)
  scale: 1.0 → 1.15 → 1.0
  glow: box-shadow expands from 20px to 40px blur
  Duration: 800ms, fires once, then returns to RESTING

State 4: DISMISSED (optional, if customer taps ✕ on slide panel)
  Slide down and out: translateY(+80px), opacity 0
  Duration: 300ms
  Does not return until customer navigates away and back
```

### Today's Reward Slide Panel (on icon tap)

When the floating icon is tapped, a panel slides up from the bottom of the viewport:

- Drag handle at top (centered 32px × 4px pill)
- Panel height: ~50–60% of viewport
- Background: white
- Backdrop: 40% black overlay behind panel
- Dismiss: drag down, tap backdrop, or tap ✕

Panel contents mirror the Today's Reward Card from the landing page:
- Title: "Today's Reward"
- Reward list (same content as card)
- [Play Now] CTA button (full-width, brand_color)
- [Continue Browsing] text link (gray, 12px) — explicit no-pressure option

After the customer taps "Play Now":
- Panel closes
- Navigate to `/play/[restaurantSlug]/[promotionSlug]`
- Floating icon disappears (they've chosen to play)

---

## 9. Mobile Wireframes

All wireframes are designed for 390px viewport width (iPhone 14 reference). The design system is mobile-first; desktop/tablet is a wider-centered version of the same layout.

### W1 — Restaurant Landing Page (Mode 3)

```
┌─────────────────────────────────────┐
│                               [≡]  │  ← 44px nav bar, transparent
│                                     │
│  ┌─────────────────────────────────┐│
│  │                                 ││
│  │                                 ││
│  │        [HERO PHOTO]             ││  60vh full-bleed
│  │                                 ││  (restaurant interior/food)
│  │                                 ││
│  │  ┌───────────────────────────┐  ││
│  │  │ [●] Bella Italia          │  ││  ← frosted glass overlay
│  │  │ ★★★★☆  Italian · Toronto  │  ││    bottom-left of hero
│  │  └───────────────────────────┘  ││
│  └─────────────────────────────────┘│
│                                     │
│ ┌───────────────────────────────────┐│
│ │ 🎯 Today's Reward                ││  ← brand_color top border
│ │ ─────────────────────────────    ││
│ │ Play our game and win:           ││
│ │                                  ││
│ │   ✓  Free Appetizer              ││
│ │   ✓  Free Soft Drink             ││
│ │   ✓  10% Off Your Order          ││
│ │   ✓  BOGO Entrée                 ││
│ │                                  ││
│ │   ⏱  Valid 20 min after winning  ││
│ │                                  ││
│ │ ┌──────────────────────────────┐ ││
│ │ │    🎯  Spin the Wheel        │ ││  ← brand_color, full-width
│ │ └──────────────────────────────┘ ││
│ │                                  ││
│ │ Free to play · No purchase needed││  ← 11px muted
│ └───────────────────────────────────┘│
│                                     │
│ Featured Items ──────────────────── │
│                                     │
│ ◄  [img]    [img]    [img]    [img  │  ← horizontal scroll
│    Burrata  Salmon   Tiramisu  Pasta│    140×140px cards
│    $16      $28      $9        $18  │
│                                     │
│         [  View Full Menu →  ]      │  ← ghost button, brand border
│                                     │
│ ── About ─────────────────────────  │
│ Authentic Italian cuisine serving   │
│ the finest seasonal ingredients...  │
│                                     │
│ 📍 123 Queen St W, Toronto    [→]  │  ← tappable → maps
│ 📞 (416) 555-1234              [→]  │  ← tappable → dialer
│ 🌐 bellaitalia.ca              [→]  │  ← tappable → browser
│                                     │
│ Today: 11am – 10pm  [See all hours] │
│                                     │
│ [📸 Instagram]  [👥 Facebook]       │
│                                     │
│ ─────────────────────────────────── │
│ Powered by SpinBite  ·  spinbite.ca │  ← 10px, muted footer
└─────────────────────────────────────┘
```

---

### W2 — Menu Page

```
┌─────────────────────────────────────┐
│ ←  [●] Bella Italia           [🎁] │  ← sticky header: back + icon
│                                     │   brand_color FAB bottom-right
│ [Lunch ●] [Dinner] [Drinks]        │  ← menu selector tabs
├─────────────────────────────────────┤
│ [Starters] [Mains] [Pasta] [Pizza] │  ← sticky section pills, scroll
├─────────────────────────────────────┤
│                                     │
│ Starters ────────────────────────── │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  [img]  Calamari        $14.00  │ │  ← item card
│ │   80px  Crispy rings,          │ │
│ │         lemon aioli            │ │
│ │         [GF] [Popular]         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │⭐[img]  Burrata          $16.00  │ │  ← featured: gold border + ⭐
│ │   80px  Buffalo mozzarella,    │ │
│ │         heirloom tomato        │ │
│ │         [V] [New]              │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Mains ──────────────────────────── │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  [img]  Grilled Salmon  $28.00  │ │
│ │   80px  Atlantic salmon,       │ │
│ │         lemon butter           │ │
│ │         [GF]                   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │  [░░░]  Osso Buco        $34.00  │ │  ← item with no image
│ │         (no image — icon shown) │ │    uses cuisine-type icon
│ │         Braised veal shank...  │ │
│ └─────────────────────────────────┘ │
│                                     │
│                                     │
│                              ┌────┐ │
│                              │ 🎁 │ │  ← floating reward widget
│                              │ ①  │ │    fixed bottom-right
│                              └────┘ │
└─────────────────────────────────────┘
```

---

### W3 — Item Detail Bottom Sheet

```
┌─────────────────────────────────────┐
│ Menu Page (dimmed 40%)              │
│  ...                                │
│  ─────────────────────────────────  │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─-┤  ← drag handle
│             ────                    │
├─────────────────────────────────────┤
│                              [✕]   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │                                 │ │
│ │         [ITEM PHOTO]            │ │  ← 200px height, full-width
│ │                                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Burrata                    $16.00   │  ← name + price
│ ⭐ Featured                         │
│                                     │
│ [Vegetarian]  [New]                 │  ← tag chips
│                                     │
│ Fresh buffalo mozzarella served     │  ← full description
│ with heirloom tomatoes, fresh       │
│ basil, and house-made basil pesto.  │
│ Drizzled with Sicilian olive oil.   │
│                                     │
│ ── Pairs well with ──────────────── │  ← future: curated cross-sells
│ 🍷 House Chianti         $9.00     │
│ 🥗 Garden Salad          $12.00    │
│                                     │
└─────────────────────────────────────┘
```

---

### W4 — Today's Reward Slide Panel (from floating icon tap)

```
┌─────────────────────────────────────┐
│ Menu Page (dimmed 40%)              │
│  ...                                │
│                                     │
├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─-┤
│             ────                    │  ← drag handle
├─────────────────────────────────────┤
│ 🎯  Today's Reward           [✕]   │  ← brand_color icon + dismiss
│                                     │
│ Play our game and you could win:    │
│                                     │
│   ✓  Free Appetizer                 │
│   ✓  Free Soft Drink                │
│   ✓  10% Off Your Order             │
│   ✓  BOGO Entrée                    │
│                                     │
│   ⏱  Valid 20 minutes after winning │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │      🎯  Spin the Wheel         │ │  ← brand_color CTA
│ └─────────────────────────────────┘ │
│                                     │
│          Continue Browsing          │  ← text link, no pressure
│                                     │
│    Free to play · No purchase needed│
└─────────────────────────────────────┘
```

---

### W5 — Coupon Page with "View Full Menu" Link

```
┌─────────────────────────────────────┐
│ [●] Bella Italia                    │  ← minimal header
│                                     │
│ 🏆 You Won!                         │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Free Appetizer                  │ │
│ │ Show this code to your server   │ │
│ │                                 │ │
│ │       [QR CODE IMAGE]           │ │
│ │                                 │ │
│ │       CODE: K7MN3P              │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ⏱  Valid until 8:45 PM (18 mins)   │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ┄ Terms & Conditions ┄          │ │
│ │ Valid once. Show to staff.       │ │
│ │ Cannot be combined with...      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ─────────────────────────────────── │
│ While you wait...                   │  ← bridge to menu
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🍽️  Browse the Full Menu →      │ │  ← ghost card, tappable
│ └─────────────────────────────────┘ │
│                                     │
│ ─────────────────────────────────── │
│ Powered by SpinBite                 │
└─────────────────────────────────────┘
```

---

### W6 — Mode 1 Remains Unchanged

For Mode 1 restaurants, the customer experience from QR scan through to coupon display is **identical to the current system**. No new screens. The existing `/play/[slug]/[promo]` page is the complete experience.

---

## 10. Database Implications

### 10.1 New Fields on `restaurants`

```sql
ALTER TABLE restaurants
  ADD COLUMN experience_mode   TEXT    NOT NULL DEFAULT 'promotion_only'
                               CHECK (experience_mode IN (
                                 'promotion_only',
                                 'menu_only',
                                 'menu_and_promotion'
                               )),
  ADD COLUMN hero_image_url    TEXT,
  ADD COLUMN description       TEXT,            -- restaurant bio, max 500 chars
  ADD COLUMN hours             JSONB,           -- structured hours (see below)
  ADD COLUMN website_url       TEXT,
  ADD COLUMN instagram_url     TEXT,
  ADD COLUMN facebook_url      TEXT,
  ADD COLUMN google_maps_url   TEXT;
```

**`hours` JSONB structure:**
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

Using JSONB for hours avoids a separate 7-row hours table while remaining queryable. Today's hours can be computed by the server at render time based on the day of the week.

### 10.2 New Storage Bucket: `restaurant-heroes`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant-heroes',
  'restaurant-heroes',
  true,
  10485760,  -- 10 MB (hero images are large)
  ARRAY['image/jpeg', 'image/webp', 'image/png']
);
```

Upload path: `{user.id}/{restaurant.id}/{timestamp}-hero.{ext}`  
Stored in: `restaurants.hero_image_url`

Performance note: Hero images should ideally be cropped to landscape ratio (16:9 or 3:2) by the owner before upload. Image transformation via Supabase Storage Transform API can be used at render time to serve appropriately sized versions (`?width=800&quality=80`).

### 10.3 Menu Schema Additions

All items below are also proposed in the separate [Menu Experience Architecture Review](./architecture-review-menu-experience.md). They are included here for completeness because Mode 2 and Mode 3 depend on them.

**New table: `menu_sections`**
```sql
CREATE TABLE menu_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id       UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Additions to `menu_items`:**
```sql
ALTER TABLE menu_items
  ADD COLUMN section_id    UUID REFERENCES menu_sections(id) ON DELETE SET NULL,
  ADD COLUMN image_url     TEXT,
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN is_featured   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tags          TEXT[] DEFAULT '{}';
```

**Addition to `menus`:**
```sql
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_type    TEXT DEFAULT 'all_day',
  ADD COLUMN               display_order INTEGER NOT NULL DEFAULT 0;
```

### 10.4 What Does NOT Need to Change

- `promotions` table — unchanged; `promotion_rewards` contain all reward display information
- `play_sessions`, `coupon_redemptions` — unchanged
- `games` table — unchanged
- `customer_profiles` — unchanged
- All existing triggers — unchanged

### 10.5 Data Volume Considerations

`restaurants.hours` JSONB is compact (~200 bytes per row). At 10,000 restaurants, the overhead is trivial. Hero images are stored in object storage (no DB impact). The `menu_sections` table adds one row per section per menu — a typical restaurant with 3 menus × 6 sections = 18 rows. Negligible.

---

## 11. Routing Implications

### 11.1 Recommended Route Architecture

The key constraint: existing printed QR codes point to `/r/[restaurantSlug]`. This URL cannot be abandoned or changed.

The recommended approach: make `/r/[restaurantSlug]` mode-aware. Instead of always being a pure server-side redirect, it becomes a **mode router**:

```
/r/[restaurantSlug]
  ├── Mode 1 (promotion_only)
  │     ├── Active promotion found → 301 redirect → /play/[slug]/[promoSlug]
  │     └── No active promotion   → "No promotion active" inline message
  │
  ├── Mode 2 (menu_only)
  │     └── Render full restaurant landing page (no game elements)
  │
  └── Mode 3 (menu_and_promotion)
        ├── Active promotion found → Render landing page + Today's Reward card
        └── No active promotion   → Render landing page (menu only, no card)
```

For Mode 2 and 3, `/r/[restaurantSlug]` transforms from a redirect into a fully rendered server component page. The URL itself becomes the restaurant's permanent digital home.

### 11.2 New Routes

| Route | Purpose | Auth | Rendering |
|-------|---------|------|-----------|
| `/r/[restaurantSlug]` | Mode router → landing page or redirect | Public | Server component |
| `/r/[restaurantSlug]/menu` | Full menu page | Public | Server component |
| `/r/[restaurantSlug]/menu/[menuSlug]` | Specific menu (optional deep link) | Public | Server component |

### 11.3 Unchanged Routes

| Route | Status |
|-------|--------|
| `/play/[restaurantSlug]/[promotionSlug]` | Unchanged — game play page |
| `/r/[restaurantSlug]` (Mode 1) | Unchanged — redirect behavior preserved |
| `/admin/*` | Unchanged — all admin routes |
| `/super-admin/*` | Unchanged |

### 11.4 Admin Routes Needed

| Route | Purpose |
|-------|---------|
| `/admin/restaurant-profile` | Edit hero image, description, hours, social links, experience mode |

This could be a new tab on the existing `/admin/restaurants` page rather than a separate route.

### 11.5 URL Design Principles

- `/r/` prefix is preserved for all customer-facing restaurant URLs. Printed QR codes always work.
- `/r/[slug]/menu` is the menu deep link. This can be QR-coded separately if the restaurant wants a direct menu link.
- `/play/` prefix is preserved for game routes.
- No slug conflicts with existing top-level routes (auth, admin, faq, etc.).

### 11.6 SEO Considerations

For Mode 2 and 3 restaurants, `/r/[restaurantSlug]` and `/r/[restaurantSlug]/menu` become fully rendered server pages with proper `<title>`, `<meta description>`, and Open Graph tags. This means restaurant pages could be discoverable via Google search — a future marketing advantage ("find Bella Italia on SpinBite").

---

## 12. Phased Implementation Plan

### Phase 0 — Prerequisites (Parallel with planning)

Complete the pending items from the [Menu Experience Architecture Review](./architecture-review-menu-experience.md) that this proposal builds on:

1. Confirm/add `menu_type` column to `menus` (the schema drift risk)
2. Create `play_sessions` and `coupon_redemptions` CREATE TABLE migrations (the missing migration risk)
3. Generate current Supabase schema as baseline

**Effort:** 2–3 days. No user-facing changes.

---

### Phase 1 — Restaurant Profile Expansion

**Goal:** Give restaurants the ability to configure their mode and upload a hero image. No public-facing changes yet.

**DB changes:**
- Add `experience_mode`, `hero_image_url`, `description`, `hours`, social URL columns to `restaurants`
- Create `restaurant-heroes` storage bucket + RLS policies

**Admin changes:**
- Add "Restaurant Experience" section to `/admin/restaurants` (or new tab):
  - Mode selector: [Promotion Only] [Menu Only] [Menu + Promotion]
  - Hero image upload (mirrors logo upload pattern; 10MB, JPEG/WebP/PNG)
  - Description textarea (max 500 chars with counter)
  - Hours editor (7-day grid: open/close time or "Closed" toggle per day)
  - Social links: Website, Instagram, Facebook, Google Maps
- Mode selector shows brief description of what each mode delivers

**Public changes:** None — `/r/[slug]` behavior unchanged at this stage.

**Effort:** 5–7 days  
**Risk:** Low — additive DB columns, new admin UI section only

---

### Phase 2 — Restaurant Landing Page

**Goal:** `/r/[slug]` becomes a real page for Mode 2 and Mode 3 restaurants.

**Route changes:**
- Refactor `/r/[restaurantSlug]/page.tsx` from a pure redirect to a mode-aware server component
- Mode 1 behavior: unchanged (redirect to promotion)
- Mode 2 / Mode 3: render landing page

**New components:**
- `RestaurantHero` — full-bleed hero image with frosted-glass restaurant info overlay
- `TodaysRewardCard` — reward card component (Mode 3 only)
- `FeaturedItemsStrip` — horizontal scroll with item cards
- `RestaurantAbout` — hours, contact, social section
- `HoursDisplay` — renders today's hours prominently; toggle for full week

**Data fetching:**
- `restaurants` — name, slug, brand_color, logo_url, hero_image_url, description, hours, contact fields
- `promotions` — active promotion (for Today's Reward card content)
- `promotion_rewards` — reward labels for the card (top 4–5 by display_order / reward_type)
- `menu_items` — featured items (is_featured = true, limit 8)
- All fetched server-side with the anon key — no authentication required

**Effort:** 8–12 days  
**Risk:** Medium — modifying the existing `/r/[slug]` route requires careful handling of the Mode 1 redirect path to avoid regressions

---

### Phase 3 — Menu Experience

**Goal:** `/r/[slug]/menu` delivers a best-in-class digital menu.

**DB changes:**
- `menu_sections` table (new)
- `menu_items`: add `section_id`, `image_url`, `display_order`, `is_featured`, `tags`
- `menu-item-images` storage bucket + RLS
- `menus`: add `slug`, `display_order`

**Admin changes:**
- Enhance `/admin/menu/page.tsx`:
  - Sections CRUD (add, rename, delete, reorder)
  - Item form: expose description, section assignment, tags, featured toggle, image upload, display_order
  - Image upload per item (mirrors logo upload pattern)

**New route:** `/r/[restaurantSlug]/menu/page.tsx`

**New components:**
- `MenuTabSelector` — horizontal tabs for multiple menus
- `SectionPillNav` — sticky scrollable section navigator
- `MenuItemCard` — horizontal item card with image, name, price, description, tags
- `ItemDetailSheet` — bottom sheet with full item detail
- `MenuItemImageUploader` — image upload control for admin

**Effort:** 10–15 days  
**Risk:** Medium — menu admin page rework is significant; item detail bottom sheet has animation complexity

---

### Phase 4 — Floating Reward Widget and Mode 3 Integration

**Goal:** Complete the Mode 3 experience with the floating icon, slide panel, and full customer journey integration.

**New components:**
- `FloatingRewardWidget` — animated FAB with pulse/bounce animations
- `TodaysRewardPanel` — bottom sheet variant of the Today's Reward card
- Update `/play/[slug]/[promo]/page.tsx` — add "Browse the Full Menu" card on coupon display

**Behavior:**
- FloatingRewardWidget shows only in Mode 3 when an active promotion exists
- Widget persists across sections while browsing
- Slide panel mirrors landing page card content
- Coupon page "View Full Menu" links to `/r/[slug]/menu`

**Effort:** 5–7 days  
**Risk:** Low — new isolated components; no changes to existing game or coupon flows

---

### Phase 5 — Admin Mode Preview and Polish

**Goal:** Admin can preview the customer experience for their configured mode before going live.

**New admin feature:**
- "Preview Experience" button in `/admin/restaurants`
- Opens a read-only preview panel showing what the customer sees for the restaurant's current mode configuration
- Mode selector in admin triggers preview update in real time

**Additional polish:**
- Restaurant landing page Open Graph meta tags (for social sharing)
- Supabase Image Transformation for hero image serving (resize for mobile vs. desktop)
- Section pill navigation smooth-scroll with IntersectionObserver active-section tracking
- Hours display: "Open now" / "Closes in 2h" / "Opens at 5pm" computed from server time + timezone

**Effort:** 5–8 days  
**Risk:** Low

---

## 13. Complexity Estimates

### Per-Phase Effort Summary

| Phase | Description | Effort | Risk | Dependency |
|-------|-------------|--------|------|------------|
| Phase 0 | Schema cleanup + baseline | 2–3 days | Low | None |
| Phase 1 | Restaurant profile expansion | 5–7 days | Low | Phase 0 |
| Phase 2 | Restaurant landing page | 8–12 days | Medium | Phase 1 |
| Phase 3 | Menu experience | 10–15 days | Medium | Phase 1 |
| Phase 4 | Floating widget + integration | 5–7 days | Low | Phase 2 + 3 |
| Phase 5 | Admin preview + polish | 5–8 days | Low | Phase 2 + 3 |

**Total range:** 35–52 engineering days (7–10 weeks for one developer)

Phases 2 and 3 can be developed in parallel if two developers are available, reducing total elapsed time to approximately 5–7 weeks.

---

### Complexity Drivers

**Highest complexity:**
- Mode-aware routing in `/r/[slug]` — this route currently does one thing (redirect); making it mode-aware requires careful conditional logic and regression protection for Mode 1 restaurants
- Item detail bottom sheet — gesture-driven drag-to-dismiss with spring animation is non-trivial to implement well on mobile
- Admin menu builder enhancement — the existing page is monolithic; adding sections, images, and ordering will require splitting into sub-components

**Medium complexity:**
- Today's Reward card — content sourcing (selecting the right 4–5 rewards from up to 10) requires product logic decisions
- Floating widget animation — CSS animation states must be smooth and not cause layout jank on lower-end devices
- Hours display — timezone-aware "Open now" computation requires server-side clock + restaurant timezone field

**Low complexity:**
- Hero image upload — pattern directly mirrors existing logo upload in `/admin/restaurants`
- Mode selector in admin — straightforward dropdown with DB column update
- "Browse the Full Menu" link on coupon page — a single link addition

---

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `/r/[slug]` refactor breaks Mode 1 redirect | Medium | High | Comprehensive regression test; Mode 1 path first, guard with `if experience_mode === 'promotion_only' return redirect(...)` at top of component |
| `menu_type` column missing from live DB | Medium | Low | Use `ADD COLUMN IF NOT EXISTS` in Phase 3 migration |
| Hero images not optimized by restaurant owners (10MB uploads serving slowly) | High | Medium | Use Supabase Image Transforms at render time; serve `?width=800&quality=75` |
| Today's Reward card content selection logic is debated | Low | Low | Start with: show all rewards by display_order, cap at 5, exclude try_again type |
| Floating widget animation causes CPU/battery issues on low-end Android | Low | Medium | Use CSS animations only (no JS requestAnimationFrame); respect `prefers-reduced-motion` |
| Admins don't set up profiles (Mode 2/3 pages look empty) | High | Medium | Show a "Complete your profile" CTA in admin dashboard if mode is not 'promotion_only' and hero/description is missing; gate the mode selector: can only switch to Mode 2/3 after completing required fields |

---

### What Stays Exactly the Same

These are not touched in any phase:

- All existing game runtimes (Spin Wheel, Mystery Box, Scratch Card, etc.)
- Promotion builder (`/admin/promotions/[id]/builder`)
- Coupon issuance API
- Coupon validation (`/admin/validate`)
- Session recovery logic
- Customer identity capture
- Super Admin game lab
- RLS policies on promotions, promotion_rewards, coupons
- Print kit generation

Mode 1 restaurants experience zero change. The entire new system is layered on top, not in replacement of, what exists.

---

*This document is a design and architecture proposal only. No implementation code has been written. All database changes, routes, and components described here require engineering review and approval before development begins.*
