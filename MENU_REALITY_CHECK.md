# SpinBite — Menu Reality Check
**Branch:** `feature/menu-reality-check`  
**Date:** 2026-06-10  
**Auditor:** Claude Sonnet 4.6  
**Method:** Live production screenshots (`spinapp.powerpaneer.com`), database inspection (Supabase MCP), full source-code read  
**Restaurant under audit:** Punjabi By Nature — Oakville (`/r/punjabi-by-nature-96179`, `experience_mode: menu_and_promotion`)

---

## Executive Summary

The menu infrastructure is technically complete. The DB schema has every field needed. The admin UI has every editor needed. The public page has every render path needed.

**The product is empty.**

Every single one of the 11 menu items in the primary restaurant has:
- `description = NULL`
- `image_url = NULL`
- `is_featured = false`
- `tags = []`
- `display_order = 0`

A customer who scans the QR today sees a grid of 11 generic plate-and-cutlery icons with names and prices. That is the entire menu experience.

The promotion UI — reward banner, reward card, "Win This" badges on 5+ items, floating 🎁 widget — was all built and runs. The menu content was not entered.

---

## Part 1 — Menu Item Content Audit

### Can a restaurant owner upload a food photo?

**Yes — the UI exists.** Location: `/admin/menu` → select restaurant → "Edit Section" on a section → "Edit" on any item → scroll to "Item Image" section.

The `MenuItemImageUploader` component ([components/admin/restaurants/MenuItemImageUploader.tsx](components/admin/restaurants/MenuItemImageUploader.tsx)) presents:
- A dashed upload zone with 🍽️ icon and "Tap to add item photo"
- File picker: JPEG, WebP, PNG, max 5 MB
- On select: shows preview overlay with Upload / Cancel
- On upload: saves to `menu-item-images` Supabase Storage and updates `menu_items.image_url`
- Hover state reveals Replace and Remove buttons on existing images

