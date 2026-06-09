# Phase B — Remediation Design Package: C-1 and C-6

**Date:** 2026-06-09  
**Branch:** feature/security-hardening-phase-b  
**Status:** Design only — no implementation  
**Scope:** C-1 (`customer_profiles`) and C-6 (`play_sessions`)

---

## Critical Pre-Analysis Finding

Before examining each table individually, one architectural fact changes the
remediation design for both findings:

**All application reads and writes to `customer_profiles` and `play_sessions`
go exclusively through Next.js server-side API routes using
`SUPABASE_SERVICE_ROLE_KEY`. No client-side Supabase call touches either
table.**

The service role bypasses RLS entirely. The current `{public}` policies
are therefore:

1. Not required by any legitimate application code path.
2. Actively dangerous — they grant the same access to anyone holding the anon
   key as the application has with the service key.

This means the remediation for both findings is to **drop the broken policy
and add nothing**. The application keeps working unchanged. This is confirmed
below in the per-table analysis.

---

## C-1 — `customer_profiles`

### 1. Current Schema

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `phone_country_code` | text | YES | — | e.g. `"1"` |
| `phone_number_raw` | text | YES | — | User-entered digits |
| `phone_number_e164` | text | YES | — | `+1XXXXXXXXXX` — **unique key** |
| `marketing_consent` | boolean | NO | `false` | Opt-in for marketing |
| `marketing_consent_timestamp` | timestamptz | YES | — | When consent was given |
| `terms_accepted_timestamp` | timestamptz | NO | `now()` | Mandatory T&C acceptance |
| `created_at` | timestamptz | NO | `now()` | |
| `updated_at` | timestamptz | NO | `now()` | |

**Unique constraint:** `customer_profiles_phone_number_e164_key` on `phone_number_e164`

**RLS status:** Enabled (`relrowsecurity = true`), not forced (`relforcerowsecurity = false`)

### 2. Current Policies

```sql
-- ONLY policy on this table:
Policy: "service role full access on customer_profiles"
  Roles:       {public}           ← WRONG — should be service_role or no policy
  Cmd:         ALL
  USING:       true
  WITH CHECK:  true
```

The policy name implies it was intended for the service role. The role binding
is `{public}`, which in Postgres means **every role** — including `anon` and
`authenticated`. This is a misconfiguration at the time of table creation that
was never caught.

Because `relforcerowsecurity = false`, the **service role bypasses RLS
entirely** and does not need this policy at all. The policy exists only to
inadvertently grant the same access to anonymous callers.

### 3. Data Sensitivity Classification

| Field | Classification | Regulation relevance |
|---|---|---|
| `phone_number_e164` | **PII — High** | PIPEDA (CA), GDPR, CCPA |
| `phone_number_raw` | **PII — High** | Same |
| `phone_country_code` | PII — Low | Geographic indicator |
| `marketing_consent` | **Consent record — High** | CASL (CA), GDPR Art. 7 |
| `marketing_consent_timestamp` | **Consent record — High** | Audit trail for consent |
| `terms_accepted_timestamp` | **Consent record — Medium** | Terms acceptance audit |
| `id` | Internal identifier | Low risk in isolation |

**Email fields:** None. This table is phone-only identity.

**Phone fields:** Three columns — `phone_country_code`, `phone_number_raw`,
`phone_number_e164`. The E164 format (`+1XXXXXXXXXX`) is the unique key and
the most useful for targeting.

**Consent fields:** `marketing_consent` (bool), `marketing_consent_timestamp`,
`terms_accepted_timestamp`. These are legally significant — they constitute the
platform's record of customer consent to marketing communications and
terms acceptance.

**Marketing fields:** `marketing_consent` and `marketing_consent_timestamp`.
These determine whether a customer's phone number can be used for SMS campaigns.
Exposure allows an attacker to see which numbers have opted in to marketing.

**Restaurant ownership relationship:** None. `customer_profiles` has **no
`restaurant_id` column**. The table is a cross-restaurant identity store — a
customer's phone number record is shared across all restaurants on the platform.
A customer who plays at Restaurant A and Restaurant B is one row. This has two
implications:

