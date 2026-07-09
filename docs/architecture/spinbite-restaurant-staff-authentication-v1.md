# SpinBite Restaurant Staff & Authentication Subsystem v1

**Status:** Implementation-ready architecture and specification. **No code, no migrations, in this document.**
**Date:** 2026-07-08
**Purpose:** Design the identity, authentication, and capability-based authorization layer for restaurant employees — the subsystem every future staff-facing feature (KDS, POS employee mapping, AI staff-notification, enterprise multi-location) builds on.
**Verification method:** Re-verified live this session: `middleware.ts` (full file, quoted below), `lib/super-admin.ts` (full file, quoted below), the live `profiles`/`restaurants` schema and RLS patterns (from this session's earlier audits), and a full read of `docs/architecture/spinbite-order-operations-engine-v1.md`, which already proposed a minimal `restaurant_staff` sketch and an `order_events` table with staff-actor attribution built in. This document does not duplicate that doc's order-state-machine, KDS-screen, or analytics design — it builds the identity/auth/capability layer that document explicitly scoped out as a prerequisite, and formalizes the FK targets (`accepted_by`, `served_by`, `cancelled_by`, `order_events.actor_id`) that document left abstract pending this design.
**Inputs treated as binding, not re-derived**: `spinbite-business-invariants-v1.md` (constitutional rules, especially SEC-4 attribution, R-1 restaurant identity), `spinbite-phase-0-critical-remediation-plan-v1.md` (current production-safety baseline this design must not regress), `spinbite-canonical-commerce-domain-model-v1.md` (bounded contexts, the still-open Organization/Brand gap), `spinbite-customer-identity-spine-v1.md` (the Customer/Guest model — Staff is a distinct concept from Customer/Guest and the two must never merge), `spinbite-pos-integration-layer-audit-v1.md` (the `pos_external_mappings` generic entity-mapping table, reused here rather than duplicated).

---

## 0. Executive Summary

SpinBite has one authorization check, everywhere: `restaurants.owner_id === auth.uid()`. It appears, re-verified this session, in every RLS policy on every restaurant-scoped table and in every admin API route's manual auth check (`app/api/admin/orders/[orderId]/status/route.ts` being the clearest single example). `middleware.ts` itself does almost nothing — it only confirms *a* Supabase session exists on `/admin/:path*`; every actual authorization decision happens per-route, and every one of those routes currently asks exactly one question: is the caller the owner? There is no second answer available anywhere in the codebase today.

This does not scale past a single-person-run restaurant, and the Order Operations Engine audit already identified it as the blocking prerequisite for kitchen/expo/server screens, refunds by non-owners, and any real operational workflow. This document is that prerequisite, designed completely: a capability-based authorization system (roles are data, not code), a multi-method authentication layer that supports both individually-logged-in staff and shared kitchen/cashier terminals with PIN attribution, and a staff lifecycle (invite → accept → activate → suspend → terminate → rehire) that treats restaurant staff as first-class business entities rather than a hardcoded owner/not-owner binary.

**Three design decisions carry the whole system and are stated up front because they recur throughout every section below:**

1. **Roles are rows, not code.** `staff_roles` are owner-scoped, editable, cloneable data — directly reusing the Menu Library redesign's already-proven owner-scoped, multi-restaurant-shareable pattern, rather than inventing a new one. A role is nothing but a named bundle of `capability_definitions` rows. Custom roles and future enterprise roles require zero schema change and zero code deploy — they're just new rows.
2. **Device trust and staff attribution are two separate, independently-revocable layers.** A shared kitchen tablet earns *device* trust once (a manager sets it up); an individual cook earns *attribution* on top of that trusted device via PIN, short-lived and independently revocable. Conflating these — as a single "terminal login" — is the mistake that makes shared-device security either annoying (re-login every order) or unsafe (never re-verify who's actually acting). Keeping them separate is what makes both usable and auditable.
3. **PIN credentials, like POS OAuth tokens before them, live in their own zero-client-access table.** This directly reuses the isolation pattern the POS Integration Audit already established for `pos_connections`' secret columns — not a new security pattern, an application of an existing one.

---

## 1. Current-State Audit (verified live this session)

**`middleware.ts`** (full file, 45 lines):
```ts
export async function middleware(req: NextRequest) {
  ...
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && req.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/auth', req.url));
  }
  return res;
}
export const config = { matcher: ['/admin/:path*'] };
```
This is the entire global gate: "is someone logged in." No role check, no restaurant scoping, nothing else — every further decision happens per-route.

**`lib/super-admin.ts`** (full file, 38 lines): the only role-check helper in the codebase. `ProfileRole = 'restaurant_owner' | 'super_admin'` — a two-value union, DB-CHECK-constrained on `profiles.role`. `requireSuperAdmin()` is used exclusively to gate the `/super-admin` platform-operator surface; nothing analogous exists for "is this person a manager at this specific restaurant" because that concept doesn't exist yet.

**`app/staff/page.tsx`**: confirmed (again, this session's prior audits already found this) to be an unauthenticated static mock — no auth, no DB write, not wired to `profiles` or any real identity. Not a foundation to build on; will be replaced by real staff-facing routes in this design.

**RLS pattern, universal across every restaurant-scoped table** (confirmed via this session's `pg_policies` queries on `restaurants`/`orders`/`order_items` and prior sessions' equivalent queries on `menus`/`promotions`/etc.): `EXISTS (SELECT 1 FROM restaurants r WHERE r.id = <table>.restaurant_id AND r.owner_id = auth.uid())`, or the direct `restaurants.owner_id = auth.uid()` form on `restaurants` itself. Every one of these policies will need an additive (not replacing) OR-clause once `restaurant_staff` exists — this document specifies the exact form in §7.

**`restaurants.owner_id`**: `uuid → auth.users(id)`, not unique — confirmed (again) 1 owner : many restaurants. This stays exactly as-is; it is not replaced, only supplemented (§4.1).

**No staff-adjacent table exists anywhere in the live schema** (41 tables, full inventory confirmed earlier this session): no `restaurant_staff`, no role table, no PIN table, no device table, no staff session table. This is, like the POS layer, a genuine blank slate — nothing to migrate away from, only to build.

**The Order Operations Engine audit's existing sketch** (§6 of that document, quoted in full since this design directly builds on and revises it):
```sql
CREATE TABLE restaurant_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  user_id uuid REFERENCES auth.users(id),
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','cashier','kitchen','expo','server')),
  pin_code_hash text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
This is correct in every structural respect (restaurant-scoped, nullable `user_id` for PIN-only terminals, additive RLS) and is **kept as the foundation of `restaurant_staff` in this design (§4.1)**. The one thing this document changes is the `role text CHECK(...)` column — a hardcoded six-value enum cannot represent Assistant Manager, Supervisor, Host, Bartender, Marketing Manager, or any custom/future role without a schema migration per new role, which directly contradicts this task's explicit requirement to avoid hardcoded roles. §4.2-4.4 replace that single column with the capability-based role system, while keeping `restaurant_staff` itself, its `user_id`/`pin_code_hash` shape (relocated to its own table, §6.6), and its RLS pattern intact.

---

## 2. Gap Analysis

| Capability required | Exists today? | Gap |
|---|---|---|
| Multiple staff per restaurant | No — one owner only | Foundational — everything else depends on this |
| Role differentiation | No — `restaurant_owner`/`super_admin` only, platform-wide not per-restaurant | No concept of "manager at Restaurant A" |
| Custom/extensible roles | No | A hardcoded enum (even the OOE sketch's) can't represent this |
| Capability-level permission checks | No — every check is `owner_id === auth.uid()` | No graduated access at all |
| Non-login authentication (PIN, shared terminal) | No | Zero infrastructure |
| Device trust | No | Zero infrastructure — note the *customer*-side `device_fingerprint` capture is separately known-broken (always `'unknown'`, per the Session Architecture memory) and must not be reused/assumed working for staff device trust |
| Staff session/attribution tracking | No | No way to know "who is acting on this shared terminal right now" |
| Staff invitation/lifecycle | No | No invite flow, no suspend/terminate, nothing |
| Order-action attribution | Partial — `order_events.actor_id` already designed (OOE doc) but has no valid FK target yet | This document supplies that target |
| POS employee mapping | No | Consistent blank slate with the rest of POS integration |
| AI-to-staff targeting | No | No staff to target — Decision Runtime currently only reaches customers/generic restaurant notification |

---

## 3. Canonical Staff Model

**Staff is a distinct canonical entity from Customer/Guest and must never be merged with it.** This is worth stating explicitly because both are "a person interacting with a restaurant" at a glance — but a `restaurant_staff` row represents an employment relationship (restaurant-scoped, capability-bearing, subject to termination/suspension) while `customer_profiles` (per the Identity Spine) represents a permanent, global, consent-bearing identity with no employment relationship at all. A person could theoretically be both (a server who also dines there off-shift as a customer) — these remain two entirely separate rows with no FK between them, by design, mirroring the same discipline the Identity Spine already applies to keep Guest and Customer distinct until an explicit link is established.

**One employment record per (restaurant, person)**: `restaurant_staff` is restaurant-scoped, not global — a person working at two of an owner's restaurants gets two `restaurant_staff` rows, both anchored to the same `auth.users.id` where a login exists. This mirrors `restaurants.owner_id`'s existing 1-owner-many-restaurants shape rather than inventing a new pattern, and correctly models that a person's *capabilities* can differ by location (a Supervisor at one site, a Server picking up shifts at another).

**A shared-terminal staff member has no `auth.users` row at all.** `restaurant_staff.user_id` is nullable specifically for this case (kitchen/cashier PIN-only staff) — they authenticate exclusively via PIN-on-a-trusted-device (§5.3), never via Supabase Auth directly. This is not a lesser form of the same account; it's a legitimate, permanent identity shape for staff who will never need (or want) a personal login.

---

## 4. Permission Model (Capability-Based)

### 4.1 The three-layer model

```
restaurant_staff (one per restaurant, one per person)
      │
      │ many-to-many, via staff_role_assignments
      ▼
staff_roles (owner-scoped, named, reusable across the owner's restaurants — like Menu)
      │
      │ many-to-many, via staff_role_capabilities
      ▼
capability_definitions (platform-wide static catalog — like provider_capabilities in the POS design)
```

A staff member's **effective capability set** is the union of every capability granted by every role assigned to them. No role is hardcoded in application logic; every authorization check queries this chain (via `PermissionService`, §11) rather than comparing a role string.

### 4.2 `capability_definitions` — the static catalog

Not restaurant-scoped, not owner-scoped — a single platform-wide seed table, exactly mirroring the POS Integration Audit's `provider_capabilities` design (a hand-curated reference table shipped as data, extended by migration when a new capability is needed, never hardcoded into route logic).

Recommended baseline set (organized by category — this is the seed data, not a schema):

| Category | Capabilities |
|---|---|
| Restaurant | `manage_restaurant`, `manage_settings`, `manage_staff`, `transfer_ownership` |
| Catalog | `manage_menus`, `manage_tables`, `manage_qr` |
| Ordering | `manage_orders` (accept/bump/status), `void_orders`, `discount_orders`, `override_price` |
| Payments | `manage_payments`, `refund_orders` |
| Promotions | `manage_promotions`, `manage_campaigns`, `redeem_coupon` |
| Customers | `manage_customers`, `view_customer_phone` |
| Intelligence | `view_reports`, `view_session_intelligence`, `acknowledge_ai_intervention`, `manage_ai` |
| Inventory | `manage_inventory` (forward-compatible — no inventory system exists yet, per the POS audit's future `InventoryProvider`) |
| Integrations | `manage_pos` |
| Kitchen (new, this document, needed for KDS role-gating) | `kitchen_view`, `kitchen_bump`, `kitchen_recall`, `expo_view`, `expo_bump_all` |

This list is deliberately a starting point, not exhaustive — adding a capability is a data insert, never a code change to any route (routes check capability *strings* dynamically, per §11).

### 4.3 `staff_roles` — owner-scoped role templates

Directly reuses the Menu Library redesign's proven shape: `staff_roles (id, owner_id, name, description, is_system_role boolean, created_at, updated_at)`. Owner-scoped (not restaurant-scoped) means an owner defines "General Manager" once and it's assignable at any of their restaurants — identical reuse pattern to how `menus` became reusable across `restaurant_menu_assignments`. `is_system_role` distinguishes the pre-seeded starter templates (Owner, General Manager, Assistant Manager, Supervisor, Server, Cashier, Kitchen Staff, Expeditor, Host, Bartender, Marketing Manager — all eleven from the requirements) from an owner's custom roles, but both are rows in the same table with no code-level distinction in how they're evaluated — `is_system_role` only affects whether the UI allows deletion (system roles can be cloned and edited but the *seeded originals* shouldn't be deletable, to keep new-restaurant onboarding predictable).

### 4.4 Example role → capability mapping (seed data, not logic)

| Role (system template) | Representative capabilities |
|---|---|
| Owner | All capabilities, permanently, non-revocable below a floor (§9.5) |
| General Manager | All except `transfer_ownership`; typically includes `manage_staff`, `refund_orders`, `void_orders`, `override_price`, `manage_pos` |
| Assistant Manager | Most of GM's set, minus `manage_settings`/`manage_staff` role-editing (can assign shifts, not redefine roles) |
| Supervisor | `manage_orders`, `void_orders`, `discount_orders`, `kitchen_bump`, `expo_bump_all` — floor-level override authority without financial/settings access |
| Server | `manage_orders` (own tables), `redeem_coupon`, `view_customer_phone` (if consented, per Identity Spine's consent-boundary rule) |
| Cashier | `manage_orders`, `manage_payments`, `refund_orders` (capped, see §9.4), `redeem_coupon` |
| Kitchen Staff | `kitchen_view`, `kitchen_bump` |
| Expeditor | `expo_view`, `expo_bump_all`, `kitchen_recall` |
| Host | `manage_tables` (seating status only), read-only order visibility |
| Bartender | `manage_orders` (bar tickets), `kitchen_view`/`kitchen_bump` scoped to a bar station |
| Marketing Manager | `manage_promotions`, `manage_campaigns`, `view_reports`, explicitly **not** `manage_orders`/`refund_orders` — this role is the clearest illustration of why capability-based design matters: no role-enum system could cleanly express "full promotions access, zero payment access" without a bespoke role name for every combination |

These are illustrative seed rows, editable per restaurant/owner from day one — none of this is hardcoded into any service.

---

## 5. Authentication Architecture

### 5.1 Email/password and magic link — already solved, reused not rebuilt

Both are native Supabase Auth capabilities already in production use for owners. Extending them to managers/salaried staff requires **zero new authentication mechanism** — only extending the *invitation* flow (§8.1) to create an `auth.users` row (or link an existing one) and a corresponding `restaurant_staff` row with `user_id` set. Magic link in particular is close to free to enable — it's a Supabase Auth configuration surface, not new code.

### 5.2 The core new mechanism: device trust and PIN attribution as two independently-revocable layers

This is the design decision named in §0 and it governs every shared-terminal scenario (kitchen, cashier):

**Layer 1 — Device trust** (`trusted_devices`): established once, by an already-authenticated manager, through an explicit "set up this terminal" flow (not self-registration by an unknown device). A trusted device receives a long-lived, signed, revocable device token (an httpOnly cookie or equivalent) that authorizes it to load restaurant-scoped, station-scoped screens (the KDS station view, the cashier order-entry screen) **without any personal login** — but a trusted device with no active staff attribution can only *view*, never *act* (see Layer 2). Revoking device trust (lost tablet, decommissioned terminal) is a single action that immediately invalidates the token, independent of any staff member's own access.

**Layer 2 — Staff attribution** (`staff_sessions`, established via PIN): a specific `restaurant_staff` member "clocks in" on an already-trusted device by entering their PIN. This creates a short-lived `staff_sessions` row that attributes every subsequent action on that device to that specific person — bumping a ticket, applying a refund, redeeming a coupon — until they clock out or the session times out from inactivity. **PIN verification never happens client-side** — the device sends the PIN to a server route (`PINService`, §11), which checks it against the hashed value in `staff_pin_credentials` (never exposed to any client) and returns only success/failure plus a new `staff_sessions` token.

This two-layer split is what makes both security properties achievable at once: a lost/stolen kitchen tablet is neutralized by revoking its device trust in one action (no need to individually reset every cook's PIN), while a cook stepping away from an unattended trusted tablet is protected by the short attribution-session timeout (§5.5), not by the device's own (necessarily longer-lived) trust.

### 5.3 PIN login and shared terminals

A PIN is scoped to one `restaurant_staff` row (i.e., effectively per-restaurant, not global — a person working two restaurants could have different PINs at each, or the UI could offer to reuse one, but there is no platform-wide "PIN identity" separate from the employment record). Recommended PIN length: 4-6 digits, staff-chosen or manager-assigned at invitation. Given a PIN's inherently low entropy compared to a password, rate limiting and lockout (§9) are **non-negotiable, not optional** — this is stated as a hard requirement, not a nice-to-have, precisely because the PIN's convenience (fast entry on a shared kitchen tablet) is also its weakness.

### 5.4 Full individual login (managers/owners)

Unchanged from today's model — standard Supabase Auth session, cookie-based, managed entirely by `@supabase/ssr`. No new mechanism; `restaurant_staff.user_id` is simply the join key that resolves "which restaurant(s) and which role(s) does this logged-in person have," replacing the current single `owner_id` equality check with a `PermissionService` lookup (§11).

A manager may also hold a PIN (§5.3) for the case of briefly stepping onto a shared terminal (covering the cashier station during a rush) — PIN is available to any `restaurant_staff` row regardless of whether they also have a full login; the two are not mutually exclusive.

### 5.5 Session expiration and forced logout

Two independent expiry policies, matching the two-layer model:
- **Supabase Auth sessions** (full-login staff): governed by Supabase's own JWT/refresh-token lifecycle — no change from today's behavior.
- **`staff_sessions` (PIN attribution)**: a shorter, restaurant-configurable idle timeout (recommend a sensible default — e.g., 30-60 minutes of no attributed action — with the restaurant able to tighten or loosen it), because a PIN-attributed session on a shared device is the higher-risk case: unlike a personal phone, nothing stops the *next* person who walks up to a kitchen tablet from acting under the *previous* person's still-active attribution if the timeout is too generous.

**Forced logout** (a `manage_staff`-gated action, e.g. on termination): must invalidate both layers for the target staff member — the Supabase Auth session (via the service-role admin API, `auth.admin.signOut`/session revocation, already a native Supabase capability, not new infrastructure) and any active `staff_sessions` row (a direct row update). This must be atomic in intent (both fire from one "Force Logout" or "Terminate" action) even if implemented as two calls.

### 5.6 Offline PIN verification — explicitly not attempted as true cryptographic offline auth

Given SpinBite has no offline-first architecture anywhere else in the platform (confirmed across every prior audit this session — no service worker, no local-first data layer), this document does **not** recommend shipping PIN hashes to client devices for local verification — that would be a real security regression (client-side hash comparison is crackable, and revocation can't propagate to a disconnected device). The honest, right-sized answer: if a trusted device loses connectivity, it should **degrade to read-only continuity** (the KDS can keep displaying its last-synced ticket state from a local cache, per the Order Operations Engine's own recommended reconciliation-on-reconnect pattern) and **block new PIN entry and any attributed mutation** until connectivity returns. This avoids overpromising a genuinely hard distributed-systems guarantee the rest of the platform doesn't otherwise provide, while still keeping the kitchen usable (in a degraded, view-only sense) during a brief outage.

### 5.7 Future SSO and enterprise identity — already structurally supported, not a new design surface

Because `restaurant_staff.user_id` anchors to `auth.users`, and Supabase Auth natively supports SAML/OIDC SSO providers as additional sign-in methods for the *same* underlying user identity, enabling SSO for an enterprise customer requires **zero changes to this document's schema** — only enabling the relevant Supabase Auth provider and, when a real enterprise customer needs it, a thin per-owner SSO-configuration surface (not designed here, since no such customer or requirement exists yet — flagged as a future, not a gap). Similarly, a future SCIM-based auto-provisioning integration would simply be another authorized writer into `restaurant_staff`/`staff_role_assignments` via the `StaffService` API (§11), not a schema redesign — the capability-based model was chosen specifically because it's the shape any such integration would need to write into anyway.

---

## 6. Database Recommendations

Every table justified individually; two candidates from the task's own list are deliberately not built, with reasoning, matching the discipline the Identity Spine document already established for its own candidate-table list.

### 6.1 `restaurant_staff`
**Purpose**: the employment record — one row per (restaurant, person). **Kept from the Order Operations Engine's sketch**, with `role text CHECK(...)` removed (replaced by §6.3's join) and `pin_code_hash` relocated to §6.6.
**Columns**: `id, restaurant_id, user_id (nullable), display_name, active boolean, employment_status text CHECK(active|suspended|terminated), hired_at, terminated_at, expires_at (nullable, for temporary/seasonal staff), created_at, updated_at`.
**Key columns/FKs**: `restaurant_id → restaurants(id)`, `user_id → auth.users(id)` (nullable).
**Indexes**: `(restaurant_id, active)`, `(user_id)`.
**RLS**: owner/manager-scoped read via `restaurant_id IN (SELECT restaurant_id FROM restaurant_staff WHERE user_id = auth.uid() AND active)` — the exact additive pattern the OOE doc already specified, extended to every other new table below. Writes gated by `manage_staff` capability, enforced in the API layer (`StaffService`), not solely by RLS.
**Phase**: 0/1.

### 6.2 `staff_roles`
**Purpose**: owner-scoped, reusable role templates (§4.3).
**Columns**: `id, owner_id, name, description, is_system_role boolean, created_at, updated_at`.
**Indexes**: `unique(owner_id, name)` (mirrors the Menu Library's own name-uniqueness precedent).
**RLS**: owner-scoped, same pattern as `menus`.
**Phase**: 1.

### 6.3 `staff_role_capabilities`
**Purpose**: the join that makes a role "a collection of capabilities" (§4.1).
**Columns**: `staff_role_id, capability_key, granted_at`.
**Key columns/FKs**: `staff_role_id → staff_roles(id)`, `capability_key → capability_definitions(capability_key)`.
**Indexes**: `unique(staff_role_id, capability_key)`.
**RLS**: owner-scoped, following `staff_roles`.
**Phase**: 1.

### 6.4 `capability_definitions`
**Purpose**: the static, platform-wide capability catalog (§4.2) — reuses the POS audit's `provider_capabilities` design pattern exactly.
**Columns**: `capability_key text PRIMARY KEY, category text, description text, is_system_capability boolean`.
**RLS**: public read (no tenant data), service-role/platform-admin write only.
**Phase**: 1.

### 6.5 `staff_role_assignments`
**Purpose**: many-to-many between `restaurant_staff` and `staff_roles` — a staff member may hold more than one role (e.g., "Server" and "Bartender").
**Columns**: `id, restaurant_staff_id, staff_role_id, assigned_at, assigned_by (restaurant_staff_id)`.
**Indexes**: `unique(restaurant_staff_id, staff_role_id)`.
**RLS**: same pattern.
**Phase**: 1.

### 6.6 `staff_pin_credentials`
**Purpose**: isolates the actual PIN hash from `restaurant_staff` into a zero-client-access table — directly reusing the POS audit's secret-isolation pattern for `pos_connections`' OAuth tokens, not a new security convention.
**Columns**: `restaurant_staff_id PRIMARY KEY, pin_hash text, pin_salt text, failed_attempts int default 0, locked_until timestamptz, last_changed_at, last_used_at`.
**RLS**: service-role only, zero client SELECT under any role, matching `pos_connections`.
**Phase**: 3.

### 6.7 `trusted_devices`
**Purpose**: device-level trust for shared terminals and remembered personal devices (§5.2 Layer 1).
**Columns**: `id, restaurant_id, device_fingerprint, device_label, device_type CHECK(shared_terminal|personal), device_token_hash, trusted_by (restaurant_staff_id), trusted_at, last_seen_at, revoked_at, revoked_by`.
**Indexes**: `(restaurant_id, revoked_at)`.
**RLS**: owner/manager-scoped read/write (`manage_staff` capability), no broader access.
**Phase**: 3.

### 6.8 `staff_sessions`
**Purpose**: the unified attribution/active-session record across every auth method (§5.2 Layer 2) — a single place to answer "who is currently active at this restaurant, and how did they authenticate" regardless of PIN vs. full login, which also becomes the actor-resolution source for `order_events.actor_id` (per the OOE doc's `actor_type = 'staff'` design).
**Columns**: `id, restaurant_staff_id, device_id (trusted_devices, nullable — null for a personal full-login session), auth_method CHECK(password|magic_link|pin|sso), started_at, last_activity_at, ended_at, ended_reason CHECK(logout|timeout|forced|expired)`.
**Indexes**: `(restaurant_staff_id, ended_at)`, `(device_id, ended_at)`.
**RLS**: service-role write; owner/manager-scoped read (for a live "who's clocked in" view).
**Phase**: 3.

### 6.9 `staff_invites`
**Purpose**: the invitation lifecycle (§8.1).
**Columns**: `id, restaurant_id, email, invited_role_ids uuid[] (or a join table if multi-role invites need per-role audit — array is sufficient for Phase 1), invited_by (restaurant_staff_id), invite_token, status CHECK(pending|accepted|expired|revoked), expires_at, accepted_at, created_at`.
**Indexes**: `unique(invite_token)`, `(restaurant_id, status)`.
**RLS**: owner/manager-scoped (`manage_staff`), public read of a *single* invite by token (for the accept flow) via a service-role-backed route, never a broad anon SELECT policy (learning directly applied from the Phase 0 remediation plan's `orders_public_track` finding — never repeat that mistake here).
**Phase**: 1.

### 6.10 `staff_audit_log`
**Purpose**: staff-lifecycle-specific audit trail — invited, activated, suspended, terminated, role changed, PIN reset, capability granted/revoked. **Deliberately scoped to staff-management events only** — order-action attribution already has its own append-only home (`order_events`, OOE doc §8) and this table must not duplicate it.
**Columns**: `id, restaurant_id, actor_restaurant_staff_id, target_restaurant_staff_id, action text, detail jsonb, created_at`.
**Indexes**: `(restaurant_id, created_at)`, `(target_restaurant_staff_id, created_at)`.
**RLS**: owner/manager-scoped read (`manage_staff` or `view_reports`), service-role write.
**Phase**: 1.

### 6.11 Explicitly rejected: `staff_activity`
The task's candidate list includes this alongside `staff_sessions`. Building both would duplicate the same concept — "is this person currently active, and when did they last do something" is already fully answered by `staff_sessions.last_activity_at`. A separate `staff_activity` table would either shadow that column (drift risk, the exact class of bug this platform has already been burned by more than once this session) or require constant dual-writes for no additional information. **Not recommended.**

### 6.12 Not built as a separate table: `staff_capabilities`
The task's candidate list names this directly. It splits cleanly into two tables already specified above — `capability_definitions` (the static catalog) and `staff_role_capabilities` (the grant join) — for the identical reason the POS audit split "capability" into a static registry plus a connection-level override table. This isn't a rejection of the concept, only a refinement of its shape, stated explicitly per the task's "justify every recommendation" instruction.

---

## 7. RLS Extension Pattern (applies to every existing restaurant-scoped table)

Every current policy of the form `EXISTS (SELECT 1 FROM restaurants r WHERE r.id = <table>.restaurant_id AND r.owner_id = auth.uid())` gains an **additive OR-clause**, never a replacement:

```sql
EXISTS (SELECT 1 FROM restaurants r WHERE r.id = <table>.restaurant_id AND r.owner_id = auth.uid())
OR
EXISTS (
  SELECT 1 FROM restaurant_staff rs
  JOIN staff_role_assignments sra ON sra.restaurant_staff_id = rs.id
  JOIN staff_role_capabilities src ON src.staff_role_id = sra.staff_role_id
  WHERE rs.restaurant_id = <table>.restaurant_id
    AND rs.user_id = auth.uid()
    AND rs.active
    AND src.capability_key = '<relevant_capability>'
)
```
No existing owner-only policy is removed or narrowed by this design — owners retain exactly the access they have today, unconditionally, as the permanent capability floor (§9.5). This is purely additive, consistent with the "no existing query/RLS breaks" discipline already proven across this platform's prior additive migrations (Menu Library, Guest Identity, Session Intelligence).

---

## 8. Staff Lifecycle

### 8.1 Invitation and acceptance
An owner/manager (`manage_staff`) creates a `staff_invites` row (email + proposed role(s)). The invite email links to an accept flow that either creates a new `auth.users` row (email/password or magic-link signup) or links an existing one (a person already has a SpinBite account, e.g. as a customer or staff at another restaurant) — on acceptance, a `restaurant_staff` row is created/activated and the invite is marked `accepted`. Expired/unused invites (`expires_at`) simply lapse; no cleanup job is required beyond excluding expired rows from active-invite queries.

### 8.2 Activation, suspension, termination, rehire
`restaurant_staff.employment_status` moves `active → suspended → active` (temporary, e.g. a leave of absence — access paused, PIN/login blocked, but the row and its historical attribution remain intact) or `active → terminated` (permanent — access revoked, forced logout fires per §5.5, but the row is **never deleted**, since historical `order_events`/`staff_audit_log` attribution must remain valid, mirroring the platform's own constitutional rule that historical attribution is never rewritten). **Rehire** is simply `terminated → active` again on the *same* row (preserving history) rather than creating a new one, unless the rehire is genuinely a new employment relationship (owner's judgment call, exposed as an explicit choice in the UI, not inferred).

### 8.3 PIN reset / password reset
Password reset: unchanged, native Supabase Auth flow. PIN reset: a `manage_staff`-gated action (a manager resets a cook's forgotten PIN) or self-service if the staff member has a full login to authenticate the reset request through — either path writes a new hash to `staff_pin_credentials` and logs a `staff_audit_log` entry, and should invalidate any currently-active `staff_sessions` tied to the old PIN as a precaution.

### 8.4 Role changes
A `staff_role_assignments` insert/delete, gated by `manage_staff`, logged to `staff_audit_log`. Per §9.3, an actor may never grant a capability they don't themselves hold.

### 8.5 Ownership transfer
**Deliberately rare, explicit, and heavier-weight than an ordinary role change** — this directly implements the Business Invariants document's R-1 ("restaurant identity never changes implicitly"). Transferring ownership means: `restaurants.owner_id` itself changes (an explicit, audited operation, not a side effect of assigning an "Owner" role to someone else), the outgoing owner's `restaurant_staff` row is *not* automatically demoted or removed (the previous owner may continue as staff, or be terminated separately, as a distinct decision), and the operation requires either the current owner's own explicit confirmation or a super-admin-mediated path (for the abandoned-account/dispute case) — never a manager-initiated action, regardless of how many capabilities that manager holds.

### 8.6 Restaurant deletion
Per the Phase 0 remediation plan's soft-delete fix: when a restaurant is soft-deleted, every `restaurant_staff` row for it should be deactivated (`employment_status` effectively frozen, access revoked) but **not deleted** — consistent with R-5 ("soft-delete cascades visibility, never data"). No new mechanism needed beyond applying the same `deleted_at`-cascade-of-visibility discipline the remediation plan already established for the parent restaurant.

### 8.7 Multiple restaurants, franchise staff
Already covered structurally (§3) — one `restaurant_staff` row per restaurant per person, `staff_roles` reusable across an owner's restaurants. **Known limitation, not solved here, correctly deferred**: true franchise/enterprise cross-location staff transfer and unified reporting depends on the Organization/Brand entity the Canonical Domain Model already flagged as missing — this document does not attempt to build that entity, only ensures nothing here blocks it from being added later (a future `organization_id` on `staff_roles`/`restaurant_staff` would be an additive column, not a redesign).

### 8.8 Temporary staff
`restaurant_staff.expires_at` (nullable) — an optional auto-deactivation date for seasonal/temporary employment, checked the same way `deleted_at IS NULL` filters are already checked elsewhere in the codebase. No new mechanism.

---

## 9. Security Model

### 9.1 PIN hashing
Standard salted hash (bcrypt/argon2-class, never reversible, never plaintext at rest or in logs) in `staff_pin_credentials` only. PIN comparison happens exclusively server-side, in `PINService` (§11) — never shipped to a client for local comparison (§5.6 already rules this out for the offline case specifically; this is the general rule).

### 9.2 Device trust
Established only through an authenticated, capability-gated ("set up this terminal," effectively `manage_staff`-adjacent) flow — never self-registered by an anonymous device hitting an API. Revocation is immediate and independent of any individual staff member's own access (§5.2).

### 9.3 Least privilege and privilege escalation prevention
Two enforced rules, both at the `StaffService`/`RoleService` layer (not solely RLS, since "can this capability be granted" is a property of the *actor's own* capabilities, which RLS can express but which is clearer and more maintainable as an explicit service-layer check):
- A new `staff_roles` row starts with zero capabilities — nothing is implicitly granted.
- An actor may never grant (via role assignment or direct capability grant) a capability they do not themselves currently hold — the standard "can't escalate beyond your own ceiling" rule, preventing a Supervisor from quietly creating a "Supervisor+" role with capabilities no Supervisor should have.

### 9.4 Owner protections
The `restaurant_staff` row corresponding to `restaurants.owner_id` is **structurally protected**: no other staff member, regardless of capabilities held (including a full "General Manager: all capabilities" role), may modify or deactivate the owner's own `restaurant_staff` row, revoke the owner's role assignments, or force-logout the owner. Only the owner themselves, or a super-admin via the emergency-access path (§9.7), may do so. This prevents the specific failure mode of a highly-privileged manager (maliciously or accidentally) locking the actual owner out of their own restaurant.

### 9.5 Manager restrictions
Follow directly from §9.3/9.4 — a manager's capability ceiling is whatever was explicitly granted to their role, never inferred as "manager therefore can do anything short of billing," and never extends to modifying the owner's own access.

### 9.6 Cross-tenant isolation
Every new table is `restaurant_id`-scoped with the additive RLS pattern in §7 — no staff table, capability check, or session record ever resolves across restaurants except where a person legitimately holds multiple independent `restaurant_staff` rows (which are never linked to each other beyond sharing the same `user_id`).

### 9.7 Shared terminal security, failed-PIN lockout, brute-force protection
Non-negotiable given PIN's lower entropy (§5.3): apply the same `lib/http/rate-limit.ts` utility the Phase 0 remediation plan already recommended for coupon routes (reused, not reinvented) to the PIN-verify endpoint. Recommended policy: lock after 5 consecutive failed attempts (`staff_pin_credentials.failed_attempts`/`locked_until`), with lockout duration escalating on repeated lockouts. A PIN attempt from a device that isn't in `trusted_devices` for that restaurant should be rejected outright, not merely rate-limited harder — device trust is a precondition for PIN entry, not just a convenience.

### 9.8 Emergency access
If a restaurant's only owner/manager is locked out (lost credentials, wrongful termination, disputed access), the recovery path is **super-admin-mediated**, reusing the existing `is_super_admin()` mechanism rather than building a parallel one — a super-admin can force-reset an owner's login or reinstate a wrongly-terminated staff row, and every such action writes a `staff_audit_log` entry flagged distinctly (`actor_type = 'super_admin'`) so emergency interventions are never indistinguishable from ordinary manager actions in the audit trail.

---

## 10. Order, Coupon, and AI-Intervention Ownership

Directly extends the Order Operations Engine's existing `order_events.actor_id`/`actor_type` design (kept, not redesigned) by supplying its FK target and naming the specific columns that were previously left abstract:

| Question | Mechanism |
|---|---|
| Who accepted the order | `orders.accepted_by → restaurant_staff(id)` (OOE §12, FK target now formalized) |
| Who prepared/bumped each item | `order_events` rows with `actor_type='staff', actor_id=restaurant_staff.id`, per item, per station (OOE §4/§8) |
| Who completed/served the order | `orders.served_by → restaurant_staff(id)` (OOE §12, formalized) |
| Who cancelled the order | `orders.cancelled_by → restaurant_staff(id)` (OOE §12, formalized) |
| Who refunded the order | **New, this document**: belongs on whichever future refund-event record closes the Business Invariants document's PAY-1 gap (refunds as distinct events, not a status flip) — that record should carry a `refunded_by → restaurant_staff(id)` column when it's built; not retrofitted onto `payments.status` as a mutation, consistent with PAY-1's own reasoning |
| Who redeemed a coupon | **New, this document**: `coupon_redemptions.redeemed_by_staff_id → restaurant_staff(id)`, nullable (null for self-service customer checkout redemption, populated when staff manually redeem via the fixed `/admin/validate` flow from the Phase 0 remediation plan) |
| Who acknowledged an AI intervention | **New, this document**: `live_interventions.acknowledged_by → restaurant_staff(id)`, nullable, additive column — `live_interventions.acknowledged_at` already exists with no actor; this closes that gap, directly enabling the "measure intervention success per staff member" AI use case (§12) |
| Who interacted with a customer (table ownership) | **Optional, later phase**: `session_guests.assigned_server_staff_id`, nullable — a host/manager-assignable "this table belongs to this server" marker, useful for routing AI upsell/intervention suggestions (§12) but not required for core attribution; scoped to Phase 8 (enterprise), not core |
| How historical attribution works | Never rewritten (§8.2) — a terminated staff member's historical `order_events`/`orders.accepted_by`/etc. rows remain exactly as they were; only their *current* access is revoked, mirroring the Business Invariants document's general historical-immutability discipline |

---

## 11. API Service Boundaries

Provider-neutral, capability-check-centralizing — no service other than `PermissionService` should ever contain a role-name string comparison:

- **`StaffService`**: CRUD over `restaurant_staff`, invitation lifecycle (`staff_invites`), suspension/termination/rehire. The only writer to `restaurant_staff.employment_status`.
- **`RoleService`**: CRUD over `staff_roles`/`staff_role_capabilities`/`staff_role_assignments`. Enforces §9.3's "can't grant what you don't have" rule.
- **`PermissionService`**: the single, universal authorization gate. Every other route/service calls `PermissionService.can(actorId, restaurantId, capability)` — never an inline role check. This is the concrete mechanism that satisfies "owners are not hardcoded throughout the application": even the owner's own permanent access (§9.4) is expressed as this service always returning `true` for the owner's `restaurant_staff` row, not as a separate code path elsewhere.
- **`AuthenticationService`**: full-login session handling (thin wrapper over Supabase Auth), magic-link issuance, SSO provider routing (future).
- **`PINService`**: PIN verification, hashing, lockout/rate-limit enforcement — kept separate from `AuthenticationService` specifically to keep the secret-bearing surface (`staff_pin_credentials`) behind one narrow, auditable boundary, mirroring why `staff_pin_credentials` is its own table (§6.6).
- **`DeviceTrustService`**: `trusted_devices` lifecycle — registration, revocation, token issuance/verification.
- **`AuditService`**: the only writer to `staff_audit_log`. Every other service calls into it rather than writing audit rows inline, keeping the audit format consistent regardless of which service triggered the event.

No service in this list references a POS provider's employee-ID shape, a specific auth method's internal token format, or a hardcoded role name — every cross-service call passes a `restaurant_staff_id`/`capability_key`, never a provider-specific or role-string value.

---

## 12. Kitchen Display Compatibility

This document does **not** redesign the Kitchen Display System — the Order Operations Engine's §5 (ticket layout, station/expo/large-screen modes, realtime channel design) stands as specified. This section only supplies the staff/auth pieces that document's §6 left as a minimal sketch:

- **Kitchen PIN login**: exactly §5.2-5.3's shared-terminal model — a kitchen tablet is a `trusted_devices` row; individual cooks PIN in/out via `staff_sessions`, attributing each `order_events` row to themselves.
- **Station filtering**: the OOE doc's `kitchen_stations`/`menu_item_station_routing` tables are unaffected by this design; station *access* (which staff member may act on which station's tickets) is a capability check (`kitchen_bump` scoped by an optional future `staff_role_capabilities`-level station restriction — not required for Phase 0-8 of this document, flagged as a natural Phase 8 refinement if a restaurant wants to restrict, e.g., a grill cook from bumping fryer tickets).
- **Shared displays / multiple cooks**: directly served by the two-layer model — the large kitchen screen (OOE §5.2's TV-tuned mode) is pure *device* trust with no individual attribution needed at all (it's read-only), while the interactive station-view tablets need both layers.
- **Order assignment**: covered by `order_events.actor_id` per-item, already specified in the OOE doc, now with a real actor to populate it.

---

## 13. POS Employee Compatibility

Directly reuses the POS Integration Audit's `pos_external_mappings` generic entity-mapping table — **no new `staff_pos_mappings` table**, for the identical reason the Customer Identity Spine document already rejected a bespoke `customer_pos_mappings` table: a second mapping table for the same purpose would violate the platform's own constitutional rule (Business Invariants POS-1, Canonical Domain Model constitutional rule 8) that new integrations extend the existing mapping pattern rather than inventing a parallel one.

**Mechanism**: extend `pos_external_mappings.entity_type` to include `'staff'`, with `spinbite_id = restaurant_staff.id`, `external_id = <Clover/Square/Toast/Lightspeed employee ID>`. Import matching follows the same staged-review discipline already designed for POS customer/menu import (POS audit §6.1, Identity Spine §9): an imported POS employee is matched against existing `restaurant_staff` where reasonably confident (e.g., email match), and routed to manager review otherwise — never auto-created with an inferred role.

**Role/capability mapping across providers**: Clover's typically flat Owner/Manager/Employee tiers, Square's and Toast's somewhat richer but still fixed role sets, and Lightspeed's own shape all get mapped to the *closest* SpinBite `staff_roles` template at import time, with the mapping surfaced for manager confirmation rather than blindly granted — a POS "Manager" import should not silently receive SpinBite's full General Manager capability set without review, since the two systems' notions of "manager" don't necessarily carry the same trust level.

**Never leak provider IDs into business logic** (restated as binding, per Business Invariants POS-1): no capability check, RLS policy, or `PermissionService` call ever references a Clover/Square/Toast/Lightspeed employee ID directly — only `pos_external_mappings` does, and only the POS Integration Layer's own sync code ever reads it.

---

## 14. AI Compatibility

This document does not build a new AI subsystem — it supplies the staff-attribution primitives the existing and already-designed AI layers (Decision Runtime, per the Session Architecture; the Order Operations Engine's §14 AI hooks) need to target and measure individual staff members, closing the gap both documents left open ("notify the restaurant" with no way to say *which* staff member).

| AI use case | What this document enables |
|---|---|
| "Recommend upsell to Server 3" | Requires `session_guests.assigned_server_staff_id` (§10, optional/later) to know which server owns the table, and a notification path scoped to that specific `restaurant_staff.user_id`/active `staff_sessions` device |
| "Notify kitchen of bottleneck" | Requires no staff-specific targeting — a station-scoped broadcast to any device with `kitchen_view` capability currently active on that station, per the OOE doc's realtime channel design |
| "Suggest manager intervention" | Targets any `restaurant_staff` with `manage_staff`/`manage_orders`-tier capability currently active (via `staff_sessions`), not a hardcoded "the owner" |
| "Alert bartender" | Same pattern as kitchen bottleneck, scoped to a bar station via `kitchen_stations` |
| "Suggest table visit" | Same as upsell targeting — needs table-to-server assignment |
| "Measure staff response" | `live_interventions.acknowledged_by` (§10, new) joined against `acknowledged_at − created_at` — directly parallels the OOE doc's `order_events`-derived KPI pattern (§11 of that document), extended to staff-level granularity |
| "Measure intervention success" | Same join, extended with `intervention_events.converted`/`conversion_value`, grouped by `acknowledged_by` |
| "Staff performance insights" | A derived, read-only rollup over `order_events.actor_id` (prep times, bump counts) and `live_interventions.acknowledged_by` (response rate) — **no new write path**, consistent with the Business Invariants document's AI-1 rule (AI proposes, never writes directly to canonical entities) and the OOE doc's "KPIs are derived, not a new table" principle |
| "Training recommendations" | Out of scope for this document — would consume the same derived performance data above, but designing the recommendation logic itself belongs to a future AI-layer document, not the staff/auth subsystem |

**Consent/visibility boundary, restated as binding here**: staff performance data is restaurant-scoped and visible only to holders of `view_reports`/`manage_staff` at that specific restaurant — never aggregated across restaurants (mirrors the Identity Spine's C-5 rule for customer data, applied to staff data for the same reason: cross-tenant leakage of any personal performance data is a privacy and competitive-harm risk regardless of whether the subject is a customer or an employee).

---

## 15. Implementation Roadmap

Each phase ships something independently useful; no phase depends on a later one.

### Phase 0 — Foundational schema
**Goals**: lay down the identity/role/capability tables with zero behavior change.
**Database**: `restaurant_staff`, `staff_roles`, `capability_definitions` (seeded), `staff_role_capabilities`, `staff_role_assignments` — all nullable/additive, RLS per §7 added alongside (not replacing) existing owner-only policies.
**Backend**: none functional yet — no route reads these tables for authorization decisions.
**Frontend**: none.
**Security**: RLS correctness verified (owner access unchanged, no new access granted yet since no `restaurant_staff` rows exist beyond a seeded "owner" row per restaurant).
**Tests**: full regression on every existing admin flow — zero behavior change expected.
**Acceptance criteria**: schema live, seeded capability catalog present, every existing owner-only flow works identically to before.
**Migration strategy**: additive only; backfill one `restaurant_staff` row per existing restaurant (`role='owner'` equivalent — actually assign the seeded "Owner" `staff_roles` template) so `restaurant_staff` becomes the uniform lookup path going forward even though `restaurants.owner_id` remains authoritative and unchanged.
**Rollback**: drop the new tables; zero impact, since nothing depends on them yet.

### Phase 1 — Invitation system
**Goals**: owners can invite a manager/staff member with a full login.
**Database**: `staff_invites`, `staff_audit_log`.
**Backend**: `StaffService` (invite/accept), `AuditService`.
**Frontend**: an "Invite Staff" flow in the restaurant admin workspace; an accept-invite page.
**Security**: invite tokens single-use, expiring; no anon bulk-read policy on `staff_invites` (apply the Phase 0 remediation plan's lesson directly).
**Tests**: invite → accept → `restaurant_staff` row created with correct role; expired/revoked invites rejected.
**Acceptance criteria**: an owner can invite a second person by email who ends up with a working, role-scoped login.
**Migration strategy**: none beyond the new tables.
**Rollback**: disable the invite UI; existing invited staff remain functional (their `restaurant_staff` rows are independent of the invite mechanism once accepted).

### Phase 2 — Capabilities (authorization goes live)
**Goals**: `PermissionService` becomes the real gate on at least one meaningful action set (recommend starting with order status transitions, the exact route the Order Operations Engine already identified as the blocking example).
**Database**: none new.
**Backend**: `PermissionService`; rewrite `app/api/admin/orders/[orderId]/status/route.ts`'s auth check from `owner_id === auth.uid()` to `PermissionService.can(..., 'manage_orders')`.
**Frontend**: role-aware UI (hide/disable actions a logged-in staff member lacks capability for).
**Security**: verify §9.3's escalation-prevention rule with an explicit adversarial test (a Supervisor attempting to self-grant `manage_settings` must fail).
**Tests**: every capability in the seed catalog has at least one route enforcing it correctly; a staff member with no `manage_orders` capability cannot transition an order.
**Acceptance criteria**: a non-owner manager can legitimately change an order's status; an unprivileged staff member cannot.
**Migration strategy**: none.
**Rollback**: revert the one route to its previous owner-only check; capability infrastructure remains inert but harmless.

### Phase 3 — PIN authentication
**Goals**: shared-terminal identity becomes real.
**Database**: `staff_pin_credentials`, `trusted_devices`, `staff_sessions`.
**Backend**: `PINService`, `DeviceTrustService`; rate-limiting (§9.7) applied from day one, not added later.
**Frontend**: PIN-entry UI, "set up this terminal" manager flow.
**Security**: brute-force protection tested explicitly (5-attempt lockout verified); PIN attempts from untrusted devices rejected.
**Tests**: full PIN lifecycle (set, verify, lockout, reset); device trust registration/revocation.
**Acceptance criteria**: a kitchen tablet can be trusted once by a manager, and a cook can subsequently PIN in/out on it without a personal login.
**Migration strategy**: none.
**Rollback**: disable PIN entry UI; full-login staff unaffected.

### Phase 4 — Shared kitchen devices
**Goals**: the KDS station/expo views (per the Order Operations Engine's §5/§10) go live, gated by the now-real staff/device model.
**Database**: none new — consumes the Order Operations Engine's own `kitchen_stations`/`order_items.status`/`order_events` tables, which should ship per that document's own roadmap in parallel or slightly ahead of this phase.
**Backend**: capability checks (`kitchen_view`, `kitchen_bump`, `expo_view`, `expo_bump_all`) wired into the OOE doc's already-specified staff-facing endpoints.
**Frontend**: the OOE doc's station-view/expo-view screens, now authenticated via trusted device + PIN attribution.
**Security**: verify a device trusted for Station A cannot bump Station B's tickets if station-scoping is enabled (optional at this phase per §12).
**Tests**: end-to-end — order placed, kitchen tablet (PIN'd in as a specific cook) bumps items, `order_events` correctly attributes each action.
**Acceptance criteria**: a real kitchen workflow (accept → item-level bump → ready) works with correct per-action staff attribution.
**Migration strategy**: none.
**Rollback**: KDS screens can be disabled independently of the underlying staff/auth infrastructure.

### Phase 5 — Order attribution (completion)
**Goals**: close every remaining attribution gap named in §10 — refunds, coupon redemption, AI acknowledgment.
**Database**: `coupon_redemptions.redeemed_by_staff_id`, `live_interventions.acknowledged_by` (additive columns); the refund-event mechanism per the Business Invariants document's PAY-1 fix (if not already shipped independently).
**Backend**: wire these columns into the already-existing redemption (`/admin/validate`, per the Phase 0 remediation plan's own fix) and AI-acknowledgment endpoints.
**Frontend**: display "redeemed by [staff name]" / "acknowledged by [staff name]" in relevant admin views.
**Security**: none new.
**Tests**: a staff-redeemed coupon and a staff-acknowledged AI intervention both correctly attribute.
**Acceptance criteria**: every attribution question in §10's table has a populated answer for new activity going forward.
**Migration strategy**: additive columns only; no backfill possible for historical rows predating staff (same "permanently unrecoverable historical gap" pattern the Phase 0 remediation plan already accepted for the guest_id case — apply the same honest framing here, don't attempt a speculative backfill).
**Rollback**: drop the new columns; no dependent logic breaks since they're purely additive display/reporting fields.

### Phase 6 — AI integration
**Goals**: the AI-to-staff targeting use cases in §14 go live, sequenced after operational primitives (Phases 0-5) are stable, per the platform's own locked "no AI automation before stable primitives" principle.
**Database**: `session_guests.assigned_server_staff_id` (optional, if table-assignment-based targeting is prioritized).
**Backend**: extend Decision Runtime's dispatcher to resolve a target `restaurant_staff`/active `staff_sessions` device rather than only a generic restaurant-wide notification.
**Frontend**: staff-facing intervention feed (extends the existing `live_interventions` admin pattern to individual staff views, not just the owner dashboard).
**Security**: consent/visibility boundary from §14 enforced and tested (cross-restaurant staff performance data never leaks).
**Tests**: an AI-generated recommendation correctly targets a specific staff member's active session and is measurably acknowledged.
**Acceptance criteria**: at least one of §14's use cases (recommend targeting one specific active staff member, not a generic broadcast) works end-to-end.
**Migration strategy**: none.
**Rollback**: AI targeting can fall back to restaurant-wide notification (today's behavior) if staff-level targeting is disabled.

### Phase 7 — POS employee mapping
**Goals**: §13's design goes live, sequenced after POS Integration Layer Phases 1-3 (kernel, connector, catalog import) per that document's own roadmap — never before.
**Database**: `pos_external_mappings.entity_type` extended to include `'staff'` (a data/enum addition, not a new table).
**Backend**: staff-matching logic within the POS Integration Layer's `CustomerProvider`-adjacent employee-sync path (per §13's staged-review discipline).
**Frontend**: the staged-review UI for ambiguous employee matches, mirroring the POS audit's menu/customer import review screens.
**Security**: verify a POS-imported "Manager" does not silently receive full SpinBite General Manager capabilities without explicit confirmation.
**Tests**: a POS employee with a matching email links to the correct existing `restaurant_staff` row; an ambiguous match routes to review, not silent creation.
**Acceptance criteria**: connecting a POS with existing employee records does not create duplicate or over-privileged SpinBite staff.
**Migration strategy**: none beyond the enum extension.
**Rollback**: disable the employee-sync path independently of the rest of POS integration.

### Phase 8 — Enterprise enhancements
**Goals**: the deliberately-deferred refinements named throughout this document — per-staff capability overrides beyond role assignment, station-level capability scoping (§12), table-assignment-based AI targeting if not already built in Phase 6, and the groundwork for a future Organization/Brand entity (§8.7) once the Canonical Domain Model's own gap is addressed.
**Database**: `staff_capability_overrides` (new, only if real demand emerges — a per-`restaurant_staff` grant/revoke on top of role-derived capabilities), evaluated against real usage rather than built speculatively.
**Backend/Frontend/Security/Tests/Acceptance/Migration/Rollback**: deferred to be scoped against actual enterprise-customer requirements at the time, rather than designed in the abstract now — consistent with this document's own discipline (§6.11, §6.12) of not building tables ahead of demonstrated need.

---

## 16. Open Questions

1. Should `staff_roles` be owner-scoped (as designed, mirroring Menu Library) or restaurant-scoped? Owner-scoped was chosen for multi-location reuse, but a franchise with genuinely independent per-location role structures (different labor agreements, different title conventions) might want restaurant-level overrides of an owner-level template — not designed here, flagged for Phase 8 if real demand emerges.
2. What is the right default `staff_sessions` idle-timeout duration, and should it be restaurant-configurable from day one (Phase 3) or a fixed platform default until a real request for configurability arrives?
3. Should PIN length/complexity be configurable per restaurant, or a fixed platform-wide policy? Leaning toward a fixed sensible default (4-6 digits) for Phase 3, configurable later only if requested.
4. Does the emergency-access path (§9.8) need a stricter secondary verification (e.g., government ID upload) before a super-admin can reassign ownership, given the fraud potential of a false "I'm locked out" claim? Not designed here — a business/legal/support-process question, not purely technical.
5. Should `order_events.actor_id` (OOE doc) gain a formal FK constraint to `restaurant_staff(id)` now that this document supplies that target, or remain a loose `uuid` for flexibility (e.g., future non-staff actor types)? Recommend a real FK, consistent with this platform's general preference for enforced referential integrity over convention-only linking.

---

## 17. Constitutional Rules

Extends, and must remain consistent with, the ten rules in `spinbite-business-invariants-v1.md` §14 and the corresponding rules in the Customer Identity Spine and Canonical Domain Model documents.

1. **Staff is never merged with Customer/Guest.** A `restaurant_staff` row and a `customer_profiles`/`session_guests` row remain permanently distinct entities with no FK between them, even for a person who is both.
2. **Roles are data, not code.** No route, RLS policy, or service may hardcode a role name (`'manager'`, `'kitchen'`, etc.) in a conditional — every authorization decision resolves through `PermissionService` against `capability_definitions`.
3. **Device trust and staff attribution are independently revocable.** No design may collapse them into one "terminal login" concept — doing so is the specific mistake this document exists to prevent.
4. **PIN credentials are never client-readable, ever, under any role**, mirroring the same rule already binding for POS OAuth tokens.
5. **No actor may grant a capability they do not themselves hold.** No exceptions, including for Owners granting to other Owners-in-training — the check is on the *capability*, not the role name.
6. **The restaurant owner's own access is structurally protected** from modification by any other staff member, regardless of capabilities held.
7. **Historical staff attribution is never rewritten.** A terminated employee's past `order_events`/`orders.accepted_by`/etc. rows remain exactly as they were; only current access is revoked.
8. **Ownership transfer is always explicit and audited**, never an incidental side effect of a role assignment.
9. **No provider (POS) employee ID ever leaks into a capability check, RLS policy, or `PermissionService` call** — only `pos_external_mappings` references it.
10. **Staff performance and identity data is restaurant-scoped in visibility**, never aggregated or exposed across restaurants, mirroring the identical rule already binding for customer data.
