# Menu Showcase Sprint — Reality Check Report

**Branch:** `feature/menu-showcase-sprint`  
**Date:** 2026-06-10  
**Production URL:** `https://spinapp.powerpaneer.com/r/punjabi-by-nature-96179`

---

## Executive Summary

SpinBite is **significantly further along than the spec assumed.** Most content was already populated from prior sprints. This sprint confirmed that the platform renders a credible restaurant experience when content is present. The primary remaining gap is photos — every item shows a plate placeholder. Photos are the single change that would most improve the visual impression.

**Platform readiness for demo: 7/10.** Would be 9/10 with item photos.

---

## Phase 1 — Admin Experience Audit

### Where operators manage each capability

| Capability | Route | Component | DB Field | UX Quality |
|---|---|---|---|---|
| Upload item photo | `/admin/menu` → Edit Section → Edit item | `MenuItemImageUploader` | `menu_items.image_url` | ✅ Clear, one click |
| Enter description | `/admin/menu` → Edit Section → Edit item | Inline textarea (300 char) | `menu_items.description` | ✅ Counter shown |
| Enter tags | `/admin/menu` → Edit Section → Edit item | Comma-separated input | `menu_items.tags` (text[]) | ⚠️ UX Defect 1 |
| Mark as featured | `/admin/menu` → Edit Section → Edit item | Toggle button (amber) | `menu_items.is_featured` | ✅ Clear toggle |
| Edit display order | `/admin/menu` → Edit Section → Edit item | Number input | `menu_items.display_order` | ⚠️ UX Defect 2 |
| Restaurant description | `/admin/restaurants` → Profile tab | `RestaurantProfileTab` | `restaurants.description` | ✅ Clear |
| Social links | `/admin/restaurants` → Contact tab | `RestaurantContactTab` | `restaurants.{website,instagram,facebook,google_maps}_url` | ✅ All 4 fields present |
| Hero image | `/admin/restaurants` → Profile tab | `HeroImageUploader` | `restaurants.hero_image_url` | ✅ Drag or click |
| Logo | `/admin/restaurants` → Profile tab | Logo section | `restaurants.logo_url` | ✅ Clear |
| Accent/Secondary color | `/admin/restaurants` → Profile tab | `BrandColorFields` | `restaurants.accent_color`, `secondary_color` | ✅ Color picker |

### UX Defects Found

**UX Defect 1 — Tags input is not discoverable**
- The tags field label says "Tags" with hint "Comma-separated" but gives no examples in the admin flow
- An operator who hasn't read documentation will not know which tags are valid or consistent
- The public page renders whatever is entered, so "veg" and "Vegetarian" would both display inconsistently
- **Severity:** Medium

**UX Defect 2 — Display order requires manual number entry**
- Operators must type integer values (0, 1, 2...) to control item ordering
- No drag-and-drop, no up/down buttons
- With 11 items, renumbering all items to reorder one is tedious
- **Severity:** Medium

**UX Defect 3 — Edit requires two levels of navigation to reach item editor**
- Flow: Edit Section button → expand section editor → click Edit on individual item → rich editor opens inline
- For a restaurant with 4 sections × 3 items, that is 12 separate "Edit" button clicks to populate all items
- There is no "bulk fill" path
- **Severity:** Low (acceptable for MVP, painful for onboarding)

**UX Defect 4 — Item photo upload hidden inside item editor**
- The image uploader only appears after clicking "Edit" on an existing item
- No affordance on the item card itself suggests photos are missing or uploadable
- A new operator will not find the photo upload unless they open every item
- **Severity:** Medium

---

## Phase 2 — Content Population Summary

All 11 required items populated across 4 sections. Content was already present from prior work.

### Sections (in display order after this sprint's DB fix)

