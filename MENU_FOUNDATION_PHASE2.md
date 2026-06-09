# Menu Foundation Phase 2 — Architecture & Delivery Plan

**Branch:** feature/menu-foundation-phase-2
**Date:** 2026-06-09
**Status:** Planning only — no migrations, no production code
**Baseline:** Restaurant → Sections (menus) → Items (menu_items) — approved and stable

---

## Context

The Restaurant Experience Audit and Menu Stabilization Gate confirmed that the data model
is clean and all enrichment columns are already migrated. This document designs the first
customer-facing QR Menu experience and the admin enablement work required to populate it.

The public entry point (`/r/[restaurantSlug]`) exists today as a redirect-only page that
bounces the customer immediately to the promotion game. Menu Foundation transforms this URL
into a full restaurant experience, branching on `restaurants.experience_mode`.

---

## Part 1 — Public Experience Modes

### Three modes (enforced by `restaurants.experience_mode` CHECK constraint)

```
promotion_only (default)
  QR → /r/[restaurantSlug]
       → immediate server-side redirect to /play/[restaurantSlug]/[promotionSlug]
       → identical to current behaviour — zero regression for existing restaurants

menu_only
  QR → /r/[restaurantSlug]
       → Restaurant Landing Page
         Hero · Description · Hours · Contact
         Sections nav
         Items browse
         Item Detail (modal)
       → (no promotion CTA rendered)

menu_and_promotion
  QR → /r/[restaurantSlug]
       → Restaurant Landing Page
         Hero · Description · Hours · Contact
         Today's Reward card  ← live promotion summary + "Spin for a Reward" CTA
         Sections nav
         Items browse
         Item Detail (modal)
         Floating Reward Widget  ← persists as customer scrolls
```

### Routing behaviour table

| mode | /r/[slug] renders | promotion visible | menu visible |
|---|---|---|---|
| promotion_only | server redirect | yes (redirected) | no |
| menu_only | landing page | no | yes |
| menu_and_promotion | landing page | yes (card + widget) | yes |

### Route structure (all within existing `/r/[restaurantSlug]` page)

No new top-level routes required for V1. The landing page is a single server component
with scroll-anchored section navigation. Item detail opens as a client-side sheet overlay
(no separate URL) to avoid deep-linking complexity in V1.

Post-coupon: the play page (`/play/[restaurantSlug]/[promotionSlug]`) gains a
"Browse Menu" CTA on the coupon screen that links back to `/r/[restaurantSlug]`.

---

## Part 2 — Restaurant Landing Page

### Data requirements (all columns already migrated)

```
restaurants:
  name, slug
  hero_image_url      → restaurant-heroes bucket, path: {uid}/{rid}/hero.{ext}
  logo_url            → restaurant-logos bucket (existing)
  description         → text, nullable
  hours               → JSONB, schema: { monday: { open, close, closed }, ... }
  website_url         → text, nullable
  instagram_url       → text, nullable
  facebook_url        → text, nullable
  google_maps_url     → text, nullable
  secondary_color     → text (hex), nullable — accent override for brand strip
  accent_color        → text (hex), nullable
  experience_mode     → determines which blocks render
  current_promotion_id → promotion reference for Today's Reward card
```

### Mobile-first UX design (top → bottom scroll)

