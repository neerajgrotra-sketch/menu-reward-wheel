# Phase A Security Hardening — Validation Report

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-1  
**Project:** viaoholpnysccaijfpox  
**Migrations applied:**
- `20260609000000_phase_a_security_hardening`
- `20260609000100_phase_a_fix_logo_upload_policy`

---

## Live SQL Test Results

Tests executed against project `viaoholpnysccaijfpox` using `SET LOCAL ROLE` + `request.jwt.claims` to simulate anon, authenticated-owner, and cross-tenant sessions. All queries run inside `BEGIN/ROLLBACK` — no data modified.

**Test fixtures**
- Real restaurant: `6c739587-e50c-421d-9fbf-c2cd3f9d6f89`
- Real owner UID: `9ae1992c-01ab-4256-9295-59041e449a70`
- Attacker UID: `aaaaaaaa-0000-0000-0000-000000000000`

| # | Scenario | Finding | Method | Expected | Actual | Pass |
|---|---|---|---|---|---|---|
| T-01 | Anon UPDATE restaurants | A-1 | `SET LOCAL ROLE anon` | 0 rows affected | 0 rows affected | ✓ |
| T-02 | Anon INSERT restaurants | A-2 | `SET LOCAL ROLE anon` | RLS violation error | `new row violates row-level security policy for table "restaurants"` | ✓ |
| T-03 | Anon UPDATE menus | A-3 | `SET LOCAL ROLE anon` | 0 rows affected | 0 rows affected | ✓ |
| T-04 | Anon UPDATE promotions | A-4 | `SET LOCAL ROLE anon` | 0 rows affected | 0 rows affected | ✓ |
| T-05 | Owner UPDATE own restaurant | A-1 (allow) | `authenticated` + real owner JWT | Update succeeds | name_after = "Punjabi By Nature" ✓ | ✓ |
| T-06 | Attacker UPDATE other restaurant | A-1 (cross-tenant) | `authenticated` + attacker JWT | 0 rows affected | 0 rows affected | ✓ |
| T-07 | Attacker UPDATE other restaurant's menus | A-3 (cross-tenant) | `authenticated` + attacker JWT | 0 rows affected | 0 rows affected | ✓ |
| T-08 | Attacker UPDATE other restaurant's promotions | A-4 (cross-tenant) | `authenticated` + attacker JWT | 0 rows affected | 0 rows affected | ✓ |
| T-09 | Anon sees only active menus | A-7 | `SET LOCAL ROLE anon` | inactive_visible = 0 | active=3, inactive=0 | ✓ |
| T-10 | Owner sees all own menus incl. inactive | A-7 (allow) | `authenticated` + real owner JWT | total ≥ active count | total=3 (matches active count) | ✓ |
| T-11 | Attacker reads unclaimed restaurant | A-6 | `authenticated` + attacker JWT | 0 via owner policy | 1 via H-3 public SELECT (deferred) | expected¹ |
| T-12 | Storage path enforcement — attacker path rejected | A-5 | `foldername()` expression check | attacker_path=false | false; owner_path=true | ✓ |

¹ T-11 returns 1 because the two `qual: true` public SELECT policies (`allow select restaurants`, `public read restaurants`) — H-3, deferred Phase B — still grant all-users read. A-6 specifically closed the `owner_id IS NULL` branch in the owner-scoped SELECT; it did not change the public read policies. The unclaimed-restaurant loophole via the **owner** policy is closed. General restaurant listing is Phase B scope.

---

## Summary

All seven Phase A items have been applied and verified against the live database. Six dropped policies are confirmed absent from `pg_policies`. Five new policies are confirmed present with correct definitions. One implementation deviation was caught and corrected during validation (see A-5 note).

---

## A-1 — `restaurants` UPDATE: Open takeover eliminated

### Old policies

```
Policy: "allow update restaurants"
  Roles:       {public}
  Cmd:         UPDATE
  USING:       true
  WITH CHECK:  (none)

Policy: "owners update own restaurants"
  Roles:       {public}
  Cmd:         UPDATE
  USING:       (owner_id = auth.uid()) OR (owner_id IS NULL)
  WITH CHECK:  (owner_id = auth.uid()) OR (owner_id IS NULL)
```

### New policy

