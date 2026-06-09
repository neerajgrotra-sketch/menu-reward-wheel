# Phase C1 Validation — H-6, H-5, H-2

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-c  
**Migration:** `20260609020000_phase_c1_h6_h5_h2_security_hardening`  
**Status:** Applied and validated — 25/25 tests pass

---

## Pre-Implementation Verification

### H-6: menu-item-images upload path convention

A code search across all `.ts` and `.tsx` files confirmed that no application code
currently uploads to `menu-item-images`. The bucket was created ahead of a
future menu item image upload feature. The upload path convention
`[uid]/[restaurant-id]/filename` is consistent with all other storage buckets
and with the intent of the original (buggy) policy. The corrected policy enforces
this convention correctly for when the feature is built.

`HeroImageUploader.tsx:60` constructs restaurant-heroes paths as:
`${ownerId}/${restaurantId}/hero-${Date.now()}.${ext}` — confirming the
`[uid]/[restaurant-id]/filename` pattern for that bucket.

---

## Policy Changes Applied

### H-6: storage.objects — restaurant-heroes and menu-item-images

**Dropped:**
- `"Owners upload hero images"` — {authenticated} INSERT — buggy EXISTS with `r.name`
- `"Owners upload menu item images"` — {authenticated} INSERT — same bug

**Created:**
```sql
-- restaurant-heroes (IN-pattern — same as restaurant-logos from Phase A):
CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM public.restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- menu-item-images:
CREATE POLICY "Owners upload menu item images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'menu-item-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM public.restaurants r WHERE r.owner_id = auth.uid()
    )
  );
```

**Root cause:** Inside `EXISTS(SELECT 1 FROM restaurants r WHERE ...)`, the
unqualified identifier `name` resolved to `restaurants.name` (display name e.g.
"Punjabi By Nature") rather than `storage.objects.name` (the file path).
`storage.foldername("Punjabi By Nature")[2]` returns `NULL`, making the
restaurant-ID check always false. The IN-pattern keeps `storage.foldername(name)`
in the outer `storage.objects` context, where `name` unambiguously refers to the
file path.

**Unchanged policies (confirmed):**
- `"Owners update hero images"` — {authenticated} UPDATE — UID check only (correct)
- `"Owners delete hero images"` — {authenticated} DELETE — UID check only (correct)
- `"Public read hero images"` — {public} SELECT (correct)
- `"Public read menu item images"` — {public} SELECT (correct)
- `"Owners upload restaurant logos"` — already using IN-pattern from Phase A (unchanged)

---

### H-5: menu_items

**Dropped:**
- `"read menu items via restaurant ownership"` — {public} SELECT — redundant with `"Owners read own menu items including deleted"` and used wrong role
- `"insert menu items via restaurant ownership"` — {public} INSERT — role corrected
- `"delete menu items via restaurant ownership"` — {public} DELETE — role corrected

**Created:**
```sql
CREATE POLICY "owners insert own menu items"
  ON public.menu_items FOR INSERT TO authenticated   -- role fixed
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "owners delete own menu items"
  ON public.menu_items FOR DELETE TO authenticated   -- role fixed
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "owners update own menu items"           -- NEW — was missing
  ON public.menu_items FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()));
```

**Unchanged policies (confirmed):**
- `"Owners read own menu items including deleted"` — {authenticated} SELECT ✓
- `"Public read active menu items"` — {public} SELECT, `active = true AND deleted_at IS NULL` ✓

**Functional regression fixed:** `menu/page.tsx:144` calls
`supabase.from('menu_items').update({name, price})`. Without the UPDATE policy
this returned 0 rows affected with no error — the admin UI displayed a false
"Item updated" success. The new `"owners update own menu items"` policy resolves
this.

---

### H-2: promotion_game_assignments

**Dropped:**
- `"Users can manage their promotion game assignments"` — {public} ALL — validated
  promotion existence only, not ownership

**Created:**
```sql
CREATE POLICY "owners manage own promotion game assignments"
  ON public.promotion_game_assignments FOR ALL TO authenticated
  USING (
    promotion_id IN (
      SELECT p.id FROM public.promotions p
      JOIN public.restaurants r ON r.id = p.restaurant_id
      WHERE r.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    promotion_id IN (
      SELECT p.id FROM public.promotions p
      JOIN public.restaurants r ON r.id = p.restaurant_id
      WHERE r.owner_id = auth.uid()
    )
  );
```

**Play flow confirmed unaffected:** `resolvePromotionGame.ts:11-13` uses
`SUPABASE_SERVICE_ROLE_KEY` — service role bypasses RLS entirely. No public
SELECT policy is needed or added.

**Admin builder confirmed unaffected:** `builder/page.tsx:285-289` (SELECT) and
`:508-510` (DELETE + INSERT on save) use `createClient()` — authenticated Supabase
client. The owner policy is satisfied when the calling user owns the promotion's
restaurant.

---

## Validation Results

All tests run against live project `viaoholpnysccaijfpox` using `SET LOCAL ROLE` +
`set_config('request.jwt.claims', ...)`. All DML tests wrapped in
`BEGIN/ROLLBACK` — no data persisted.

**Test owner:** `9ae1992c-01ab-4256-9295-59041e449a70` (Punjabi By Nature)  
**Test restaurant:** `6c739587-e50c-421d-9fbf-c2cd3f9d6f89`  
**Test menu item:** `e0172601-235d-46c9-85ad-a954b4d35f81` (Lassi, active)