```
┌─────────────────────────────────────┐
│  HERO IMAGE (full bleed, 45vh)      │
│  ┌──────────────────────────────┐   │
│  │ LOGO  Restaurant Name        │   │  ← absolute, bottom-left of hero
│  │       City                   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
  DESCRIPTION BLOCK
  ┌──────────────────────────────────┐
  │ Short description paragraph      │
  └──────────────────────────────────┘

  HOURS BLOCK
  ┌──────────────────────────────────┐
  │ Mon–Fri  11:00 – 22:00           │
  │ Saturday 11:00 – 23:00           │
  │ Sunday   CLOSED                  │
  └──────────────────────────────────┘
  Current-day row highlighted.

  CONTACT / SOCIAL STRIP
  ┌──────────────────────────────────┐
  │ [📍 Directions] [🌐 Website]     │
  │ [📸 Instagram]  [👍 Facebook]    │
  └──────────────────────────────────┘
  Renders only links that have values. Phone (from existing restaurants.phone).

  TODAY'S REWARD CARD  (menu_and_promotion only)
  ┌──────────────────────────────────┐
  │  🎯 Today's Reward               │
  │  Win from the Lunch menu         │
  │  Free item · Discount · More     │
  │  [Spin for a Reward]  ──────────→ /play/[slug]/[promotionSlug]
  └──────────────────────────────────┘

  FEATURED ITEMS STRIP  (horizontal scroll)
  ┌──────────────────────────────────┐
  │  ⭐ Featured                     │
  │  [Item A] [Item B] [Item C] >>>  │
  └──────────────────────────────────┘
  SELECT from menu_items WHERE is_featured = true, restaurant_id, deleted_at IS NULL.
  Capped at 6. Omitted entirely if no featured items.

  SECTION NAV (sticky after scroll past hero)
  ┌──────────────────────────────────┐
  │  [Breakfast] [Lunch] [Dinner]    │  ← pill-style scroll chips
  └──────────────────────────────────┘

  SECTION + ITEM BLOCKS (repeated per section in display_order)
  ┌──────────────────────────────────┐
  │  BREAKFAST                       │
  │  ┌─────────┐  Item name  $12.00  │
  │  │ thumb   │  description         │
  │  └─────────┘                     │
  │  ...                             │
  └──────────────────────────────────┘

  FOOTER
  ┌──────────────────────────────────┐
  │  Powered by SpinBite             │
  └──────────────────────────────────┘
```

### Fallback states