| Order | Section | Items |
|---|---|---|
| 1 | Breakfast | Lassi, Pakora, Masala Chai |
| 2 | Lunch | Tandoori Chicken, Haryali Chicken, Naan Kabab |
| 3 | Dinner | Palak Paneer, Kadhi, Sheesh Kabab |
| 4 | Kids Special | Chocolate Pizza, Mini Idlis |

### Per-item content status

| Item | Description | Tags | Featured | Photo |
|---|---|---|---|---|
| Lassi | ✅ | Vegetarian, Gluten Free | — | ❌ |
| Pakora | ✅ | Vegetarian, Vegan | ✅ | ❌ |
| Masala Chai | ✅ | Vegetarian | — | ❌ |
| Tandoori Chicken | ✅ | Gluten Free, Halal | ✅ | ❌ |
| Haryali Chicken | ✅ | Gluten Free, Halal | — | ❌ |
| Naan Kabab | ✅ | Halal | — | ❌ |
| Palak Paneer | ✅ | Vegetarian, Gluten Free | ✅ | ❌ |
| Kadhi | ✅ | Vegetarian, Gluten Free | — | ❌ |
| Sheesh Kabab | ✅ | Gluten Free, Halal | — | ❌ |
| Chocolate Pizza | ✅ | Vegetarian, Kids Favourite | — | ❌ |
| Mini Idlis | ✅ | Vegetarian, Vegan, Gluten Free | — | ❌ |

**Photos remain at 0/11.** All items show a gray plate emoji placeholder. This is the biggest remaining gap for visual impression.

---

## Phase 3 — Restaurant Profile Status

| Field | Status | Value |
|---|---|---|
| Description | ✅ | "Punjabi By Nature is a renowned restaurant offering a rich array of authentic Punjabi dishes..." |
| Hero image | ✅ | Uploaded (restaurant mascot photo) |
| Logo | ✅ | Uploaded |
| Brand color | ✅ | `#FF6B00` (orange) |
| Accent color | ✅ Set this sprint | `#f59e0b` (amber/saffron — renders on reward labels, tags, section headings) |
| Secondary color | ✅ Set this sprint | `#fff8f0` (warm cream — page background tint) |
| Website | ✅ | `https://punjabibynature.ca` |
| Instagram | ✅ | `https://instagram.com/punjabibynaturecanada` |
| Facebook | ✅ | `https://facebook.com/punjabibynature` |
| Google Maps | ✅ | `https://maps.google.com/?q=261+Oak+Walk+Dr,+Oakville,+ON` |
| Address | ✅ | 261 Oak Walk Dr., Oakville, Ontario |
| Phone | ✅ | 4382263860 |
| Hours | ❌ | Not configured — hours block is hidden |

All four social/contact links render as tappable pills on the public page and correctly open in a new tab.

---

## Phase 4 — Promotion UX Changes

All three changes are implemented and committed on this branch (`feature/menu-showcase-sprint`, commit `86cc74a`).
They are not yet merged to `main` or deployed — production still runs the prior `main` build.

### Change 1 — Reward banner position

| | State |
|---|---|
| Before (production) | Hero → **Reward Banner** → Info card → Hours → Contact links |
| After (this branch) | Hero → Info card → Hours → Contact links → **Reward Banner** → Reward card |

**Implementation:** Removed `RewardBanner` from just before the info card block. Moved it just before `TodaysRewardCard`. Also removed the conditional `-mt-8` suppression that existed to prevent margin collision when the banner was present.

File: [components/public/RestaurantPublicPage.tsx](components/public/RestaurantPublicPage.tsx)

### Change 2 — Pulse animation removed

| | State |
|---|---|
| Before (production) | Floating 🎁 button had `animation: spinbiteRewardPulse 3s ease-in-out infinite` — a ring-expand ring-pulse loop |
| After (this branch) | Button is static. Style block reduced to `{ backgroundColor: accentColor, color: '#fff' }` |

The `spinbiteRewardPulse` keyframe definition remains in `globals.css` for potential future use but is no longer applied.

### Change 3 — Reward badge cap at 3