- A restaurant owner cannot be granted row-level access by restaurant — there
  is no tenant boundary in this table.
- The table's RLS model must be either service-role-only (current intended
  design) or linked to play_sessions for per-session scoping.

### 4. Example Records (illustrative — not real data)

```
id:                          a7f3c2d1-... (UUID)
phone_country_code:          "1"
phone_number_raw:            "416 555 0199"
phone_number_e164:           "+14165550199"
marketing_consent:           true
marketing_consent_timestamp: 2026-05-15 14:22:00+00
terms_accepted_timestamp:    2026-05-15 14:22:00+00
created_at:                  2026-05-15 14:22:00+00
updated_at:                  2026-05-15 14:22:00+00
```

**Live table:** 1 record at time of audit (2026-06-09). The table grows with
every customer who enters their phone number after winning. As the platform
scales, this becomes the most sensitive table in the database.

### 5. Current Access Paths

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LEGITIMATE PATHS                             │
│                                                                     │
│  Browser → POST /api/public/customer-identity                       │
│              └─ makeServiceClient() [SUPABASE_SERVICE_ROLE_KEY]     │
│                   ├─ SELECT customer_profiles WHERE phone_e164 = ?  │
│                   ├─ INSERT customer_profiles (new customers)       │
│                   ├─ UPDATE customer_profiles SET marketing_consent │
│                   └─ UPDATE play_sessions SET customer_profile_id   │
│                                                                     │
│  File: app/api/public/customer-identity/route.ts                    │
│  Key:  SUPABASE_SERVICE_ROLE_KEY (bypasses RLS)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        ATTACK PATH (current)                        │
│                                                                     │
│  Attacker → supabase.from('customer_profiles').select('*')          │
│              using NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (anon key)  │
│              ← Returns every row: all phone numbers + consent       │
│                                                                     │
│  Attacker → supabase.from('customer_profiles').update({             │
│                marketing_consent: true })                           │
│              ← Modifies consent records for any customer            │
└─────────────────────────────────────────────────────────────────────┘
```

The anon (publishable) key is embedded in the client-side JavaScript bundle
(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). It is visible to any visitor who
opens browser DevTools. This is expected and by design for Supabase — the
anon key is safe **only if RLS policies are correct**. The current policy
makes it unsafe.

### 6. Business Impact if Exploited

**Immediate:**
- Complete exfiltration of all customer phone numbers in a single
  `SELECT * FROM customer_profiles` query — no authentication required.
- Ability to bulk-update `marketing_consent = true` for all customers,
  fabricating consent records for numbers that never opted in.
- Ability to delete all customer profile records (DROP-equivalent via DELETE).

**Regulatory:**
- Under PIPEDA (Canada), disclosure of customer phone numbers without
  authorization constitutes a reportable breach if it poses a real risk of
  significant harm. Mandatory breach reporting to the Privacy Commissioner
  of Canada is triggered.
- Falsified consent records (`marketing_consent = true` by an attacker)
  could expose the business to CASL penalties of up to $10M CAD per violation
  if the tampered records are used to send commercial electronic messages.
- If any EU customers are present, GDPR Article 33 requires breach notification
  to supervisory authorities within 72 hours.

**Reputational:**
- Customer trust destroyed if exposed. Customers shared their phone number
  expecting it to be protected.

**Operational:**
- The platform's legal basis for sending post-win follow-up messages rests on
  the integrity of `marketing_consent` and `marketing_consent_timestamp`.
  If those records are corrupted, the legal basis is gone.

### 7. Recommended Remediation

**Option A — Drop policy, add nothing (Recommended)**

```sql
DROP POLICY "service role full access on customer_profiles"
  ON public.customer_profiles;

-- No new policy added.
-- Result: anon and authenticated roles see RLS block (no permissive policy).
-- Service role continues to bypass RLS — all legitimate code paths unaffected.
```

**Why this is safe:** Every legitimate write and read path uses the service
role (`SUPABASE_SERVICE_ROLE_KEY`). Dropping the `{public}` policy does not
affect service role access — the service role is exempt from RLS by design
in Postgres/Supabase when `relforcerowsecurity = false`.

**Option B — Add explicit service-role policy for documentation clarity**

```sql
DROP POLICY "service role full access on customer_profiles"
  ON public.customer_profiles;

