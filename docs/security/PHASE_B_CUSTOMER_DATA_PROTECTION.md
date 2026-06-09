# Phase B — Customer Data Protection: C-1 and C-6

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-b  
**Migration:** `20260609010000_phase_b_drop_public_customer_and_session_policies`  
**Status:** Applied and validated

---

## 1. Old Policies

### `customer_profiles` — before (C-1)

```sql
-- The only policy on this table:
Policy: "service role full access on customer_profiles"
  Roles:       {public}       ← misconfigured — grants to all roles incl. anon
  Cmd:         ALL
  USING:       true
  WITH CHECK:  true
```

Any caller with the publishable (anon) key could execute:
```sql
SELECT * FROM customer_profiles;   -- full phone + consent dump
UPDATE customer_profiles SET marketing_consent = true;  -- fabricate consent
DELETE FROM customer_profiles;     -- destroy all records
```

### `play_sessions` — before (C-6)

```sql
Policy: "Users can access their play sessions"
  Roles:       {public}
  Cmd:         ALL
  USING:       EXISTS (
                 SELECT 1 FROM promotions
                 WHERE promotions.id = play_sessions.promotion_id
               )
  WITH CHECK:  (none)
```

Because `promotions` is world-readable, any caller knowing one promotion UUID
— discoverable via `SELECT id FROM promotions` — gained ALL access to every
play session for that promotion: 63 of 63 rows were reachable. Session tokens,
IP addresses, user agents, and `customer_profile_id` links were all exposed.

---

## 2. New Policy State

```sql
-- customer_profiles: zero policies
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'customer_profiles';
-- (0 rows)

-- play_sessions: zero policies
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'play_sessions';
-- (0 rows)
```

Both tables: RLS enabled, zero permissive policies. Anon and authenticated
roles are blocked by default. Service role bypasses RLS.

---

## 3. Why No Replacement Public Policies Were Added

Every legitimate read and write to `customer_profiles` and `play_sessions`
goes through server-side Next.js API routes using `SUPABASE_SERVICE_ROLE_KEY`.
No client-side Supabase call references either table.

| Route | Table(s) touched | Key used |
|---|---|---|
| `GET /api/public/promotion-play` | `play_sessions` (SELECT, INSERT) | `SUPABASE_SERVICE_ROLE_KEY` |
| `lib/game-pool/resolvePromotionGame.ts` | `play_sessions` (SELECT, INSERT) | `SUPABASE_SERVICE_ROLE_KEY` |
| `POST /api/public/customer-identity` | `customer_profiles` (SELECT, INSERT, UPDATE), `play_sessions` (UPDATE) | `SUPABASE_SERVICE_ROLE_KEY` |
| `POST /api/coupons/issue` | `coupon_redemptions` (INSERT) | `SUPABASE_SERVICE_ROLE_KEY` |

The service role is exempt from RLS when `relforcerowsecurity = false` (the
default). Both tables have `relforcerowsecurity = false`. Adding a
`service_role` policy would be cosmetic — the service role already bypasses
RLS with no policy at all. Adding any `{public}` or `{authenticated}` policy
would re-open the attack surface. No policies are the correct state.

---

## 4. Validation Results

All tests run against live project `viaoholpnysccaijfpox` using
`SET LOCAL ROLE` + `request.jwt.claims`. All DML tests are wrapped in
`BEGIN/ROLLBACK` — no data persisted.

### Anonymous user — `customer_profiles`

| Test | Method | Expected | Actual | Pass |
|---|---|---|---|---|
| VAL-C1-01 SELECT | `SET LOCAL ROLE anon` | 0 rows returned | 0 rows | ✓ |
| VAL-C1-02 INSERT | `SET LOCAL ROLE anon` | RLS violation error | `new row violates row-level security policy` | ✓ |
| VAL-C1-03 UPDATE | `SET LOCAL ROLE anon` | 0 rows affected | 0 rows | ✓ |
| VAL-C1-04 DELETE | `SET LOCAL ROLE anon` | 0 rows deleted | 0 rows¹ | ✓ |

¹ Postgres RLS hides rows for DELETE (same as UPDATE — USING false → 0 rows
affected, no error). Verified via `RESET ROLE` count check inside DO block:
before_count = after_count.

### Anonymous user — `play_sessions`