| | State |
|---|---|
| Before (production) | Every reward-linked item (can be many) shows "🎁 Win This" badge |
| After (this branch) | Maximum 3 items receive "🎁 Win This" badge. Applied to both the featured strip and the full menu grid |

**Logic:** `cappedRewardItemIds = new Set(Array.from(rewardItemIds).slice(0, 3))`  
The cap is applied at component entry — the first 3 reward IDs (ordered by `promotion_rewards.display_order`) receive badges. Items beyond position 3 render without a badge.

**Why 3:** Matches the number of featured items. A customer scanning for "win" items can identify them at a glance without the badge becoming noise that appears on every card.

---

## Phase 5 — Screenshot Pack

All screenshots captured from production URL after DB changes applied.

### 01 — Restaurant Landing Page (above fold, mobile)

Hero image (restaurant mascot), reward banner, restaurant name in orange, description, address, phone, contact link pills.

Key observation: Logo correctly straddles the hero/card boundary via `absolute -top-10` positioning.

### 02 — Reward Section

Today's Reward card showing "Test 108" promotion with 4 reward items. Amber gold border-top matches accent color. Play Now / Maybe Later CTAs.

**Notable:** The promotion is named "Test 108" — this is an unprofessional name that should be renamed before any real customer faces this screen.

### 03 — Featured Dishes Strip

Horizontal scroll strip showing Pakora, Tandoori Chicken, and Palak Paneer as featured items. All three have descriptions that truncate cleanly. Prices render in brand orange. No photos — plate placeholders only.

### 04 — Breakfast Section

Lassi ($6.99), Pakora ($5.99), Masala Chai ($3.00) — all with descriptions, tags. Featured badge renders on Pakora correctly. Nav shows Breakfast as active.

### 05 — Lunch Section

Tandoori Chicken ($22.99), Haryali Chicken ($24.99), Naan Kabab ($13.99). Featured + Win This badges stacking on Tandoori Chicken. Nav updated to Lunch.

### 06 — Dinner Section

Palak Paneer ($25.99), Kadhi ($24.99), Sheesh Kabab ($23.99). Featured + Win This on Palak Paneer. Win This on Kadhi and Sheesh Kabab.

### 07 — Kids Menu

Chocolate Pizza ($12.99) and Mini Idlis ($5.99) in Kids Special section. Items visible in full-page mobile view.

### 08 — Item Detail Sheet

Tandoori Chicken sheet open. Shows: name in 24px black, price in brand orange, full description in readable stone-600, tag pills (Gluten Free, Halal) in amber/saffron accent. No photo — plate placeholder shown. Sheet slides from bottom as expected.

### 09 — Mobile Full Page (375px)

Full page scroll view confirms all 4 sections render in correct order: Breakfast → Lunch → Dinner → Kids Special. Featured strip renders. Brand consistency throughout. Floating 🎁 widget visible in bottom right.

### 10 — Desktop Full Page (1280px)

Menu renders in 3-column grid on desktop. All sections visible. Info card text is readable. The design holds up at full width — no horizontal overflow or broken layouts observed.

---

## Before vs After Summary

| Dimension | Before This Sprint | After This Sprint |
|---|---|---|
| Accent color | null (falls back to brand orange) | `#f59e0b` — amber/saffron, distinct from brand orange |
| Secondary color | null (white page background) | `#fff8f0` — warm cream tint, improves visual warmth |
| Section ordering | All display_order=0 (undefined/alphabetical) | Breakfast→Lunch→Dinner→Kids (explicit order 1–4) |
| Reward banner position | Immediately after hero, before restaurant info | After contact links, before reward card |
| Floating widget animation | Continuous ring-pulse on 🎁 button | Static button — no animation |
| Reward badges | Every linked item shows "🎁 Win This" | Capped at 3 items max |

---

## UX Defect List