-- Optional: document that only service_role has access
CREATE POLICY "service role only"
  ON public.customer_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

This is functionally identical to Option A (service role bypasses RLS with or
without a policy) but makes the intent explicit to future engineers. Carry
this as a comment rather than a required migration step.

**Recommendation:** Option A. One line. Zero application impact. No new
policies to maintain.

### 8. Expected Application Impact

**Zero.** Verified by code review:

| Code path | Key used | Impact of dropping policy |
|---|---|---|
| `app/api/public/customer-identity/route.ts` | `SUPABASE_SERVICE_ROLE_KEY` | None — service role bypasses RLS |
| `components/CustomerIdentityScreen.tsx` | HTTP fetch to above route | None — no direct Supabase call |
| `lib/supabase/database.types.ts` | Types only | None |

No client-side Supabase call to `customer_profiles` exists in the codebase.

### 9. Migration Complexity

**Very low.** One `DROP POLICY` statement. No schema changes. No data
migration. No application code changes.

```sql
-- Complete migration:
DROP POLICY "service role full access on customer_profiles"
  ON public.customer_profiles;
```

Estimated risk: near-zero. The only way this breaks something is if an
undiscovered code path uses the anon key to access `customer_profiles` directly.
A pre-migration grep confirms this is not the case (verified above).

Pre-migration check to run:
```bash
grep -rn "customer_profiles" /app /components /hooks /lib \
  --include="*.ts" --include="*.tsx" | grep -v "database.types"
# Must show only: app/api/public/customer-identity/route.ts
# (the service-role route) and no createClient() calls using anon key
```

### 10. Rollback Considerations

Rollback is a single statement:

```sql
-- Rollback:
CREATE POLICY "service role full access on customer_profiles"
  ON public.customer_profiles
  FOR ALL TO public
  USING (true)
  WITH CHECK (true);
```

**Rollback should not be needed.** There is no application behaviour that
depends on the `{public}` policy. If rollback is executed, it re-opens the
C-1 vulnerability.

---

## C-6 — `play_sessions`

### 1. Current Schema

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `promotion_id` | uuid | NO | — | FK → promotions (CASCADE delete) |
| `selected_game_type` | text | NO | — | `wheel`, `mystery_box`, etc. |
| `session_token` | text | NO | — | **Unique** — client recovery key |
| `customer_id` | text | YES | — | Legacy text field (pre-profile) |
| `ip_address` | text | YES | — | Visitor IP |
| `user_agent` | text | YES | — | Browser fingerprint |
| `created_at` | timestamptz | NO | `now()` | |
| `expires_at` | timestamptz | YES | — | Session TTL |
| `customer_profile_id` | uuid | YES | — | FK → customer_profiles (SET NULL) |
| `terms_accepted_timestamp` | timestamptz | YES | — | Set when identity screen submitted |

**Unique constraint:** `play_sessions_session_token_key` on `session_token`

**RLS status:** Enabled, not forced

**Inbound FK:** `coupon_redemptions.play_session_id` → `play_sessions.id`

**Outbound FKs:**
- `promotion_id` → `promotions.id` (ON DELETE CASCADE)
- `customer_profile_id` → `customer_profiles.id` (ON DELETE SET NULL)

### 2. Current Policies

```sql
Policy: "Users can access their play sessions"
  Roles:       {public}
  Cmd:         ALL
  USING:       EXISTS (
                 SELECT 1 FROM promotions
                 WHERE promotions.id = play_sessions.promotion_id
               )
  WITH CHECK:  (none — ALL policy with only USING applies USING to writes too)
```

**What this grants:** ANY caller (anon or authenticated) who holds a valid
promotion UUID gains SELECT, INSERT, UPDATE, and DELETE on every play session
belonging to that promotion. Because promotions are world-readable
(`public read promotions`, qual: true), any promotion UUID is trivially
discoverable.

**Scope of exposure confirmed:** 63 of 63 play session rows are reachable via
the promotion EXISTS check (verified by live SQL query, 2026-06-09).

### 3. Data Sensitivity Classification