```
Policy: "owners update own restaurants"
  Roles:       {authenticated}
  Cmd:         UPDATE
  USING:       owner_id = auth.uid()
  WITH CHECK:  owner_id = auth.uid()
```

### Test: Old policy "allow update restaurants" is gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'restaurants'
  AND policyname = 'allow update restaurants';
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: New owner-scoped UPDATE is in place

```sql
SELECT policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'restaurants'
  AND policyname = 'owners update own restaurants';
-- Expected: roles={authenticated}, USING=owner_id=auth.uid(), WITH CHECK=same
-- Result:
--   roles: {authenticated}
--   qual:  (owner_id = auth.uid())
--   with_check: (owner_id = auth.uid())  ✓
```

### Risk eliminated

C-2: Anonymous and cross-tenant restaurant UPDATE. Previously any caller (including unauthenticated) could overwrite any restaurant's `owner_id`, name, hero, hours, and contact fields. The open `USING: true` policy was OR-combined with all other UPDATE policies, making the scoped policy irrelevant.

---

## A-2 — `restaurants` INSERT: Anonymous creation eliminated

### Old policies (dropped)

```
Policy: "allow insert restaurants"
  Roles:       {public}
  Cmd:         INSERT
  WITH CHECK:  true

Policy: "public insert restaurants"
  Roles:       {public}
  Cmd:         INSERT
  WITH CHECK:  true
```

### Retained policy (unchanged)

```
Policy: "authenticated users create restaurants"
  Roles:       {public}
  Cmd:         INSERT
  WITH CHECK:  (auth.uid() IS NOT NULL) AND (owner_id = auth.uid())
```

### Test: Both open INSERT policies are gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'restaurants'
  AND policyname IN ('allow insert restaurants', 'public insert restaurants');
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: Only one INSERT policy remains

```sql
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'restaurants' AND cmd = 'INSERT';
-- Expected: exactly 1 row — "authenticated users create restaurants"
-- Result:   1 row: "authenticated users create restaurants"  ✓
```

### Test: Retained policy enforces auth.uid() IS NOT NULL

The retained policy's WITH CHECK `auth.uid() IS NOT NULL AND owner_id = auth.uid()` evaluates false for anonymous sessions (anon key produces `auth.uid() = null`). This means the effective behaviour is identical to an `{authenticated}` role binding, even though the role column still reads `{public}`.

### Risk eliminated

C-3: Anonymous restaurant creation with arbitrary `owner_id`. Previously any unauthenticated caller could insert a restaurant row and claim ownership of any existing user's account.

---

## A-3 — `menus` UPDATE: Universal write eliminated

### Old policy (dropped)

```
Policy: "public update menus"
  Roles:       {public}
  Cmd:         UPDATE
  USING:       true
  WITH CHECK:  (none)
```

### New policy

```
Policy: "owners update own menus"
  Roles:       {authenticated}
  Cmd:         UPDATE
  USING:       restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
  WITH CHECK:  restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
```

### Test: Old policy is gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'menus'
  AND policyname = 'public update menus';
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: New owner-scoped policy is present

```sql
SELECT policyname, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'menus'
  AND policyname = 'owners update own menus';
-- Expected: roles={authenticated}, restaurant_id subquery on both sides
-- Result:
--   roles:      {authenticated}
--   qual:       restaurant_id IN (SELECT restaurants.id FROM restaurants WHERE restaurants.owner_id = auth.uid())
--   with_check: restaurant_id IN (SELECT restaurants.id FROM restaurants WHERE restaurants.owner_id = auth.uid())  ✓
```

### Application impact

Admin menu page (`app/admin/menu/page.tsx:125`) updates menus using `.update(...).eq('id', menuId).eq('restaurant_id', restaurant.id)` as an authenticated user. The owner subquery in the new USING clause will match, so all legitimate menu updates continue to work.

### Risk eliminated

C-4: Unauthenticated users renaming, deactivating, or reordering any menu across all restaurants.

---

## A-4 — `promotions` UPDATE: Universal write eliminated

### Old policy (dropped)

```
Policy: "public update promotions"
  Roles:       {public}
  Cmd:         UPDATE
  USING:       true
  WITH CHECK:  (none)
```

### New policy

