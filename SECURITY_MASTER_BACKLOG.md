# SpinBite Security Master Backlog

**Authoritative security register — updated 2026-06-09**  
**Current release:** v0.2.3-security-phase-c1

This document is the single source of truth for all security findings, remediation
history, and open risk. Update it when a finding is opened or closed.

---

## Executive Summary

SpinBite has completed three security hardening phases since initial deployment.
All Critical findings are resolved. Two High findings remain open (H-1, H-3) and
require remediation before public launch. Two Medium findings are open but present
lower operational risk.

### Current Finding Counts

| Severity | Total Found | Resolved | **Remaining** |
|---|---|---|---|
| Critical | 6 | 6 | **0** |
| High | 6 | 4 | **2** |
| Medium | 2 | 0 | **2** |
| Low / Informational | 0 formal | — | **0** (hardening backlog below) |

**Security posture:** Adequate for continued private/beta operation. Not suitable for
public launch until H-1 is resolved. Not suitable for enterprise customers until
H-1 and H-3 are resolved.

---

## Completed Security Work

### Phase A — RLS Ownership Enforcement

**Released:** v0.2.1-security-phase-a  
**Merged:** `7373e1d`  
**Migrations:**
- `20260609000000_phase_a_security_hardening`
- `20260609000100_phase_a_fix_logo_upload_policy`

**Validation:** `docs/security/PHASE_A_VALIDATION.md`

Closed all findings that could be remediated with policy-only changes: open
`USING: true` policies that granted universal read/write across all restaurant data.