**Screenshot evidence:** Admin page redirects to auth at `/auth` — cannot screenshot while logged out. UI verified by source code inspection. See [app/admin/menu/page.tsx:651-660](app/admin/menu/page.tsx#L651).

**Reality:** 0 of 11 items have an image uploaded. All show the 🍽️ placeholder on the public page.

### Can a restaurant owner add a description?

**Yes.** Same editor — `Description` textarea with 300-character counter. Located at [app/admin/menu/page.tsx:627-648](app/admin/menu/page.tsx#L627).

**Reality:** 0 of 11 items have a description. Item detail sheets open to a near-empty bottom sheet: name + price + plate icon. Nothing else.

### Can a restaurant owner edit tags?

**Yes.** Free-text comma-separated input. "Vegetarian, Vegan, Gluten Free, Spicy…" placeholder. Located at [app/admin/menu/page.tsx:689-699](app/admin/menu/page.tsx#L689).

**Reality:** 0 of 11 items have any tags. No dietary indicators appear anywhere on the public page.

### Can a restaurant owner mark featured?

**Yes.** Toggle button: "Not Featured" / "⭐ Featured". Located at [app/admin/menu/page.tsx:663-673](app/admin/menu/page.tsx#L663).

**Reality:** 0 of 11 items are marked featured. The entire featured strip (`⭐ Featured Dishes` horizontal scroll) does not render. That section is dead.

### Can a restaurant owner change display order?

**Yes.** Number input, lower = earlier. Located at [app/admin/menu/page.tsx:700-715](app/admin/menu/page.tsx#L700).

**Reality:** All 11 items have `display_order = 0`. Items render in creation order, not editorial order. No meaningful ordering.

### Can a restaurant owner preview the result?

**Yes — barely.** Admin restaurants page has a "Preview" button that opens `/r/[slug]` in a new tab. Located at [app/admin/restaurants/page.tsx]. Admin menu page has no preview shortcut.

**Gap:** The admin menu editor has no in-page preview. Owner must open a separate tab and refresh manually. No before/after comparison.

---

## Part 2 — Database vs UI Gap Matrix

Database: `menu_items` table — 11 rows for Punjabi By Nature (Oakville, `restaurant_id: 6c739587-...`).

| Field | Exists in DB | Editable in Admin UI | Rendered Publicly | Working? | Gap |
|---|---|---|---|---|---|
| `name` | ✅ | ✅ | ✅ | ✅ Full | — |
| `price` | ✅ | ✅ | ✅ | ✅ Full | — |
| `description` | ✅ (nullable text) | ✅ textarea 300 char | ✅ card + detail sheet | ⚠️ Partial | No data entered |
| `image_url` | ✅ (nullable text) | ✅ uploader component | ✅ card + detail sheet | ⚠️ Partial | No images uploaded |
| `tags` | ✅ (text[] array) | ✅ comma-separated input | ✅ detail sheet pills | ⚠️ Partial | No tags entered |
| `is_featured` | ✅ (boolean, default false) | ✅ toggle button | ✅ strip + badge | ⚠️ Partial | All false — strip hidden |
| `available` | ✅ (boolean, default true) | ✅ toggle button | ✅ filtered at query | ✅ Full | — |
| `display_order` | ✅ (integer, default 0) | ✅ number input | ✅ ORDER BY | ⚠️ Partial | All 0 — unordered |
| `ai_metadata` | ✅ (jsonb) | ❌ no admin UI | ❌ not rendered | ❌ Unused | No AI pipeline |
| `section_id` | ✅ (uuid FK → menu_sections) | ❌ not used in admin | ❌ not used publicly | ❌ Dead | menu_sections table has 0 rows |
| `deleted_at` | ✅ (timestamptz) | ❌ no soft-delete UI | ✅ filtered at query | ⚠️ Partial | Hard delete used instead |

**Restaurant-level fields audit:**

| Field | DB | Admin | Public | Data Filled? |
|---|---|---|---|---|
| `hero_image_url` | ✅ | ✅ | ✅ renders | ✅ Yes (has image) |
| `logo_url` | ✅ | ✅ | ✅ renders | ✅ Yes (has logo) |
| `description` | ✅ | ✅ | ✅ renders | ✅ Yes |
| `phone` | ✅ | ✅ | ✅ renders | ✅ Yes |
| `address_line1 / city` | ✅ | ✅ | ✅ renders | ✅ Yes |
| `website_url` | ✅ | ✅ | ✅ (conditional) | ❌ NULL |
| `instagram_url` | ✅ | ✅ | ✅ (conditional) | ❌ NULL |
| `facebook_url` | ✅ | ✅ | ✅ (conditional) | ❌ NULL |
| `google_maps_url` | ✅ | ✅ | ✅ (conditional) | ❌ NULL |
| `hours` | ✅ | ✅ | ✅ renders | — (not confirmed) |
| `accent_color` | ✅ | ✅ | ✅ (tints badges/buttons) | — |
| `secondary_color` | ✅ | ✅ | ✅ (page bg tint) | — |

---

## Part 3 — Public Menu Audit (Punjabi By Nature, Oakville)

**Live URL:** `https://spinapp.powerpaneer.com/r/punjabi-by-nature-96179`  
**Mode:** `menu_and_promotion`

### What renders at page load (scroll = 0)

From top to bottom of the page:

1. **Hero image** — renders. 256px tall. Restaurant food photography present and loads. ✅
2. **Reward Banner** — immediately below hero. Orange strip: "Rewards Available Today | Play & Win While You Dine | Play Now →". Animated spinning game icon. Visible before customer sees any menu content.
3. **Info card** — restaurant logo (overlays hero/card boundary) ✅, restaurant name in brand orange ✅, description text ✅, address ✅, phone ✅. No contact links (all NULL).
4. **Hours block** — not confirmed in screenshots (may be absent if hours not configured or all days show closed).
5. **Today's Reward Card** — "TODAY'S REWARD / Test 108 / 10% Off [item] × 4 / Play Now / Maybe Later". Large, prominent.
6. **Browse Menu ↓** — full-width orange button. Appears below reward card.
7. **Sticky section nav** — Breakfast | Lunch | Dinner | Kids Special pills.
8. **Menu section grid** — 2-column cards, all with placeholder icon.

### Per-item audit across all 11 items

| Item | Image | Description | Featured badge | Tags | Detail sheet shows |
|---|---|---|---|---|---|
| Pakora ($5.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Lassi ($6.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Masala Chai ($3.00) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Sheesh Kabab ($23.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Palak Paneer ($25.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Kadhi ($24.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Haryali Chicken ($24.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Naan Kabab ($13.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Tandoori Chicken ($22.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Chocolate Pizza ($12.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |
| Mini idlis ($5.99) | ❌ placeholder | ❌ none | ❌ no | ❌ none | Name + price only |

**Score: 0/11 items have any rich content at all.**

### Item detail sheet

Tapping any item opens a bottom sheet. It renders:
- 160px tall placeholder zone with 🍽️ icon (no image)
- Item name (bold, large)
- Price (brand color)
- Blank space where description would go
- No tags section rendered (empty array)

The sheet looks almost empty. A customer tapping "Lassi" to learn more sees: a plate icon, "Lassi", "$6.99". Nothing else.

### What is completely absent from the public page

- Food photography (any)
- Any item description
- Dietary indicators (vegetarian / vegan / GF)
- Nutritional information
- Allergen information
- Featured items strip (hidden because no items marked featured)
- Best sellers section
- Reviews or review link
- Rating indicators
- Language selector
- Ordering / cart functionality
- Gallery mode
- List/grid toggle

---

## Part 4 — Compare Against Product Vision

| Capability | Expected | Current State |
|---|---|---|
| Large food photography | Hero of every item card | ❌ Plate icon for all 11 items |
| Rich descriptions | Paragraph in card + detail sheet | ❌ Completely absent |
| Dietary indicators | Pill badges (V, VE, GF, Spicy) | ❌ Tags field empty |
| Featured items | Horizontal strip at top of menu | ❌ Strip not rendered (no featured items) |
| Best sellers | Visual callout in grid | ❌ Absent |
| Restaurant website link | Tap → opens website | ❌ website_url is NULL |
| Instagram link | Tap → opens profile | ❌ instagram_url is NULL |
| Google Maps / Directions | Tap → opens directions | ❌ google_maps_url is NULL |
| About section | Dedicated "Our Story" block | ❌ Only description in info card |
| Reviews / Google Stars | Star rating + count | ❌ No DB field, no UI, no render |
| Language selector | Globe icon → switch locale | ❌ Not implemented |
| Nutrition placeholders | Calories / macros (even empty) | ❌ No DB field, no UI |
| Rating placeholders | Star rating (even empty) | ❌ No DB field, no UI |
| Ordering placeholder | "Order Now" CTA (even disabled) | ❌ No implementation |

**What exists and works:**
- Hero image renders ✅
- Logo renders ✅  
- Restaurant name, description, address, phone ✅
- Section navigation (sticky pills) ✅
- 2-column item grid ✅
- Item detail sheet opens on tap ✅
- Promotion + reward card system ✅
- QR code infrastructure ✅

**What is partially implemented (code ready, data missing):**
- Food photos (uploader exists, 0 uploaded)
- Descriptions (editor exists, 0 entered)
- Tags/dietary (input exists, 0 entered)
- Featured items (toggle exists, 0 marked)
- Display ordering (input exists, all = 0)
- Contact links (fields exist, all NULL)

**What is completely missing (no code, no DB field):**
- Reviews / Google Stars integration
- Rating display
- Nutrition info
- Language selector
- Ordering / cart
- Gallery / list mode toggle

---

## Part 5 — Promotion Overreach Audit

The following promotion UI elements appear on the public menu page when `experience_mode = menu_and_promotion`.

### 1. Reward Banner

**Location:** Between hero image and info card. First thing after the food photo.

**What it shows:** Orange full-width bar. Animated spinning game icon. "Rewards Available Today / Play & Win While You Dine / Play Now →"

| Question | Answer |
|---|---|
| Helps food discovery? | ❌ No. Shows no food content. |
| Helps restaurant conversion? | ❌ No. Pushes to game, not to menu. |
| Distracts from menu browsing? | ✅ Yes. Appears before customer reads name, description, or sees any food. |
| Should it remain? | Maybe — but not in this position. |
| Should it move? | Yes — below the info card, or as a subtle sticky footer. |
| Should it be reduced? | Yes — smaller, less animation. |

**Recommendation:** Move below the hours/contact block. Let the customer see the restaurant identity first.

### 2. Today's Reward Card

**Location:** Below info card, above Browse Menu button. Occupies significant vertical real estate.

**What it shows:** "TODAY'S REWARD / [Promotion Name] / reward list / Play Now / Maybe Later"

| Question | Answer |
|---|---|
| Helps food discovery? | Partially. Lists item names that are rewards. |
| Helps restaurant conversion? | Partially. Gives reason to engage. |
| Distracts from menu browsing? | ✅ Yes. Blocks path to menu with a full card. |
| Should it remain? | Yes. |
| Should it move? | It is in the right general position. Consider reducing height. |
| Should it be reduced? | Yes — max 2 reward items shown, not 4. Collapse to a smaller card after first visit. |

**Recommendation:** Keep this component. Reduce to 2 reward items shown. Make it collapsible.

### 3. Reward Widget (Floating 🎁 Button)

**Location:** Fixed bottom-right. Always visible while browsing menu. Pulsing animation.

**What it shows:** Orange circle, 🎁 emoji, ring-expand pulse animation on 3-second loop.

| Question | Answer |
|---|---|
| Helps food discovery? | ❌ No. |
| Helps restaurant conversion? | ❌ No. |
| Distracts from menu browsing? | ✅ Yes. Pulsing element in corner competes with every item card. |
| Should it remain? | Yes — it serves the dismissed-card case. |
| Should it move? | No. |
| Should it be reduced? | Yes — disable the pulse animation after the reward card is dismissed. Show it static. |

**Recommendation:** Remove the pulsing animation from the widget entirely. The 🎁 icon is sufficient. Animation competes with menu content.

### 4. "Win This" Badges

**Location:** Top-left OR top-right corner of item cards in the 2-column grid.

**What they show:** Orange pill badge: "🎁 Win This" or "★ Featured".

**Current coverage:** 5–6 of 11 items carry "Win This" badges (any item tied to a `promotion_reward.menu_item_id`). In the Breakfast section alone, 2 of 3 items have orange badges. In Lunch, 2 of 3. This means nearly every card in the grid has an orange overlay.

| Question | Answer |
|---|---|
| Helps food discovery? | Marginally. Badge draws attention to linked items. |
| Helps restaurant conversion? | ❌ No. |
| Distracts from menu browsing? | ✅ Yes. When >50% of items have badges, the visual hierarchy collapses — nothing stands out. |
| Should it remain? | Yes, on ≤3 items maximum. |
| Should it move? | Badge position is fine. |
| Should it be reduced? | Yes — cap at 3 items; make badge smaller. |

**Recommendation:** Cap "Win This" badge display to the top 2–3 highest-weight rewards. Do not badge every item tied to any reward.

---

## Part 6 — Restaurant Header Audit

### Currently rendered in public header

| Field | DB column | Admin UI | Public render | Punjabi By Nature (Oakville) |
|---|---|---|---|---|
| Logo | `logo_url` | ✅ upload | ✅ bottom-left of hero | ✅ Has logo |
| Hero image | `hero_image_url` | ✅ upload | ✅ full-bleed 256px | ✅ Has hero |
| Name | `name` | ✅ (setup flow) | ✅ brand color | ✅ |
| Description | `description` | ✅ textarea | ✅ below name | ✅ filled |
| Address | `address_line1`, `city`, `province_state` | ✅ | ✅ with 📍 | ✅ |
| Phone | `phone` | ✅ | ✅ clickable tel: link | ✅ |
| Website | `website_url` | ✅ | ✅ conditional button | ❌ NULL |
| Google Maps | `google_maps_url` | ✅ | ✅ conditional button | ❌ NULL |
| Instagram | `instagram_url` | ✅ | ✅ conditional button | ❌ NULL |
| Facebook | `facebook_url` | ✅ | ✅ conditional button | ❌ NULL |
| Hours | `hours` (jsonb) | ✅ 7-day editor | ✅ conditional block | — |

### Missing opportunities

| Field | DB column | Admin UI | Public render | Action needed |
|---|---|---|---|---|
| Google Reviews link | ❌ no column | ❌ no field | ❌ not rendered | Schema change required |
| Review count / star rating | ❌ no column | ❌ no field | ❌ not rendered | Schema change required |
| About / our story (long-form) | ❌ separate column | ❌ no field | ❌ not rendered | Could use `description` — or new column |
| Cuisine type (display) | `cuisine_type` exists | ❌ not in admin tab | ❌ not rendered | No schema change — just admin + render |

### What can be rendered immediately without schema changes

- Website, Maps, Instagram, Facebook links → just needs data entry by restaurant owner
- `cuisine_type` tag in header → just needs admin UI field + render code
- Hours block → depends on data entered by owner

---

## Part 7 — Missing Functionality Backlog

### P0 — Demo Blockers (blocks investor/restaurant-owner demo next week)

| Item | Complexity | Type |
|---|---|---|
| P0-1: Food photos for at least 5 key dishes | Low — data entry only | Content |
| P0-2: Descriptions for at least 5 key dishes | Low — data entry only | Content |
| P0-3: Mark 3 items as featured (triggers featured strip) | Low — data entry only | Content |
| P0-4: Enter display_order to control section ordering | Low — data entry only | Content |
| P0-5: Enter Google Maps URL for restaurant (shows "Directions" button) | Low — data entry only | Content |
| P0-6: Remove/reduce pulsing on RewardWidget (visual noise) | Low — 1-line CSS change | Code |
| P0-7: Cap "Win This" badges to ≤3 items | Low — 10-line logic change | Code |

### P1 — Must-Have QR Menu Features (before any restaurant goes live publicly)

| Item | Complexity | Type |
|---|---|---|
| P1-1: Move Reward Banner below info card (or to sticky footer) | Low | Code |
| P1-2: Admin menu preview shortcut on edit page | Low | Code |
| P1-3: Dietary filter presets (checkboxes: V, VE, GF, Spicy) instead of free-text tags | Medium | Code + DB |
| P1-4: Item card shows at least 1 tag pill when tags exist | Low | Code (already in detail sheet, needs grid card) |
| P1-5: Display sections in meaningful order (lunch first, not creation order) | Low | Data entry (display_order) |
| P1-6: Show hours in header (if configured) | Low | Data entry (hours jsonb) |

### P2 — Nice-to-Have

| Item | Complexity | Type |
|---|---|---|
| P2-1: Drag-and-drop display order instead of number input | Medium | Code |
| P2-2: Gallery / list view toggle on public menu | Medium | Code |
| P2-3: Cuisine type badge in restaurant header | Low | Code + data |
| P2-4: Nutrition placeholder (calories field, shown empty) | Medium | Schema + Admin + Public |
| P2-5: Image optimization on upload (compress before storage) | Medium | Code |
| P2-6: Section-level description ("Small plates to share") | Low | Schema + Admin + Public |

### P3 — Future Roadmap

| Item | Complexity | Type |
|---|---|---|
| P3-1: AI description generation (envelope `ai_metadata` already in DB) | High | Code + AI integration |
| P3-2: Google Reviews integration | High | External API |
| P3-3: Star rating placeholder (editable by owner) | Medium | Schema + Admin + Public |
| P3-4: Language selector (locale switching) | High | i18n infrastructure |
| P3-5: Cart / ordering placeholder | High | Architecture |
| P3-6: POS integration (Square, Toast) | Very High | Integration |
| P3-7: Review / UGC integrations | High | External API |
| P3-8: AI image generation for items | High | AI integration |

---

## Part 8 — Recommendation

**"If SpinBite had to impress a restaurant owner next week, what are the next 5 highest-impact menu improvements?"**

### Rank 1: Enter content for the flagship items (zero code, maximum impact)

Upload photos and write descriptions for at least 5 signature dishes in Punjabi By Nature. Mark 3 of them as Featured. Enter Google Maps and Instagram URLs.

This takes 2–3 hours of data entry. The visual transformation is dramatic: the menu goes from a list of prices with fork icons to a real food discovery experience. Every other improvement on this list is blocked by this one, because the rendering code is ready — there is nothing to display.

**Why it matters:** Every investor or restaurant owner who scans the QR today sees a price list with plate icons. That is the entire impression of the product. Content unlocks the experience already built.

### Rank 2: Cap "Win This" badges to 3 items maximum

Currently 5–6 of 11 items carry the orange "Win This" badge. The grid looks like a promotion overlay rather than a menu. Limit the badge to the top 2–3 highest-weight promotion_rewards only.

**Why it matters:** The "Win This" badge was designed to create excitement around specific items. When every card has one, it creates visual noise instead of urgency. This is a 10-line code change that dramatically improves menu readability.

### Rank 3: Move the Reward Banner below the info card

The animated reward banner currently appears between the hero image and the restaurant name. A customer scans the QR and sees the banner before they have even read the restaurant's name. Moving it below the info card (or collapsing it to a sticky footer) gives the menu experience priority.

**Why it matters:** The product vision is "Beautiful Digital Menu → Promotions (secondary)". The current layout is "Promotion Banner → Name → Promotion Card → Browse Menu → Menu". The order is inverted.

### Rank 4: Remove the RewardWidget pulse animation

The floating 🎁 button pulses on a 3-second loop. While browsing the menu, there is a pulsing orange circle in the bottom-right of every screen. This is visual interference. The icon itself is sufficient — the user already saw the reward card. Remove the CSS animation, keep the button.

**Why it matters:** Animation draws the eye involuntarily. The pulse competes with reading item names and prices. Removing it is a 1-line CSS change and makes the menu feel calmer and more professional.

### Rank 5: Enter social + contact links for the restaurant

Punjabi By Nature (Oakville) has `website_url`, `instagram_url`, `facebook_url`, and `google_maps_url` all set to NULL. The public page conditionally renders horizontal-scroll contact link buttons — but nothing renders because the data is missing. Entering these links activates a complete contact section that is already built.

**Why it matters:** A restaurant owner evaluating the product wants to see their brand fully represented. "Directions / Instagram / Website" links make the page feel like a real restaurant presence, not a test stub. This is data entry only.

---

## Appendix A — Screenshot Evidence

All screenshots captured from `https://spinapp.powerpaneer.com/r/punjabi-by-nature-96179` on 2026-06-10, iPhone 14 viewport (390×844).

| Screenshot | Shows |
|---|---|
| `01_public_hero_banner.png` | Hero image loading, Reward Banner visible, info card, Today's Reward card, Browse Menu button, section nav beginning |
| `02_public_info_hours.png` | Full info card, Today's Reward card, section nav, Breakfast section starting |
| `03_public_reward_card.png` | Reward card, Browse Menu button, Breakfast items — all showing 🍽️ placeholder, Win This badges |
| `04_public_featured_items.png` | Full Breakfast section (Lassi, Pakora, Masala Chai — all placeholder), Lunch starting |
| `05_public_menu_grid.png` | Lunch (Tandoori Chicken, Haryali Chicken, Naan Kabab), Dinner starting — all placeholder |
| `06_public_more_items.png` | Dinner section (Palak Paneer, Kadhi, Sheesh Kabab), Kids Special (Chocolate Pizza, Mini idlis) |
| `07_item_detail_sheet.png` | Lassi detail sheet: plate icon, "Lassi", "$6.99" — no description, no tags, empty |
| `08_full_page.png` | Full page scroll — hero visible at top, complete menu, all items with placeholder icons |

---

## Appendix B — Database State (Punjabi By Nature, Oakville)

**Queried via Supabase MCP on 2026-06-10**

**restaurant_id:** `6c739587-e50c-421d-9fbf-c2cd3f9d6f89`  
**slug:** `punjabi-by-nature-96179`  
**experience_mode:** `menu_and_promotion`

**Menus (sections):**

| Name | slug | display_order |
|---|---|---|
| Breakfast | breakfast | 0 |
| Lunch | lunch | 0 |
| Dinner | dinner | 0 |
| Kids Special | kids-special | 0 |

Note: All sections have `display_order = 0` — sections render in creation order.

**Menu items — rich content status:**

| Name | Price | description | image_url | is_featured | tags | display_order |
|---|---|---|---|---|---|---|
| Pakora | $5.99 | NULL | NULL | false | [] | 0 |
| Lassi | $6.99 | NULL | NULL | false | [] | 0 |
| Masala Chai | $3.00 | NULL | NULL | false | [] | 0 |
| Sheesh Kabab | $23.99 | NULL | NULL | false | [] | 0 |
| Palak Paneer | $25.99 | NULL | NULL | false | [] | 0 |
| Kadhi | $24.99 | NULL | NULL | false | [] | 0 |
| Chocolate Pizza | $12.99 | NULL | NULL | false | [] | 0 |
| Mini idlis | $5.99 | NULL | NULL | false | [] | 0 |
| Haryali Chicken | $24.99 | NULL | NULL | false | [] | 0 |
| Naan Kabab | $13.99 | NULL | NULL | false | [] | 0 |
| Tandoori Chicken | $22.99 | NULL | NULL | false | [] | 0 |

**All 11 items: 0 descriptions, 0 images, 0 featured, 0 tags.**

---

## Appendix C — Files Inspected

| File | Relevance |
|---|---|
| [app/admin/menu/page.tsx](app/admin/menu/page.tsx) | Complete admin menu item editor — all fields confirmed present |
| [components/admin/restaurants/MenuItemImageUploader.tsx](components/admin/restaurants/MenuItemImageUploader.tsx) | Photo upload component — fully implemented |
| [components/public/RestaurantPublicPage.tsx](components/public/RestaurantPublicPage.tsx) | Full public page render — all conditional renders confirmed |
| [app/r/[restaurantSlug]/page.tsx](app/r/[restaurantSlug]/page.tsx) | Server-side data fetch — all fields selected from DB |
| [supabase/migrations/20260606040000_menu_items_enrichment.sql](supabase/migrations/20260606040000_menu_items_enrichment.sql) | DB schema — description, image_url, tags, is_featured, available, display_order all confirmed |
| [supabase/migrations/20260606050000_storage_buckets.sql](supabase/migrations/20260606050000_storage_buckets.sql) | menu-item-images bucket confirmed created |
| [app/admin/restaurants/page.tsx](app/admin/restaurants/page.tsx) | Admin restaurant tabs (Profile/Contact/Settings/QR) |

---

*End of audit. No code was modified. No migrations were created. No data was changed.*