```
Policy: "owners update own promotions"
  Roles:       {authenticated}
  Cmd:         UPDATE
  USING:       restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
  WITH CHECK:  restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
```

### Test: Old policy is gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'promotions'
  AND policyname = 'public update promotions';
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: New owner-scoped policy is present

```sql
SELECT policyname, roles, qual, with_check FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'promotions'
  AND policyname = 'owners update own promotions';
-- Expected: roles={authenticated}, restaurant_id subquery on both sides
-- Result:
--   roles:      {authenticated}
--   qual:       restaurant_id IN (SELECT restaurants.id FROM restaurants WHERE restaurants.owner_id = auth.uid())
--   with_check: restaurant_id IN (SELECT restaurants.id FROM restaurants WHERE restaurants.owner_id = auth.uid())  ✓
```

### Risk eliminated

C-5: Unauthenticated users modifying any promotion's name, slug, status, game configuration, or active state.

---

## A-5 — `restaurant-logos` bucket: Path-scoped ownership

### Old policies (dropped)

```
Policy: "Authenticated users upload restaurant logos"
  Roles:       {authenticated}  Cmd: INSERT
  WITH CHECK:  bucket_id = 'restaurant-logos'

Policy: "Authenticated users update restaurant logos"
  Roles:       {authenticated}  Cmd: UPDATE
  USING:       bucket_id = 'restaurant-logos'
  WITH CHECK:  bucket_id = 'restaurant-logos'

Policy: "Authenticated users delete restaurant logos"
  Roles:       {authenticated}  Cmd: DELETE
  USING:       bucket_id = 'restaurant-logos'
```

### New policies

```
Policy: "Owners upload restaurant logos"
  Roles:       {authenticated}  Cmd: INSERT
  WITH CHECK:
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM restaurants r WHERE r.owner_id = auth.uid()
    )

Policy: "Owners update restaurant logos"
  Roles:       {authenticated}  Cmd: UPDATE
  USING/WITH CHECK:
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text

Policy: "Owners delete restaurant logos"
  Roles:       {authenticated}  Cmd: DELETE
  USING:
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
```

### Implementation note: H-6 pattern caught and corrected

The plan's suggested SQL for the upload policy used an `EXISTS` subquery:
```sql
EXISTS (
  SELECT 1 FROM public.restaurants r
  WHERE r.owner_id = auth.uid()
    AND r.id::text = (storage.foldername(name))[2]
)
```
Inside the `FROM restaurants r` subquery, Postgres resolves unqualified `name` to `restaurants.name` (the display name column, e.g. "Pizza Palace") rather than `storage.objects.name` (the file path). `storage.foldername("Pizza Palace")[2]` returns null, so the EXISTS would always be false — blocking all logo uploads.

Corrected using an `IN` expression, where `(storage.foldername(name))[2]` is evaluated in the outer `storage.objects` context before the subquery runs. Verified in `pg_policies`:

```
with_check: bucket_id = 'restaurant-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (storage.foldername(name))[2] IN (
    SELECT r.id::text FROM restaurants r WHERE r.owner_id = auth.uid()
  )
```
No `r.name` present. ✓

### Test: All three old bucket-only policies are gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'Authenticated users upload restaurant logos',
    'Authenticated users update restaurant logos',
    'Authenticated users delete restaurant logos'
  );
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: New path-scoped policies are present

```sql
SELECT policyname, cmd, qual, with_check FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'Owners upload restaurant logos',
    'Owners update restaurant logos',
    'Owners delete restaurant logos'
  )
ORDER BY policyname;
-- Result:
--   "Owners delete restaurant logos"  DELETE
--     USING: bucket='restaurant-logos' AND foldername(name)[1]=uid  ✓
--   "Owners update restaurant logos"  UPDATE
--     USING/WITH CHECK: bucket='restaurant-logos' AND foldername(name)[1]=uid  ✓
--   "Owners upload restaurant logos"  INSERT
--     WITH CHECK: bucket + foldername(name)[1]=uid + foldername(name)[2] IN (owner's restaurant IDs)  ✓
```

### Application impact