| Finding ID | Table / Scope | Description | Resolution |
|---|---|---|---|
| C-2 (A-1) | `restaurants` UPDATE | Any user (including anon) could overwrite any restaurant's name, slug, owner_id, hero, hours, and contact fields | Dropped `allow update restaurants` (qual: true). Created `owners update own restaurants` scoped to `owner_id = auth.uid()`, {authenticated} |
| C-3 (A-2) | `restaurants` INSERT | Anonymous callers could create restaurants and claim arbitrary `owner_id` values | Dropped both open INSERT policies (`allow insert restaurants`, `public insert restaurants`). Retained `authenticated users create restaurants` which enforces `auth.uid() IS NOT NULL AND owner_id = auth.uid()` |
| C-4-UPDATE (A-3) | `menus` UPDATE | Any user could rename, deactivate, or reorder any menu across all restaurants | Dropped `public update menus` (qual: true). Created `owners update own menus` scoped to `restaurant_id IN (owner subquery)`, {authenticated} |
| C-5-UPDATE (A-4) | `promotions` UPDATE | Any user could modify any promotion's name, slug, status, game configuration, or active state | Dropped `public update promotions` (qual: true). Created `owners update own promotions` scoped to `restaurant_id IN (owner subquery)`, {authenticated} |
| H-4 (A-5) | `restaurant-logos` storage | Authenticated users could upload or overwrite logos in any restaurant's storage folder — no path scoping | Dropped bucket-only policies. Created `Owners upload restaurant logos` using IN-pattern path enforcement: `foldername(name)[1] = uid` AND `foldername(name)[2] IN (owner's restaurant IDs)` |
| A-6 | `restaurants` SELECT | `owner_id IS NULL` condition in owner SELECT policy allowed any authenticated user to read orphaned/unclaimed restaurant rows | Dropped old policy. Created `owners read own restaurants` with `USING: owner_id = auth.uid()`, {authenticated} — no IS NULL branch |
| A-7 | `menus` SELECT | Inactive/draft menus readable by anonymous users | Dropped `public read menus` (qual: true). Added `owners read own menus` ({authenticated}) to preserve admin UI access. Retained `Public read active menus` (active = true) for QR play page |

---

### Phase B — Critical Customer Data Protection

**Released:** v0.2.2-security-phase-b  
**Merged:** `6be7f46`  
**Migration:** `20260609010000_phase_b_drop_public_customer_and_session_policies`

**Validation:** `docs/security/PHASE_B_CUSTOMER_DATA_PROTECTION.md`  
**Risk analysis:** `docs/security/PHASE_B_C1_C6_RISK_ANALYSIS.md`

Closed the two Critical PII exposure findings. Both fixes were DROP POLICY only —
no replacement policies needed because all legitimate access is server-side via
`SUPABASE_SERVICE_ROLE_KEY`.

| Finding ID | Table | Description | Resolution |
|---|---|---|---|
| C-1 | `customer_profiles` | `"service role full access on customer_profiles"` was bound to `{public}` — any anon-key caller could SELECT all phone numbers and consent records, fabricate consent, or DELETE all records | Dropped the single policy. Zero policies on this table. All access via `SUPABASE_SERVICE_ROLE_KEY` in server-side routes (`/api/public/customer-identity`). Service role bypasses RLS. |
| C-6 | `play_sessions` | `"Users can access their play sessions"` granted ALL to any caller who knew a promotion UUID (which is world-readable). 63 of 63 rows reachable — session tokens, IP addresses, and customer_profile_id links exposed | Dropped the single policy. Zero policies on this table. All access via `SUPABASE_SERVICE_ROLE_KEY` in `resolvePromotionGame.ts` and `/api/public/customer-identity`. |

---

### Phase C1 — High Finding Remediation (H-6, H-5, H-2)

**Released:** v0.2.3-security-phase-c1  
**Merged:** `fd8a11a`  
**Migration:** `20260609020000_phase_c1_h6_h5_h2_security_hardening`

**Validation:** `docs/security/PHASE_C1_VALIDATION.md`  
**25/25 tests passed. One functional regression resolved (menu item UPDATE).**

| Finding ID | Table / Scope | Description | Resolution |
|---|---|---|---|
| H-6 | `restaurant-heroes`, `menu-item-images` storage | Upload policies used `EXISTS(... r.name ...)` where `r.name` resolved to the restaurant display name inside the subquery — not the storage path. Restaurant-ID segment was never validated; an owner could upload to any restaurant's folder using their own UID | Dropped both buggy INSERT policies. Recreated with the IN-pattern: `foldername(name)[2] IN (SELECT r.id::text FROM restaurants r WHERE r.owner_id = auth.uid())` — identical fix to Phase A restaurant-logos |
| H-5 | `menu_items` | No UPDATE policy existed — owner attempts to update item names/prices silently returned 0 rows. INSERT and DELETE policies used `{public}` role. A redundant `{public}` owner SELECT policy was also present | Dropped redundant SELECT, fixed INSERT/DELETE roles to `{authenticated}`, added `"owners update own menu items"` UPDATE policy. Functional regression resolved: `menu/page.tsx:144` update flow now works |
| H-2 | `promotion_game_assignments` | `{public}` ALL policy validated only that the referenced promotion exists (world-readable) — not that the caller owns it. Any caller could enumerate promotion UUIDs and overwrite any promotion's game configuration | Dropped `"Users can manage their promotion game assignments"`. Created `"owners manage own promotion game assignments"` FOR ALL TO authenticated with promotions → restaurants owner join. Play flow uses service role (unaffected). |

---

## Open Findings

### High

---

#### H-1 — `guest_sessions`: Full Cross-Tenant Read/Write

**Severity:** High  
**Table:** `public.guest_sessions`  
**Status:** Open — deferred to Phase C2  
**Prerequisite:** QR play flow code review required before implementing any fix

**Current policies (three, all qual: true):**
```sql
"Allow guest session inserts"   {anon, authenticated}  INSERT  WITH CHECK: true
"Allow guest session reads"     {anon, authenticated}  SELECT  USING: true
"Allow guest session updates"   {anon, authenticated}  UPDATE  USING: true  WITH CHECK: true
```

**Description:** No row-level predicate is evaluated. Any unauthenticated HTTP
request using the public anon key can:
- `SELECT * FROM guest_sessions` — enumerate all sessions across all restaurants
- `UPDATE guest_sessions SET spins_remaining = 99 WHERE id = '<any-id>'` — override spin counts for any session
- `INSERT INTO guest_sessions (restaurant_id, ...) VALUES ('<any-id>', ...)` — create fraudulent sessions for any restaurant

**Exploitability:** High. No authentication required. Anon key is embedded in the
client-side bundle of every QR play page. The PostgREST API is reachable directly.

**Business Impact:**
- **Coupon fraud:** Overwriting `spins_remaining` or completion state may bypass win/coupon guards if spin state is authoritative in `guest_sessions`
- **Cross-tenant enumeration:** All guest session data across all restaurants is readable — timing patterns, play counts
- **Session hijacking:** Any session UUID exposed via the world-readable SELECT can be overwritten
- **Data integrity:** Attacker can insert ghost sessions for any restaurant, skewing analytics

**Recommended Remediation:**

Two viable approaches — which to use depends on the code review outcome:

*Option A — Token-scoped RLS (if guest sessions are identified by a client-held token):*
```sql
DROP POLICY "Allow guest session inserts" ON public.guest_sessions;
DROP POLICY "Allow guest session reads" ON public.guest_sessions;
DROP POLICY "Allow guest session updates" ON public.guest_sessions;