### H-6 Storage Path Validation (6/6)

| Test | Description | Expected | Actual | Pass |
|---|---|---|---|---|
| VAL-H6-01 | Owner uploads to own `restaurant-heroes` folder | WITH CHECK = true | true | ✓ |
| VAL-H6-02 | Owner uploads to foreign restaurant's hero folder | WITH CHECK = false | false | ✓ |
| VAL-H6-03 | Wrong UID in path segment 1 | WITH CHECK = false | false | ✓ |
| VAL-H6-04a | Owner uploads to own `menu-item-images` folder | WITH CHECK = true | true | ✓ |
| VAL-H6-04b | Owner uploads to foreign restaurant's menu-item folder | WITH CHECK = false | false | ✓ |
| VAL-H6-05 | `foldername(display_name)[2]` = NULL; `foldername(path)[2]` = restaurant-id | Both true | true | ✓ |

### H-5 menu_items (10/10)

| Test | Role | Operation | Expected | Actual | Pass |
|---|---|---|---|---|---|
| VAL-H5-01 | anon | SELECT active items | >0 rows | 13 rows | ✓ |
| VAL-H5-02 | anon | INSERT | RLS violation | `new row violates row-level security policy` | ✓ |
| VAL-H5-03 | anon | UPDATE | 0 rows affected | 0 | ✓ |
| VAL-H5-04 | anon | DELETE | 0 rows affected | 0 | ✓ |
| VAL-H5-05 | owner | SELECT (incl. inactive) | >0 rows | 7 rows | ✓ |
| VAL-H5-06 | owner | INSERT | 1 row | 1 | ✓ |
| VAL-H5-07 | owner | **UPDATE** | **1 row** | **1** | **✓** |
| VAL-H5-08 | owner | DELETE | 1 row | 1 | ✓ |
| VAL-H5-09 | non-owner auth | UPDATE another restaurant's item | 0 rows | 0 | ✓ |
| VAL-H5-10 | non-owner auth | SELECT inactive items of another restaurant | 0 rows | 0 | ✓ |

VAL-H5-07 is the key regression fix: authenticated owners can now update menu item
names and prices in the admin menu builder.

### H-2 promotion_game_assignments (9/9)

| Test | Role | Operation | Expected | Actual | Pass |
|---|---|---|---|---|---|
| VAL-H2-01 | anon | SELECT | 0 rows | 0 | ✓ |
| VAL-H2-02 | anon | INSERT | RLS violation | `new row violates row-level security policy` | ✓ |
| VAL-H2-03 | anon | DELETE | 0 rows | 0 | ✓ |
| VAL-H2-04 | owner | SELECT own assignments | 1 row (seeded) | 1 | ✓ |
| VAL-H2-05 | owner | INSERT for own promotion | 1 row | 1 | ✓ |
| VAL-H2-06 | owner | DELETE own assignments | 1 row | 1 | ✓ |
| VAL-H2-07 | non-owner auth | SELECT another owner's assignments | 0 rows | 0 | ✓ |
| VAL-H2-08 | non-owner auth | DELETE another owner's assignments | 0 rows | 0 | ✓ |
| VAL-H2-09 | service role | SELECT all (play flow baseline) | all rows visible | 1 (seeded) | ✓ |

---

## Regression Assessment

| Path | Table(s) | Access method | Expected impact | Observed |
|---|---|---|---|---|
| `resolvePromotionGame.ts` (play flow) | `promotion_game_assignments` | `SUPABASE_SERVICE_ROLE_KEY` | None — service role bypasses RLS | Confirmed (VAL-H2-09) |
| `builder/page.tsx` (admin promotion builder) | `promotion_game_assignments` | Authenticated client | None — owner policy satisfied | Confirmed (VAL-H2-04/05/06) |
| `menu/page.tsx` admin SELECT | `menu_items` | Authenticated client | None | Confirmed (VAL-H5-05) |
| `menu/page.tsx` admin INSERT item | `menu_items` | Authenticated client | None | Confirmed (VAL-H5-06) |
| `menu/page.tsx:144` admin UPDATE item | `menu_items` | Authenticated client | **Fixed** — was silently broken | Confirmed (VAL-H5-07) |
| `menu/page.tsx` admin DELETE item | `menu_items` | Authenticated client | None | Confirmed (VAL-H5-08) |
| `HeroImageUploader.tsx` | `storage/restaurant-heroes` | Authenticated client | None — valid paths satisfy corrected policy | Confirmed (VAL-H6-01) |
| Public QR play page | `menu_items` active read | Anonymous / anon key | None — public SELECT policy retained | Confirmed (VAL-H5-01) |

No regressions. One functional regression resolved (menu item UPDATE).

---

## Remaining Security Backlog

### High

| ID | Table | Finding | Status |
|---|---|---|---|
| H-1 | `guest_sessions` | Full cross-tenant read/write (`qual: true` on anon/authenticated) | Deferred to Phase C2 — requires QR play flow code review |
| H-3 | `restaurants` | Owner PII (email, phone, address) readable by anonymous users | Deferred to Phase C2 — requires column-level design decision |

### Medium

| ID | Table | Finding | Status |
|---|---|---|---|
| C-4 | `menus` | Anonymous INSERT under any restaurant_id | Deferred |
| C-5 | `promotions` | Anonymous INSERT under any restaurant_id | Deferred |