| ID | Description | Where | Severity |
|---|---|---|---|
| D1 | Item photos: 0/11 present — plate placeholder on every card | Public menu | Critical |
| D2 | Tags field has no preset options or autocomplete | Admin /admin/menu | Medium |
| D3 | Display order requires manual integer input — no drag/drop | Admin /admin/menu | Medium |
| D4 | Photo upload not visible until "Edit" is clicked on an item | Admin /admin/menu | Medium |
| D5 | Promotion named "Test 108" — shows to customers | Public reward card | High (content) |
| D6 | No hours configured — hours block hidden entirely | Public landing | Low |
| D7 | "Win This" badge overlaps "Featured" badge on same card — two badges stacked | Public menu grid | Low |
| D8 | "Kids Special" truncates to "Kids Spe..." on narrow nav | Public menu nav | Low |
| D9 | Hours block absent — customers cannot see opening times | Public landing | Medium |
| D10 | Section description not supported — sections have no subtitle | Admin/Public | Future |

---

## Remaining Gaps — Classification

### Must Have Before Launch

| Gap | Reason |
|---|---|
| Item photos (0/11) | The single biggest visual gap. A menu with 11 plate placeholders looks unfinished even with excellent descriptions. Operators need real food photography or a clear photo upload guide. |
| Rename "Test 108" promotion | Customers see this name on the Today's Reward card. Must be a real promotion name before going live. |
| Deploy branch to production | Phase 4 changes (banner position, pulse removal, badge cap) are coded but not live. |

### Nice To Have

| Gap | Reason |
|---|---|
| Configure opening hours | Hours block currently hidden. Simple to fix — just takes 5 minutes in the admin Contact tab. |
| Tag presets or autocomplete | Prevents inconsistency across operators (e.g. "veg" vs "Vegetarian" vs "Vegetable"). |
| Drag-and-drop display order | Significantly reduces time to reorder a menu section. |
| Item photo empty-state prompt | Show a "📷 Add photo" overlay on items with no photo to make the gap obvious to operators without instructions. |

### Future Roadmap

| Gap | Reason |
|---|---|
| Menu-level description/subtitle | Give each section (Breakfast, Lunch, etc.) a brief description or seasonal note. |
| Allergen chips | Separate from tags — a structured allergen field with a defined set (Nuts, Dairy, Gluten, Shellfish...). |
| Item availability schedule | Toggle availability by time of day (Breakfast items hidden after 11am). |
| Multi-photo per item | A single image is enough for MVP; multiple images with swipe is a future premium feature. |
| Search within menu | Relevant once a restaurant has 50+ items. |

---

## Seed Script

A TypeScript seed script is available at `scripts/seed-punjabi-by-nature.ts` for fresh environments or CI resets.
It mirrors the exact writes the admin UI performs (same Supabase client, same table inserts) and is idempotent — safe to run multiple times.

Run with:
```sh
SUPABASE_URL=<url> SUPABASE_SERVICE_KEY=<service-role-key> npx tsx scripts/seed-punjabi-by-nature.ts
```

The script seeds: 4 menu sections, 11 items with descriptions/tags/featured status, and the restaurant profile (description + social links). It does **not** upload photos — those must be added via the admin UI as documented in Phase 2.

---

## Platform Verdict

SpinBite already delivers a **complete restaurant discovery experience** when content is populated:

- ✅ Hero image with branding
- ✅ Restaurant info (name, description, address, phone)
- ✅ Social links (4 of 4 populated, all render)
- ✅ Today's Reward card with real promotion data
- ✅ Featured dishes horizontal strip
- ✅ Sticky section navigation with active tracking
- ✅ 2-column menu grid (3-column on desktop)
- ✅ Item descriptions and tag pills
- ✅ Item detail bottom sheet (full-screen modal)
- ✅ Floating reward widget
- ❌ Food photos — the only major gap

**Next recommended action:** Get 11 food photos uploaded (phone camera quality is fine). Then deploy this branch. The platform is ready for real customer traffic once photos are in.
