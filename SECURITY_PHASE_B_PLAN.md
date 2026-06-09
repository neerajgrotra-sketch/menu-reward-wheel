# SpinBite Security Hardening — Phase B Plan

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-b  
**Prerequisite:** Phase A merged and tagged as v0.2.1-security-phase-a  
**Status:** C-1 + C-6 RESOLVED 2026-06-09 — remaining findings deferred

---

## Current Finding Counts (as of 2026-06-09)

| Severity | Total | Resolved | Remaining |
|---|---|---|---|
| Critical | 2 | **2** (C-1, C-6) | **0** |
| High | 5 | 0 | **5** (H-1, H-2, H-3, H-5, H-6) |
| Medium | 2 | 0 | 2 (C-4 INSERT, C-5 INSERT) |

---

## Context

Phase A closed all findings that could be fixed by dropping or tightening policies without touching application code. Phase B addresses the remaining findings, which require application coordination: the QR play flow, coupon issuance, customer identity capture, and guest session handling all have direct dependencies on the policies being changed.

Each Phase B item must be accompanied by a review of the client-side code that reads or writes the affected table before a migration is written.

---

## Resolved Critical Findings

### C-1 — `customer_profiles`: Full unauthenticated PII exposure — ✓ RESOLVED

**Severity:** Critical  
**Table:** `public.customer_profiles`  
**Finding:** The policy `service role full access on customer_profiles` was bound to the `{public}` role, granting any anon-key caller full SELECT/INSERT/UPDATE/DELETE on all customer phone numbers and consent records.

**Resolution:** Policy dropped. All legitimate access confirmed to use `SUPABASE_SERVICE_ROLE_KEY` via server-side routes. No replacement policies needed — service role bypasses RLS. Zero application impact.

**Migration:** `20260609010000_phase_b_drop_public_customer_and_session_policies`  
**Validation:** See [PHASE_B_CUSTOMER_DATA_PROTECTION.md](docs/security/PHASE_B_CUSTOMER_DATA_PROTECTION.md)

---

### C-6 — `play_sessions`: Full cross-tenant access via promotion existence — ✓ RESOLVED

**Severity:** Critical  
**Table:** `public.play_sessions`  
**Finding:** `Users can access their play sessions` granted ALL operations to any caller knowing a promotion UUID. 63 of 63 rows were reachable. Session tokens, IP addresses, and `customer_profile_id` links were fully exposed, enabling coupon recovery hijack and cross-table PII joins.

**Resolution:** Policy dropped. All legitimate access confirmed to use `SUPABASE_SERVICE_ROLE_KEY` via server-side routes. No replacement policies needed. Zero application impact.

**Migration:** `20260609010000_phase_b_drop_public_customer_and_session_policies`  
**Validation:** See [PHASE_B_CUSTOMER_DATA_PROTECTION.md](docs/security/PHASE_B_CUSTOMER_DATA_PROTECTION.md)

---

## Remaining High Findings

### H-1 — `guest_sessions`: Full cross-tenant read/write

**Severity:** High  
**Table:** `public.guest_sessions`  
**Finding:** All three policies use `qual: true` against `{anon, authenticated}`. Any unauthenticated request can enumerate, modify, or overwrite guest sessions across all restaurants.

**Current policies:**
```sql
-- "Allow guest session inserts"  {anon, authenticated}  INSERT  WITH CHECK: true
-- "Allow guest session reads"    {anon, authenticated}  SELECT  USING: true
-- "Allow guest session updates"  {anon, authenticated}  UPDATE  USING: true  WITH CHECK: true
```

**Risk:** Any caller can read or overwrite any guest session across all restaurants.

**Affected application code to review:** Guest session creation and lookup in the QR play flow.

**Proposed remediation:** Scope by `id` match using a client-supplied token, or migrate to server-side session management. Exact approach depends on how the QR play page creates and retrieves guest sessions.

**Expected application impact:** Medium. Guest sessions must be retrievable by the creating caller. If sessions are identified by UUID (generated client-side), scoping by `id = <client-supplied-id>` may be sufficient. Requires play-page code review.

---

### H-2 — `promotion_game_assignments`: Cross-tenant write via promotion existence

**Severity:** High  
**Table:** `public.promotion_game_assignments`  
**Finding:** Same structural flaw as C-6. Any caller with a promotion UUID can modify that promotion's game type, spin count, or expiry settings.

**Current policy:**
```sql
-- Roles: {public}  Cmd: ALL
-- USING: EXISTS (SELECT 1 FROM promotions WHERE promotions.id = promotion_game_assignments.promotion_id)
CREATE POLICY "Users can manage their promotion game assignments"
  ON public.promotion_game_assignments FOR ALL TO public ...
```

**Risk:** Any caller can overwrite game configuration for any promotion.

**Proposed remediation:**
```sql
DROP POLICY "Users can manage their promotion game assignments" ON public.promotion_game_assignments;

CREATE POLICY "owners manage own promotion game assignments"
  ON public.promotion_game_assignments FOR ALL TO authenticated
  USING (promotion_id IN (
    SELECT p.id FROM public.promotions p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE r.owner_id = auth.uid()
  ))
  WITH CHECK (promotion_id IN (
    SELECT p.id FROM public.promotions p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE r.owner_id = auth.uid()
  ));
```

**Expected application impact:** Low. Game assignments are written from the admin promotion builder (authenticated). Client-side play flow reads game config but does not need to write it. Verify no anonymous write path before applying.

---

### H-3 — `restaurants`: Owner PII readable by anonymous users

**Severity:** High  
**Table:** `public.restaurants`  
**Finding:** Two policies (`allow select restaurants`, `public read restaurants`, both `qual: true`) return full restaurant rows including `contact_email`, `phone`, `address_line1`, `owner_name` to any unauthenticated request.

