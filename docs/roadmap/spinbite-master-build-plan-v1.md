# SpinBite Master Dependency Graph & Technical Build Plan v1

**Status:** Systems-planning exercise. No code, no migrations. Prior architecture is treated as binding and is not redesigned here — this document sequences it.
**Date:** 2026-07-08
**Inputs (all binding, none re-derived from scratch):** `spinbite-business-invariants-v1.md`, `spinbite-phase-0-critical-remediation-plan-v1.md`, `spinbite-canonical-commerce-domain-model-v1.md`, `spinbite-customer-identity-spine-v1.md`, `spinbite-pos-integration-layer-audit-v1.md`, `spinbite-restaurant-staff-authentication-v1.md`, `spinbite-order-operations-engine-v1.md`.
**Verification this session**: confirmed live via `package.json` and filesystem inspection — `vitest` is configured but exactly **one** test file exists platform-wide (`lib/session-play-state.test.ts`), and **no CI pipeline exists** (`.github/workflows/` is absent). This is a new finding, not previously surfaced in any prior document, and it materially changes the parallelization and release-1 recommendations below: a five-person team cannot safely work in parallel against a codebase with no automated regression net.

---

## 0. Executive Summary

Every prior document in this series independently arrived at the same structural conclusion from a different angle: **Restaurant Staff is the load-bearing prerequisite the rest of the platform is currently missing**, not a parallel workstream. The Order Operations Engine document states it outright ("this is the prerequisite, not a parallel phase"). The Staff & Authentication document exists because of that statement. The POS audit needs Staff for employee mapping and order-export attribution. The Business Invariants document's SEC-4 rule (every mutation is attributable) is unsatisfiable without it. This convergence, arrived at independently across six documents rather than asserted once, is the single strongest signal in this entire planning exercise.

**One correction to the task's own framing is necessary and is stated plainly, per this document's mandate to challenge implementation order where the dependency facts require it:** the requested critical path (`... → Kitchen → Staff → POS → ...`) places Kitchen before Staff. Every piece of prior architecture — written independently, at different times, by different framing — says the opposite. This document's critical path (§3) reorders it to `... → Staff → Kitchen → POS → ...` and justifies why with direct citation, not preference.

**The second load-bearing finding**: `order_events` (designed in the Order Operations Engine document) is a shared dependency for three separate initiatives — Kitchen ticket tracking, Staff action attribution, and POS order-export status tracking. Building it once, early, and correctly is higher leverage than any single feature it enables, because building it late means retrofitting attribution into whichever of the three shipped first.

**The third finding, new to this document**: the platform has effectively zero automated test coverage and no CI. This isn't a gap in prior architecture — it's a gap in engineering infrastructure that prior architecture didn't cover and this planning exercise is positioned to surface. It is folded into Release 1 below, not treated as a separate, deferrable concern, because every subsequent release's safety depends on it existing first.

**Recommended sequencing, four words**: *stabilize, identify, empower, operate* — fix what's broken (Phase 0), reconnect who the customer is (Identity Spine), give restaurants more than one authorized human (Staff), then build the operational layer (Kitchen) that only makes sense once both of those exist. POS and AI follow, because both depend on primitives — Order Events, Staff, settled payment data — that don't exist until the releases before them ship.

---

## 1. Complete Subsystem Inventory

**Maturity legend**: 🟢 Mature/live · 🟡 Partial/live-with-gaps · 🟠 Designed, 0% built · 🔴 Not designed, not built · ⚫ Explicitly out of scope for the 18-24 month window

