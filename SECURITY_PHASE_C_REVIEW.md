# SpinBite Security Hardening — Phase C Review

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-c  
**Prerequisite:** Phase B merged and tagged as v0.2.2-security-phase-b  
**Status:** ANALYSIS ONLY — no implementation on this branch

---

## Summary

Phase C addresses the five remaining High-severity RLS findings. All Critical findings were resolved in Phase A and Phase B. This document provides a structured review of each finding: current policy state, exploitability, business impact, recommended fix, implementation effort, and regression risk.

**No migration files are created on this branch.**

| ID | Table / Scope | Severity | Finding |
|---|---|---|---|
| H-1 | `guest_sessions` | High | Full cross-tenant read/write via open `{anon, authenticated}` policies |
| H-2 | `promotion_game_assignments` | High | ALL operations via promotion UUID existence (world-readable) |
| H-3 | `restaurants` | High | Owner PII (email, phone, address) world-readable to anonymous callers |
| H-5 | `menu_items` | High | No UPDATE policy; INSERT/DELETE bound to `{public}` role |
| H-6 | `restaurant-heroes`, `menu-item-images` | High | `r.name` vs `name` path-validation bug — restaurant-ID segment not validated |

---

## H-1 — `guest_sessions`: Full Cross-Tenant Read/Write

### Current Policies

```sql
-- Policy: "Allow guest session inserts"
--   Roles:       {anon, authenticated}
--   Cmd:         INSERT
--   WITH CHECK:  true

-- Policy: "Allow guest session reads"
--   Roles:       {anon, authenticated}
--   Cmd:         SELECT
--   USING:       true

-- Policy: "Allow guest session updates"
--   Roles:       {anon, authenticated}
--   Cmd:         UPDATE
--   USING:       true
--   WITH CHECK:  true
```

All three policies use `qual: true` against `{anon, authenticated}`. There is no predicate binding rows to a session ID, token, or restaurant. Any unauthenticated HTTP request can:

```sql
-- Enumerate all guest sessions across all restaurants:
SELECT * FROM guest_sessions;

-- Overwrite any guest session's spin count, timestamps, or status:
UPDATE guest_sessions SET spins_remaining = 99 WHERE id = '<any-id>';

-- Fabricate guest sessions under any restaurant:
INSERT INTO guest_sessions (restaurant_id, ...) VALUES ('<any-restaurant-id>', ...);
```

### Exploitability

**High.** No authentication required. No row-level predicate is evaluated. The Supabase anon key is embedded in every QR play page's client-side bundle. A caller with the anon key can execute these queries directly against the PostgREST API without touching the application layer.

### Business Impact

- **Session hijacking:** Any caller who knows a `guest_session.id` (UUIDs are not secret once exposed in SELECT results) can overwrite spin counts or completion status, granting extra spins or resetting completed sessions.
- **Cross-tenant enumeration:** All guest sessions across all restaurants are readable — leaking play counts, timing patterns, and any linked customer data.
- **Fraudulent session creation:** Attacker can insert ghost sessions for any restaurant to skew analytics or test abuse paths.
- **Coupon replay setup:** If spin state is stored in guest_sessions and checked server-side, tampering with `spins_remaining` or `completed_at` could bypass coupon issuance guards.

### Recommended Fix

**Option A — Token-scoped RLS (preferred if sessions are identified by a client-held token):**

```sql
-- Assumes guest_sessions has a session_token column (UUID or random bytes)
-- stored client-side in localStorage.

DROP POLICY "Allow guest session inserts" ON public.guest_sessions;
DROP POLICY "Allow guest session reads" ON public.guest_sessions;
DROP POLICY "Allow guest session updates" ON public.guest_sessions;

-- Allow insert only (client creates session, no reads/updates via anon):
CREATE POLICY "anon creates guest session"
  ON public.guest_sessions FOR INSERT TO anon
  WITH CHECK (true);

-- Read and update scoped to matching token:
CREATE POLICY "token holder reads own session"
  ON public.guest_sessions FOR SELECT TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token');

CREATE POLICY "token holder updates own session"
  ON public.guest_sessions FOR UPDATE TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token')
  WITH CHECK (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token');
```