CREATE POLICY "anon creates guest session"
  ON public.guest_sessions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "token holder reads own session"
  ON public.guest_sessions FOR SELECT TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token');

CREATE POLICY "token holder updates own session"
  ON public.guest_sessions FOR UPDATE TO anon
  USING (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token')
  WITH CHECK (session_token = current_setting('request.jwt.claims', true)::jsonb->>'session_token');
```

*Option B — Server-side session management (architecturally preferred):*
Migrate `guest_sessions` reads/writes to server-side API routes using
`SUPABASE_SERVICE_ROLE_KEY`, eliminating all client-side Supabase access. Zero
public policies — same architecture as `play_sessions` after Phase B. This is the
stronger security posture but requires more application refactoring.

**Required pre-implementation audit:**
1. Confirm whether `guest_sessions` is read/written via Supabase client (client-side) or API routes (server-side)
2. Confirm whether a `session_token` column exists on the table
3. Confirm whether spin state is authoritative in `guest_sessions` or in `play_sessions`

**Estimated Effort:** Medium (Option A) / Medium-High (Option B)  
**Regression Risk:** Medium — the QR play flow creates and reads guest sessions; restricting access requires the application to be updated concurrently

---

#### H-3 — `restaurants`: Owner PII Readable by Anonymous Users

**Severity:** High  
**Table:** `public.restaurants`  
**Status:** Open — deferred to Phase C2  
**Prerequisite:** Column-level design decision and callsite audit required

**Current policies (both qual: true):**
```sql
"allow select restaurants"  {public}  SELECT  USING: true
"public read restaurants"   {public}  SELECT  USING: true
```

**Exposed PII fields:**

| Column | Data | Classification |
|---|---|---|
| `contact_email` | Owner contact email | PII — not required by QR play page |
| `phone` | Owner phone number | PII — not required by QR play page |
| `address_line1`, `address_line2` | Physical address | PII — not required by QR play page |
| `city`, `state`, `postcode` | Location | Partially public, but not needed by anon |
| `owner_name` | Owner personal name | PII — not required by QR play page |
| `owner_id` | Supabase auth UID | Internal FK — not needed by anon |
| `id`, `slug`, `name`, `experience_mode` | Public display | Required by QR play page |
| `hero_image_url`, `logo_url`, `description` | Branding | Required by QR play page |
| `brand_color`, `secondary_color`, `accent_color` | Branding | Required by QR play page |

**Description:** Both SELECT policies return full restaurant rows to any
unauthenticated caller. All restaurant owner PII is publicly enumerable — name,
email, phone, and physical address of every restaurant owner on the platform.

**Exploitability:** High. No authentication required.
```sql
SELECT name, contact_email, phone, address_line1, owner_name FROM restaurants;
```

**Business Impact:**
- **GDPR/CCPA exposure:** Full personal contact details of business owners publicly
  enumerable without consent
- **`owner_id` exposure:** Supabase auth UID of every owner is public — enables targeted account attacks
- **Competitive intelligence:** Full restaurant inventory (names, slugs, configuration) visible to competitors
- **Spam/phishing risk:** Email and phone of every owner directly accessible

**Architectural Considerations:**

Because Postgres RLS operates on rows (not columns), restricting which columns are
exposed to anonymous callers requires one of:

1. **A view** (`public.restaurants_public`) exposing only safe columns, with a
   `{public}` SELECT policy on the view and removal of direct table access for anon.
   Callsites reading safe columns switch to the view; owner callsites continue reading
   the base table via the owner SELECT policy.

2. **Column-level GRANT/REVOKE:** Revoke specific columns from the `anon` role.
   Postgres column-level privileges interact with RLS in non-obvious ways — requires
   testing.

3. **Server-side route for public restaurant reads:** Serve restaurant data through a
   Next.js API route that explicitly selects only safe columns, eliminating direct
   client-side Supabase queries to `restaurants` for anonymous play paths.

The view approach (option 1) is the most auditable and is recommended.

**Recommended Design Approach:**

```sql
-- Safe columns only — for QR play page and public landing:
CREATE VIEW public.restaurants_public AS
  SELECT id, slug, name, experience_mode, hero_image_url,
         logo_url, description, brand_color, secondary_color, accent_color
  FROM public.restaurants;

GRANT SELECT ON public.restaurants_public TO anon, authenticated;

-- Remove direct anon access to base table:
DROP POLICY "allow select restaurants" ON public.restaurants;
DROP POLICY "public read restaurants" ON public.restaurants;

-- Owner retains full access via existing owner policy:
-- "owners read own restaurants" {authenticated} USING: owner_id = auth.uid()
```

**Required pre-implementation callsite audit:**
- `/r/[restaurantSlug]` landing page — which columns does it read?
- `/play/[restaurantSlug]/[promotionSlug]/page.tsx` — which columns does it read?
- All `supabase.from('restaurants').select(...)` calls across app and components
- Super-admin routes — confirm they use service role or owner auth

**Estimated Effort:** Medium-High. View creation is Low effort; callsite audit and
switch from base table to view is Medium; any column gaps discovered require iteration.

**Regression Risk:** Medium-High — the QR play page reads restaurant data on every scan.
Switching to the view requires confirming the view contains every column the page needs.

---

### Medium

---

#### C-4-INSERT — `menus`: Anonymous INSERT

**Severity:** Medium  
**Table:** `public.menus`  
**Status:** Open

**Current policy:**
```sql
"public insert menus"  {public}  INSERT  WITH CHECK: true
```

**Description:** Any unauthenticated caller can insert a menu row for any
`restaurant_id`. Orphan menus would appear in the restaurant owner's admin menu
list, corrupting their workspace. At scale, this is a database pollution and
potential DoS vector.

**Recommended Remediation:**
```sql
DROP POLICY "public insert menus" ON public.menus;
CREATE POLICY "owners insert own menus"
  ON public.menus FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid())
  );