| Field | Classification | Notes |
|---|---|---|
| `session_token` | **Security-sensitive — High** | Used for coupon recovery; acts as a bearer token |
| `customer_profile_id` | **PII link — High** | Bridges to phone number via C-1 exposure |
| `ip_address` | **PII — Medium** | Visitor IP; identifiable in many jurisdictions |
| `user_agent` | PII — Low | Browser fingerprint, limited identifier |
| `terms_accepted_timestamp` | Consent — Medium | Terms acceptance record |
| `promotion_id` | Internal reference | Low risk in isolation |
| `selected_game_type` | Operational | No PII |
| `expires_at` | Operational | No PII |
| `customer_id` | PII — Low | Legacy text field; may contain session identifiers |

### 4. Coupon, Customer, and Promotion Relationships

```
promotions
    │ 1
    │ ∞
play_sessions ──────────────────────── customer_profiles
    │ 1                                    (via customer_profile_id FK, SET NULL)
    │ ∞
coupon_redemptions
    (play_session_id FK)
```

**Key relationship for fraud analysis:**
- One `play_sessions` row maps to one promotion play.
- One `play_sessions` row may link to many `coupon_redemptions` (one per spin
  in multi-spin promotions).
- `session_token` is the client's recovery key — the play page stores it in
  `localStorage` and passes it as a URL parameter to `/api/public/promotion-play`.
- The server uses `session_token` to look up the play session and return
  existing coupons for recovery.

**coupon_redemptions RLS status:** RLS enabled, **zero policies** — anon and
authenticated roles are completely blocked; service role bypasses. The coupon
table is correctly locked down.

### 5. Current Access Paths

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LEGITIMATE PATHS                             │
│                                                                     │
│  Browser → GET /api/public/promotion-play?sessionToken=<uuid>       │
│              └─ makeServiceClient() [SUPABASE_SERVICE_ROLE_KEY]     │
│                   ├─ SELECT play_sessions WHERE session_token = ?   │
│                   └─ INSERT play_sessions (new session)             │
│              File: app/api/public/promotion-play/route.ts           │
│                                                                     │
│  lib/game-pool/resolvePromotionGame.ts (module-level service client)│
│    ├─ SELECT play_sessions WHERE session_token = ?  (fast path)     │
│    ├─ INSERT play_sessions (new session)                            │
│    └─ SELECT play_sessions WHERE session_token = ?  (race recovery) │
│                                                                     │
│  Browser → POST /api/public/customer-identity                       │
│              └─ makeServiceClient() [SUPABASE_SERVICE_ROLE_KEY]     │
│                   └─ UPDATE play_sessions SET customer_profile_id   │
│              File: app/api/public/customer-identity/route.ts        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        ATTACK PATHS (current)                       │
│                                                                     │
│  Step 1: Enumerate promotions (world-readable, no auth required)    │
│    SELECT id FROM promotions;                                       │
│    → Returns all promotion UUIDs                                    │
│                                                                     │
│  Step 2: Read all play sessions for any promotion                   │
│    SELECT * FROM play_sessions                                      │
│    WHERE promotion_id = '<known-uuid>';                             │
│    → Returns session_token, ip_address, customer_profile_id         │
│      for every player of that promotion                             │
│                                                                     │
│  Step 3a: Token hijack — replay stolen session token                │
│    GET /api/public/promotion-play?sessionToken=<stolen-token>       │
│    → Server returns the victim's coupon codes                       │
│                                                                     │
│  Step 3b: Session poisoning — link attacker's profile to victim     │
│    UPDATE play_sessions                                             │
│    SET customer_profile_id = '<attacker-profile-id>'               │
│    WHERE promotion_id = '<known-uuid>';                             │
│    → Dissociates victims' phones from their sessions                │
│                                                                     │
│  Step 3c: Session deletion — erase all play records for a promo     │
│    DELETE FROM play_sessions WHERE promotion_id = '<known-uuid>';   │
│    → Removes play guard; theoretically allows replay if app         │
│      relies on session existence (it does not — coupons are         │
│      authoritative — but this corrupts session history)             │
│                                                                     │
│  Step 3d: Cross-table PII join (requires C-1 + C-6 together)       │
│    SELECT ps.session_token, ps.ip_address, cp.phone_number_e164    │
│    FROM play_sessions ps                                            │
│    JOIN customer_profiles cp                                        │
│      ON cp.id = ps.customer_profile_id;                             │
│    → Full winner list with phone numbers and IP addresses           │
└─────────────────────────────────────────────────────────────────────┘
```

**Important scoping note:** Session token hijack (Step 3a) works because the
`/api/public/promotion-play` route accepts `sessionToken` as a URL parameter
and uses it to look up the session. If an attacker has the session token, they
get a full coupon recovery response. The route is server-side and uses the
service role, so there is no RLS protection at the route level — protection
must come from preventing token enumeration at the database level.

### 6. Does Exposure Enable Fraud or Abuse?

**Yes — multiple vectors:**

| Vector | Severity | Requires C-1 too? | Feasibility |
|---|---|---|---|
| Coupon recovery hijack via stolen session_token | High | No | High — one query gives all tokens |
| Mass PII harvest (phone + IP → winner profiling) | Critical | Yes | High — simple JOIN |
| Consent record tampering via customer_profile_id update | High | Yes | Medium |
| Session deletion (destroy play audit trail) | Medium | No | Trivial |
| Session poisoning (unlink victims from their profiles) | High | No | Trivial |
| Replay attack via session erasure | Low | No | Low — coupons are authoritative, not sessions |

**Coupon recovery hijack detail:** The play page stores the session token in
`localStorage`. If an attacker can enumerate all session tokens via the current
C-6 policy, they can replay any victim's session token against
`/api/public/promotion-play` and receive the victim's coupon codes. The coupon
code (e.g., `FREE-BURGER-A3K9`) is then usable at the restaurant POS. This is
direct monetary fraud.

**Replay attack clarification:** The play page prevents double-play by checking
whether coupons already exist for the session (via `coupon_redemptions`). This
check uses the service role and is not bypassable via C-6. Deleting play
sessions does not grant extra spins. However, it corrupts the session audit
trail and breaks coupon recovery for affected users.

### 7. Recommended Remediation

**Option A — Drop policy, add nothing (Recommended)**

```sql
DROP POLICY "Users can access their play sessions" ON public.play_sessions;

