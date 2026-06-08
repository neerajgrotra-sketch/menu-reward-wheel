# SpinBite Security Hardening Plan

**Date:** 2026-06-08  
**Branch:** feature/security-hardening-phase-1  
**Blocks:** Menu Foundation (Phase 2), Public Menu, Promotion Widget  
**Status:** NOT STARTED — audit complete, remediation pending

---

## Context

A full multi-tenant RLS and storage audit was performed on 2026-06-08 against Supabase project `viaoholpnysccaijfpox`. The audit found that the platform's founding tables (`restaurants`, `menus`, `promotions`, `customer_profiles`, `play_sessions`, `guest_sessions`) were never hardened past prototype-era permissive policies. Newer tables (`restaurant_settings`, `menu_sections`) are correctly scoped.

All Menu Foundation and public-facing feature work is **paused** until Phase A remediation is complete.

---

## Critical Findings

### C-1 — `customer_profiles`: Full unauthenticated read/write

The policy named `service role full access on customer_profiles` is bound to the `{public}` role (not the service role). Any anonymous user can read, insert, update, and delete all customer profiles across all restaurants. This table contains customer phone numbers and post-win consent records.

**Attack:** `SELECT * FROM customer_profiles` with the anon key returns every customer record in the database.

---

### C-2 — `restaurants`: Any user can update any restaurant

The policy `allow update restaurants` has `qual: true` and no `WITH CHECK`. Any unauthenticated caller can overwrite any restaurant's `owner_id`, `name`, `slug`, `hero_image_url`, `hours`, `experience_mode`, or any contact field. A second policy `owners update own restaurants` is irrelevant — permissive policies are OR'd, so the `true` policy always wins.

**Attack:** `UPDATE restaurants SET owner_id = '<attacker-uid>'` with the anon key succeeds against any row.

---

### C-3 — `restaurants`: Unauthenticated insert with arbitrary `owner_id`

Two INSERT policies (`allow insert restaurants`, `public insert restaurants`) both have `with_check: true`. Any anonymous user can create a restaurant row and set `owner_id` to any existing user's UUID, effectively hijacking their account by claiming ownership.

---

### C-4 — `menus`: Unauthenticated insert and universal update

`public insert menus` (`with_check: true`) and `public update menus` (`qual: true`) allow any anonymous user to create menus under any `restaurant_id` or rename, deactivate, and reorder any menu in the database. No owner-scoped write policies exist on this table.

---

### C-5 — `promotions`: Unauthenticated insert and universal update

`public insert promotions` (`with_check: true`) and `public update promotions` (`qual: true`) allow any anonymous user to create promotions for any restaurant and modify any existing promotion's name, slug, status, or configuration.

---

### C-6 — `play_sessions`: Full cross-tenant access via promotion existence

The policy `Users can access their play sessions` grants ALL operations to any caller as long as `promotion_id` exists in the promotions table — which is itself world-readable. Any anonymous user knowing one promotion UUID gains full read, write, update, and delete access to every play session for that promotion. Play sessions contain coupon issuance state and session tokens.

---

## High Findings

### H-1 — `guest_sessions`: Full cross-tenant read/write by any anonymous user

All three policies (`Allow guest session inserts`, `Allow guest session reads`, `Allow guest session updates`) have `qual: true` against `{anon, authenticated}` roles. Any unauthenticated request can enumerate, modify, or overwrite guest sessions across all restaurants.

### H-2 — `promotion_game_assignments`: Cross-tenant write via promotion existence

Same structural flaw as C-6. Any user knowing a promotion UUID can modify that promotion's game assignment — changing the game type, spin count, or expiry settings.

### H-3 — `restaurants`: Owner PII readable by anonymous users

Three SELECT policies (two with `qual: true`) return full restaurant rows including `contact_email`, `phone`, `address_line1`, `city`, `province_state`, `postal_code`, and `owner_name` to unauthenticated requests.

### H-4 — `restaurant-logos` bucket: No path scoping

The upload, update, and delete policies for the `restaurant-logos` bucket check only `bucket_id = 'restaurant-logos'`. Any authenticated user can overwrite or delete any other restaurant's logo file regardless of ownership.

### H-5 — `menu_items`: No UPDATE policy — owner writes silently blocked

There is no UPDATE policy for `menu_items`. RLS blocks all owner updates silently. Restaurant owners cannot update item names, prices, descriptions, or availability. Additionally, INSERT and DELETE policies use the `{public}` role instead of `{authenticated}`.