| Field missing | Fallback |
|---|---|
| hero_image_url | Brand gradient (#FF6B00 → #E63939), restaurant initial |
| logo_url | Text-only name badge |
| description | Block omitted silently |
| hours | Block omitted silently |
| contact links | Individual links omitted |
| no featured items | Featured strip omitted |
| no items in section | "Items coming soon." placeholder row |

### Branding

`secondary_color` is applied to the section nav active chip and the Today's Reward card
border. If null, falls back to SpinBite brand orange (#FF6B00).

---

## Part 3 — Public Menu Experience

### Section navigation

- Sticky pill-strip nav anchored below the header once the user scrolls past the hero.
- Tapping a pill smooth-scrolls to the matching section anchor (`#section-{slug}`).
- Active chip highlights via IntersectionObserver watching section headers.
- Horizontal overflow scroll on mobile (no wrapping).
- Maximum sections before overflow: unlimited — the strip scrolls.

### Featured items strip

- Horizontal scroll carousel, rendered before the section nav.
- Source: `menu_items WHERE is_featured = true AND restaurant_id = $id AND deleted_at IS NULL AND available = true`
- Ordered by `display_order ASC`.
- Cards show: thumbnail (or food emoji placeholder), name, price.
- Tapping a card opens the Item Detail sheet.

### Section + item grid

- Sections ordered by `menus.display_order ASC`.
- Within each section, items ordered by `menu_items.display_order ASC`.
- Item row (list layout): thumbnail 64×64 | name + description truncated 2 lines | price | availability badge.
- `available = false` items shown with grey opacity and "Unavailable" badge — not hidden.
- `active = false` items excluded entirely (soft-deleted items hidden from public).

### Loading states

- Skeleton cards (CSS) for hero, featured strip, and item rows — avoids layout shift.
- The page is a Next.js server component: data is fetched at request time, so loading
  skeletons are for Suspense boundaries around client-only interactive elements (nav scroll,
  item detail sheet).

### Empty states

- No sections: "Menu coming soon. Check back later."
- Section with no items: "Items coming soon."
- No featured items: strip is simply omitted (no empty state shown).

### Search readiness

- V1: no search input.
- V2 hook: a search bar can be added above the section nav. The item data structure
  (name, description, tags) supports client-side fuzzy filter with no backend change.
- `tags` GIN index already provisioned for future server-side full-text search.

---

## Part 4 — Item Detail Experience

### Trigger

Tapping any item card (in the featured strip or in a section block) opens a bottom sheet
overlay. No URL change in V1. The sheet is a client component layered over the server page.

### Sheet content (top → bottom)

```
┌─────────────────────────────────────┐
│  [close ×]                          │
│                                     │
│  ITEM IMAGE (16:9, rounded)         │
│  or food emoji fallback             │
│                                     │
│  Item Name                 $12.00   │
│  ─────────────────────────────────  │
│  Description paragraph              │
│                                     │
│  Tags: [🌶 Spicy] [🌿 Vegan]       │
│                                     │
│  [ Unavailable ]  (if available=F)  │
│                                     │
│  ─────────────────────────────────  │
│  🎯 Today's Reward includes this    │
│     item →  [Spin for a Reward]     │  ← only if item is in active promotion rewards
│                                     │
└─────────────────────────────────────┘
```

### Fields rendered

| Field | Source | V1 | V2 |
|---|---|---|---|
| Image | `menu_items.image_url` (CDN) | yes | — |
| Name | `menu_items.name` | yes | — |
| Price | `menu_items.price` | yes | — |
| Description | `menu_items.description` | yes (if present) | AI-generated |
| Tags | `menu_items.tags` | yes (if non-empty) | AI-suggested |
| Available badge | `menu_items.available` | yes | — |
| Promotion hook | `promotion_rewards` join | yes | — |
| AI description origin | `ai_metadata.description_source` | no | V2 label |
| Video | — | no | V3 (AI Food Video) |

### Featured treatment

Items with `is_featured = true` receive a gold star badge on their card in the grid.
In the detail sheet there is no special treatment — the content speaks for itself.

### Future AI hooks

The `ai_metadata` JSONB envelope is already in place. When AI description generation is
implemented, the sheet renders an "AI-assisted description" badge sourced from
`ai_metadata.description_source === 'ai'`. No schema change required.

---

## Part 5 — Admin Enablement

### Current state

The admin menu page (`/admin/menu`) exposes: section name, item name, item price.

The restaurant profile admin (`/admin/restaurant`) exposes via Phase 1 tabs:
mode tab (experience_mode), hero tab (hero_image_url upload), hours tab (hours JSONB),
contact tab (website_url, instagram_url, facebook_url, google_maps_url, phone).

### Gaps: fields in DB not yet exposed in any admin UI

#### Item-level (high priority — needed before landing page is useful)

| Field | Type | Admin control needed |
|---|---|---|
| `description` | text | Textarea in item edit form |
| `image_url` | text | Upload widget (bucket: menu-item-images) |
| `is_featured` | boolean | Toggle in item row |
| `tags` | text[] | Tag chip input (comma-separated, max 8) |
| `available` | boolean | Toggle in item row (per-day availability) |
| `display_order` | integer | Drag handle or up/down arrows in section editor |

#### Section-level

| Field | Type | Admin control needed |
|---|---|---|
| `display_order` | integer | Drag or up/down arrows on section list |

#### Restaurant-level (mostly covered by Phase 1 tabs)

| Field | Type | Status |
|---|---|---|
| `experience_mode` | text | Phase 1 tab — needs verification |
| `hero_image_url` | text | Phase 1 tab — covered |
| `secondary_color` | text | Not yet exposed — add to hero/branding tab |
| `accent_color` | text | Not yet exposed — add to hero/branding tab |
| `description` | text | Not yet exposed — add to a new "About" tab |

### Admin UX approach for item enrichment

The existing item edit form is inline within the section editor. For V1 admin enrichment,
expand the inline editor to include the new fields rather than creating a separate page.
The image upload widget follows the same pattern as `HeroImageUploader` but targeting the
`menu-item-images` bucket at path `{uid}/{rid}/items/{iid}/{timestamp}.jpg`.

Priority sequence:
1. `is_featured` toggle + `available` toggle — row-level, one click
2. `display_order` — up/down arrows (drag is V2)
3. `description` + `tags` — textarea + chip input in expanded editor
4. `image_url` — upload widget last (most complex)

---

## Part 6 — Promotion Integration

### Today's Reward Card

Rendered on the landing page when `experience_mode = 'menu_and_promotion'` and a live
promotion exists.

```
Data fetched: promotions JOIN promotion_rewards ON restaurant_id
              WHERE restaurant_id = $id AND status = 'active'
              AND (starts_at IS NULL OR starts_at <= now())
              AND (ends_at IS NULL OR ends_at >= now())
              LIMIT 1

Card content:
  Promotion name
  Section name (from menus WHERE id = promotion.menu_id)
  Reward count: "6 rewards available"
  Sample reward preview: top 3 reward labels (truncated)
  CTA button: "Spin for a Reward" → /play/[restaurantSlug]/[promotionSlug]
```

The card is subtle — styled as an informational callout, not a full-screen interrupt.
SpinBite brand orange used sparingly. No animation on load.

### Floating Reward Widget

A persistent floating action button (FAB) that appears after the customer scrolls past
the Today's Reward card. Remains visible while browsing the menu.

```
Position: bottom-right, fixed, z-50
Style: rounded-full, SpinBite orange, 56px
Content: 🎯 icon
Tap: opens a mini-card sheet showing Today's Reward card content + CTA
     (same data, not a full page navigation)
```

Shown only when `experience_mode = 'menu_and_promotion'` and live promotion exists.

Hidden on the `/play/...` page (already in game context).

### Menu-to-Game Journey

```
Customer lands at /r/[restaurantSlug]
↓
Sees Today's Reward card (menu_and_promotion mode)
↓
Browses menu, sees item detail with "Today's Reward includes this item" hook
↓
Taps "Spin for a Reward" CTA
↓
/play/[restaurantSlug]/[promotionSlug]
↓
Captures customer identity (phone + consent) if not already captured
↓
Plays game
↓
Coupon screen
```

The item-level promotion hook in the detail sheet connects browsing intent to play
motivation — the customer sees their food, then discovers it can be won.

### Coupon-to-Menu Journey

After winning a coupon, the customer should be encouraged to browse the rest of the menu.

```
Coupon screen (existing) gains:
  [Browse Menu]  → /r/[restaurantSlug]

  Small text below the coupon code:
  "While you wait — browse our full menu"
```

No changes to the coupon redemption flow. The link is additive.

---

## Part 7 — AI Foundation Review

### Reusable assets already in place

| Asset | Location | AI-ready |
|---|---|---|
| `ai_metadata` JSONB column | `menu_items` | yes — contract defined in migration comment |
| `description` column | `menu_items` | yes — text column, nullable |
| `image_url` column | `menu_items` | yes — CDN-backed |
| `tags` column | `menu_items` | yes — text[] with GIN index |
| `menu-item-images` storage bucket | Supabase Storage | yes — public CDN, 5MB limit |
| `restaurant-heroes` storage bucket | Supabase Storage | yes — public CDN, 10MB limit |
| `description` column | `restaurants` | yes |

### AI Descriptions

**Readiness: HIGH.** All columns exist. A server-side edge function (or Next.js API route)
can call Claude API with: item name + price + restaurant name + section name → generate
description → write to `menu_items.description` and set
`ai_metadata.description_source = 'ai'`, `ai_metadata.description_model = 'claude-...'`,
`ai_metadata.description_generated_at = now()`.

The admin item editor can show the generated text with an "AI-generated — tap to edit"
affordance. Manual edits flip `description_source` to `'manual'`.

Required future architecture:
- A server action or API route: `POST /api/admin/menu-items/[id]/generate-description`
- Usage counter or rate limiter (per restaurant, per day)

### AI Image Enhancement

**Readiness: MEDIUM.** Storage bucket provisioned. The pipeline would be:
owner uploads raw photo → store original at `ai_metadata.original_image_url` → call
image model → write enhanced URL to `menu_items.image_url`.

This requires:
- An image processing pipeline (edge function or external queue)
- Image model API access
- No schema migration needed

V3 priority.

### AI Menu Import

**Readiness: MEDIUM.** The `import_source` and `import_job_id` fields in `ai_metadata`
are the designated tracking fields. A CSV/PDF/photo menu import could:
1. Extract structured items (name, price, section) via LLM
2. Create menus + items in bulk
3. Set `ai_metadata.import_source = 'ai_import'`, `import_job_id = <uuid>`

Required:
- A multi-step import wizard (upload → preview → confirm → apply)
- No schema migration for AI tracking; a `menu_import_jobs` table may be useful for
  async processing

V3 priority. High value for restaurant onboarding speed.

### AI Food Video

**Readiness: LOW.** No video storage bucket, no `video_url` column on `menu_items`.
Would require a `video_url` column + a video bucket (or external CDN) + a video generation
pipeline. Significant infrastructure work.

V4+ priority.

---

## Part 8 — Technical Architecture

### Existing reusable assets

**Routes**
| Route | Purpose | Reuse |
|---|---|---|
| `/r/[restaurantSlug]` | QR entry point | Transform — add landing page logic |
| `/play/[restaurantSlug]/[promotionSlug]` | Game play | Unchanged — add "Browse Menu" CTA |
| `/admin/restaurant` | Restaurant profile | Unchanged — add brand colors + description tab |
| `/admin/menu` | Section + item management | Extend — add enrichment fields |

**APIs (Route Handlers)**
| Route | Purpose |
|---|---|
| `/api/public/promotion-play` | Core play session API — untouched |
| `/api/admin/restaurant/upload-hero` | Hero image upload |

**Storage buckets (both provisioned and live)**
| Bucket | Path | Max size |
|---|---|---|
| `restaurant-heroes` | `{uid}/{rid}/hero.{ext}` | 10 MB |
| `menu-item-images` | `{uid}/{rid}/items/{iid}/{ts}.{ext}` | 5 MB |
| `restaurant-logos` | existing | — |

**Components**
| Component | Reuse |
|---|---|
| `HeroImageUploader` | Reuse as model for item image uploader |
| `CustomerIdentityScreen` | Unchanged — phone + consent capture |
| `BrandedUnavailablePage` | Reuse for missing restaurant / no menu states |
| `SpinWheelPreview` | Unchanged |

**Database indexes (already provisioned)**
- `menu_items_featured_idx` — fast featured items query
- `menu_items_menu_id_order_idx` — section item ordering
- `menu_items_tags_gin_idx` — future search
- `restaurants_slug_mode_idx` — landing page query by slug + mode
- `menus_restaurant_id_display_order_idx` — ordered section fetch

### New routes

| Route | Type | Purpose |
|---|---|---|
| `/r/[restaurantSlug]` (transformed) | Server component (Page) | Restaurant landing page — replaces redirect-only logic |

No additional top-level routes in V1. Item detail is a client-side sheet, not a route.

### New components

| Component | Type | Purpose |
|---|---|---|
| `RestaurantHero` | Server | Hero image, logo overlay, name, city |
| `RestaurantAbout` | Server | Description, hours, contact strip |
| `TodaysRewardCard` | Server | Promotion summary card with CTA |
| `FloatingRewardWidget` | Client | FAB that appears on scroll, triggers reward sheet |
| `SectionNav` | Client | Sticky pill navigation, IntersectionObserver active state |
| `FeaturedItemsStrip` | Client | Horizontal scroll carousel of featured items |
| `SectionBlock` | Server | Section heading + item list |
| `ItemCard` | Server (partial) | Item row: thumbnail, name, description, price |
| `ItemDetailSheet` | Client | Bottom sheet overlay for item detail |
| `ItemImageUploader` | Client | Admin: uploads to menu-item-images bucket |
| `ItemEnrichmentForm` | Client | Admin: description, tags, featured, available, order |

### New API routes

| Route | Method | Purpose |
|---|---|---|
| None required for V1 | — | Landing page data fetched in server components |
| `/api/admin/menu-items/[id]` | PATCH | Admin: update item enrichment fields |
| `/api/admin/menu-items/[id]/image` | POST | Admin: upload item image |

Optional for V2:
| `/api/admin/menu-items/[id]/generate-description` | POST | AI description generation |

### Future migrations (not in this sprint)

| Migration | Purpose | When |
|---|---|---|
| None required | All enrichment columns already migrated | — |
| `menu_items.video_url` | AI Food Video V4 | V4 |
| `menu_import_jobs` | AI Menu Import tracking table | V3 |

The V1 landing page and admin enrichment work requires **zero new migrations**. All schema
is in place from Phase 2 restaurant foundation migrations (2026-06-06).

---

## Part 9 — Delivery Plan

### Epic

**QR Menu — Menu Foundation Phase 2**
Transform the SpinBite QR code from a single promotion entry point into a full restaurant
experience: landing page, menu browse, item detail, and promotion discovery.

---

### Stories and complexity

#### Sprint 1 — Admin Enrichment (Week 1–2)

| Story | Complexity | Dependencies |
|---|---|---|
| S1-1: Item featured toggle (is_featured) in section editor | S | None |
| S1-2: Item available toggle (available) in section editor | S | None |
| S1-3: Item display_order — up/down arrows in section editor | S | None |
| S1-4: Section display_order — up/down arrows on section list | S | None |
| S1-5: Item description textarea in expanded item editor | S | None |
| S1-6: Item tags chip input in expanded item editor | S | None |
| S1-7: Item image upload widget (menu-item-images bucket) | M | S1-5, S1-6 ordering |
| S1-8: Restaurant description textarea (new "About" tab) | S | Phase 1 restaurant admin tabs |
| S1-9: Brand colors (secondary_color, accent_color) in hero tab | S | Phase 1 hero tab |

**Sprint 1 goal:** Restaurant owners can fully populate their menu data before the public page is live.

---

#### Sprint 2 — Restaurant Landing Page (Week 3–4)

| Story | Complexity | Dependencies |
|---|---|---|
| S2-1: Transform /r/[restaurantSlug] — experience_mode branch | M | None |
| S2-2: RestaurantHero component (hero image, logo, name, city) | M | S1-9 (brand colors) |
| S2-3: RestaurantAbout component (description, hours, contact) | M | S1-8 (description) |
| S2-4: FeaturedItemsStrip component | M | S1-1 (is_featured) |
| S2-5: SectionNav component (sticky, IntersectionObserver) | M | None |
| S2-6: SectionBlock + ItemCard components | M | S1-3/S1-4 (display_order) |
| S2-7: Fallback states (no hero, no items, no description) | S | S2-2 through S2-6 |
| S2-8: BrandedUnavailablePage integration (no mode, no menu) | S | S2-1 |

**Sprint 2 goal:** A customer scanning a QR code for a `menu_only` restaurant sees a full landing page.

---

#### Sprint 3 — Item Detail + Promotion Integration (Week 5–6)

| Story | Complexity | Dependencies |
|---|---|---|
| S3-1: ItemDetailSheet component | M | S2-6 (ItemCard trigger) |
| S3-2: TodaysRewardCard component | M | S2-1 (mode branch) |
| S3-3: FloatingRewardWidget (FAB + mini-sheet) | M | S3-2 |
| S3-4: Promotion hook in ItemDetailSheet | S | S3-1, S3-2 |
| S3-5: "Browse Menu" CTA on coupon screen | S | S2-1 (landing page exists) |
| S3-6: promotion_only mode — verify zero regression | S | S2-1 |

**Sprint 3 goal:** `menu_and_promotion` restaurants deliver the full customer journey: menu → discover reward → play → browse.

---

#### Sprint 4 — Polish and Hardening (Week 7)

| Story | Complexity | Dependencies |
|---|---|---|
| S4-1: Skeleton loading states (Suspense boundaries) | S | S2 + S3 complete |
| S4-2: `available = false` visual treatment on items | S | S2-6 |
| S4-3: Mobile scroll performance audit (no layout shift) | S | S2 + S3 complete |
| S4-4: Brand color application (secondary_color fallback to #FF6B00) | S | S2-2 |
| S4-5: Analytics events (page view, section tap, item tap, CTA tap) | M | S2 + S3 complete |
| S4-6: Lighthouse mobile score ≥ 90 | M | S4-1 through S4-4 |

**Sprint 4 goal:** Production-ready, performant, fully instrumented.

---

### Dependencies

```
S1 (Admin Enrichment)
  ↓ data populated
S2 (Landing Page)
  ↓ page exists
S3 (Item Detail + Promotion)
  ↓
S4 (Polish)
```

S1 and S2 can be developed in parallel (S2 uses placeholder data during development;
is_featured / display_order are wired in S2-4/S2-6 as late-binding queries).

S3 requires S2 to be deployable (needs the landing page route).

S4 requires S2 + S3 to be complete.

---

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `experience_mode` admin UI not yet verified to be wired | Medium | High | Verify Phase 1 mode tab in first day of S1 sprint |
| Restaurant owners don't populate enrichment data before launch | High | Medium | Launch `menu_only` and `menu_and_promotion` modes with graceful fallbacks for all missing fields; no blank-screen states |
| Hero image CDN latency (large images) | Low | Medium | Enforce 10MB limit (already in bucket policy); add next/image width hints for hero |
| IntersectionObserver scroll performance on old Android browsers | Low | Low | Polyfill via next/dynamic lazy load |
| AI descriptions generated before human review go live | Low | Medium | `ai_metadata.description_reviewed = false` flag; admin review flow in V2 before showing AI badge |
| Promotion data fetch adds latency to landing page | Low | Low | Server component — single DB call, cached at edge |

---

### Definition of Done

A story is done when:
1. All acceptance criteria are met (verified in mobile browser at 375px width)
2. TypeScript passes with `tsc --noEmit` (zero errors)
3. ESLint passes (no new errors; warnings logged but not blocking)
4. The golden path journey for the affected mode works end to end in staging
5. All three modes (`promotion_only`, `menu_only`, `menu_and_promotion`) have been
   smoke-tested to confirm no regression
6. Changes are committed and PR-reviewed before merge to main

---

### Timeline

| Sprint | Scope | Duration | Gate |
|---|---|---|---|
| Sprint 1 | Admin Enrichment (S1-1 through S1-9) | Week 1–2 | Restaurant owners can populate items with images, descriptions, featured flags |
| Sprint 2 | Restaurant Landing Page (S2-1 through S2-8) | Week 3–4 | `menu_only` QR scan delivers full landing page |
| Sprint 3 | Item Detail + Promotion Integration (S3-1 through S3-6) | Week 5–6 | `menu_and_promotion` full journey working |
| Sprint 4 | Polish + Hardening (S4-1 through S4-6) | Week 7 | Lighthouse ≥ 90, zero regressions, analytics wired |

**Total: 7 weeks**

Go-live sequence:
- Week 2 end: enable admin enrichment for internal restaurant(s)
- Week 4 end: enable `menu_only` mode for pilot restaurant
- Week 6 end: enable `menu_and_promotion` mode for pilot restaurant
- Week 7 end: full rollout gate review

---

## Summary of Deliverables

| Deliverable | Status |
|---|---|
| Experience mode routing design | Complete — see Part 1 |
| Restaurant landing page UX | Complete — see Part 2 |
| Public menu UX | Complete — see Part 3 |
| Item detail sheet design | Complete — see Part 4 |
| Admin enablement field gaps | Complete — see Part 5 |
| Promotion integration design | Complete — see Part 6 |
| AI readiness assessment | Complete — see Part 7 |
| Technical architecture | Complete — see Part 8 |
| Delivery plan (epic, stories, risks, DoD, timeline) | Complete — see Part 9 |

**Zero new migrations required for V1. All schema is in place.**
**Zero existing routes removed or broken.**
**Pilot launch achievable in 7 weeks.**