**Option B — Migrate to server-side session management (preferred architecturally):**

Migrate the guest session lifecycle to server-side API routes using `SUPABASE_SERVICE_ROLE_KEY`, eliminating all client-side Supabase access to `guest_sessions`. Zero public policies — same architecture as `play_sessions` after Phase B.

Option B is the stronger security posture and aligns with the existing pattern for `play_sessions`. It requires more application refactoring but eliminates the attack surface entirely.

### Implementation Effort

**Medium (Option A) / Medium-High (Option B).**

Before writing either fix, the QR play page must be audited:
1. Confirm whether `guest_sessions` is read/written client-side (via Supabase client) or server-side (via API routes).
2. Confirm what columns `guest_sessions` contains — specifically whether a session token column already exists.
3. Confirm whether spin state is authoritative in `guest_sessions` or in `play_sessions`.

The Phase B pattern (auditing `resolvePromotionGame.ts` and `promotion-play/route.ts`) is the model for this review.

### Regression Risk

**Medium.** The QR play flow creates and reads guest sessions. If client-side Supabase calls read `guest_sessions` directly, any restriction will break the flow until the application is updated. Risk drops to Low under Option B if all access is migrated to server routes (no client-side policy dependency).

---

## H-2 — `promotion_game_assignments`: Cross-Tenant Write via Promotion UUID

### Current Policy

```sql
-- Policy: "Users can manage their promotion game assignments"
--   Roles:  {public}
--   Cmd:    ALL
--   USING:  EXISTS (
--             SELECT 1 FROM promotions
--             WHERE promotions.id = promotion_game_assignments.promotion_id
--           )
--   WITH CHECK: (same)
```

This policy grants ALL operations (SELECT, INSERT, UPDATE, DELETE) to any caller holding a promotion UUID. Because `promotions` is world-readable via a separate `{public}` SELECT policy, any unauthenticated caller can:

1. `SELECT id FROM promotions` — enumerate all promotion UUIDs.
2. `UPDATE promotion_game_assignments SET spin_count = 99 WHERE promotion_id = '<any-uuid>'` — overwrite game configuration for any promotion.
3. `DELETE FROM promotion_game_assignments WHERE promotion_id = '<any-uuid>'` — destroy game configuration.

### Exploitability

**High.** Promotion UUIDs are discoverable in a single unauthenticated query. The `EXISTS` check is satisfied for every valid promotion — it provides existence validation, not ownership validation. Any caller with the anon key can enumerate promotion IDs and overwrite any promotion's game settings.

### Business Impact

- **Reward probability tampering:** An attacker who knows SpinBite's game configuration schema could set their own promotion's spin count, reward probability, or reward type to maximize winnings.
- **Competitor sabotage:** An attacker can enumerate all promotion game assignments — across all restaurants — and delete or corrupt any promotion's game configuration, disabling the QR play experience.
- **Prize pool manipulation:** If `promotion_game_assignments` contains prize tier weights or expiry, overwriting these controls the reward pool distribution.

### Recommended Fix

```sql
DROP POLICY "Users can manage their promotion game assignments"
  ON public.promotion_game_assignments;

-- Owners manage their own promotion game assignments:
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

-- If the QR play flow reads game assignments client-side,
-- add a separate SELECT for the public play path:
-- CREATE POLICY "public reads active promotion game assignments"
--   ON public.promotion_game_assignments FOR SELECT TO public
--   USING (
--     promotion_id IN (
--       SELECT id FROM public.promotions WHERE active = true
--     )
--   );
-- (Only add if client-side SELECT is confirmed — otherwise omit.)
```