**Current policies:**
```sql
-- "allow select restaurants"  {public}  SELECT  USING: true
-- "public read restaurants"   {public}  SELECT  USING: true
```

**Risk:** All restaurant PII is publicly enumerable.

**Proposed remediation:** Replace with column-specific policies or a view that excludes PII columns for anonymous callers, while retaining full access for authenticated owners. Requires confirming which columns the public QR landing page needs (name, slug, hero image, experience mode) versus which are owner-only (email, phone, address).

**Expected application impact:** Medium-High. The QR play page reads restaurant data. Must confirm minimum required column set before restricting.

---

### H-5 — `menu_items`: Missing UPDATE policy; wrong role on INSERT/DELETE

**Severity:** High  
**Table:** `public.menu_items`  
**Finding:** No UPDATE policy exists — owner attempts to update item names, prices, or availability are silently blocked by RLS. INSERT and DELETE policies are bound to `{public}` instead of `{authenticated}`.

**Current policies:**
```sql
-- INSERT: {public}  WITH CHECK: EXISTS(restaurant owner check)  -- role wrong
-- DELETE: {public}  USING: EXISTS(restaurant owner check)       -- role wrong
-- UPDATE: (no policy)                                            -- missing
-- SELECT: "Public read active menu items" + owner SELECT         -- OK
```

**Risk:** Restaurant owners cannot update menu items. INSERT and DELETE use a permissive role, though the WITH CHECK/USING clause provides functional scoping.

**Proposed remediation:**
```sql
-- Fix INSERT role
DROP POLICY "insert menu items via restaurant ownership" ON public.menu_items;
CREATE POLICY "owners insert own menu items"
  ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Fix DELETE role
DROP POLICY "delete menu items via restaurant ownership" ON public.menu_items;
CREATE POLICY "owners delete own menu items"
  ON public.menu_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Add missing UPDATE policy
CREATE POLICY "owners update own menu items"
  ON public.menu_items FOR UPDATE TO authenticated
  USING (restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid()));
```

**Expected application impact:** Low — the UPDATE addition enables currently-broken owner functionality. The role correction on INSERT/DELETE does not change who can insert/delete because the WITH CHECK/USING clause already enforces ownership; only the role label changes.

---

### H-6 — Storage upload ownership validation bug (`r.name` vs `name`)

**Severity:** High  
**Buckets:** `restaurant-heroes`, `menu-item-images`  
**Finding:** The EXISTS subquery in both upload policies references `storage.foldername(r.name)[2]` where `r.name` is the restaurant's display name (e.g., "Pizza Palace"). The correct reference is `storage.foldername(name)[2]` where `name` is the storage object path. Postgres resolves unqualified `name` inside `FROM restaurants r` to `r.name`. This makes the restaurant-ID path segment check always false — only the UID prefix is enforced.

**Current policies (both buckets):**
```sql
-- EXISTS subquery (buggy):
EXISTS (
  SELECT 1 FROM restaurants r
  WHERE r.owner_id = auth.uid()
    AND r.id::text = (storage.foldername(r.name))[2]  -- r.name = "Pizza Palace", not a path
)
```

**Risk:** The second path segment (restaurant ID) is not validated. A user can upload under their own UID but into any restaurant's folder (e.g., `{their-uid}/{any-restaurant-id}/logo.png`).

**Proposed remediation:** Apply the same fix used in Phase A for `restaurant-logos` — use an IN expression so path extraction happens in the outer context:

```sql
-- For restaurant-heroes:
DROP POLICY "Owners upload hero images" ON storage.objects;
CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (storage.foldername(name))[2] IN (
      SELECT r.id::text FROM public.restaurants r WHERE r.owner_id = auth.uid()
    )
  );

-- Apply same pattern to "Owners upload menu item images"
```

**Expected application impact:** Low. The app constructs paths as `{uid}/{restaurant_id}/filename`, which satisfies the corrected policy. The bug means uploads currently work (the UID check passes); the fix adds proper restaurant-ID validation without breaking valid uploads.

---

## Recommended Phase B Execution Order

| Priority | Finding | Reason |
|---|---|---|
| 1 | **C-1** `customer_profiles` | Customer PII — highest risk, most urgent |
| 2 | **C-6** `play_sessions` | Coupon/session integrity at risk |
| 3 | **H-1** `guest_sessions` | Play flow data integrity |
| 4 | **H-2** `promotion_game_assignments` | Admin data integrity; low app impact |
| 5 | **H-5** `menu_items` | Owner functionality broken; fix unblocks menu editing |
| 6 | **H-6** Storage `r.name` bug | Tighten existing path scoping |
| 7 | **H-3** `restaurants` PII SELECT | Requires column-level design decision |

C-1 and C-6 are the correct first targets because they involve customer data and session integrity. H-3 is last because it requires the most careful design work (column-level scoping vs. a view).

---

## Pre-Conditions for Phase B Start

- [ ] Phase A merged to main ✓ (complete — `7373e1d`)
- [ ] Phase A tagged `v0.2.1-security-phase-a` ✓ (complete)
- [ ] Phase B branch `feature/security-hardening-phase-b` created ✓ (complete)
- [ ] Menu Foundation work remains paused until Phase B is merged
- [ ] QR play flow reviewed to confirm server-side vs. client-side Supabase key usage (required for C-1 and C-6)
- [ ] Customer identity code reviewed for `customer_profiles` write path (required for C-1)

---

## Do Not Start Until Phase B Is Merged

- Menu Foundation (Phase 2)
- Public Menu page
- Floating Reward Widget
- Promotion Integration

All feature work that adds new tables must include owner-scoped RLS from the first migration.