| Test | Method | Expected | Actual | Pass |
|---|---|---|---|---|
| VAL-C6-01 SELECT | `SET LOCAL ROLE anon` | 0 rows returned | 0 rows | ✓ |
| VAL-C6-02 INSERT | `SET LOCAL ROLE anon` | RLS violation error | `new row violates row-level security policy` | ✓ |
| VAL-C6-03 UPDATE | `SET LOCAL ROLE anon` | 0 rows affected | 0 rows | ✓ |
| VAL-C6-04 DELETE | `SET LOCAL ROLE anon` | 0 rows deleted | 0 rows¹ | ✓ |

### Authenticated non-service-role user

| Test | Method | Expected | Actual | Pass |
|---|---|---|---|---|
| VAL-C1-05 SELECT customer_profiles | `authenticated` + random JWT | 0 rows | 0 rows | ✓ |
| VAL-C1-06 UPDATE customer_profiles | `authenticated` + random JWT | 0 rows affected | 0 rows | ✓ |
| VAL-C6-05 SELECT play_sessions | `authenticated` + random JWT | 0 rows | 0 rows | ✓ |
| VAL-C6-06 UPDATE play_sessions | `authenticated` + random JWT | 0 rows affected | 0 rows | ✓ |

### Service role

| Test | Expected | Actual | Pass |
|---|---|---|---|
| VAL-SVC-01 SELECT customer_profiles | Sees all rows | 1 row visible | ✓ |
| VAL-SVC-02 INSERT + UPDATE customer_profiles | Succeeds | 1 row inserted, consent_updated = true | ✓ |
| VAL-SVC-03 SELECT play_sessions | Sees all rows | 63 rows visible | ✓ |
| VAL-SVC-04 INSERT play_sessions | Succeeds | Row created, id + session_token returned | ✓ |

---

## 5. Regression Test Results

Full end-to-end customer flow simulation run as service role inside
`BEGIN/ROLLBACK`. No data persisted to production.

### Flow: play → coupon → phone capture → recovery

| Step | Simulates | Result | Pass |
|---|---|---|---|
| 1: `INSERT play_sessions` | `resolvePromotionGame` creates new session | Session created with id + session_token | ✓ |
| 2: `SELECT play_sessions WHERE session_token = ?` | Fast-path session recovery on reload | Session row returned | ✓ |
| 3: `INSERT coupon_redemptions` | `/api/coupons/issue` writes coupon | `REGR-DIRECT-COUPON` issued, `session_linked = true` | ✓ |
| 4: `INSERT customer_profiles` + `UPDATE play_sessions.customer_profile_id` | `/api/public/customer-identity` captures phone | `play_session_id` + `customer_profile_id` populated, `terms_recorded = true` | ✓ |
| 5: `SELECT coupon_redemptions JOIN play_sessions` | `findSessionCoupons` recovery read | Coupons returned with `session_linked = true`; live data shows 3 real coupons recoverable | ✓ |

All five steps passed. The QR play flow, coupon issuance, post-win phone
capture, session recovery, and coupon recovery all work correctly under the
new policy state.

---

## 6. Remaining Security Backlog

### Critical

None. C-1 and C-6 are resolved.

### High

| ID | Table | Finding | Status |
|---|---|---|---|
| H-1 | `guest_sessions` | All ops open to anon/authenticated (`qual: true`) | Deferred |
| H-2 | `promotion_game_assignments` | ALL access via promotion existence | Deferred |
| H-3 | `restaurants` | Owner PII readable by anonymous users | Deferred |
| H-5 | `menu_items` | No UPDATE policy; INSERT/DELETE on `{public}` role | Deferred |
| H-6 | `restaurant-heroes`, `menu-item-images` | `r.name` vs `name` path-validation bug | Deferred |

### Medium

| ID | Table | Finding | Status |
|---|---|---|---|
| C-4 INSERT | `menus` | Anonymous insert under any restaurant_id | Deferred |
| C-5 INSERT | `promotions` | Anonymous insert under any restaurant_id | Deferred |

### Secondary hardening (not blocking)

| Item | Description |
|---|---|
| `play_sessions.expires_at` | Stored but not enforced in session recovery path |
| Session token invalidation | Tokens not rotated/invalidated after all spins consumed |