**Pre-implementation code review required:** Confirm whether the QR play page reads `promotion_game_assignments` client-side (Supabase client) or server-side (API route with service role). If server-side only, the owner-scoped authenticated policy is complete and no public SELECT is needed.

### Implementation Effort

**Low.** The owner-scoped policy structure is straightforward and follows the same join pattern used in Phase A for `promotions` and `menus`. One DROP + one CREATE. The pre-implementation code review is the primary time cost.

### Regression Risk

**Low.** The admin promotion builder writes game assignments — it is authenticated and will satisfy the owner check. The QR play page reads game configuration; if this read is server-side (service role), there is no regression. If client-side, a public SELECT policy for active promotions is needed (noted in the fix above). Dropping the ALL/{public} policy and replacing with authenticated-only will break any anonymous write path, which should not exist.

---

## H-3 — `restaurants`: Owner PII Readable by Anonymous Users

### Current Policies

```sql
-- Policy: "allow select restaurants"
--   Roles:  {public}
--   Cmd:    SELECT
--   USING:  true

-- Policy: "public read restaurants"
--   Roles:  {public}
--   Cmd:    SELECT
--   USING:  true
```

Two overlapping `qual: true` SELECT policies on `{public}`. Both return the full `restaurants` row to any unauthenticated caller. The `restaurants` table contains:

| Column | Classification |
|---|---|
| `id`, `slug`, `name`, `brand_color` | Public — required for QR play page |
| `experience_mode`, `hero_image_url` | Public — required for play page landing |
| `logo_url`, `description` | Public — used on play/landing page |
| `contact_email` | **PII — owner contact, not needed publicly** |
| `phone` | **PII — owner phone, not needed publicly** |
| `address_line1`, `address_line2`, `city`, `state`, `postcode` | **PII — owner address, not needed publicly** |
| `owner_name` | **PII — owner personal name, not needed publicly** |
| `owner_id` | Internal FK — not needed by public callers |

### Exploitability

**High.** Completely open to unauthenticated enumeration. Any caller can `SELECT * FROM restaurants` to extract the full contact details, personal name, and physical address of every restaurant owner in the system.

```sql
-- Enumerate all owner PII:
SELECT name, contact_email, phone, address_line1, owner_name FROM restaurants;
```

### Business Impact

- **Owner PII exposure:** Full name, email, phone number, and physical address of every restaurant owner is publicly enumerable. This constitutes a GDPR/CCPA reportable exposure for a production system.
- **Competitive intelligence:** All restaurant configuration (experience mode, brand settings) is visible to competitors.
- **`owner_id` exposure:** The Supabase auth UID of every restaurant owner is publicly readable, enabling targeted attacks against owner accounts.
- **Enumeration surface:** Leaks the full restaurant inventory of the platform (names, slugs) to competitors or scrapers.

### Recommended Fix

**Option A — Column-restricted public SELECT (preferred):**

Replace both open policies with a policy that limits anonymous callers to the minimum columns needed for the QR play experience. The remaining columns are accessible only to the authenticated owner.

```sql
DROP POLICY "allow select restaurants" ON public.restaurants;
DROP POLICY "public read restaurants" ON public.restaurants;

-- Public callers get only play-page columns:
-- (PostgREST will still return all columns in SELECT *,
-- but column-level security via a view or GRANT is the correct enforcement)
```

Because Postgres RLS operates on rows, not columns, restricting specific columns requires one of:

1. **A view** (`public.restaurants_public`) that exposes only safe columns for the play page, combined with a `{public}` SELECT policy on the view and removal of direct table access from anon.
2. **Column-level GRANT** (`REVOKE` specific columns from anon role).
3. **Two separate row policies** — one for anonymous (using a subquery that checks request headers or a flag), one for owners — but this does not prevent column access.

The view approach is cleanest and most auditable:

