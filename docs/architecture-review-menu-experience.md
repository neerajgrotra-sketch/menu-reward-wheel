# Architecture Review: Menu Experience
**Branch:** `feature/menu-experience-architecture-review`  
**Date:** 2026-06-05  
**Status:** Awaiting review and approval before implementation

---

## Table of Contents
1. [Current State](#1-current-state)
2. [Gaps](#2-gaps)
3. [Recommended Database Changes](#3-recommended-database-changes)
4. [Recommended Admin UI Changes](#4-recommended-admin-ui-changes)
5. [Recommended Public Customer Menu Experience](#5-recommended-public-customer-menu-experience)
6. [Phased Implementation Plan](#6-phased-implementation-plan)
7. [Risks and Complexity](#7-risks-and-complexity)
8. [Files Likely to Change](#8-files-likely-to-change)
9. [Migration Impact](#9-migration-impact)
10. [Security / RLS Impact](#10-security--rls-impact)
11. [Test Plan](#11-test-plan)

---

## 1. Current State

### 1.1 Database Schema — Menu-Related Tables

#### `restaurants`
The restaurant row is the location. No separate `locations` table exists. Each restaurant has one `owner_id` (auth.users), a `slug`, `logo_url` (Supabase Storage), `brand_color`, and basic address fields. `current_promotion_id` is synced by a DB trigger whenever a promotion goes active.

Relevant columns:
```
id, owner_id, name, slug, brand_color, logo_url, current_promotion_id,
address_line1, city, province_state, postal_code, country, phone, cuisine_type
```

#### `menus`
One restaurant can have multiple named menus (Breakfast, Lunch, Dinner, etc.).
```
id, restaurant_id, name, description, active, created_at
```
`menu_type` appears in UI code (`BuilderMenu` type) but is **not confirmed in any CREATE TABLE** statement in the tracked migrations — it may exist only as an in-memory UI concept or an untracked schema addition.

#### `menu_items`
```
id, restaurant_id, menu_id, name, category (TEXT, free-form), price (NUMERIC),
description (TEXT), active (BOOLEAN), created_at
```
- `category` is a raw text field — not a foreign key, not validated, not ordered.
- No image column.
- No `display_order` column.
- No dietary/tag columns.
- `description` exists in DB but the admin Menu page form **does not expose it**.

#### `promotion_rewards`
Links a promotion to either a `menu_item_id` (nullable) or a `custom_name`:
```
id, promotion_id, restaurant_id, menu_item_id (FK → menu_items, nullable),
custom_name, reward_type (free|discount|custom), reward_value, daily_limit, weight, display_order
```
This is the only bridge between menu items and active promotions.

#### No `menu_sections` table exists.
Categories are just strings typed inline. There is no structured section/category hierarchy.

---

### 1.2 Admin Menu Builder (`app/admin/menu/page.tsx`)

**What it does today:**
- Multi-restaurant selector (top-level)
- Create / rename / delete menus
- Create / rename / delete menu items (name + price only)
- In-line editing — no separate edit screen
- Item count per menu shown
- Cascading delete (menu → all its items)

**What it does NOT do:**
- Expose the `description` field when creating or editing items
- Manage categories as a structured entity (add/remove/reorder sections)
- Upload images per item
- Set `display_order` — items appear in insertion order
- Show dietary or tag information
- Preview what the customer would see

All DB calls go directly from the client via the Supabase browser client with RLS — no server actions or API routes are used.

---

### 1.3 Menu Items Inside Promotions

The promotion builder (`app/admin/promotions/[id]/builder/page.tsx`) fetches menu items for a selected menu, then presents them as candidate rewards. The owner clicks an item to add it as a reward slot. At that point the item's `name` becomes the reward label and its `menu_item_id` is stored in `promotion_rewards`.

During gameplay and coupon display, the reward label (and optionally discount value) is shown to the customer. The item's `description`, `price`, `image`, or `category` are **never surfaced** to the customer in the current play flow.

---

### 1.4 Public QR / Play Flow

```
Printed QR code → /r/[restaurantSlug]
  → DB: find current active promotion for restaurant
  → 301 redirect to /play/[restaurantSlug]/[promotionSlug]
    → /api/public/promotion-play (session creation, game pool resolution)
    → Game renders (Spin Wheel / Mystery Box / Scratch Card / etc.)
    → Win → coupon issued → customer sees QR code + countdown
    → Optional: identity panel captures phone + consent
```

There is **no restaurant landing page** or **menu page** in this flow. The `/r/[restaurantSlug]` route's only purpose is to find the active promotion and redirect. A customer who scans the QR code never sees the restaurant's menu — they go straight to the game.

---

### 1.5 Image Upload / Storage Architecture

One Supabase Storage bucket exists today:

| Bucket | Purpose | Public | Max Size | Allowed Types |
|--------|---------|--------|----------|---------------|
| `restaurant-logos` | Restaurant brand logos | Yes | 2 MB | PNG, JPEG, WebP, SVG |

Upload path pattern: `{user.id}/{restaurant.id}/{timestamp}-{sanitized_filename}`  
Public URL stored in `restaurants.logo_url`.

RLS on the bucket enforces that only authenticated owners of that specific restaurant can upload/update/delete; public read is open.

**No bucket for menu item images exists.**

---

### 1.6 Route Structure

| Route | Purpose | Auth |
|-------|---------|------|
| `/` | Marketing landing page | Public |
| `/faq` | FAQ accordion | Public |
| `/r/[restaurantSlug]` | Permanent QR resolver → redirect to active promo | Public |
| `/play/[restaurantSlug]/[promotionSlug]` | Customer game play page | Public |
| `/play/demo` | Demo spin wheel | Public |
| `/auth` | Login / signup | Public |
| `/admin` | Dashboard | Auth required |
| `/admin/menu` | Menu builder | Auth required |
| `/admin/restaurants` | Restaurant profiles | Auth required |
| `/admin/promotions` | Promotion list + create | Auth required |
| `/admin/promotions/[id]/builder` | Promotion rewards + rules | Auth required |
| `/admin/coupons` | Coupon ledger | Auth required |
| `/admin/validate` | Counter coupon scanner | Auth required |

There is **no `/menu/[restaurantSlug]`** route, no `/[restaurantSlug]` landing page, and no location-level slug hierarchy — the restaurant row is the location.

---

## 2. Gaps

### G1 — No public-facing menu page
Customers have no way to browse a restaurant's menu digitally. The only public destination for a restaurant slug is the active promotion game. If there is no active promotion, `/r/[slug]` shows an error.

### G2 — Menu items lack images
`menu_items` has no `image_url` column. There is no storage bucket for food photography. Rewards in the game and on coupons are text-only.

### G3 — No structured menu sections / categories
`menu_items.category` is a free-text string — not a table, not ordered, not reusable. Creating "Starters", "Mains", "Desserts" requires typing them identically on every item. There is no way to reorder or rename a category globally.

### G4 — `description` field is orphaned in the admin UI
The DB column `menu_items.description` exists, but the admin menu builder form only shows `name` and `price`. Owners cannot set descriptions today without a direct DB call.

### G5 — No `display_order` on menu items or sections
Items appear in insertion order only. Owners cannot reorder them. There is no drag-and-drop or ordering mechanism.

### G6 — No dietary / tag metadata on items
No fields for vegan, vegetarian, gluten-free, contains allergens, popular, chef's pick, spicy, etc. These are commonly expected on a digital menu.

### G7 — No featured items concept
There is no way to mark an item as "featured" or "popular" for display prioritization on a menu page.

### G8 — No `is_featured` or `available_hours` scheduling on items
Items are globally active or inactive. A breakfast item cannot be set as available only until 11 AM.

### G9 — Menu builder does not expose item description
Even though the column exists, the admin UI never shows it, making the field useless in practice.

### G10 — Promotion reward labels are disconnected from menu metadata
When a menu item becomes a reward, only its `name` is carried forward as the label. The description, price, and future image are not shown to the customer during or after the game. The coupon is context-free.

### G11 — `/r/[restaurantSlug]` fails with no active promotion
If a restaurant has no active promotion, the permanent QR redirects to an error page. There is no graceful fallback to a restaurant landing page or menu.

### G12 — No `menu_type` column confirmed in tracked migrations
The `menu_type` field on the `menus` table appears in UI code and the builder type definitions, but no `ALTER TABLE menus ADD COLUMN menu_type` was found in any tracked migration file. This may exist as an untracked schema change on the live Supabase project.

---

## 3. Recommended Database Changes

### 3.1 New: `menu_sections` table

Replaces the free-text `category` field with a structured hierarchy: Menu → Section → Items.

```sql
CREATE TABLE menu_sections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id       UUID NOT NULL REFERENCES menus(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX menu_sections_menu_id_idx ON menu_sections(menu_id);
CREATE INDEX menu_sections_restaurant_id_idx ON menu_sections(restaurant_id);
```

### 3.2 Alter `menu_items` — add missing columns

```sql
ALTER TABLE menu_items
  ADD COLUMN section_id    UUID REFERENCES menu_sections(id) ON DELETE SET NULL,
  ADD COLUMN image_url     TEXT,
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN is_featured   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN tags          TEXT[] DEFAULT '{}';

CREATE INDEX menu_items_section_id_idx ON menu_items(section_id);
CREATE INDEX menu_items_display_order_idx ON menu_items(menu_id, display_order);
```

`section_id` is nullable so existing items with only a `category` string do not break. Both fields coexist during migration; `category` becomes deprecated and can be dropped in a future release.

`tags` is a text array for arbitrary labels: `['vegan', 'gluten-free', 'popular', 'spicy']`. This is simpler than a join table for now.

### 3.3 New: `menu-item-images` storage bucket

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-item-images',
  'menu-item-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
);
```

Upload path: `{user.id}/{restaurant.id}/{menu_item.id}/{timestamp}-{filename}`

### 3.4 Alter `menus` — add `slug` and confirm `menu_type`

```sql
-- Confirm menu_type exists (add if missing):
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_type TEXT DEFAULT 'all_day';

-- Add slug for public URL:
ALTER TABLE menus
  ADD COLUMN slug TEXT;

-- Back-fill slug from name:
UPDATE menus SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g'));

ALTER TABLE menus
  ADD CONSTRAINT menus_restaurant_slug_unique UNIQUE (restaurant_id, slug);
```

### 3.5 Optional: `restaurants.menu_page_enabled` flag

```sql
ALTER TABLE restaurants
  ADD COLUMN menu_page_enabled BOOLEAN NOT NULL DEFAULT false;
```

Gates the public menu page per restaurant so owners can opt in when their menu is ready, rather than exposing an empty page to all customers on day one.

### 3.6 Summary of schema changes

| Table | Change | Reason |
|-------|--------|--------|
| `menu_sections` | New table | Structured section hierarchy |
| `menu_items` | Add `section_id`, `image_url`, `display_order`, `is_featured`, `tags` | Rich menu content |
| `menus` | Add `slug`, confirm `menu_type` | Public URL + type-aware display |
| `restaurants` | Add `menu_page_enabled` | Opt-in public menu |
| Storage | New `menu-item-images` bucket | Food photography |

---

## 4. Recommended Admin UI Changes

### 4.1 Menu Builder — `/admin/menu/page.tsx`

**Expose item description field**
The existing `menu_items.description` column must be shown in the create and edit form. Currently invisible, making the DB column useless.

**Structured section management**
Below the menu selector, show sections as collapsible groups. Owners can:
- Add a section (name it, optionally give a description)
- Reorder sections (up/down arrows or drag handles — drag is preferred)
- Delete a section (warns if items are in it; orphans items to no section or prompts re-assignment)

**Item form enhancement**
When adding or editing an item, the form should expose:
- Name (existing)
- Price (existing)
- Description (new exposure — column already exists)
- Section (dropdown of sections in that menu)
- Tags (multi-select chips: Vegan, Vegetarian, Gluten-Free, Popular, Spicy, New, Chef's Pick)
- Featured toggle
- Image upload (new, calls Supabase Storage)
- Display order within section (numeric or drag-and-drop)

**Image upload component**
Mirror the logo upload pattern in `app/admin/restaurants/page.tsx`. Key differences:
- Bucket: `menu-item-images`
- Storage path: `{userId}/{restaurantId}/{menuItemId}/{timestamp}-{filename}`
- 5 MB max, PNG/JPEG/WebP only
- Show thumbnail in item list after upload
- Allow replacement or removal

**Menu preview tab**
Add a "Preview" tab or slide-out panel to the menu builder that renders a read-only customer view of the selected menu — sections, items, images, tags, prices — so the owner can see what customers will see before publishing.

### 4.2 Promotion Builder — `/admin/promotions/[id]/builder/page.tsx`

**Show item image and description when selecting rewards**
In Step 2 (Add Rewards), the item picker currently shows only the item name as a button. It should show:
- Thumbnail image (if available)
- Name + price
- Category/section badge

This helps owners choose the right items for their promotion.

**Surface item context on the reward card**
After an item is added as a reward, the reward configuration card (Step 3) should show the item's image thumbnail alongside the name, giving the owner confirmation they chose the right item.

---

## 5. Recommended Public Customer Menu Experience

### 5.1 New route: `/menu/[restaurantSlug]`

A public, non-authenticated restaurant menu landing page. This becomes the graceful fallback destination for `/r/[restaurantSlug]` when there is no active promotion.

**Page structure:**
```
[Restaurant Logo]  [Restaurant Name]
[Cuisine type]  [City, Province]
[Phone]

┌──────────────────────────────────┐
│  🎯  Active Promotion Banner      │
│  "Spin to win a free appetizer!" │
│  [Play Now →]                    │
└──────────────────────────────────┘

[Menu selector tabs: Breakfast | Lunch | Dinner]

── Starters ────────────────────────
 [img] Calamari          $14.00
       Crispy rings, served with...
       [Gluten-Free] [Popular]

 [img] Soup of the Day   $8.00
       Ask your server for today's...

── Mains ───────────────────────────
 [img] ★ Grilled Salmon  $28.00    ← is_featured = true
       Atlantic salmon, lemon...
       [Gluten-Free]
...
```

**Data needed:**
- `restaurants` — name, slug, logo_url, brand_color, address, cuisine_type
- `menus` — list for restaurant where `active = true`
- `menu_sections` — ordered by `display_order` within each menu
- `menu_items` — ordered by `display_order` within each section, where `active = true`
- `promotions` — active promotion (if any) for the restaurant (for the banner CTA)

**Rendering strategy:**
- Server component (Next.js RSC) for SEO and fast first paint
- `force-dynamic` (no caching) — menus change frequently
- No authentication required
- Uses the **anon** Supabase key — no service role needed (menu data is public)

### 5.2 Update `/r/[restaurantSlug]` fallback behavior

Current behavior when no active promotion: error page.

Recommended behavior:
```
/r/[restaurantSlug]
  ├── Active promotion found → redirect to /play/[slug]/[promoSlug]  (unchanged)
  └── No active promotion
        ├── restaurant.menu_page_enabled = true → redirect to /menu/[slug]
        └── restaurant.menu_page_enabled = false → show "No active promotion" message
              with link to restaurant's social or website (if stored)
```

### 5.3 Coupon page — link to full menu

After a customer wins and sees their coupon QR code, add a "View Full Menu" link that opens `/menu/[restaurantSlug]`. This gives the customer something to do while they wait for the table and increases menu engagement.

### 5.4 Menu page — cross-link to active promotion

If the customer arrives at `/menu/[restaurantSlug]` directly (typed URL, Google search, etc.) and there IS an active promotion, the banner CTA (`[Play Now →]`) links them to `/play/[restaurantSlug]/[promotionSlug]`. This makes the menu page both a discovery surface and a conversion funnel.

---

## 6. Phased Implementation Plan

### Phase 1 — Database Foundation
**Effort:** Small (1–2 days)  
**Risk:** Low — additive changes only, no breaking alterations

1. Write migration: create `menu_sections` table
2. Write migration: add `section_id`, `image_url`, `display_order`, `is_featured`, `tags` to `menu_items`
3. Write migration: add `slug` to `menus`, back-fill, add unique constraint
4. Write migration: confirm / add `menu_type` to `menus` via `ADD COLUMN IF NOT EXISTS`
5. Write migration: add `menu_page_enabled` to `restaurants`
6. Write migration: create `menu-item-images` storage bucket + RLS policies
7. Apply RLS policies for `menu_sections` (same pattern as `menu_items`)
8. Generate updated TypeScript types

**Does not touch any existing routes or UI.**

---

### Phase 2 — Admin Menu Builder Enhancement
**Effort:** Medium (3–4 days)  
**Risk:** Low–Medium — changes to an admin-only page, no public impact

1. Expose `description` field in item create/edit form (1 line DB query change)
2. Add `menu_sections` CRUD to the menu builder page:
   - Section list per menu (fetched alongside items)
   - Add section form (name + description)
   - Inline rename
   - Delete with item-reassignment warning
   - Display order reordering (up/down buttons first; drag-and-drop in Phase 4)
3. Update item form to include: section selector, tags multi-select, featured toggle, display order
4. Image upload component for menu items (mirror logo upload pattern):
   - New `menu-item-images` bucket
   - Upload → store URL → update `menu_items.image_url`
   - Thumbnail in item list
   - Remove / replace existing image
5. Verify all DB calls respect `restaurant_id` RLS

---

### Phase 3 — Public Menu Page
**Effort:** Medium (2–3 days)  
**Risk:** Low — new route, no changes to existing routes

1. Create `app/menu/[restaurantSlug]/page.tsx` as a server component
2. Fetch restaurant, menus, sections, and items using anon key
3. Design mobile-first layout:
   - Header: logo, name, cuisine, address
   - Active promotion banner (if any) with "Play Now" CTA
   - Menu tab selector (if multiple menus)
   - Sections as headings, items in grid/list
   - Item cards: image thumbnail, name, price, description, tags
   - Featured items styled distinctly
4. Handle edge cases:
   - Restaurant not found → 404
   - No menus or items → "Menu coming soon" state
   - `menu_page_enabled = false` → redirect to `/r/[slug]`
5. Update `/r/[restaurantSlug]/page.tsx` fallback logic

---

### Phase 4 — Integration & Polish
**Effort:** Small–Medium (2 days)  
**Risk:** Low — additive links and enhancements

1. Add "View Full Menu" link on the coupon display screen (`/play/[slug]/[slug]/page.tsx`)
2. Add item image thumbnails to the promotion builder reward picker (Step 2)
3. Drag-and-drop reordering for sections and items in the admin menu builder
4. Add a "Preview Menu" panel to the admin menu builder

---

### Phase 5 — Future Considerations (Not scoped yet)
- Item availability scheduling (available_from / available_until times)
- Multi-location menu sharing / inheritance
- Nutritional / calorie information
- Item modifier groups (size, toppings)
- Menu export to PDF / print

---

## 7. Risks and Complexity

### R1 — `menu_type` column ambiguity (Medium)
The `menus.menu_type` field appears in the TypeScript types and builder UI code but is NOT confirmed in any tracked migration SQL. If the column doesn't exist on the live DB, Phase 1 needs to add it via `ADD COLUMN IF NOT EXISTS`. If it DOES exist (added manually in Supabase dashboard), the `IF NOT EXISTS` guard makes the migration safe. **Action: verify before writing migration.**

### R2 — `play_sessions` / `coupon_redemptions` missing CREATE TABLE (Medium)
Both tables are actively used by API routes and referenced in migrations, but their original `CREATE TABLE` statements were not found in any migration file. They may have been created manually in Supabase dashboard. This is a **schema drift** risk — the source of truth may not be version-controlled. **Action: generate current schema from Supabase and add a schema-recovery migration for these tables before Phase 1.**

### R3 — Section vs. category migration path (Low–Medium)
Existing `menu_items` use `category` (text) as their grouping. After adding `section_id`, items will have `section_id = NULL` until owners migrate them. The public menu page must handle both states gracefully: items with `section_id` shown under their section; items with only `category` text shown under a generated "Uncategorized" or category-name bucket. **Plan: keep `category` column indefinitely as a display fallback; never DROP it until it is fully empty.**

### R4 — Image storage costs and performance (Low)
Food photography can be large. The 5 MB per file limit in the proposed bucket is reasonable, but high-volume restaurants could accumulate significant storage. Images should be served via Supabase's CDN (public bucket = automatic CDN). No resizing/optimization is planned in this phase; consider Supabase Image Transformations or an external CDN if performance becomes an issue.

### R5 — RLS complexity for `menu_sections` (Low)
`menu_sections` must follow the same owner-gated RLS pattern as `menu_items`: `restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())`. Adding a new table means adding new policies — these must be written carefully to avoid accidental public write access.

### R6 — Admin menu builder page size (Low)
`app/admin/menu/page.tsx` is currently a client component with all CRUD inline. Adding sections, images, tags, and drag-and-drop will significantly grow this file. Consider splitting into sub-components (`MenuSectionList`, `MenuItemCard`, `MenuItemForm`, `ImageUploader`) before Phase 2 starts to keep the file maintainable.

### R7 — `/r/[restaurantSlug]` fallback changes customer expectations (Low)
Any restaurants that have printed or distributed QR codes pointing to `/r/[slug]` will now route to a menu page when no promotion is running. This is intentional and better than an error page, but owners should be notified of the behavior change.

---

## 8. Files Likely to Change

### New Files
| File | Purpose |
|------|---------|
| `supabase/migrations/YYYYMMDD_menu_sections.sql` | Create menu_sections, alter menu_items, create storage bucket |
| `app/menu/[restaurantSlug]/page.tsx` | Public menu landing page (server component) |
| `app/menu/[restaurantSlug]/MenuPageClient.tsx` | Client-side tab switching, if needed |
| `components/admin/menu/MenuSectionList.tsx` | Section CRUD list component |
| `components/admin/menu/MenuItemForm.tsx` | Enhanced item create/edit form |
| `components/admin/menu/MenuItemImageUploader.tsx` | Image upload for menu items |
| `components/menu/MenuItemCard.tsx` | Public-facing item card |
| `components/menu/MenuSectionGroup.tsx` | Public-facing section group |
| `components/menu/PromotionBanner.tsx` | Active promotion CTA on menu page |

### Modified Files
| File | Change |
|------|--------|
| `app/admin/menu/page.tsx` | Add sections CRUD, expose description, tags, featured, image upload, display order |
| `app/r/[restaurantSlug]/page.tsx` | Add fallback redirect to `/menu/[slug]` when no active promotion |
| `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` | Add "View Full Menu" link on coupon display |
| `app/admin/promotions/[id]/builder/page.tsx` | Add item image thumbnail to reward picker |
| `lib/builder/types.ts` | Extend `BuilderMenuItem` with `image_url`, `tags`, `section_id` |
| `types/reward.ts` | Extend `MenuItem` type with new columns |

---

## 9. Migration Impact

### Data Safety
All Phase 1 migrations are **additive** (new table, new columns). No existing columns are altered or dropped. No data is moved or transformed automatically. Existing rows will have `NULL` for all new nullable columns.

### Back-fill requirements
- `menus.slug`: must be back-filled from `name` at migration time (SQL `UPDATE` in migration file). Use `lower(regexp_replace(name, '[^a-z0-9]+', '-', 'g'))`. If two menus for the same restaurant produce the same slug, append `-2`, `-3`, etc. (requires a PL/pgSQL function in the migration).
- `menu_items.display_order`: back-fill with `0` (default) — all items will have the same order initially; owners set order manually via admin UI.
- `menus.menu_type`: back-fill existing rows with `'all_day'` if column is new.

### Zero downtime
Since all changes are additive, the app can continue running during migration. No column renames, no type changes, no index rebuilds on large tables. The only potential lock is on `menu_items` (adding 5 columns) — on a small dataset this is instant; on a table with millions of rows, consider `ADD COLUMN ... NOT NULL DEFAULT ...` vs nullable.

### Type regeneration
After applying migrations, run:
```bash
supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
```
All consuming code must be updated to handle the new columns (they will be optional/nullable).

---

## 10. Security / RLS Impact

### `menu_sections` — new table, needs RLS

Recommended policies (mirror `menu_items`):

```sql
-- Public read (for the menu page)
CREATE POLICY "Public read menu_sections"
  ON menu_sections FOR SELECT USING (true);

-- Owner write (admin menu builder)
CREATE POLICY "Owners manage menu_sections"
  ON menu_sections FOR ALL
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

### `menu-item-images` storage bucket — new bucket, needs RLS

```sql
-- Public read (images shown on menu page and play page)
CREATE POLICY "Public read menu item images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-item-images');

-- Owner upload (path must start with their user ID and match a restaurant they own)
CREATE POLICY "Restaurant owners upload menu item images"
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

-- Owner update/delete
CREATE POLICY "Restaurant owners update/delete menu item images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-item-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### Existing tables — no RLS changes needed
`menu_items` and `menus` already have public SELECT policies. The new columns (`image_url`, `section_id`, `tags`, etc.) inherit the existing policies automatically. No changes required.

### Public menu page — anon key safe
The `/menu/[restaurantSlug]` server component uses the anon Supabase client (same as the play page data fetch). It reads only public data (`menus`, `menu_sections`, `menu_items`, `restaurants`). No service role key required, no auth cookie required. This is consistent with how the play page loads restaurant and promotion data.

### No new attack surface introduced
- All new admin writes are gated by existing `owner_id = auth.uid()` checks via RLS
- Image uploads are path-scoped to the uploading user's ID (preventing cross-restaurant overwrites)
- The public menu page is read-only; no user input is submitted from it
- `menu_page_enabled` flag is owner-controlled and only gates display — no security boundary

---

## 11. Test Plan

### Unit / Integration Tests (Recommended additions)

| Test | What it verifies |
|------|----------------|
| `menu_sections` RLS — public read | Anon user can SELECT from `menu_sections` |
| `menu_sections` RLS — owner write | Authenticated owner can INSERT/UPDATE/DELETE own sections |
| `menu_sections` RLS — other owner blocked | User B cannot INSERT into User A's restaurant's sections |
| `menu_items` — `section_id` FK | Cannot insert a section_id that doesn't exist |
| `menu_items` — `section_id` ON DELETE SET NULL | Deleting a section nulls item.section_id, does not cascade-delete items |
| `menus.slug` uniqueness | Cannot create two menus with same slug in same restaurant |
| Storage policy — owner upload | Owner can upload to `menu-item-images/{their-user-id}/{their-restaurant-id}/...` |
| Storage policy — cross-restaurant blocked | Owner cannot upload to `menu-item-images/{their-user-id}/{other-restaurant-id}/...` |
| Storage policy — public read | Anon can GET any image URL from the bucket |

### Admin UI Manual Tests

| Flow | Expected outcome |
|------|----------------|
| Create menu section | Section appears in list, items can be assigned to it |
| Rename section | Name updates inline |
| Delete section with items | Warning shown; items moved to "Uncategorized" or reassigned |
| Reorder sections | `display_order` updates; list re-renders in new order |
| Add item with image | Image uploads to storage; thumbnail shown in item list |
| Edit item description | Description saved; visible on preview |
| Toggle item tags | Tags save as array; displayed as chips |
| Menu preview | Shows same layout as public menu page |
| Remove item image | Image deleted from storage; `image_url` set to NULL |

### Public Menu Page Manual Tests

| Scenario | Expected outcome |
|---------|----------------|
| Restaurant with active promotion + menu | Banner shows CTA; menu renders below |
| Restaurant with no active promotion, `menu_page_enabled = true` | Menu renders, no banner; `/r/[slug]` redirects here |
| Restaurant with no active promotion, `menu_page_enabled = false` | `/r/[slug]` shows "no active promotion" message |
| Restaurant not found | 404 page |
| Restaurant with no items | "Menu coming soon" state |
| Items with `section_id` | Grouped under named section headings |
| Items with only `category` text (legacy) | Grouped under category string as heading |
| Items with `is_featured = true` | Visually distinct (star badge, top of section) |
| Items with tags | Tag chips displayed (Vegan, Gluten-Free, etc.) |
| Item with no image | Placeholder / icon shown |
| Item with image | Image thumbnail renders from Supabase Storage CDN |
| Mobile viewport (375px) | Single column, readable card layout |

### Regression Tests (Existing flows must not break)

| Flow | Verify |
|------|--------|
| `/r/[slug]` with active promotion | Still redirects to play page (no change) |
| Promotion builder item picker | Items still load; new columns do not break query |
| Play page | Game still renders; reward labels still work |
| Coupon issuance | Unaffected by schema additions |
| Admin menu page (before Phase 2 changes) | Existing create/edit/delete works on `name` and `price` |
| Logo upload | Unchanged — different bucket, unaffected |

---

*This document represents the architecture review findings only. No implementation changes have been made to the codebase. All recommendations require review and approval before any code is written.*