-- No new policy added.
-- Result: anon and authenticated roles see RLS block (no permissive policy).
-- Service role continues to bypass RLS — all legitimate code paths unaffected.
```

**Why this is safe:** Every read and write to `play_sessions` goes through
server-side routes using `SUPABASE_SERVICE_ROLE_KEY`:
- `lib/game-pool/resolvePromotionGame.ts` — module-level service client
- `app/api/public/promotion-play/route.ts` — service client
- `app/api/public/customer-identity/route.ts` — service client

None of these use the anon key or the browser-side Supabase client.

**Option B — Owner read access (if restaurant dashboard ever needs session data)**

If a future feature shows restaurant owners their play session counts, an
owner-scoped SELECT could be added at that time:

```sql
CREATE POLICY "owners read own promotion sessions"
  ON public.play_sessions FOR SELECT TO authenticated
  USING (promotion_id IN (
    SELECT p.id FROM public.promotions p
    JOIN public.restaurants r ON r.id = p.restaurant_id
    WHERE r.owner_id = auth.uid()
  ));
```

This is not needed now and should **not** be added preemptively.

**Recommendation:** Option A only.

### 8. Expected Application Impact

**Zero.** Verified by code review:

| Code path | Key used | Impact of dropping policy |
|---|---|---|
| `lib/game-pool/resolvePromotionGame.ts` | `SUPABASE_SERVICE_ROLE_KEY` (module-level) | None |
| `app/api/public/promotion-play/route.ts` | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `app/api/public/customer-identity/route.ts` | `SUPABASE_SERVICE_ROLE_KEY` | None |
| `app/play/.../page.tsx` | HTTP fetch to above routes (no direct Supabase) | None |

**QR play flow verification:**

```
1. Customer scans QR → loads play page (client component, no Supabase)
2. Play page generates/recovers sessionToken from localStorage
3. Play page calls GET /api/public/promotion-play?sessionToken=...
   → Server (service role) creates or retrieves play_sessions row
   → Server returns game config and coupons