```sql
CREATE VIEW public.restaurants_public AS
  SELECT id, slug, name, experience_mode, hero_image_url,
         logo_url, description, brand_color, secondary_color, accent_color
  FROM public.restaurants;

GRANT SELECT ON public.restaurants_public TO anon, authenticated;

-- Remove direct anon SELECT from base table (owner access handled by existing owner policy):
DROP POLICY "allow select restaurants" ON public.restaurants;
DROP POLICY "public read restaurants" ON public.restaurants;

CREATE POLICY "owners read own restaurant"
  ON public.restaurants FOR SELECT TO authenticated
  USING (owner_id = auth.uid());
```

**Pre-implementation audit required:** Confirm every callsite that reads from `restaurants`:
- QR play page (`/r/[slug]`, `/play/[restaurantSlug]/[promotionSlug]`) — must use view or include only safe columns in the SELECT.
- Admin restaurant page — authenticated owner read, uses the owner policy.
- Super-admin — authenticated, uses service role or owner-scoped policy.

### Implementation Effort

**Medium-High.** The view approach requires:
1. Creating the view and updating GRANT.
2. Auditing every `supabase.from('restaurants').select(...)` callsite to confirm column lists or to switch to `supabase.from('restaurants_public').select(...)` for anonymous paths.
3. Ensuring the admin UI reads from `restaurants` (not the view) via the owner policy so PII columns remain available.

This is the most design-intensive of the remaining High findings.

### Regression Risk

**Medium-High.** The QR play page reads restaurant data including `slug`, `name`, `experience_mode`, `hero_image_url`, and potentially `brand_color`. If client-side calls use `SELECT *` or explicitly include PII columns today, switching to the view requires updating those queries. The admin UI also reads from `restaurants` and needs owner PII columns (contact info) — it must continue to use the base table via the owner SELECT policy.

---

## H-5 — `menu_items`: No UPDATE Policy; Wrong Role on INSERT/DELETE

### Current Policies

```sql
-- Policy: "insert menu items via restaurant ownership"
--   Roles:      {public}        ← incorrect — should be {authenticated}
--   Cmd:        INSERT
--   WITH CHECK: EXISTS (
--                 SELECT 1 FROM public.restaurants r
--                 WHERE r.id = menu_items.restaurant_id
--                   AND r.owner_id = auth.uid()
--               )

-- Policy: "delete menu items via restaurant ownership"
--   Roles:      {public}        ← incorrect — should be {authenticated}
--   Cmd:        DELETE
--   USING:      EXISTS (
--                 SELECT 1 FROM public.restaurants r
--                 WHERE r.id = menu_items.restaurant_id
--                   AND r.owner_id = auth.uid()
--               )

-- UPDATE: no policy exists
-- (RLS is enabled → authenticated owners cannot update menu items)

-- SELECT (existing, correct):
-- "Public read active menu items"  {public}  USING: active = true
-- "owners read own menu items"     {authenticated}  USING: restaurant_id IN (owner subquery)
```

The practical consequences:
- **UPDATE is silently blocked** for all callers including authenticated owners. Any `UPDATE menu_items SET name = '...'` in the admin UI returns 0 rows affected without error.
- **INSERT and DELETE** have correct ownership predicates but use `{public}` role — anon callers can attempt these operations. Because `auth.uid()` returns null for anon, the EXISTS check is false and the operation is blocked, but the role binding is semantically wrong and creates unnecessary exposure surface.

### Exploitability

**INSERT/DELETE:** Low — the WITH CHECK/USING predicates correctly enforce owner identity via `auth.uid()`. An anon caller's attempt silently fails. The risk is the incorrect role label creating ambiguity in future policy audits.

**UPDATE:** High from a functionality perspective — the missing policy means restaurant owners cannot update menu item prices, names, descriptions, or availability through the admin UI. This is a functional regression.

### Business Impact

- **Broken admin feature:** Menu item editing is silently broken. Owners who attempt to edit items receive no error but see no changes. This surfaces as unexplained data staleness in the admin UI.
- **Role hygiene:** The `{public}` role on INSERT and DELETE creates a false impression that anonymous callers have meaningful write access. Correcting this prevents future auditors from drawing wrong conclusions.