### H-6 — Storage upload ownership check bug (`r.name` vs `name`)

The EXISTS subquery in the INSERT policies for both `restaurant-heroes` and `menu-item-images` buckets references `storage.foldername(r.name)[2]` where `r.name` is the restaurant's display name string (e.g., `"Pizza Palace"`). The correct reference is `storage.foldername(name)[2]` (the storage object path). This makes the restaurant-ID ownership check always false, meaning only the UID path prefix is enforced — the second path segment (restaurant ID) is not validated.

---

## Phase A Remediation Scope

These seven changes are immediately safe to apply as a single migration with no application code changes. They drop or replace policies that are currently more permissive than required and do not constrain any legitimate user flow.

### A-1 — Fix `restaurants` UPDATE policies

```sql
DROP POLICY "allow update restaurants" ON restaurants;
DROP POLICY "owners update own restaurants" ON restaurants;

CREATE POLICY "owners update own restaurants"
  ON restaurants FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
```

Removes the open `qual: true` UPDATE. The `owner_id IS NULL` loophole is also eliminated.

---

### A-2 — Fix `restaurants` INSERT policies

```sql
DROP POLICY "allow insert restaurants" ON restaurants;
DROP POLICY "public insert restaurants" ON restaurants;
-- Retain: "authenticated users create restaurants"
--   with_check: auth.uid() IS NOT NULL AND owner_id = auth.uid()
```

Eliminates unauthenticated restaurant creation and arbitrary `owner_id` injection.

---

### A-3 — Fix `menus` UPDATE policies

```sql
DROP POLICY "public update menus" ON menus;

CREATE POLICY "owners update own menus"
  ON menus FOR UPDATE
  TO authenticated
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));
```

Removes open UPDATE. Adds owner-scoped replacement.

---

### A-4 — Fix `promotions` UPDATE policies

```sql
DROP POLICY "public update promotions" ON promotions;

CREATE POLICY "owners update own promotions"
  ON promotions FOR UPDATE
  TO authenticated
  USING (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM restaurants WHERE owner_id = auth.uid()));
```

Removes open UPDATE. Adds owner-scoped replacement.

---

### A-5 — Fix `restaurant-logos` storage bucket policies

```sql
DROP POLICY "Authenticated users upload restaurant logos" ON storage.objects;
DROP POLICY "Authenticated users update restaurant logos" ON storage.objects;
DROP POLICY "Authenticated users delete restaurant logos" ON storage.objects;

CREATE POLICY "Owners upload restaurant logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.restaurants r
      WHERE r.owner_id = auth.uid()
        AND r.id::text = (storage.foldername(name))[2]
    )
  );

CREATE POLICY "Owners update restaurant logos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owners delete restaurant logos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'restaurant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

Applies the same path-scoped ownership pattern already used by `restaurant-heroes` and `menu-item-images`.

---

### A-6 — Remove `owner_id IS NULL` loophole from `restaurants` SELECT

```sql
DROP POLICY "owners read own restaurants" ON restaurants;

CREATE POLICY "owners read own restaurants"
  ON restaurants FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());
```

Eliminates any authenticated user's ability to read unclaimed restaurant rows.

---

### A-7 — Drop `public read menus` unscoped SELECT

```sql
DROP POLICY "public read menus" ON menus;
-- Retain: "Public read active menus" (qual: active = true)
```

Removes the `qual: true` policy that exposes inactive menus to anonymous users. The narrower `Public read active menus` policy is sufficient for the customer-facing menu page.

---

## Deferred Phases (require application coordination)

The following findings are real but require changes to both the database and the application layer. They are out of scope for Phase A and will be addressed in a follow-on sprint after reviewing the public play flow and customer identity flow:

- **B-1** — `customer_profiles` full exposure (C-1)
- **B-2** — `menus` INSERT / DELETE owner policies (C-4)
- **B-3** — `promotions` INSERT / DELETE / SELECT scoping (C-5)
- **B-4** — `promotion_game_assignments` owner policies (H-2)
- **B-5** — `menu_items` UPDATE policy + role fix (H-5)
- **B-6** — Storage `r.name` bug fix in hero and menu-item-images buckets (H-6)
- **C-6** — `play_sessions` session-token scoping (C-6)
- **H-1** — `guest_sessions` scoping
- **H-3** — `restaurants` PII SELECT scoping

---

## Do Not Start Until Phase A Is Merged

- Menu Foundation (Phase 2)
- Public Menu page
- Floating Reward Widget
- Any feature that adds new tables without owner-scoped RLS from the start