4. Player wins → play page calls POST /api/coupons/issue
   → Server (service role) inserts coupon_redemptions row
5. Post-win screen → customer enters phone → calls POST /api/public/customer-identity
   → Server (service role) upserts customer_profiles, updates play_sessions
```

No step touches `play_sessions` directly from the browser via Supabase client.

### 9. Migration Complexity

**Very low.** One `DROP POLICY` statement.

```sql
-- Complete migration:
DROP POLICY "Users can access their play sessions" ON public.play_sessions;
```

Pre-migration check:
```bash
grep -rn "play_sessions" /app /components /hooks /lib \
  --include="*.ts" --include="*.tsx" | grep -v "database.types"
# Must show only:
#   app/api/public/promotion-play/route.ts (service role)
#   app/api/public/customer-identity/route.ts (service role)
#   lib/game-pool/resolvePromotionGame.ts (service role)
# No createClient() using anon/public key should appear.
```

### 10. Rollback Considerations

```sql
-- Rollback:
CREATE POLICY "Users can access their play sessions"
  ON public.play_sessions
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM promotions WHERE promotions.id = play_sessions.promotion_id
  ));
```

**Rollback should not be needed.** There is no application behaviour that
depends on the `{public}` policy. If rollback is executed, it re-opens the
C-6 vulnerability.

---

## Combined Migration

Both C-1 and C-6 can be addressed in a single migration:

```sql
-- Phase B: C-1 + C-6 remediation
-- Drop the two broken {public} policies that expose customer PII and session data
-- to any holder of the anon key. All legitimate access uses the service role,
-- which bypasses RLS and is unaffected by this change.

DROP POLICY "service role full access on customer_profiles"
  ON public.customer_profiles;

DROP POLICY "Users can access their play sessions"
  ON public.play_sessions;
```

**Total lines of SQL: 2.**
**Application code changes required: 0.**
**Schema changes required: 0.**
**Migration risk: Near-zero.**

---

## Secondary Finding: session_token Exposure Warrants Additional Hardening

Even after C-6 is fixed, the session_token is a meaningful credential — it
grants coupon recovery when replayed against the server route. Two
recommendations for a follow-on task (not C-6 scope):

1. **Token expiry enforcement:** `play_sessions.expires_at` exists but is not
   validated server-side in the session recovery path. Enforce it:
   ```sql
   -- In resolvePromotionGame.ts or promotion-play route:
   .eq('session_token', sessionToken)
   .gt('expires_at', new Date().toISOString())  -- add this filter
   ```

2. **Token rotation:** After coupon issuance, the session token's value has
   been consumed. Rotating or invalidating it after all spins are used
   eliminates the recovery hijack vector even if the token is later exposed.

These are Medium-severity hardening items, not prerequisites for Phase B merge.

---

## Remaining Questions for Phase B Planning

These must be answered before implementing H-1 (`guest_sessions`), which
depends on understanding the session model:

| Question | Why it matters |
|---|---|
| Does `guest_sessions` link to `play_sessions`? | Determines whether guest session scoping can reuse the session_token pattern |
| Is there a `restaurant_id` or `promotion_id` on `guest_sessions`? | Determines the correct ownership scope for H-1 policies |
| Does the play page create `guest_sessions` directly from the browser? | If yes, anon INSERT must be retained for H-1; if server-side, same pattern as C-6 applies |
| What is `play_sessions.customer_id` (text column)? | Pre-profile legacy field — understand what was stored before customer_profiles FK was added |

---

## Summary

| Finding | Table | Current policy | Proposed fix | App impact | SQL lines |
|---|---|---|---|---|---|
| C-1 | `customer_profiles` | `{public}` ALL `USING: true` | DROP policy | Zero | 1 |
| C-6 | `play_sessions` | `{public}` ALL via promotion EXISTS | DROP policy | Zero | 1 |

Both fixes are the same structural change: remove the policy that grants
`{public}` access and rely on service role bypass for all legitimate paths.
The architectural decision to route all customer-facing data operations through
server-side API routes is correct and was made consistently. This remediation
formalises that boundary at the database layer.