### Recommended Fix

```sql
-- Correct INSERT role (drop + recreate with authenticated):
DROP POLICY "insert menu items via restaurant ownership" ON public.menu_items;
CREATE POLICY "owners insert own menu items"
  ON public.menu_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Correct DELETE role:
DROP POLICY "delete menu items via restaurant ownership" ON public.menu_items;
CREATE POLICY "owners delete own menu items"
  ON public.menu_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.restaurants r
    WHERE r.id = menu_items.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Add missing UPDATE policy:
CREATE POLICY "owners update own menu items"
  ON public.menu_items FOR UPDATE TO authenticated
  USING (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT id FROM public.restaurants WHERE owner_id = auth.uid()
    )
  );
```

No application code changes required. The UPDATE policy enables currently-broken owner functionality. The INSERT/DELETE role corrections are non-breaking.

### Implementation Effort

**Low.** Three DROP/CREATE statements with no schema changes. No application code needs to be modified. No pre-implementation code review required beyond confirming the admin UI uses authenticated Supabase client calls for menu item writes (which it does, per the existing ownership predicates).

### Regression Risk

**Low.** The UPDATE addition enables broken functionality — it cannot break working functionality. The INSERT/DELETE role changes are functionally equivalent for anon callers (both evaluate to false) and for authenticated owners (both evaluate ownership correctly). The only change visible to the system is that anon INSERT/DELETE attempts will be rejected by role check before the predicate is evaluated, rather than the predicate evaluation itself.

---

## H-6 — Storage Path Validation Bug (`r.name` vs `name`)

**Buckets affected:** `restaurant-heroes`, `menu-item-images`

### The Bug

The `restaurant-logos` upload policy was corrected in Phase A (migration `20260609000100_phase_a_fix_logo_upload_policy.sql`). The same class of bug exists in the upload policies for `restaurant-heroes` and `menu-item-images`.

All three buckets use a path structure of `{owner-uid}/{restaurant-id}/{filename}`. The upload policy validates:
1. The caller's UID matches path segment 1 (`auth.uid()::text`).
2. The restaurant ID in path segment 2 belongs to a restaurant owned by the caller.

The validation of point 2 is broken:

```sql
-- Buggy policy (restaurant-heroes example):
CREATE POLICY "Owners upload hero images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'restaurant-heroes'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM restaurants r
      WHERE r.owner_id = auth.uid()
        AND r.id::text = (storage.foldername(r.name))[2]
        --                                   ^^^^^^^
        -- WRONG: inside "FROM restaurants r", the unqualified identifier "name"
        -- resolves to restaurants.name (the display name, e.g. "Pizza Palace").
        -- storage.foldername("Pizza Palace")[2] → NULL
        -- NULL = r.id::text → false for every row.
        -- The EXISTS subquery ALWAYS returns false.
    )
  );
```

Because the EXISTS always returns false, the policy as written blocks **all** uploads. In practice, Supabase may have a bucket-level policy that overrides this, or the policy was defined but never took effect — either way, the restaurant-ID path segment is **not validated**.