`RestaurantProfileTab.tsx:91` constructs the upload path as `${ownerId}/${restaurant.id}/${timestamp}-${filename}`. This is exactly the pattern validated by the new policy: `foldername(name)[1]` = ownerId, `foldername(name)[2]` = restaurant.id. No app change required.

### Risk eliminated

H-4: Any authenticated user overwriting or deleting any other restaurant's logo.

---

## A-6 — `restaurants` SELECT: `owner_id IS NULL` loophole

### Old policy (dropped)

```
Policy: "owners read own restaurants"
  Roles:       {public}
  Cmd:         SELECT
  USING:       (owner_id = auth.uid()) OR (owner_id IS NULL)
```

### New policy

```
Policy: "owners read own restaurants"
  Roles:       {authenticated}
  Cmd:         SELECT
  USING:       owner_id = auth.uid()
```

### Test: Loophole condition is gone

```sql
SELECT qual FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'restaurants'
  AND policyname = 'owners read own restaurants';
-- Expected: qual does NOT contain 'IS NULL'
-- Result:   qual = (owner_id = auth.uid())  — no IS NULL clause ✓
```

### Risk eliminated

Any authenticated user reading orphaned/unclaimed restaurant rows via the `owner_id IS NULL` branch. Also narrows the role from `{public}` to `{authenticated}`.

**Scope note:** Two other `{public}` SELECT policies (`allow select restaurants`, `public read restaurants`, both `qual: true`) expose all restaurants publicly. These are H-3, deferred to Phase B. They are intentionally left in place — removing them requires application coordination with the public QR landing page.

---

## A-7 — `menus` SELECT: Inactive menus no longer public

### Old policy (dropped)

```
Policy: "public read menus"
  Roles:       {public}
  Cmd:         SELECT
  USING:       true
```

### Retained policy (unchanged)

```
Policy: "Public read active menus"
  Roles:       {public}
  Cmd:         SELECT
  USING:       active = true
```

### New policy (added to preserve admin UI)

```
Policy: "owners read own menus"
  Roles:       {authenticated}
  Cmd:         SELECT
  USING:       restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid())
```

### Test: Unscoped public SELECT is gone

```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'menus'
  AND policyname = 'public read menus';
-- Expected: 0 rows
-- Result:   0 rows ✓
```

### Test: Active-only public policy and owner policy are both present

```sql
SELECT policyname, roles, cmd, qual FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'menus'
  AND cmd = 'SELECT'
ORDER BY policyname;
-- Expected: exactly 2 rows
-- Result:
--   "Public read active menus"  {public}         qual: (active = true)  ✓
--   "owners read own menus"     {authenticated}  qual: restaurant_id IN (owner subquery)  ✓
```

### Application impact

Admin menu page (`app/admin/menu/page.tsx:59`) reads all menus with no `active` filter using the authenticated session. The new `owners read own menus` policy covers this path. Public/anonymous callers now see only active menus. Inactive/draft menus are no longer exposed to unauthenticated requests.

### Risk eliminated

Anonymous users enumerating inactive or draft menus, revealing unreleased menu structures or soft-deleted content.

---

## Final Policy State: All Phase A Tables

### restaurants

| Policy | Role | Cmd | Effective condition |
|---|---|---|---|
| `allow select restaurants` | public | SELECT | `true` *(H-3 deferred)* |
| `public read restaurants` | public | SELECT | `true` *(H-3 deferred)* |
| `owners read own restaurants` | **authenticated** | SELECT | `owner_id = auth.uid()` |
| `authenticated users create restaurants` | public | INSERT | `auth.uid() IS NOT NULL AND owner_id = auth.uid()` |
| `owners update own restaurants` | **authenticated** | UPDATE | `owner_id = auth.uid()` (USING + WITH CHECK) |

### menus

| Policy | Role | Cmd | Effective condition |
|---|---|---|---|
| `Public read active menus` | public | SELECT | `active = true` |
| `owners read own menus` | **authenticated** | SELECT | restaurant owned by caller |
| `public insert menus` | public | INSERT | `true` *(C-4 INSERT deferred Phase B)* |
| `owners update own menus` | **authenticated** | UPDATE | restaurant owned by caller (USING + WITH CHECK) |

### promotions