```

**Estimated Effort:** Low — 1 DROP + 1 CREATE. Verify admin menu page creates menus as authenticated user (confirmed: `menu/page.tsx:105` inserts via authenticated Supabase client).

---

#### C-5-INSERT — `promotions`: Anonymous INSERT

**Severity:** Medium  
**Table:** `public.promotions`  
**Status:** Open

**Current policy:**
```sql
"public insert promotions"  {public}  INSERT  WITH CHECK: true
```

**Description:** Any unauthenticated caller can insert a promotion row for any
`restaurant_id`. Orphan promotions appear in the restaurant owner's admin
promotions list, corrupting their workspace.

**Recommended Remediation:**
```sql
DROP POLICY "public insert promotions" ON public.promotions;
CREATE POLICY "owners insert own promotions"
  ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (
    restaurant_id IN (SELECT id FROM public.restaurants WHERE owner_id = auth.uid())
  );
```

**Estimated Effort:** Low — 1 DROP + 1 CREATE. Verify admin promotions page creates promotions as authenticated user before applying.

---

## Deferred Hardening Opportunities

These are not formal security findings — they are improvements that would reduce
risk surface over time. None are blocking for launch.

| Item | Description | Priority |
|---|---|---|
| Session token expiry enforcement | `play_sessions.expires_at` is stored but never checked in the session recovery path (`resolvePromotionGame.ts`). Expired sessions can be replayed indefinitely. | Medium |
| Session token invalidation after completion | Tokens are not rotated or invalidated after all spins are consumed. A completed session's token remains valid for recovery and replay. | Medium |
| Session token hashing at rest | `play_sessions.session_token` stores plain UUIDs. A DB read (e.g., via a future misconfiguration) would immediately reveal usable tokens. Storing HMAC-SHA256 hashes limits the blast radius. | Low |
| Audit logging | No structured audit trail for admin actions (promotion launch/pause, reward changes, restaurant profile updates). Relevant for enterprise compliance. | Medium |
| Security monitoring / alerting | No alerting on suspicious patterns: high INSERT rates, enumeration of all promotions, repeated RLS violation errors in PostgREST logs. | Medium |
| Penetration testing | Manual pen test by an external party has not been performed. RLS logic bugs (like the `r.name` H-6 issue) are difficult to detect via policy review alone. | High (pre-enterprise) |
| Secret rotation | `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` rotation cadence not documented. | Low |
| Rate limiting review | PostgREST rate limiting relies on Supabase platform defaults. No application-level rate limiting on `/api/public/promotion-play` or `/api/public/customer-identity`. | Medium |
| CSP review | Content Security Policy headers for the QR play page have not been audited against the current asset sources (Supabase Storage CDN URLs). | Low |
| Dependency scanning | No automated CVE scanning (e.g., `npm audit`, Dependabot, or Snyk) in CI pipeline for the Next.js application. | Medium |

---

## Security Milestones

### v0.2.1-security-phase-a
**Merged:** `7373e1d` — 2026-06-09

Closed 7 findings covering the most critical write-access vulnerabilities. Before
this release, any unauthenticated caller could overwrite any restaurant, menu, or
promotion in the system. After this release, all write operations are authenticated
and owner-scoped.

### v0.2.2-security-phase-b
**Merged:** `6be7f46` — 2026-06-09

Closed the two Critical customer data exposure findings. Before this release, all
customer phone numbers, consent records, and play session data (including coupon
recovery tokens) were directly readable by any caller with the anon key. After this
release, both tables have zero public policies — access is exclusively through
server-side service role routes.

### v0.2.3-security-phase-c1
**Merged:** `fd8a11a` — 2026-06-09

Closed 3 High findings. Fixed the storage path validation bug in two buckets (an
identical class of bug to Phase A's restaurant-logos fix). Added the missing
`menu_items` UPDATE policy, resolving a silent functional regression in the admin
menu builder. Replaced the open `promotion_game_assignments` policy with an
owner-scoped policy, eliminating game configuration tampering.

---

## Recommendation: When to Address Remaining Findings

### Required Before Public Launch

| Finding | Reason |
|---|---|
| **H-1** `guest_sessions` | Any unauthenticated visitor can enumerate and overwrite session data across all restaurants. Coupon fraud potential via spin count manipulation. This is an active abuse surface the moment the platform has real users. **Do not publicly launch until H-1 is resolved.** |
| **C-4-INSERT** `menus` | Anonymous menu creation pollutes every restaurant owner's admin workspace. With real users, this will surface as a support issue within hours of launch. Low effort fix. |
| **C-5-INSERT** `promotions` | Same as C-4 — anonymous promotion creation is trivially exploitable and creates visible noise in the admin UI. Low effort fix. |

### Required Before Enterprise Customers

| Finding | Reason |
|---|---|
| **H-3** `restaurants` PII | Full owner contact details (email, phone, physical address, personal name) are publicly enumerable. Any enterprise customer due-diligence process will flag this as a GDPR/CCPA violation. This is the architecturally most complex remaining finding — start design work early. |
| **Penetration testing** | Enterprise customers will request a pen test report or third-party security assessment before signing. A formal test should be conducted after H-1 and H-3 are resolved. |
| **Audit logging** | Enterprise customers typically require evidence of admin action logging for compliance. |

### Nice to Have (Post-Launch Hardening)

| Item | Reason |
|---|---|
| Session token expiry enforcement | Reduces fraud surface but does not enable a new attack class. The current architecture already limits the blast radius. |
| Session token invalidation and hashing | Defense-in-depth improvements. Valuable but not urgent. |
| Rate limiting on public API routes | Reduces abuse risk post-launch but the platform's current scale makes active exploitation unlikely before it would be noticed and mitigated manually. |
| CSP review, dependency scanning, secret rotation | Operational hygiene — schedule for the sprint after public launch. |
| Security monitoring | Set up PostgREST error alerting and anomaly detection as part of the general observability work, not as a separate security initiative. |

---

## Finding Count History

| Release | Critical Remaining | High Remaining | Medium Remaining |
|---|---|---|---|
| Pre-Phase A | 2 | 6 | 2 |
| v0.2.1-security-phase-a | 2 | 5 | 2 |
| v0.2.2-security-phase-b | **0** | 5 | 2 |
| v0.2.3-security-phase-c1 | 0 | **2** | 2 |
| Phase C2 target | 0 | 0 | 0 |