| # | Subsystem | Maturity | Depends On | Consumers | Blocking Issues | Owner (bounded context) |
|---|---|---|---|---|---|---|
| 1 | Restaurant Management | 🟢 | — (root) | everything | Hard-delete bug (Phase 0 §Issue 1); no Location/Organization split | Restaurant Management |
| 2 | Authentication (core, owner/super-admin) | 🟢 | Supabase Auth (external) | everything behind `/admin` | None structural | Restaurant Management |
| 3 | Restaurant Staff | 🟠 designed, 0% built | Restaurant Mgmt, Authentication | Kitchen, POS employee mapping, AI targeting, order/coupon/AI attribution, Payments refund gating | None — ready to build | Staff & Identity |
| 4 | Permissions / Capability Engine | 🟠 designed, 0% built | Restaurant Staff schema | every future staff-gated route | Ships together with #3 | Staff & Identity |
| 5 | Menu Library | 🟢 | Restaurant Mgmt | Ordering, POS catalog sync, Promotions, AI menu-layout | None for current scope | Catalog |
| 6 | Modifier System | 🔴 conceptually designed, 0% built | Menu Library | Ordering, POS catalog import, Kitchen ticket display | Deliberately deferred — schema should be informed by real Clover data (POS audit §12 Phase 3), not built ahead of it |
| 7 | QR / Touchpoints | 🟢 | Restaurant Mgmt | Visit Sessions, Ordering, Kitchen (once `orders.touchpoint_id` lands) | `orders.touchpoint_id` missing (flagged independently by 3 prior docs) | Catalog / Restaurant Mgmt |
| 8 | Visit Sessions | 🟢 | Touchpoints | Behavior Events, Session Intelligence, Customer Identity linkage, Ordering attribution | None blocking | Session Intelligence |
| 9 | Customer Identity (Spine) | 🟡 | Visit Sessions/session_guests, Promotions (current sole bridge) | AI personalization, Campaign targeting, POS customer mapping, Coupon attribution | Structural disconnection (Identity Spine's core finding) — highest-leverage fix in the whole platform | Customer Identity |
| 10 | Session Intelligence / Decision Runtime | 🟡 (V1 live, narrow scope) | Visit Sessions, Behavior Events | AI Runtime, future staff-targeting | None blocking; scope is deliberately narrow (2 opportunity types, 1 action) | Session Intelligence |
| 11 | Behavior Events (`session_events`) | 🟢 | Visit Sessions | Session Intelligence, future Revenue Intelligence | None | Session Intelligence |
| 12 | Ordering | 🟢 | Menu Library, Visit Sessions (optional), Customer Identity (optional) | Kitchen, Payments, Coupons, future POS export | `order_events` not yet built; historical `guest_id` gap accepted as non-issue (Phase 0 §Issue 6) | Ordering |
| 13 | Kitchen Operations (KDS) | 🟠 designed, 0% built | Ordering, **Restaurant Staff (explicit prerequisite)**, Realtime publication fix | AI hooks, future Revenue Intelligence prep-time KPIs | Blocked on Staff; blocked on `orders` realtime publication gap | Ordering (operational extension) |
| 14 | Payments | 🟡 (real orchestration, mock provider only) | Ordering | Kitchen (payment status), POS payment integration, refund attribution | No real PSP; refund is a status-flip not a distinct event (Business Invariants PAY-1) | Payments |
| 15 | Coupons (redemption ledger) | 🟡 | Promotions | Ordering (discount), Customer Identity (once linked) | Zero ownership check (Phase 0 §Issue 2, Critical); zero RLS policies (Phase 0 §Issue 7) | Promotions & Engagement |
| 16 | Promotions / Rewards / Games | 🟢 | Menu Library, Restaurant Mgmt | Coupons, Customer Identity's current bridge | None blocking | Promotions & Engagement |
| 17 | Campaign Engine | 🔴 (table exists, dead/empty) | **Customer Identity linkage (must precede)**, Consent Ledger | Marketing, AI campaign recommendation | Must not build before Identity Spine Phases 1-4 (rewrite risk, §7) | Campaign & Communication |
| 18 | AI Runtime — Generative | 🟢 | Menu Library (image targets), Restaurant Mgmt (context) | Catalog (item images) | None | Generative Intelligence |
| 19 | AI Runtime — Decisioning | 🟡 (see #10) | — | — | — | Session Intelligence |
| 20 | Revenue Intelligence / Analytics | 🔴 (thin dashboard endpoints only) | Ordering, Payments (real settlement), Kitchen (`order_events`), POS (real sales data) | AI Revenue Optimization, restaurant owners | Needs real (not mock) payment data to be meaningful | Revenue Intelligence |
| 21 | POS Integration Kernel | 🟠 designed, 0% built | Capability registry design (done) | Provider Connectors | None structural — ready after Release 1 | POS Integration |
| 22 | Provider Connectors (Clover first) | 🟠 designed, 0% built | POS Kernel | Menu import, Order export, Payment integration | Depends entirely on Kernel | POS Integration |
| 23 | Restaurant Analytics | 🟡 (thin) | Ordering, Payments, Promotions | Revenue Intelligence | Same as #20 | Revenue Intelligence |
| 24 | Marketing (SMS/email/push delivery) | 🔴 | Campaign Engine, Consent Ledger | — | No provider integration exists at all (no SMS/email vendor found in any audit) | Campaign & Communication |
| 25 | Notifications (operational, not marketing) | 🔴 | Kitchen (new-order alerts), Staff (who to notify), AI Runtime (intervention alerts) | Kitchen, Staff | Zero infrastructure — confirmed by OOE audit | Ordering (operational extension) |
| 26 | Audit Logging | 🟡 (fragmented) | — | Compliance, dispute resolution, staff accountability | No unified log; `order_events`/`staff_audit_log`/`pos_sync_events` all separately designed, none built | Cross-cutting |
| 27 | Observability (CI, error tracking, monitoring) | 🔴 | — | Every release's safety | **New finding this session**: 1 test file, no CI, no APM/error tracking configured anywhere | Cross-cutting / Engineering |
| 28 | Super Admin | 🟢 | Authentication | Platform operations | None | Platform Administration |
| 29 | Feature Flags | 🟡 (`restaurant_capabilities` only — per-restaurant boolean, no general system) | — | Every gated rollout | Adequate for current roadmap; do not over-build (§7/§8) | Restaurant Management |
| 30 | Settings | 🟢 (`restaurant_settings` EAV + capabilities) | Restaurant Mgmt | Ordering (tax/fee), Catalog | Tax/fee has no admin UI (POS audit finding, unrelated to this plan's scope) | Restaurant Management |
| 31 | Integrations (beyond POS) | ⚫ | POS Integration (proves the pattern) | — | Reservations, delivery, accounting, CRM, gift cards, loyalty — all explicitly out of the 18-24 month window per the Canonical Domain Model's own extensibility test (10/11 categories need no redesign once core gaps close, so building them now would be premature) | POS Integration (pattern reused) |

---

## 2. Dependency Graph

### 2.1 Foundational chain (the spine of the whole graph)

```
Restaurant Management (root)
   │
   ├── Authentication ──────────────────────────────────┐
   │                                                     ▼
   ├── Menu Library                          Restaurant Staff ── Permissions/Capability Engine
   │        │                                     │                        │
   │        ▼                                     │                        ├──> Kitchen Operations
   │   Modifier System (concept only,              │                        ├──> Payments refund/void gating
   │   schema deferred to POS Phase 3)              │                        └──> POS Employee Mapping
   │                                                │
   ├── QR / Touchpoints ── Visit Sessions ──────────┤
   │                            │                   │
   │                            ├── Behavior Events  │
   │                            │       │            │
   │                            │       ▼            │
   │                            │  Session Intelligence / Decision Runtime
   │                            │
   │                            └── Customer Identity linkage fix (needs session_guests to exist)
   │
   ├── Promotions ── Coupons (needs Ordering too)
   │        │
   │        └── (current sole, narrow bridge to) Customer Identity via play_sessions
   │
   └── Ordering (needs Menu Library; Visit Sessions/Customer Identity optional)
            │
            ├── Order Events ─────────┬──> Kitchen Operations (item-level lifecycle)
            │                         ├──> Staff action attribution
            │                         └──> POS Order Export status tracking
            │
            └── Payments (mock today) ──> real PSP integration (parallel track, not blocking)
```

### 2.2 Downstream (POS / AI / Campaign)

```
POS Integration Kernel (needs: nothing new — capability registry is already designed)
   │
   ├── Clover Connector
   │       │
   │       ├── Menu/Modifier Import ── FINALIZES Modifier System's real schema (informed by live data)
   │       ├── Order Export ── needs Order Events (built for Kitchen)
   │       ├── Payment Integration ── needs real PSP track
   │       ├── Webhooks/Reconciliation
   │       ├── Customer Mapping ── needs Customer Identity linkage fix
   │       └── Employee Mapping ── needs Restaurant Staff

Customer Identity linkage fix ──> Consent Ledger fix ──> Campaign Engine ──> Marketing (SMS/email)
                                                              │
Restaurant Staff ──> AI-to-staff targeting ──────────────────┤
                                                              ▼
Kitchen Operations + Payments (real) + POS (real sales data) ──> Revenue Intelligence ──> AI Revenue Optimization
```

### 2.3 Relationship classification

| Relationship | Pairs |
|---|---|
| **Must ship together** | Restaurant Staff + Permissions/Capability Engine (inseparable — a staff table with no capability system is inert); PIN Auth + Trusted Devices (Staff doc's own design, one layer is useless without the other); Order Events + Order State Machine v2 (the events table has nothing to log without the new states) |
| **Required before** | Restaurant Staff **before** Kitchen Operations (explicit, cited, §3); Customer Identity linkage **before** Campaign Engine (explicit, cited, §7); Realtime publication fix **before** any Kitchen UI (silent no-op risk, already-tracked debt); Order Events **before** POS Order Export |
| **Can build in parallel** | Modifier concept refinement ∥ Restaurant Staff (unrelated subsystems); Consent Ledger fix ∥ Restaurant Staff; Real PSP integration track ∥ Kitchen Operations (Kitchen doesn't need real payment capture, only that an order exists); Revenue Intelligence dashboard scaffolding ∥ POS Kernel (the scaffolding can be built before real data sources exist, populated later) |
| **Optional** | Device-based customer recognition (Identity Spine Phase 3) — blocked on an unrelated, lower-priority bug fix (`device_fingerprint` capture), not required for any other release |
| **Must never ship together** | Re-enabled restaurant delete button **without** the soft-delete trigger (Phase 0's own explicit sequencing); expanded coupon auto-apply surface **without** the ownership-check fix (deepens live fraud exposure); POS price-ownership flip **before** Modifier System's real schema lands (§7 rewrite risk) |
| **Cycles** | None found. Kitchen Operations and Restaurant Staff's own Phase 4 ("shared kitchen devices") appear mutually referential at a glance — Staff Phase 4 consumes Kitchen's station tables, Kitchen needs Staff for attribution — but both source documents independently sequence this correctly as an interleaving (schema before UI, in both directions), not a true cycle. No genuine circular dependency exists anywhere in this graph. |
| **Breaking dependency** | `order_events` is the single highest-leverage table in the entire platform — three independent initiatives (Kitchen, Staff, POS) all require it. Building it once, correctly, early is this plan's most important infrastructure decision. |

---

## 3. Critical Path — Corrected

**The task frames the critical path as**: `Restaurant using SpinBite → QR Ordering → Payments → Kitchen → Staff → POS → AI Revenue Optimization`.

**This document corrects the ordering of two adjacent steps, with citation, per its own mandate to challenge implementation order where dependency facts require it:**

> **Corrected: `Restaurant using SpinBite → QR Ordering → Payments → Staff → Kitchen → POS → AI Revenue Optimization`**

**Why**: the Order Operations Engine document — written independently, before the Staff document existed — states directly: *"This is the prerequisite, not a parallel phase"* (§6, referring to `restaurant_staff`), and frames the entire missing actor model as the reason a KDS "will not survive a real service rush" without it (§0). The Staff & Authentication document, written after and citing the OOE document throughout, was commissioned specifically to build that prerequisite. Every KDS screen in the OOE design — station view, expo view, cashier refund/void actions — is gated by a role/capability that doesn't exist until Staff ships. Building Kitchen first would mean either (a) shipping it owner-only (useless for any real kitchen with more than one person), or (b) retrofitting staff/capability gating into every already-shipped KDS screen once Staff eventually lands — a rewrite, not an extension (§7, ranked as the top rewrite risk in this plan).

**Payments does not block Staff or Kitchen.** The existing mock payment orchestrator is sufficient to unblock both — Kitchen Operations needs an `orders` row to exist, not a real captured charge. Real PSP integration (Stripe) is a legitimate parallel track that can proceed alongside Staff/Kitchen work without gating either.

### 3.1 Blockers at every step

| Step | Blocker(s) | Resolved by |
|---|---|---|
| Restaurant using SpinBite | Restaurant hard-delete risk (live, one click) | Phase 0 remediation, Release 1 |
| QR Ordering | None — already mature | — |
| Payments | Mock-only; not a blocker for anything downstream, but real PSP work should start in parallel now | Independent track, any release |
| Staff | None — ready to build today | Release 3 |
| Kitchen | Staff (above); `orders`/`order_events` realtime publication gap | Release 3 then Release 4 |
| POS | Order Events (Release 4); Staff for employee mapping (Release 3); Modifier concept for catalog parity | Release 5 |
| AI Revenue Optimization | Real settled payment data (needs real PSP or POS-managed capture); Staff attribution; Revenue Intelligence layer | Release 6, gated on Release 5's real transaction data |

---

## 4. Work Packages

Every package cites the source document's own phase numbering rather than re-deriving complexity/scope from scratch — this plan sequences prior architecture, it does not re-specify it.

| Package | Scope | Depends On | Complexity | Risk | Migration Impact | Testing Impact | Rollout | Rollback | Acceptance Criteria |
|---|---|---|---|---|---|---|---|---|---|
| **WP0 — Observability & CI Foundation** | Stand up CI (lint+test+build gate on PRs), baseline test coverage for the highest-risk paths (order creation, payment orchestration, RLS-sensitive routes), basic error tracking | None | Medium | Low (pure infra) | None | This *is* the testing infra | Immediate, no flag needed | N/A (infra, not a feature) | PRs cannot merge without CI passing; a regression in order creation or RLS is caught before merge, not after |
| **WP1 — Phase 0 Critical Remediation** | All 7 issues per the remediation plan: DB delete-trigger, RLS fixes (restaurants/orders/order_items/coupon_redemptions), consent ratchet fix, coupon rate-limiting, OrderTracker realtime replacement | WP0 (tests should exist before touching security-critical code) | Low-Medium per issue (plan already sequences this) | High if skipped, Low to execute (plan is detailed) | RLS policy changes, one new trigger, two new nullable columns | Explicit test plan already exists in the source doc | Per the remediation plan's own deployment sequence (§6 of that doc) | Per-issue, already specified (all trivially reversible) | Per-issue, already specified in the source doc |
| **WP2 — Restaurant Staff Foundation** | `restaurant_staff`, `staff_roles`, `capability_definitions`, `staff_role_capabilities`, `staff_role_assignments`, invite flow, `PermissionService` live on ≥1 real route | WP0, WP1 (don't build new RLS-sensitive tables until the RLS-fix discipline from WP1 is fresh/applied) | Medium-High (new subsystem, but schema is fully specified) | Medium | New tables, additive RLS OR-clauses on every existing owner-scoped policy | New — first real test of the capability model, adversarial escalation tests required (Staff doc §9.3) | Feature-flagged per restaurant (`restaurant_capabilities`-style) during Phase 2 rollout | Drop new tables; revert the one rewritten route to owner-only check | An invited manager can log in and perform a capability-gated action an unprivileged staff member cannot |
| **WP3 — PIN Auth & Shared Terminals** | `staff_pin_credentials`, `trusted_devices`, `staff_sessions`, PIN verify/lockout, device trust registration | WP2 | Medium-High (new auth surface, security-sensitive) | Medium-High (brute-force surface, per Staff doc §9.7) | New tables only, zero-client-access on PIN table | Explicit brute-force/lockout test required before ship | Feature-flagged, pilot with one restaurant first | Disable PIN entry UI; full-login staff unaffected | A kitchen tablet can be trusted once and a cook can PIN in/out without a personal login; lockout verified under adversarial test |
| **WP4 — Order Events & State Machine v2** | `order_events`, widened `orders.status` CHECK (additive), new nullable columns (`accepted_at/by`, `served_at/by`, etc.), `orders.touchpoint_id` finally added | WP2 (actor FK target must exist) | Medium (schema-only, well-specified in OOE doc) | Low (fully additive, backward-compatible per OOE doc's own note) | Additive columns + one CHECK widen; zero existing query breaks per OOE doc | Regression test every existing order-status consumer | Ship schema before any UI depends on it (OOE doc's own sequencing) | Drop new columns/table; existing 5-state flow unaffected | Every new order writes correct `order_events` rows; no existing admin/customer flow regresses |
| **WP5 — Realtime Hardening** | Add `orders` and `order_events` to `supabase_realtime` publication; migrate `OrderTracker.tsx` off direct anon RLS dependency (shared with WP1) | WP1 (shares the OrderTracker fix), WP4 | Low | Low | Publication membership change only | Verify live status updates end-to-end | Ship before any Kitchen UI | Trivial (remove from publication) | A staff-side status change reaches the customer tracker and a kitchen screen within target latency |
| **WP6 — Kitchen Display MVP** | Single default station, item-level bump, accept/ready flow, minimal ticket card | WP2, WP3, WP4, WP5 | Medium-High | Medium (first real-time, multi-actor UI) | None new | End-to-end: order placed → kitchen bumps → customer sees update | Feature-flagged, one pilot restaurant | Disable KDS UI; ordering/payments unaffected | A real kitchen workflow works with correct per-action staff attribution |
| **WP7 — Multi-Station Kitchen + Staff Role Screens** | `kitchen_stations`, `menu_item_station_routing`, station/expo view split, server "ready to serve" view, cashier refund/void actions | WP6 | Medium | Low-Medium | New join tables, additive | Station-routing correctness tests | Per-restaurant opt-in | Fall back to single-station mode | A multi-station kitchen correctly routes and a server sees only their assigned tables |
| **WP8 — Order/Coupon/AI Attribution Completion** | `orders.accepted_by/served_by/cancelled_by` populated, `coupon_redemptions.redeemed_by_staff_id`, `live_interventions.acknowledged_by` | WP2, WP4 | Low | Low | Additive columns only | Attribution-correctness regression tests | Ships alongside WP6/WP7 | Drop columns, no dependent logic breaks | Every attribution question in the Staff doc's §10 table has a populated answer for new activity |
| **WP9 — Customer Identity Linkage** | `session_guest_customer_links`, `orders.customer_profile_id`, wire phone-capture to write the link, fix the checkout-time attribution race | WP0 (needs test coverage given past silent bugs in this exact area) | Medium | Medium (touches high-traffic checkout path) | Additive nullable columns/table | Explicit test: guest-first flow unaffected when phone is skipped (Identity Spine's own top acceptance criterion) | Feature-flagged rollout of the optional checkout phone field | Drop new columns/table; existing flow unaffected | A phone-linked guest's orders/coupons are attributable across visits; skipping the field has zero UX change |
| **WP10 — Consent Ledger** | `customer_consents`, remove the one-way marketing-consent ratchet (small piece already in WP1) | WP1 | Low | Low (no live campaigns exist yet to create real exposure today, but must precede any that do) | New table | Verify consent moves both directions and is respected by (future) send logic | Ships any time after WP1 | Drop table, revert to WP1's simpler fix | Consent can be granted and revoked, with a channel-scoped audit trail |
| **WP11 — Coupon Ownership Hardening** | `coupon_redemptions.issuing_session_guest_id`, soft ownership check in `resolveCouponDiscount()`, staff-facing override at `/admin/validate` | WP1, WP9 (benefits from the identity link but doesn't strictly require it — can ship the session-scoped check first) | Low-Medium | Medium (getting the "warn not block" balance wrong either breaks legitimate sharing or leaves the gap open) | Additive column | Explicit adversarial test: cross-restaurant/cross-session redemption blocked; in-visit sharing still works | Ship the rate-limiting piece immediately (WP1), the ownership check after WP9 lands for best signal quality | Revert to warn-only or no-check; no data loss either way | Cross-tenant coupon redemption confirmed blocked by test, not assumption |
| **WP12 — Modifier System (concept only)** | Finalize the *conceptual* model (group→option hierarchy, price-delta shape) in documentation; **do not build the schema yet** | Menu Library (already live) | Low (it's a design task, not a build) | Low | None yet | None yet | N/A | N/A | A written modifier concept exists that WP15 can implement against once real Clover data arrives |
| **WP13 — POS Integration Kernel** | `pos_connections`, `pos_locations`, `provider_capabilities`, `pos_connection_capabilities`, OAuth connect/disconnect, Integrations admin tab | WP0 (secret-handling code needs test coverage) | Medium-High | Medium (new secret-storage surface) | New tables, zero-client-access on token columns | Token encryption round-trip test, RLS deny-by-default test | Ship with zero real providers wired (per POS audit's own Phase 1 acceptance criteria — a test provider proves the kernel first) | Drop new tables; no other system depends on this yet | A fake/test provider completes connect→probe→disconnect with zero code outside the provider file touched |
| **WP14 — Clover Reference Connector** | Real `CloverProvider`, real OAuth against Clover sandbox | WP13 | High (first real external integration) | Medium-High (external API discovery risk, budget time per POS audit's own caution) | `pos_sync_jobs`, `pos_sync_events` | Sandbox-verified connect/disconnect | Sandbox-only until proven | Disconnect capability from WP13 | A real Clover sandbox merchant connects/disconnects; capability probe matches documented plan-tier access |
| **WP15 — POS Menu/Modifier Import** | `pos_external_mappings`, real catalog import, **Modifier System's real schema finalized here**, staging-review UI | WP12, WP14 | High | Medium-High (ownership-flip correctness is revenue-critical, per Business Invariants M-2) | New mapping table; **first schema build for Modifiers** | Conflict-resolution correctness tests (POS-always-wins rule) | Staged review before any import goes live, per POS audit's own design | Reject the import batch; no live data touched until review approval | A Clover catalog imports, maps correctly, re-import detects no-op vs. real changes |
| **WP16 — POS Order Export** | `pos_order_exports`, export orchestration, local-first order creation preserved | WP4, WP14 | Medium-High | Medium (customer-facing failure mode if export silently fails) | New table | Export-failure-surfaces-to-admin test (non-negotiable per POS audit) | Per-restaurant opt-in once WP14 is stable | Orders stay valid/fulfillable in SpinBite even if export is disabled | An order reliably reaches a connected Clover kitchen ticket; a forced failure surfaces in admin within one polling cycle |
| **WP17 — Real Payment Integration** | `StripeProvider` implementing the existing `PaymentProvider` interface; POS-managed capture as capability-gated alternative | WP13 (for POS-managed path); independent of Kitchen/Staff entirely for the SpinBite-managed path | High | High (real money, real PCI exposure — highest-stakes package in this plan) | `pos_payment_attempts` | PCI-scope verification, refund-authorization-side correctness, concurrent-webhook idempotency | Sandboxed/test-mode extensively before any live charge | Revert to mock provider; zero data implications since mock never processed real money | A sandboxed real charge completes, settles, and (if hybrid) reflects as paid on the connected POS ticket |
| **WP18 — POS Webhooks & Reconciliation** | `pos_webhook_events`, signature verification, polling fallback | WP14, WP16 | Medium-High | Medium (genuinely new infrastructure — no webhook route exists anywhere in the codebase today) | New table | Replay-attack rejection, dedup correctness, signature-verification negative cases | After WP16 is stable | Fall back to polling-only | A Clover-side status change reaches SpinBite faster via webhook than polling would have; duplicate delivery produces no duplicate effect |
| **WP19 — Capability-Based UX Polish** | Every unsupported-capability state made explicit in the UI (never silent), per POS audit §5's design rule | WP13-WP18 | Low-Medium | Low | None | Visual/snapshot tests across capability-on/off permutations | Ships continuously alongside WP14-18 | N/A | No screen presents an unsupported capability as if it were working |
| **WP20 — Additional POS Providers** | Square, then Toast, per business priority | WP13-WP19 proving the abstraction holds | Medium per provider (should decrease if the abstraction is genuinely provider-neutral) | Low-Medium | `provider_capabilities` seed data only | Same acceptance suite as WP14, re-run per provider | Per-provider rollout | Disable the specific provider | A second provider reaches parity with zero change to `payment-orchestrator.ts`/`lib/orders/*`/admin core logic — any change required outside the new provider's own files is a signal the abstraction leaked |
| **WP21 — AI-to-Staff Targeting** | Decision Runtime resolves a target `restaurant_staff`/active `staff_sessions` device instead of generic restaurant-wide notification | WP2, WP3 (Staff/PIN sessions must exist); does **not** need POS | Medium | Low | `session_guests.assigned_server_staff_id` (optional) | Targeting-correctness test | Feature-flagged | Fall back to restaurant-wide notification (today's behavior) | At least one AI recommendation correctly targets one specific active staff member, measurably acknowledged |
| **WP22 — POS Employee Mapping** | Staff-matching within POS sync, staged review for ambiguous matches | WP2 (Staff), WP13 (POS Kernel) | Medium | Medium (over-privileging risk if a POS "Manager" import is trusted blindly) | `pos_external_mappings` entity_type extension only | Adversarial test: no silent over-privilege grant | After both WP2 and WP13-14 are stable | Disable employee-sync path independently | A POS employee with a matching email links to the correct existing staff row; ambiguous matches route to review |
| **WP23 — Revenue Intelligence Layer** | Derived, read-only rollups: prep-time KPIs (from `order_events`), promotion performance, (once real) sales trends | WP4 (order_events), WP17 (real payment data for meaningful revenue numbers) | Medium | Low (read-only, no write path) | Materialized views or scheduled rollups, not new always-on tables | Correctness of derived aggregates against source data | Ships incrementally as source data becomes real | N/A (read-only) | KPI numbers reconcile against source `order_events`/`payments` data |
| **WP24 — AI Revenue Optimization** | The actual north-star use cases (sales-lift commands, campaign tuning against real revenue) | WP17 (real settled data), WP23, WP9 (customer linkage for personalized recommendations) | High | Medium (scope creep risk — start narrow, per Decision Runtime V1's own precedent) | None new beyond what WP9/23 already added | End-to-end: at least one named use case demonstrably actionable against real data | Narrow pilot scope first, matching the platform's existing V1 discipline | Disable the specific AI feature; underlying data/attribution unaffected | At least one of the POS audit §10 example commands works end-to-end against real connected-POS data |
| **WP25 — Campaign & Communication Engine** | Real `campaigns` schema (not resurrected dead table), SMS/email provider integration, consent-gated sends | WP9, WP10 (both must precede — §7 rewrite risk) | High | Medium-High (first outbound-communication surface, real compliance exposure) | New schema (not yet designed in any prior doc — first genuinely new design surface this plan identifies) | Consent-enforcement test is the most important test in this package (per Identity Spine §9 Phase 9's own framing) | Pilot with a small, opted-in segment first | Disable sending; consent/segment data unaffected | A revoked consent is verifiably honored before this package's acceptance is signed off |
| **WP26 — Enterprise Enhancements** | Per-staff capability overrides, station-level capability scoping, groundwork for Organization/Brand entity | WP2-WP22 stable in production | Variable — scope against real enterprise-customer demand, not built speculatively | Low (deferred by design) | TBD, evaluated at the time | TBD | TBD | TBD | Scoped against actual requirements when a real multi-location enterprise customer requires it — not designed further in this plan, per the Staff doc's own explicit deferral |

---

## 5. Parallelization Strategy

**Team**: 1 senior, 2 mid-level, 1 frontend, 1 QA.

### 5.1 Track assignment

| Track | Owner | Sequence |
|---|---|---|
| A — Highest-risk/highest-complexity | Senior engineer | WP1 (Phase 0, especially the DB trigger and RLS work) → WP2/WP3 (Staff capability engine + PIN security) → WP13 (POS Kernel, once Release 3-4 stabilize) |
| B — Ordering/Kitchen backend | Mid-level #1 | WP4 (Order Events) → WP6 backend (Kitchen MVP) → WP7 backend (multi-station) → WP16 (POS Order Export) |
| C — Identity/Commerce-data backend | Mid-level #2 | WP9 (Customer Identity linkage) → WP10 (Consent) → WP11 (Coupon hardening) → WP23 (Revenue Intelligence) |
| D — Frontend | Frontend engineer | Staff invite/role UI (parallel to WP2) → KDS screens (parallel to WP6-7) → admin customer timeline (parallel to WP9) → Integrations tab (parallel to WP13) |
| E — QA | QA engineer | **WP0 first** (this is the recommended reordering this document's new finding demands) → Phase 0 remediation test plans (highest stakes, execute before WP1 ships) → regression suites landing alongside each subsequent package |

### 5.2 What creates merge conflicts (coordinate explicitly, don't just hope)

- `app/admin/restaurants/[restaurantId]/page.tsx` — touched by WP1 (delete button fix) and by WP13 (new Integrations tab) and by WP2 (staff management UI). Sequence these three sequentially through this one file, or coordinate a shared branch window.
- RLS policies on `restaurants`/`orders`/`order_items`/`coupon_redemptions` — touched by WP1 directly, and touched again by WP2's additive OR-clause pattern (§7 of the Staff doc). These should not be edited by two people in the same window; the Phase 0 remediation plan's own PR-gating rules (§11 of that document) already establish the right discipline here — reuse them, don't reinvent.
- `lib/orders/create-order.ts` — wanted by WP4 (new status/actor columns), WP9 (customer_profile_id attribution), and WP11 (coupon ownership check). All three should land as coordinated, reviewed-together changes to this one function, not three independent PRs racing each other.

### 5.3 What should be feature-flagged

Kitchen Display (WP6-7), PIN Auth (WP3), every POS provider connection (WP13-20, inherently per-connection), the coupon ownership hard-block option (ship soft/warn-only first per Identity Spine's own recommendation, flag the eventual stricter mode separately), Campaign sending (WP25, given the compliance stakes).

### 5.4 What requires a database freeze

A short, coordinated freeze (hours, not days) during: the Phase 0 RLS migration window (already specified in that document's own deployment sequence); the Staff doc's §7 RLS OR-clause rollout (touches every existing owner-scoped policy in one pass); any point where two work packages above are simultaneously proposing schema changes to the same table (`orders` is the most contended table across this entire plan — WP4, WP9, WP11, WP16 all want columns on it).

---

## 6. Release Train

| Release | Contents | Why this grouping |
|---|---|---|
| **Release 1 — Platform Stabilization** | WP0, WP1, WP5 | Nothing else should be built on top of a live one-click data-destruction bug, open tenant-isolation holes, and zero test coverage. Pure risk reduction, no new product surface — this is the release where "ship nothing visible, fix everything load-bearing" is the correct, defensible choice. |
| **Release 2 — Commerce Foundation** | WP9, WP10, WP11, WP12 | The Identity Spine's own framing: this is "higher priority than POS connector implementation" because it blocks the AI-first mission at its foundation, independent of whether POS ever ships. Also closes the live coupon-fraud gap. Deliberately excludes Staff/Kitchen — this release is about commerce-data integrity, not operations. |
| **Release 3 — Restaurant Staff** | WP2, WP3 | The explicit, doc-confirmed prerequisite for Release 4. This is the release that turns SpinBite from "one owner per restaurant" into a real multi-person operational platform — the single most consequential capability unlock in this entire plan. |
| **Release 4 — Kitchen Operations** | WP4, WP6, WP7, WP8 | Now unblocked by Release 3. `order_events` (WP4) is built here but immediately serves double duty as the POS Order Export dependency for Release 5. |
| **Release 5 — POS** | WP13 through WP20, WP22 | Sequenced after Order Events (Release 4) and Staff (Release 3) because Order Export and Employee Mapping genuinely need them. Clover first, proven, before any second provider — per the POS audit's own "Clover is the first connector, not the architecture" principle. |
| **Release 6 — AI Revenue Optimization** | WP21, WP23, WP24, WP25 | Gated on real settled transaction data (Release 5) and stable operational primitives (Releases 3-4), per the platform's own locked "no AI automation before stable primitives" principle. **Note**: WP21 (AI-to-staff) only needs Release 3, and WP25 (Campaign) only needs Release 2 — both could realistically start interleaved with Release 5 rather than waiting for it to fully complete. This release is grouped by *theme* (AI/revenue), not by a hard technical gate on every item within it — flagged explicitly so the release train isn't read as more rigid than the dependency graph actually requires. |

---

## 7. Rewrite Risk Analysis

Ranked by severity — each entry states the concrete rework that results from getting the order wrong, not just that it would be "bad practice."

| Rank | Risk | Concrete rework if violated |
|---|---|---|
| 1 — **Severe** | Building Kitchen Operations before Staff | Every KDS screen ships owner-only, then needs role/capability gating retrofitted into each one once Staff lands — not an extension, a rewrite of the auth layer underneath already-shipped UI. This is the exact scenario the OOE document's own words ("prerequisite, not parallel") were written to prevent, and it's the correction this plan makes to the task's own stated critical path (§3). |
| 2 — **Severe** | Building Campaign Engine before Customer Identity linkage | Campaigns ship targeting the current disconnected `customer_profiles` (no real order/visit history to segment against); once the linkage fix lands, every campaign's targeting logic needs re-auditing and likely re-running. Named explicitly as an example risk in the task itself — confirmed as real by this plan's dependency analysis, not just asserted. |
| 3 — **High** | Building the POS price-ownership flip before Modifier System's real schema lands | A price-sync mechanism designed only for flat (non-modified) items needs extension the moment modifiers — which carry their own price deltas — enter the picture. The POS audit's own Phase 3 sequencing (finalize Modifiers informed by real Clover data) already prevents this if followed; the risk is real only if someone skips ahead of that sequencing under schedule pressure. |
| 4 — **High** | Expanding coupon self-checkout auto-apply before the ownership-check fix ships | Deepens the live fraud exposure actively while it's being "improved," and any UX built around blindly trusting a client-supplied coupon reference needs rework once server-side validation is added — a client-contract change, not just a backend patch. |
| 5 — **Medium** | Building AI-to-staff table-assignment targeting before both Staff and Kitchen exist | Not a rewrite so much as dead-weight risk — there's no active session/table-assignment concept to target yet, so early work here is likely to be discarded rather than reworked. Lower severity than the above because it wastes time rather than corrupting data or requiring a security retrofit. |
| 6 — **Medium** | Re-enabling the restaurant delete UI before the soft-delete trigger ships | Already correctly sequenced in the Phase 0 remediation plan; listed here as a reminder that violating that plan's own stated order reintroduces the exact critical risk it exists to close, not a new independent finding. |
| 7 — **Low** | Building a heavier, general-purpose feature-flag system speculatively | The existing `restaurant_capabilities` pattern is adequate for every package in this plan. Building a fuller system ahead of a demonstrated need would itself constitute the kind of premature complexity this plan's own §8 recommends against — a rewrite risk of the *opposite* kind (over-building), worth naming explicitly so it isn't missed for only looking at under-building risks. |
| 8 — **Low** | Rushing refund attribution onto the existing `payments.status` mutation instead of the Business Invariants-recommended distinct refund-event mechanism | If WP8's `refunded_by` column gets attached to today's status-flip refund path instead of waiting for the proper event-based redesign (PAY-1's fix), it needs to move again once that redesign ships — a small, contained rework, correctly ranked lowest severity. |

---

## 8. Technical Debt Budget

| Release | Debt expected/acceptable | Debt that must never be accepted |
|---|---|---|
| 1 — Stabilization | Deferring the customer-side `device_fingerprint` bug fix if unrelated to this release's scope; deferring a full generic audit-log unification (staff/order/POS logs can stay separate for now) | Leaving the restaurant hard-delete risk unaddressed; leaving any of the four flagged RLS holes open; shipping without WP0's CI gate in place |
| 2 — Commerce Foundation | Deferring `customer_contact_points` (multi-phone-number support) and household/group intelligence — both already correctly scoped as later-phase in the Identity Spine document | Shipping consent tracking that still can't be revoked; over-correcting the coupon fix into a hard block that breaks legitimate in-household sharing |
| 3 — Restaurant Staff | Deferring per-staff capability overrides and station-level capability scoping (Staff doc's own Phase 8); deferring restaurant-configurable PIN policy (ship a sensible fixed default first) | Shipping PIN storage without proper hashing/isolation; shipping without brute-force lockout; shipping any path that lets a non-owner modify the owner's own access |
| 4 — Kitchen Operations | Deferring the large-kitchen-screen TV mode and All-Day batch-cook view (OOE's own framing: presentation layers over data that already exists, safe to defer); deferring full KPI rollups | Shipping without the realtime publication fix; shipping item-level bump without correct actor attribution |
| 5 — POS | Supporting only Clover initially, explicitly by design; deferring full webhook reconciliation if polling is adequate at current volume | Any provider ID leaking into business logic (constitutional rule, POS-1); flipping price ownership without the "POS always wins, no merge" rule actually enforced in code, not just documented |
| 6 — AI Revenue Optimization | Starting with a narrow use-case scope, matching Decision Runtime V1's own deliberately narrow precedent | AI writing directly to any canonical entity (constitutional rule AI-1); launching campaign sends without consent enforcement actually wired end-to-end and tested, not just schema-present |

---

## 9. Success Metrics Per Release

| Release | Engineering KPI | Architecture KPI | Performance KPI | Security KPI | Business KPI |
|---|---|---|---|---|---|
| 1 | CI passing on 100% of merged PRs; test coverage established on all Phase 0-touched code paths | Zero owner-only auth checks remain the *only* mechanism (staff schema exists, even if unused yet) | No regression in checkout/ordering latency | Zero anonymous bulk-read access on the four flagged tables (verified by test, not assumption) | Zero incidents of restaurant data loss; zero reported coupon-fraud abuse post-fix |
| 2 | Identity-linkage test suite passing, including the "skipping phone has zero UX impact" acceptance test | `customer_profile_id` populated on ≥X% of new session-linked orders (target set once WP9 ships) | No regression in checkout latency from the new optional field | Consent revocation verifiably honored in a test, not just possible in schema | Baseline established for churn/LTV measurement, previously impossible |
| 3 | Adversarial escalation test suite passing (no self-granted capability beyond ceiling) | Zero routes using a hardcoded role-name string comparison | PIN verification round-trip latency acceptable for real-time terminal use | PIN brute-force lockout verified under test; owner-protection rule verified under test | At least one real restaurant operating with >1 authorized staff member |
| 4 | End-to-end order→kitchen→served test passing with correct attribution | `order_events` is the single source of truth for all derived KPIs, no parallel/competing timeline mechanism | Kitchen realtime update latency within target (informed by WP5's testing) | Kitchen device trust revocation verified to immediately block a lost/stolen terminal | At least one real restaurant's kitchen running on the KDS during real service |
| 5 | Full POS Phase 1-6 acceptance criteria (per the POS audit's own definitions) passing | Zero code outside `lib/pos/providers/<name>/` required when the second provider is added (leak-detection test) | Order export latency within the POS audit's own target SLA | Webhook signature verification tested against forged/replayed payloads | At least one real restaurant transacting through a live Clover connection |
| 6 | At least one AI-revenue use case demonstrably actionable end-to-end against real data | AI write paths remain zero-direct-to-canonical-entity (verified, not assumed) | AI recommendation latency doesn't degrade the operational (Kitchen/Ordering) critical path | Consent enforcement verified before every campaign send in production, not just in test | Measurable revenue-lift signal from at least one AI-recommended action, however small |

---

## 10. Recommended Next PR

**Ship the Phase 0 remediation plan's `BEFORE DELETE` trigger on `restaurants`, alone.** It is the single highest-severity, lowest-complexity, zero-application-code change available — a database trigger and its supporting function, nothing else touched. It closes the worst-case outcome in the entire platform (irrecoverable loss of a restaurant's full commercial history) permanently, regardless of whether any other fix in this plan ships on schedule. Pair it, in the same PR or the one immediately following, with disabling the restaurant delete button in the admin UI (§Design Question 1 of the remediation plan) — both are same-day, zero-risk changes that should not wait for any review cycle longer than a normal PR.

## 11. Recommended Next Milestone

**Complete Release 1 (Platform Stabilization) in full — all of WP0, WP1, WP5 — before any Release 2 work begins.** This is a hard, not soft, recommendation: every subsequent release in this plan assumes a codebase with working CI, closed security holes, and a functioning realtime publication. Starting Release 2 work in parallel with an incomplete Release 1 reintroduces exactly the "build on top of known-broken infrastructure" risk this entire plan exists to avoid.

---

## 12. Constitutional Reminders

Restated, not re-derived, from the documents this plan sequences — every work package above is bound by these regardless of which engineer implements it:

- Every canonical entity has exactly one SpinBite-issued UUID; provider IDs never leak into business logic (Business Invariants POS-1, restated in the Staff doc for employee mapping).
- Customer identity is permanently SpinBite-owned; POS/CRM data enriches, never replaces it (Business Invariants, Identity Spine, POS audit — three-way consistent).
- Price and tax ownership flips completely on POS connect, never partially (Business Invariants M-2/POS-4).
- Anonymous ordering is always supported, permanently, with zero degraded experience (Business Invariants C-2) — no package in this plan may introduce a login/identity requirement to browse or order.
- No actor may grant a capability they don't themselves hold (Staff doc §9.3).
- AI proposes; business services execute — no AI write path touches a canonical entity directly (Business Invariants AI-1).
- Historical attribution (order, coupon, staff action) is never rewritten, only added to going forward (Business Invariants, Staff doc §8.2).
- A restaurant may only ever see a customer's activity at that restaurant; the identical rule applies to staff performance data (Identity Spine C-5, Staff doc §14).

## 13. Open Questions

1. Should WP0 (CI/observability) block *all* other work, or is a narrower "CI on the specific files each package touches" sufficient to start Release 1's other packages in parallel? This document recommends the stricter reading (full CI first) given the platform's current near-zero coverage, but a one-week narrower interim is a reasonable compromise if schedule pressure is severe.
2. Is the assumed team composition (1 senior, 2 mid, 1 frontend, 1 QA) fixed for the full 18-24 months, or does it change by release — e.g., does Release 5 (POS) warrant a specialist with prior payments/PCI experience rather than relying on the existing team's general capability?
3. Should Release 6's AI work (WP21, WP25) actually be pulled forward to interleave with Release 5, given §6's own note that neither strictly depends on POS? This plan presents them grouped by theme for readability but flags that the dependency graph permits earlier parallel start — worth a explicit go/no-go decision rather than defaulting to the reading order.
4. WP25 (Campaign & Communication Engine) is the one package in this entire plan with no prior design document behind it — every other package cites a specific source document's specification. Should a dedicated architecture document for the Campaign Engine be commissioned before WP25 enters active development, consistent with how every other major subsystem in this plan was designed before being sequenced?
5. What is the actual current velocity baseline (given zero prior sprint history to measure against, per this session's own finding of near-zero test/CI infrastructure)? Every complexity estimate in §4 is relative (Low/Medium/High), not calendar time — converting this plan into actual 18-24 month calendar dates requires at least one completed release's worth of real velocity data, which doesn't exist yet.