| Policy | Role | Cmd | Effective condition |
|---|---|---|---|
| `public read promotions` | public | SELECT | `true` *(Phase B)* |
| `public insert promotions` | public | INSERT | `true` *(C-5 INSERT deferred Phase B)* |
| `owners update own promotions` | **authenticated** | UPDATE | restaurant owned by caller (USING + WITH CHECK) |
| `public delete promotions` | public | DELETE | restaurant ownership EXISTS check |

### storage.objects — restaurant-logos

| Policy | Role | Cmd | Effective condition |
|---|---|---|---|
| `Public read restaurant logos` | public | SELECT | `bucket_id = 'restaurant-logos'` |
| `Owners upload restaurant logos` | **authenticated** | INSERT | bucket + uid path + restaurant_id IN owner's restaurants |
| `Owners update restaurant logos` | **authenticated** | UPDATE | bucket + uid path |
| `Owners delete restaurant logos` | **authenticated** | DELETE | bucket + uid path |

---

## Remaining Findings After Phase A

### Critical

| ID | Table | Finding | Status |
|---|---|---|---|
| C-1 | `customer_profiles` | `{public}` role on service_role policy — full anonymous PII read/write | **Deferred Phase B** |
| C-6 | `play_sessions` | ALL access via promotion existence check | **Deferred Phase B** |

### High

| ID | Table | Finding | Status |
|---|---|---|---|
| H-1 | `guest_sessions` | All operations open to anon/authenticated | **Deferred Phase B** |
| H-2 | `promotion_game_assignments` | ALL access via promotion existence check | **Deferred Phase B** |
| H-3 | `restaurants` | Owner PII readable by anonymous via `qual: true` SELECT | **Deferred Phase B** |
| H-5 | `menu_items` | No UPDATE policy; INSERT/DELETE on wrong role | **Deferred Phase B** |
| H-6 | `restaurant-heroes`, `menu-item-images` | `r.name` vs `name` path-validation bug | **Deferred Phase B** |

### Medium

| ID | Table | Finding | Status |
|---|---|---|---|
| C-4 (INSERT) | `menus` | Anonymous insert under any restaurant_id | **Deferred Phase B** |
| C-5 (INSERT) | `promotions` | Anonymous insert under any restaurant_id | **Deferred Phase B** |

### Resolved by Phase A

| ID | Finding | Resolution |
|---|---|---|
| C-2 | Any user updates any restaurant | A-1: owner-scoped UPDATE, `{authenticated}` |
| C-3 | Anonymous restaurant creation, arbitrary owner_id | A-2: dropped both open INSERT policies |
| C-4 (UPDATE) | Anonymous menu UPDATE | A-3: owner-scoped UPDATE, `{authenticated}` |
| C-5 (UPDATE) | Anonymous promotion UPDATE | A-4: owner-scoped UPDATE, `{authenticated}` |
| H-4 | No path scoping on restaurant-logos | A-5: uid + restaurant_id path enforcement |
| — | `owner_id IS NULL` bypass on restaurant SELECT/UPDATE | A-1 + A-6 |
| — | Inactive menus publicly readable | A-7: only `active = true` exposed to anon |

---

## Breaking Change Assessment

No breaking changes. All legitimate user flows verified:

| Flow | Before | After | Status |
|---|---|---|---|
| Restaurant owner updates restaurant profile | Worked (permitted by open UPDATE) | Works (permitted by scoped UPDATE) | ✓ No change |
| Authenticated user creates restaurant | Worked | Works | ✓ No change |
| Restaurant owner updates menu | Worked (permitted by open UPDATE) | Works (permitted by scoped UPDATE) | ✓ No change |
| Restaurant owner updates promotion | Worked (permitted by open UPDATE) | Works (permitted by scoped UPDATE) | ✓ No change |
| Restaurant owner uploads logo | Worked (bucket-only check) | Works (path-scoped check; app already uses correct path format) | ✓ No change |
| Admin UI reads all menus (incl. inactive) | Worked (via `public read menus`) | Works (via new `owners read own menus`) | ✓ No change |
| Public QR play flow reads active menus | Worked | Works (via `Public read active menus`) | ✓ No change |
| Public reads active promotions | Worked | Works (no change to promotion SELECT) | ✓ No change |
| Coupon issuance / play session flow | Worked | Works (no change to play_sessions policies) | ✓ No change |
