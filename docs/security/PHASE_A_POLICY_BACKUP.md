# Phase A Pre-Remediation Policy Backup

**Captured:** 2026-06-09  
**Branch:** feature/security-hardening-phase-1  
**Purpose:** Rollback reference — exact live policy definitions before Phase A migration is applied.  
**Project:** viaoholpnysccaijfpox

If a production issue appears after deployment, use the DROP/CREATE statements in each section to restore the previous state.

---

## Table of Contents

1. [restaurants](#restaurants)
2. [menus](#menus)
3. [promotions](#promotions)
4. [customer_profiles](#customer_profiles)
5. [play_sessions](#play_sessions)
6. [promotion_game_assignments](#promotion_game_assignments)
7. [storage.objects — restaurant-logos bucket](#storageobjects--restaurant-logos-bucket)
8. [storage.objects — other buckets (reference)](#storageobjects--other-buckets-reference)

---

## restaurants

### Pre-remediation SELECT policies

```sql
-- Policy: "allow select restaurants"
-- Roles: {public}  Cmd: SELECT
-- USING: true  WITH CHECK: n/a
-- Findings: H-3 (deferred Phase B) — exposes owner PII to anonymous users
CREATE POLICY "allow select restaurants"
  ON public.restaurants
  FOR SELECT
  TO public
  USING (true);

-- Policy: "owners read own restaurants"
-- Roles: {public}  Cmd: SELECT
-- USING: (owner_id = auth.uid() OR owner_id IS NULL)  WITH CHECK: n/a
-- Findings: A-6 — owner_id IS NULL loophole; role should be authenticated
CREATE POLICY "owners read own restaurants"
  ON public.restaurants
  FOR SELECT
  TO public
  USING ((owner_id = auth.uid()) OR (owner_id IS NULL));

-- Policy: "public read restaurants"
-- Roles: {public}  Cmd: SELECT
-- USING: true  WITH CHECK: n/a
-- Findings: H-3 (deferred Phase B) — duplicate unrestricted read
CREATE POLICY "public read restaurants"
  ON public.restaurants
  FOR SELECT
  TO public
  USING (true);
```

### Pre-remediation INSERT policies

```sql
-- Policy: "allow insert restaurants"
-- Roles: {public}  Cmd: INSERT
-- USING: n/a  WITH CHECK: true
-- Findings: C-3 — anonymous insert with arbitrary owner_id
CREATE POLICY "allow insert restaurants"
  ON public.restaurants
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Policy: "authenticated users create restaurants"
-- Roles: {public}  Cmd: INSERT
-- USING: n/a  WITH CHECK: (auth.uid() IS NOT NULL AND owner_id = auth.uid())
-- Note: functionally correct but bound to {public} role instead of {authenticated}
CREATE POLICY "authenticated users create restaurants"
  ON public.restaurants
  FOR INSERT
  TO public
  WITH CHECK ((auth.uid() IS NOT NULL) AND (owner_id = auth.uid()));

-- Policy: "public insert restaurants"
-- Roles: {public}  Cmd: INSERT
-- USING: n/a  WITH CHECK: true
-- Findings: C-3 — anonymous insert with arbitrary owner_id (duplicate)
CREATE POLICY "public insert restaurants"
  ON public.restaurants
  FOR INSERT
  TO public
  WITH CHECK (true);
```

### Pre-remediation UPDATE policies

```sql
-- Policy: "allow update restaurants"
-- Roles: {public}  Cmd: UPDATE
-- USING: true  WITH CHECK: n/a
-- Findings: C-2 — any unauthenticated caller can overwrite any restaurant row
CREATE POLICY "allow update restaurants"
  ON public.restaurants
  FOR UPDATE
  TO public
  USING (true);

-- Policy: "owners update own restaurants"
-- Roles: {public}  Cmd: UPDATE
-- USING: (owner_id = auth.uid() OR owner_id IS NULL)  WITH CHECK: same
-- Findings: A-1 — owner_id IS NULL loophole; shadowed by the open policy above
CREATE POLICY "owners update own restaurants"
  ON public.restaurants
  FOR UPDATE
  TO public
  USING ((owner_id = auth.uid()) OR (owner_id IS NULL))
  WITH CHECK ((owner_id = auth.uid()) OR (owner_id IS NULL));
```

---

## menus

### Pre-remediation SELECT policies

```sql
-- Policy: "public read menus"
-- Roles: {public}  Cmd: SELECT
-- USING: true  WITH CHECK: n/a
-- Findings: A-7 — exposes inactive/draft menus to anonymous users
CREATE POLICY "public read menus"
  ON public.menus
  FOR SELECT
  TO public
  USING (true);

-- Policy: "Public read active menus"
-- Roles: {public}  Cmd: SELECT
-- USING: (active = true)  WITH CHECK: n/a
-- Status: CLEAN — retained in Phase A
CREATE POLICY "Public read active menus"
  ON public.menus
  FOR SELECT
  TO public
  USING ((active = true));
```

### Pre-remediation INSERT policies

```sql
-- Policy: "public insert menus"
-- Roles: {public}  Cmd: INSERT
-- USING: n/a  WITH CHECK: true
-- Findings: C-4 — anonymous insert under any restaurant_id (deferred Phase B)
CREATE POLICY "public insert menus"
  ON public.menus
  FOR INSERT
  TO public
  WITH CHECK (true);
```

### Pre-remediation UPDATE policies

```sql
-- Policy: "public update menus"
-- Roles: {public}  Cmd: UPDATE
-- USING: true  WITH CHECK: n/a
-- Findings: C-4 — any user can rename/deactivate/reorder any menu
CREATE POLICY "public update menus"
  ON public.menus
  FOR UPDATE
  TO public
  USING (true);
```

---

## promotions

### Pre-remediation SELECT policies

```sql
-- Policy: "public read promotions"
-- Roles: {public}  Cmd: SELECT
-- USING: true  WITH CHECK: n/a
-- Findings: Phase B — world-readable; required for QR play flow (deferred)
CREATE POLICY "public read promotions"
  ON public.promotions
  FOR SELECT
  TO public
  USING (true);
```

### Pre-remediation INSERT policies

```sql
-- Policy: "public insert promotions"
-- Roles: {public}  Cmd: INSERT
-- USING: n/a  WITH CHECK: true
-- Findings: C-5 — anonymous insert under any restaurant_id (deferred Phase B)
CREATE POLICY "public insert promotions"
  ON public.promotions
  FOR INSERT
  TO public
  WITH CHECK (true);
```

### Pre-remediation UPDATE policies

```sql
-- Policy: "public update promotions"
-- Roles: {public}  Cmd: UPDATE
-- USING: true  WITH CHECK: n/a
-- Findings: C-5 — any user can modify any promotion's name, slug, status, config
CREATE POLICY "public update promotions"
  ON public.promotions
  FOR UPDATE
  TO public
  USING (true);
```

### Pre-remediation DELETE policies

```sql
-- Policy: "public delete promotions"
-- Roles: {public}  Cmd: DELETE
-- USING: EXISTS (SELECT 1 FROM restaurants r WHERE r.id = promotions.restaurant_id AND r.owner_id = auth.uid())
-- Note: functionally correct ownership check but bound to {public} role
CREATE POLICY "public delete promotions"
  ON public.promotions
  FOR DELETE
  TO public
  USING (EXISTS (
    SELECT 1 FROM restaurants r
    WHERE (r.id = promotions.restaurant_id)
      AND (r.owner_id = auth.uid())
  ));
```

---

## customer_profiles

```sql
-- Policy: "service role full access on customer_profiles"
-- Roles: {public}  Cmd: ALL
-- USING: true  WITH CHECK: true
-- Findings: C-1 CRITICAL — bound to {public} not service_role; any anonymous
--   caller can SELECT/INSERT/UPDATE/DELETE every customer phone + consent record
-- Status: DEFERRED Phase B (requires application coordination)
CREATE POLICY "service role full access on customer_profiles"
  ON public.customer_profiles
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);
```

---

## play_sessions

```sql
-- Policy: "Users can access their play sessions"
-- Roles: {public}  Cmd: ALL
-- USING: EXISTS (SELECT 1 FROM promotions WHERE promotions.id = play_sessions.promotion_id)
-- WITH CHECK: n/a
-- Findings: C-6 — any caller knowing a promotion UUID gains full ALL access to
--   every play session for that promotion (coupon state, session tokens)
-- Status: DEFERRED Phase B (requires application coordination)
CREATE POLICY "Users can access their play sessions"
  ON public.play_sessions
  FOR ALL
  TO public
  USING (EXISTS (
    SELECT 1 FROM promotions
    WHERE (promotions.id = play_sessions.promotion_id)
  ));
```

---

## promotion_game_assignments

```sql
-- Policy: "Users can manage their promotion game assignments"
-- Roles: {public}  Cmd: ALL
-- USING: EXISTS (SELECT 1 FROM promotions WHERE promotions.id = promotion_game_assignments.promotion_id)
-- WITH CHECK: n/a
-- Findings: H-2 — any caller knowing a promotion UUID can modify game type,
--   spin count, or expiry settings for that promotion
-- Status: DEFERRED Phase B (requires application coordination)
CREATE POLICY "Users can manage their promotion game assignments"
  ON public.promotion_game_assignments
  FOR ALL
  TO public
  USING (EXISTS (
    SELECT 1 FROM promotions
    WHERE (promotions.id = promotion_game_assignments.promotion_id)
  ));
```

---

## storage.objects — restaurant-logos bucket

```sql
-- Policy: "Authenticated users upload restaurant logos"
-- Roles: {authenticated}  Cmd: INSERT
-- WITH CHECK: (bucket_id = 'restaurant-logos')
-- Findings: H-4 — no path scoping; any authenticated user can upload to any path
CREATE POLICY "Authenticated users upload restaurant logos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'restaurant-logos');

-- Policy: "Authenticated users update restaurant logos"
-- Roles: {authenticated}  Cmd: UPDATE
-- USING: (bucket_id = 'restaurant-logos')  WITH CHECK: (bucket_id = 'restaurant-logos')
-- Findings: H-4 — no path scoping; any authenticated user can overwrite any logo
CREATE POLICY "Authenticated users update restaurant logos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'restaurant-logos')
  WITH CHECK (bucket_id = 'restaurant-logos');

-- Policy: "Authenticated users delete restaurant logos"
-- Roles: {authenticated}  Cmd: DELETE
-- USING: (bucket_id = 'restaurant-logos')
-- Findings: H-4 — no path scoping; any authenticated user can delete any logo
CREATE POLICY "Authenticated users delete restaurant logos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'restaurant-logos');

-- Policy: "Public read restaurant logos"  (CLEAN — retained)
-- Roles: {public}  Cmd: SELECT
-- USING: (bucket_id = 'restaurant-logos')
CREATE POLICY "Public read restaurant logos"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'restaurant-logos');
```

---

## storage.objects — other buckets (reference)

Included for completeness. These are not modified in Phase A but contain the H-6 `r.name` bug (deferred Phase B).

```sql
-- "Owners upload hero images" — H-6 BUG: uses (storage.foldername(r.name))[2]
--   instead of (storage.foldername(name))[2]; restaurant-ID path segment not validated
CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'restaurant-heroes')
    AND ((storage.foldername(name))[1] = auth.uid()::text)
    AND (EXISTS (
      SELECT 1 FROM restaurants r
      WHERE (r.owner_id = auth.uid())
        AND (r.id::text = (storage.foldername(r.name))[2])  -- BUG: r.name not name
    ))
  );

-- "Owners upload menu item images" — same H-6 bug
CREATE POLICY "Owners upload menu item images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    (bucket_id = 'menu-item-images')
    AND ((storage.foldername(name))[1] = auth.uid()::text)
    AND (EXISTS (
      SELECT 1 FROM restaurants r
      WHERE (r.owner_id = auth.uid())
        AND (r.id::text = (storage.foldername(r.name))[2])  -- BUG: r.name not name
    ))
  );

-- "Owners update hero images"  (USING/WITH CHECK: bucket + foldername[1] = uid)
-- "Owners delete hero images"  (USING: bucket + foldername[1] = uid)
-- "Owners update menu item images"  (same as hero)
-- "Owners delete menu item images"  (same as hero)
-- "Public read hero images"    (USING: bucket_id = 'restaurant-heroes')
-- "Public read menu item images" (USING: bucket_id = 'menu-item-images')
```

---

## Tables with clean policies (no Phase A changes)

| Table | Status |
|---|---|
| `menu_sections` | Clean — all policies are authenticated + owner-scoped |
| `restaurant_settings` | Clean — all policies are authenticated + owner-scoped |
| `menu_items` | H-5 deferred Phase B (missing UPDATE; INSERT/DELETE on wrong role) |
| `guest_sessions` | H-1 deferred Phase B (all policies are qual: true) |

---

## Rollback procedure

If Phase A causes a production issue, run the following in order:

```sql
-- 1. Restore restaurants UPDATE
DROP POLICY IF EXISTS "owners update own restaurants" ON public.restaurants;
CREATE POLICY "allow update restaurants" ON public.restaurants FOR UPDATE TO public USING (true);
CREATE POLICY "owners update own restaurants" ON public.restaurants FOR UPDATE TO public
  USING ((owner_id = auth.uid()) OR (owner_id IS NULL))
  WITH CHECK ((owner_id = auth.uid()) OR (owner_id IS NULL));

-- 2. Restore restaurants INSERT
CREATE POLICY "allow insert restaurants" ON public.restaurants FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "public insert restaurants" ON public.restaurants FOR INSERT TO public WITH CHECK (true);

-- 3. Restore menus UPDATE
DROP POLICY IF EXISTS "owners update own menus" ON public.menus;
CREATE POLICY "public update menus" ON public.menus FOR UPDATE TO public USING (true);

-- 4. Restore promotions UPDATE
DROP POLICY IF EXISTS "owners update own promotions" ON public.promotions;
CREATE POLICY "public update promotions" ON public.promotions FOR UPDATE TO public USING (true);

-- 5. Restore restaurant-logos storage
DROP POLICY IF EXISTS "Owners upload restaurant logos" ON storage.objects;
DROP POLICY IF EXISTS "Owners update restaurant logos" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete restaurant logos" ON storage.objects;
CREATE POLICY "Authenticated users upload restaurant logos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'restaurant-logos');
CREATE POLICY "Authenticated users update restaurant logos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'restaurant-logos') WITH CHECK (bucket_id = 'restaurant-logos');
CREATE POLICY "Authenticated users delete restaurant logos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'restaurant-logos');

-- 6. Restore restaurants SELECT (owner_id IS NULL loophole)
DROP POLICY IF EXISTS "owners read own restaurants" ON public.restaurants;
CREATE POLICY "owners read own restaurants" ON public.restaurants FOR SELECT TO public
  USING ((owner_id = auth.uid()) OR (owner_id IS NULL));

-- 7. Restore menus SELECT
DROP POLICY IF EXISTS "owners read own menus" ON public.menus;
CREATE POLICY "public read menus" ON public.menus FOR SELECT TO public USING (true);
```