The consequence: an authenticated owner can upload a file to `{their-uid}/{any-restaurant-id}/{filename}` — using their own UID (which passes check 1) but an arbitrary restaurant ID (which passes check 2 because it's never actually evaluated).

This is the same root cause documented in Phase A for `restaurant-logos`, fixed by using an `IN (SELECT ...)` expression that keeps path extraction in the outer context, outside the `FROM restaurants r` scope.

### Current Policy State (both buckets — same pattern)

```sql
-- restaurant-heroes upload:
WITH CHECK (
  bucket_id = 'restaurant-heroes'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(r.name))[2]   -- r.name resolves wrong
  )
)

-- menu-item-images upload:
WITH CHECK (
  bucket_id = 'menu-item-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.owner_id = auth.uid()
      AND r.id::text = (storage.foldername(r.name))[2]   -- same bug
  )
)
```

### Exploitability

**Medium.** Requires an authenticated user (a registered restaurant owner). An attacker who registers as an owner can upload images into any other restaurant's hero or menu-item storage folder by constructing a path with their own UID and a victim restaurant's ID. Because the UID prefix check passes (they own a restaurant), and the restaurant-ID segment is never validated, the upload succeeds.

### Business Impact

- **Cross-tenant storage pollution:** An attacker-owner can upload files into any restaurant's image folder — replacing or polluting hero images or menu item images visible on other restaurants' QR play pages.
- **Content defacement:** An attacker can overwrite visible images with offensive content by crafting a path that matches an existing file's key under a victim restaurant.
- **Storage cost abuse:** Unlimited upload to any restaurant's folder with no per-restaurant quota enforcement.

### Recommended Fix

Apply the same IN-pattern fix used in Phase A for `restaurant-logos`:

```sql
-- restaurant-heroes:
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

-- menu-item-images:
DROP POLICY "Owners upload menu item images" ON storage.objects;
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

The key change: `storage.foldername(name)` is evaluated in the outer context of `storage.objects`, where `name` unambiguously refers to `storage.objects.name` (the file path). The `IN (SELECT ...)` subquery then looks up restaurant IDs owned by the caller without introducing a join alias that shadows `name`.

**Pre-implementation:** Confirm the exact policy names (`"Owners upload hero images"`, `"Owners upload menu item images"`) by querying `pg_policies` on `storage.objects`. Confirm the path structure used by `HeroImageUploader.tsx` and the menu item image upload component matches `{uid}/{restaurant_id}/...`.

From Phase A code review: `HeroImageUploader.tsx` constructs paths as `${ownerId}/${restaurantId}/${Date.now()}-${sanitizeFileName(file.name)}` — this satisfies the corrected policy exactly.

### Implementation Effort

**Low.** The fix pattern is already validated from Phase A. Two DROP + two CREATE statements. No application code changes needed — valid upload paths already match the corrected policy structure. The only task is confirming the exact policy names before running the DROP.

### Regression Risk

**Low.** The corrected policy is strictly more specific than the current bug: valid uploads (own UID, own restaurant ID) continue to succeed. The bug allows extra-scope uploads (own UID, foreign restaurant ID) to pass — those will now correctly fail. No legitimate upload path is affected.

---

## Phase C Execution Order

| Priority | ID | Reason |
|---|---|---|
| 1 | **H-6** Storage path bug | Lowest regression risk, fully understood fix from Phase A — good warm-up |
| 2 | **H-5** `menu_items` UPDATE | Enables broken owner functionality; low risk, no code review required |
| 3 | **H-2** `promotion_game_assignments` | Low effort, straightforward owner-scoped fix after confirming play-page read path |
| 4 | **H-1** `guest_sessions` | Requires QR play code review to choose Option A vs B |
| 5 | **H-3** `restaurants` PII | Most complex — column-level design decision, highest regression risk, do last |

---

## Pre-Conditions for Phase C Implementation

- [ ] Phase B merged to main ✓ (complete — `6be7f46`)
- [ ] Phase B tagged `v0.2.2-security-phase-b` ✓ (complete)
- [ ] Phase C branch `feature/security-hardening-phase-c` created ✓ (this branch)
- [ ] QR play flow audited for `guest_sessions` read/write path (required before H-1)
- [ ] Play page audited for `promotion_game_assignments` read path (required before H-2)
- [ ] All `restaurants` callsites audited for column usage (required before H-3)
- [ ] Menu Foundation work remains paused until Phase C is merged

---

## Finding Count Summary

| Severity | Before Phase A | After Phase A | After Phase B (current) | After Phase C |
|---|---|---|---|---|
| Critical | 2 | 2 | **0** | 0 |
| High | 5 | 5 | 5 | **0** |
| Medium | 2 | 2 | 2 | 2 (deferred) |
