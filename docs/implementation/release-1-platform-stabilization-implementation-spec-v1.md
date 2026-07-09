# Release 1 — Platform Stabilization: Implementation Specification v1

**Status:** Engineering execution plan. **No code implemented by this document.** Every PR, migration, and test below is a specification to execute against, not a completed change.
**Date:** 2026-07-08
**Binding inputs (not redesigned):** `spinbite-business-invariants-v1.md`, `spinbite-phase-0-critical-remediation-plan-v1.md`, `spinbite-master-build-plan-v1.md` (source of Release 1's scope: WP0, WP1, WP5). The Canonical Domain Model, Customer Identity Spine, POS Integration Audit, Staff & Authentication, and Order Operations Engine documents are referenced only where Release 1 touches their concerns (customer consent, coupon ownership) — none of their in-scope-for-later work is included here.
**New verification this session** (beyond what the Phase 0 remediation plan already established): confirmed `lib/http/rate-limit.ts` exists and exports two ready-to-use limiters (`createIpRateLimiter`, `checkRestaurantRateLimit`) — the coupon-hardening PRs below call these directly rather than writing new rate-limiting logic. Confirmed `vitest.config.ts` exists but is minimal, and `package.json` has no `typecheck` script despite `tsconfig.json` being `strict: true`. Confirmed no `vercel.json`/`.github/workflows/` exist — deployment is Vercel-dashboard-configured, git-integrated, auto-deploy-on-merge-to-`main`, with no PR gate today. Confirmed via `pg_publication_tables` that `orders` is **not** in the `supabase_realtime` publication — this means the admin order list's realtime subscription (per the Order Operations Engine document's own finding) and the customer `OrderTracker`'s subscription are **both already silently non-functional today**, independent of any RLS policy. This measurably lowers the regression risk of dropping `orders_public_track` (§4, migration 5) — the live-update behavior it nominally enables is already broken. Confirmed via `list_branches` that Supabase database branching is an available, unused capability on this project (only the default `main` branch exists) — recommended below as the missing "isolated staging database" this release should establish.

---

## Part 1 — Release Overview

### Goals
Close every live correctness, security, and data-loss risk identified in the Phase 0 remediation plan, and establish the automated testing/CI foundation that every subsequent release in the Master Build Plan depends on for safety. Ship zero new customer-facing product surface — this release is entirely risk reduction and engineering-infrastructure investment.

### Business value
Removes a live, one-click, irreversible path to losing a restaurant's entire order and payment history. Closes a live coupon-fraud exposure (141 issued coupons currently redeemable by anyone who obtains the code). Closes a platform-wide unauthenticated data exposure (all restaurant contact info, all orders, all order items readable by anyone with the public anon key). Establishes a legal-compliance-ready consent model before any real marketing communication exists to need one. Establishes the CI/test safety net every later release's velocity and safety depends on — without it, Releases 2-6 in the Master Build Plan would be executing against the same near-zero-coverage baseline that let these Release 1 issues go unnoticed in the first place.

### Architecture dependencies
None upstream — Release 1 is the root of the Master Build Plan's dependency graph. It blocks every subsequent release by design (Master Build Plan §11: "Release 1 must complete in full before any Release 2 work begins").

### Expected duration
Not calendar-estimated here — the Master Build Plan (§13, Open Question 5) already notes no velocity baseline exists yet to convert complexity estimates into dates. This document sequences and sizes the work (Part 3's PR-level granularity is the input a team would use to estimate); it does not invent a date.

### Blocking issues
None external — every fix in this release is self-contained (Phase 0 remediation plan §Dependency Map: "No issue in this plan blocks any other," with one coupled pair). The one internal sequencing constraint: PR-012 (drop `orders_public_track`) should not merge before PR-014 (OrderTracker replacement) is verified working — not because the drop itself is risky (see the realtime-publication finding above), but because the *replacement* mechanism should exist and be tested before the old (already-broken) one is formally removed, so there is no window where the tracker's intended behavior has zero implementation at all.

### Success criteria
Every acceptance criterion in Part 2's eight work packages passes. Every migration in Part 4 applies cleanly with its production verification query returning the expected result. CI is green on every subsequent PR platform-wide, not just this release's own PRs.

### Exit criteria
All 21 PRs in Part 3 merged and deployed to production. `get_advisors` (security) shows no `rls_enabled_no_policy` or always-true-policy findings on the four tables this release touches. A restaurant owner cannot destroy their own order/payment history via the admin UI. An anonymous caller cannot bulk-read `restaurants`, `orders`, or `order_items`. A staff member can complete a coupon redemption through `/admin/validate`. `marketing_consent` can be verified to move in both directions via the existing API.

---

## Part 2 — Work Package Breakdown

Release 1 = Master Build Plan's WP0 + WP1 + WP5, expanded here into eight independently shippable work packages. WP5 (Realtime Hardening) is folded into WP1.3 below rather than kept separate, because the Master Build Plan itself already noted the two "share the OrderTracker fix" — presenting them as one package avoids a false impression of independence that doesn't exist at this granularity.

### WP0 — CI & Automated Testing Foundation
- **Purpose**: establish the regression-safety net every other work package in this release (and every later release) depends on.
- **Scope**: GitHub Actions CI workflow gating lint/typecheck/test/build on every PR; a `typecheck` script; baseline unit tests for the two highest-risk pure-logic modules (`create-order.ts`, `payment-orchestrator.ts`); a repeatable RLS verification script.
- **Files expected to change**: new `.github/workflows/ci.yml`; `package.json` (new `typecheck` script); new `lib/orders/create-order.test.ts`; new `lib/payments/payment-orchestrator.test.ts`; new `scripts/verify-rls.ts` (or equivalent).
- **Database objects affected**: none.
- **Application layers affected**: none (pure tooling/test addition — no production code path changes).
- **Security implications**: the RLS verification script uses the *anon* key deliberately (to assert what an unauthenticated caller can and cannot see) — must never use the service-role key, and must never be checked in with a real key value (use the existing `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` env var, which is public by design).
- **Dependencies**: none.
- **Risk level**: Low (additive tooling only).
- **Acceptance criteria**: a PR with a deliberately broken type/lint/test is demonstrated to fail CI and be blockable from merging (requires a one-time GitHub branch-protection rule enabling "require status checks to pass," configured in repo settings — not a file in this repo, flagged explicitly so it isn't missed as a manual step).
- **Rollback strategy**: delete the workflow file; no production impact either way since this package touches no runtime code.
- **Manual verification checklist**: open a throwaway PR with an intentional lint error, confirm CI fails; confirm a clean PR passes all four CI jobs; confirm branch protection actually blocks merge on failure (not just displays a red X).
- **Automated test requirements**: this package *is* the automated test requirement for the rest of the release — see Part 5.

### WP1.1 — Restaurant Hard-Delete Protection
- **Purpose**: close the highest-severity finding in the Phase 0 remediation plan — the restaurant "Delete" button performs a real hard delete that cascades (via `ON DELETE CASCADE`) to every table referencing `restaurants(id)`, including `orders` and `payments`.
- **Scope**: disable the delete button immediately; add a database-level `BEFORE DELETE` trigger that unconditionally blocks hard deletes on `restaurants`; replace `delete_restaurant_cascade` with a soft-delete function; drop the confirmed-dead `delete_promotion_cascade`; audit and fix any restaurant-list query missing a `deleted_at IS NULL` filter.
- **Files expected to change**: `app/admin/restaurants/[restaurantId]/page.tsx` (delete handler); new migration files (trigger, function replacement); any admin/public restaurant-list query found missing the soft-delete filter during the audit step (candidates already partially confirmed clean: `app/admin/restaurants/page.tsx`, `RestaurantOverviewTab.tsx`, `RestaurantMenusTab.tsx` — the audit's job is to find the remainder, if any, e.g. any super-admin restaurant list).
- **Database objects affected**: new trigger + trigger function on `public.restaurants`; `delete_restaurant_cascade` redefined/renamed to `soft_delete_restaurant`; `delete_promotion_cascade` dropped.
- **Application layers affected**: admin UI (one button/handler); no API route changes beyond the RPC name it calls.
- **Security implications**: this is the release's single highest-value security fix — closes an irrecoverable-data-loss path. The trigger provides defense-in-depth that holds even if the RPC fix is later reverted or bypassed by a different code path, since `SECURITY DEFINER` functions bypass RLS but cannot bypass a table-level trigger.
- **Dependencies**: none (can ship before or independent of every other package in this release).
- **Risk level**: Low to execute, would be Critical if skipped.
- **Acceptance criteria**: a direct `DELETE FROM restaurants` fails with a clear exception in every environment; the admin delete action soft-deletes (row persists, `deleted_at` set, child `orders`/`payments` unchanged); no admin or public list surfaces a soft-deleted restaurant.
- **Rollback strategy**: `DROP TRIGGER` reverts to pre-fix behavior (not recommended, but mechanically trivial for an emergency hotfix unrelated to this release); the RPC replacement's rollback is reverting to the previous function body (also not recommended, reintroduces the original risk).
- **Manual verification checklist**: attempt a direct SQL `DELETE FROM restaurants WHERE id = '<test-restaurant>'` in a non-production context only, confirm rejection; click the (re-enabled, post-fix) delete button on a disposable test restaurant, confirm it disappears from every list while its `orders`/`payments` rows remain queryable by ID.
- **Automated test requirements**: a test asserting the trigger rejects a direct delete; a test asserting the soft-delete function sets `deleted_at` and leaves child rows intact.

### WP1.2 — Restaurant Public-Read RLS Remediation
- **Purpose**: close the two wide-open `SELECT ... TO public USING (true)` policies on `restaurants` — one traced to an untracked legacy file, one with no source anywhere at all.
- **Scope**: verify no browser-side code depends on unconditioned anonymous restaurant reads; drop both open policies.
- **Files expected to change**: new migration file only, unless the verification step (below) finds a real dependent, in which case that dependent's read path needs to move to a service-role-backed route first (same treatment as WP1.3).
- **Database objects affected**: `restaurants` RLS policies — drop `"public read restaurants"` and `"allow select restaurants"`; `"owners read own restaurants"` (already correctly owner-scoped) is untouched.
- **Application layers affected**: none expected, pending verification.
- **Security implications**: closes unauthenticated platform-wide access to every restaurant's `contact_email`, `phone`, `address_line1`, `owner_name`, and other business-sensitive fields.
- **Dependencies**: none.
- **Risk level**: Low-Medium — the one open question (does anything actually depend on the open policy) must be resolved by verification, not assumption, before this ships.
- **Acceptance criteria**: anonymous `SELECT * FROM restaurants` via the anon key returns zero rows; every known public restaurant flow (`/r/[slug]`, `/r/[slug]/[touchpointCode]`, QR resolution, order placement, order tracking) continues to work end-to-end.
- **Rollback strategy**: `CREATE POLICY ... USING (true)` restores prior behavior — same-day hotfix only if the verification step missed a real dependent, never a standing option.
- **Manual verification checklist**: grep every browser-side (`'use client'`) component for `.from('restaurants')` calls using the anon-key client (not the service-role client) before merging; after merging, confirm the public restaurant page still loads correctly (it should, since it already resolves via the service-role client server-side).
- **Automated test requirements**: an RLS test (via `scripts/verify-rls.ts`, WP0) asserting an anon-key client cannot `SELECT` from `restaurants` at all.

### WP1.3 — Orders/Order Items RLS Remediation + Realtime Hardening
- **Purpose**: close the unconditional anonymous read access on `orders`/`order_items`, and separately fix the confirmed-unrelated `orders` realtime-publication gap that silently breaks the admin order list's live updates.
- **Scope**: drop `order_items_public_track` (zero current dependents, ships alone, no replacement needed); drop `orders_public_track` and replace `OrderTracker.tsx`'s direct anon-key `postgres_changes` subscription with a polling call to a new service-role-backed status endpoint; separately, add `orders` to the `supabase_realtime` publication (benefits the *admin* order list's already-correctly-scoped, currently-silently-broken subscription — confirmed this session via `pg_publication_tables`, not previously connected to this specific benefit in the Phase 0 remediation plan).
- **Files expected to change**: new migration files (two policy drops, one publication-membership addition); `app/r/order/[orderId]/OrderTracker.tsx` (rewritten to poll); new `app/api/public/orders/[orderId]/status/route.ts` (or equivalent, service-role-backed, returns only `{status, preparing_at, ready_at, completed_at}`).
- **Database objects affected**: drop `order_items_public_track`, drop `orders_public_track`; `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders`.
- **Application layers affected**: one customer-facing component (`OrderTracker.tsx`); one new thin API route.
- **Security implications**: closes unauthenticated bulk read of all 83+ orders and their line items across every restaurant. **New finding this session, materially relevant here**: because `orders` was never in the realtime publication to begin with, the live-tracking behavior this policy nominally supported has been silently non-functional regardless of RLS — dropping the policy causes no observable regression in practice, only a formal closing of an exposure that wasn't actually delivering the feature it was added for.
- **Dependencies**: the RLS drop and the polling replacement should land in the same release window, though (per the finding above) the drop itself is safe to merge first if sequencing pressure requires it — the risk this document's Release Overview flagged is about leaving zero working implementation of the feature, not about the drop causing a new regression.
- **Risk level**: Low (re-assessed down from the Phase 0 plan's original "Medium–High, coupled" framing, given the realtime-publication finding above).
- **Acceptance criteria**: anonymous bulk read of `orders`/`order_items` returns zero rows; the order tracker continues to reflect status changes within a defined polling interval; the admin order list's live updates (previously silently broken) start working once the publication fix ships.
- **Rollback strategy**: both policy drops are trivially reversible (`CREATE POLICY ... USING (true)`) as a same-day hotfix only; the publication addition is reversible via `ALTER PUBLICATION ... DROP TABLE`; the `OrderTracker.tsx` rewrite can revert to its previous subscription code, which would simply resume being non-functional as it already silently is today.
- **Manual verification checklist**: confirm `order_items_public_track` removal doesn't affect `/r/order/[orderId]`'s initial load (should be a no-op); confirm the new polling endpoint correctly reflects a staff-driven status change within the target interval; confirm the admin order list now receives live updates it previously didn't.
- **Automated test requirements**: RLS tests asserting anon cannot bulk-read `orders`/`order_items`; an integration test for the new status-polling endpoint's response shape and access control (must not leak fields beyond status/timestamps).

### WP1.4 — Coupon Ownership & Rate-Limit Hardening
- **Purpose**: close the live coupon-fraud gap — any valid, unexpired coupon at a restaurant is currently redeemable by anyone who obtains the code, with no rate limiting on issuance or redemption at all.
- **Scope**: apply the existing `lib/http/rate-limit.ts` limiters to the coupon issue and redemption/apply routes; add forensic-only `issuing_ip`/`issuing_user_agent` columns; verify (with an explicit test, not an assumption) that restaurant/promotion scoping in `resolveCouponDiscount()` already rejects cross-restaurant coupon application.
- **Files expected to change**: `app/api/coupons/issue/route.ts`; `lib/orders/apply-coupon-discount.ts` (redemption/apply path — wherever it's invoked from, likely `lib/orders/create-order.ts` or the payment orchestrator); new migration file.
- **Database objects affected**: `coupon_redemptions` — two new nullable columns.
- **Application layers affected**: two API routes gain rate-limit checks; issuance gains two new field writes.
- **Security implications**: rate limiting is the primary fraud-mitigation lever available without the full identity-based ownership model (correctly deferred to the Customer Identity Spine's later phases, per that document's own Phase 5 scoping — not rebuilt here).
- **Dependencies**: none.
- **Risk level**: Medium — rate-limit thresholds set too aggressively could block legitimate rapid multi-guest-at-one-table redemption; ship with a generous initial limit per the Phase 0 remediation plan's own recommendation.
- **Acceptance criteria**: rate limiting demonstrably triggers under a scripted rapid-repeat-request test; `issuing_ip`/`issuing_user_agent` populate on every new issuance; cross-restaurant coupon application is confirmed rejected by an explicit test.
- **Rollback strategy**: rate limiting is disableable via a threshold config change, not a code revert; the two new columns can be dropped with no dependent logic breaking (they are additive/forensic only).
- **Manual verification checklist**: issue a coupon, attempt to apply it against an order at a different restaurant, confirm rejection; rapidly repeat coupon issuance from one source, confirm the rate limit engages.
- **Automated test requirements**: a rate-limit trigger test per route; a cross-restaurant rejection test for `resolveCouponDiscount()`.

### WP1.5 — Coupon Redemption RLS Fix (Staff Validate Flow)
- **Purpose**: `coupon_redemptions` has RLS enabled with zero policies, which currently breaks the staff manual-redemption screen (`/admin/validate`) entirely — every lookup silently returns "not found" for a real, valid coupon.
- **Scope**: add an owner-scoped SELECT/UPDATE RLS policy on `coupon_redemptions` (defense-in-depth, mirroring the existing `promotion_rewards` pattern); move the actual redemption mutation from the browser (RLS-subject) client to a new service-role-backed API route.
- **Files expected to change**: `app/admin/validate/page.tsx`; new `app/api/admin/coupons/redeem/route.ts` (or equivalent); new migration file.
- **Database objects affected**: `coupon_redemptions` — one new RLS policy (SELECT + UPDATE, owner-scoped).
- **Application layers affected**: one admin screen's data-fetching/mutation path moves from direct client query to an API route.
- **Security implications**: the new route is also the natural place to apply WP1.4's rate limiting to staff-initiated redemptions, keeping the fraud-prevention logic in one place rather than duplicated across a client-side query and a server route.
- **Dependencies**: naturally shares files with WP1.4 (both touch coupon redemption) — recommend reviewing together, though neither blocks the other per the Phase 0 remediation plan's own dependency map.
- **Risk level**: Low — this fixes an already-broken feature; there is no working behavior to regress.
- **Acceptance criteria**: a restaurant owner/staff member can look up and redeem a real, valid coupon through `/admin/validate` end-to-end (currently fails 100% of the time — trivial to demonstrate broken-before/fixed-after).
- **Rollback strategy**: revert to the browser-client path (still broken, but no worse than the pre-release state); the new RLS policy can be dropped independently with no other dependent.
- **Manual verification checklist**: issue a test coupon, redeem it through `/admin/validate`, confirm success; confirm a restaurant owner cannot see or redeem another restaurant's coupons through the same screen.
- **Automated test requirements**: an end-to-end test of the lookup+redeem flow; an RLS/access-control test confirming cross-restaurant denial.

### WP1.6 — Marketing Consent Revocation
- **Purpose**: `customer_profiles.marketing_consent` can currently only move from `false` to `true` — there is no code path anywhere that revokes it, a live (if not yet triggered) compliance gap.
- **Scope**: remove the one-way-forward restriction in the existing identity-capture route so `marketing_consent: false` is accepted and written, always refreshing `marketing_consent_timestamp`.
- **Files expected to change**: `app/api/public/customer-identity/route.ts` only.
- **Database objects affected**: none (same columns, same table).
- **Application layers affected**: one API route's conditional logic.
- **Security implications**: closes a compliance gap ahead of any real outbound marketing communication existing to trigger it — deliberately minimal, per the Customer Identity Spine's own explicit scoping (the full channel-scoped `customer_consents` ledger is correctly deferred to that document's later phases, not built here).
- **Dependencies**: none.
- **Risk level**: Low.
- **Acceptance criteria**: a follow-up call with `marketing_consent: false` updates an existing row to `false` and refreshes the timestamp; a call with `marketing_consent: true` still works as before.
- **Rollback strategy**: revert the conditional — trivial, no data implications either direction since no revocation has ever been recorded yet to lose.
- **Manual verification checklist**: capture consent as `true`, then submit again as `false`, confirm the row reflects `false` with an updated timestamp.
- **Automated test requirements**: a unit/integration test asserting both directions of the write succeed.

### WP1.7 — Guest Attribution Observability
- **Purpose**: closes the one still-live (if currently low-incidence) piece of the historical "missing `guest_id`" finding — `join-session.ts`'s graceful degradation on a `session_guests` insert failure is silent (`console.warn` only), with no retry and no downstream visibility.
- **Scope**: add one bounded retry of the `session_guests` insert before giving up; upgrade the swallowed warning to a visible, monitorable signal. **Explicitly not in scope**: any UI-level gate on order submission tied to `guestId` readiness — the Phase 0 remediation plan's own re-verified data (zero incidents since 2026-06-29, the feature's launch date) shows this would add friction to effectively all traffic to guard against a condition with no recent occurrence.
- **Files expected to change**: `engine/session-presence/join-session.ts` only.
- **Database objects affected**: none.
- **Application layers affected**: one server-side session-resolution function.
- **Security implications**: none.
- **Dependencies**: none.
- **Risk level**: Low. Lowest priority in this release — ship whenever convenient within the release window.
- **Acceptance criteria**: a simulated `session_guests` insert failure is retried once and, if still failing, produces a visible/monitorable signal instead of a silent `console.warn`.
- **Rollback strategy**: revert the retry/logging change — trivial, no data implications.
- **Manual verification checklist**: simulate an insert failure (e.g., temporarily point at an invalid table name in a local/test environment) and confirm the retry fires and the failure is visibly logged.
- **Automated test requirements**: a unit test asserting one retry occurs before final failure is surfaced.

---

## Part 3 — Pull Request Plan

21 PRs, each independently reviewable, testable, deployable, and rollback-able. "Size" is relative (S/M/L), not a line count — reflects review complexity, not literal diff size.

| PR | Title | Purpose | Files | Size | Migration? | Feature Flag? | Deployment Risk | Rollback Method | Definition of Done |
|---|---|---|---|---|---|---|---|---|---|
| PR-001 | Add CI workflow (lint/typecheck/test/build) | Establish the PR gate | `.github/workflows/ci.yml` | S | No | No | None (tooling only) | Delete workflow file | CI runs on every PR; a deliberately-broken test PR is demonstrated to fail |
| PR-002 | Add `typecheck` script + fix surfaced errors | Make type-checking a fast, separate CI step | `package.json`, any file with a newly-surfaced type error | S-M (depends on error count) | No | No | Low | Revert script + fixes | `npm run typecheck` passes clean |
| PR-003 | Unit tests: `create-order.ts` | Regression-protect the idempotency/guest-attribution logic | `lib/orders/create-order.test.ts` | M | No | No | None | Delete test file | Idempotency and guest_id-sanitization paths covered |
| PR-004 | Unit tests: `payment-orchestrator.ts` | Regression-protect payment idempotency + compensating refund | `lib/payments/payment-orchestrator.test.ts` | M | No | No | None | Delete test file | Idempotency and compensating-refund paths covered |
| PR-005 | RLS verification script | Repeatable anon-key assertions against the 4 flagged tables | `scripts/verify-rls.ts` | S-M | No | No | None (read-only, anon key only) | Delete script | Script correctly reports current (pre-fix) exposure as a baseline |
| PR-006 | Disable restaurant delete button | Same-day stopgap, zero backend risk | `app/admin/restaurants/[restaurantId]/page.tsx` | S | No | No | None | Revert one component change | Delete action is disabled/replaced with a support-contact message |
| PR-007 | `BEFORE DELETE` trigger on `restaurants` | Database-level, unconditional hard-delete block | new migration | S | **Yes** | No | Low (additive, no existing legit path uses hard delete) | `DROP TRIGGER` | Direct `DELETE FROM restaurants` rejected in every environment |
| PR-008 | Replace `delete_restaurant_cascade` with soft-delete; drop `delete_promotion_cascade`; re-point UI | Close the root cause, not just the trigger symptom | new migration; `app/admin/restaurants/[restaurantId]/page.tsx` | M | **Yes** | No | Low-Medium (re-enables a previously-disabled action, so should ship after PR-007 is verified) | Revert function body; revert UI re-point | Delete button soft-deletes correctly; child data intact |
| PR-009 | Audit + fix missing `deleted_at` filters | Prevent soft-deleted restaurants leaking into lists | any restaurant-list query found non-compliant | S-M (depends on audit findings) | No | No | Low | Revert filter additions | No admin/public list shows a soft-deleted restaurant |
| PR-010 | Drop open `restaurants` SELECT policies | Close unauthenticated bulk-read exposure | new migration | S | **Yes** | No | Medium (pending pre-merge verification grep) | `CREATE POLICY ... USING (true)` (hotfix only) | Anon bulk-read of `restaurants` returns zero rows; all public flows still work |
| PR-011 | Drop `order_items_public_track` | Close unused, unconditional anon policy | new migration | S | **Yes** | No | Low (confirmed zero dependents) | `CREATE POLICY ... USING (true)` (hotfix only) | Anon bulk-read of `order_items` returns zero rows |
| PR-012 | Drop `orders_public_track` | Close unauthenticated bulk-read exposure on orders | new migration | S | **Yes** | No | Low (re-assessed — see WP1.3) | `CREATE POLICY ... USING (true)` (hotfix only) | Anon bulk-read of `orders` returns zero rows |
| PR-013 | Add `orders` to `supabase_realtime` publication | Fix the admin order list's silently-broken live updates | new migration | S | **Yes** | No | Low | `ALTER PUBLICATION ... DROP TABLE` | Admin order list receives live `UPDATE` events |
| PR-014 | Rewrite `OrderTracker.tsx` to poll | Replace the dropped anon realtime dependency with a working mechanism | `app/r/order/[orderId]/OrderTracker.tsx`, new status API route | M | No | No | Low-Medium (customer-facing UI change) | Revert component to previous subscription code (resumes its pre-existing silent non-function) | Tracker reflects a real status change within target polling interval |
| PR-015 | Apply rate limiting to coupon issue + redemption | Close the no-rate-limit gap | `app/api/coupons/issue/route.ts`, redemption/apply route | S-M | No | No | Low-Medium (threshold tuning risk) | Revert rate-limit calls | Rapid-repeat test triggers the limit; normal usage unaffected |
| PR-016 | Add `coupon_redemptions` forensic columns | Capture `issuing_ip`/`issuing_user_agent` | new migration; `app/api/coupons/issue/route.ts` | S | **Yes** | No | Low (additive, nullable) | Drop columns | Fields populate on every new issuance |
| PR-017 | Cross-restaurant coupon rejection test | Verify (not assume) existing scoping holds | new test file | S | No | No | None | Delete test | Test passes, confirming existing behavior is correct |
| PR-018 | Add owner-scoped RLS policy on `coupon_redemptions` | Defense-in-depth correctness fix | new migration | S | **Yes** | No | Low | Drop policy | Owner-scoped SELECT/UPDATE works; cross-restaurant denied |
| PR-019 | Service-role redemption route + `/admin/validate` update | Fix the actually-broken staff redemption flow | new API route; `app/admin/validate/page.tsx` | M | No | No | Low (fixes a currently-100%-broken flow) | Revert to browser-client path (no worse than before) | Staff can look up and redeem a real coupon end-to-end |
| PR-020 | Remove one-way consent restriction | Enable revocation | `app/api/public/customer-identity/route.ts` | S | No | No | Low | Revert conditional | Consent verified settable in both directions |
| PR-021 | `join-session.ts` retry + visible failure signal | Observability for the (now low-priority) guest-attribution gap | `engine/session-presence/join-session.ts` | S | No | No | Low | Revert change | Simulated failure retried once, then visibly logged |

### Reviewer checklist (applies to every PR above, restated once rather than duplicated 21 times)
- [ ] Does this PR touch exactly one concern (per Part 9's engineering standards), or should it be split further?
- [ ] If it includes a migration, is it the *only* schema change in the PR (never bundled with unrelated changes)?
- [ ] Does the PR description name the exact acceptance criteria from Part 2's matching work package?
- [ ] Does CI (PR-001 onward) pass?
- [ ] If the PR touches `restaurants`/`orders`/`order_items`/`coupon_redemptions` RLS, has the reviewer independently confirmed no other in-flight PR touches the same table's policies in the same window (Master Build Plan §5.2's merge-conflict hotspot)?
- [ ] Is the rollback method in the table above actually sufficient, or does this PR have a hidden forward-only dependency?

---

## Part 4 — Database Migration Plan

Eight migrations, each single-purpose, sequential same-day timestamps continuing the existing `YYYYMMDDHHMMSS_description.sql` convention (last existing file: `20260708000001_...`).

| # | Filename | Purpose | Order/Deps | Safe Deployment Strategy | Rollback | Backfill? | Downtime | Production Verification |
|---|---|---|---|---|---|---|---|---|
| 1 | `20260709000000_restaurants_block_hard_delete_trigger.sql` | `BEFORE DELETE` trigger + function on `restaurants` | Independent, ship first | Apply directly — purely additive, no existing legitimate path performs a hard delete | `DROP TRIGGER` + `DROP FUNCTION` | None | None | Attempt a direct delete on a disposable test row (non-production) or, in production, confirm via `pg_trigger` that the trigger exists and is enabled |
| 2 | `20260709010000_soft_delete_restaurant_function.sql` | Redefine `delete_restaurant_cascade` as `soft_delete_restaurant`; drop `delete_promotion_cascade` | After #1 (belt-and-suspenders — trigger should exist before the function that used to hard-delete is even touched) | Apply directly; pair with PR-008's UI re-point in the same deploy window | Revert function body/rename; the trigger from #1 still protects even if this rollback happens | None | None | Call the new function against a disposable test restaurant (non-production) or verify via `pg_proc` that the function body no longer contains a `DELETE FROM restaurants` statement |
| 3 | `20260709020000_drop_open_restaurants_select_policies.sql` | Drop `"public read restaurants"` and `"allow select restaurants"` | Independent; ship after the pre-merge verification grep (WP1.2) confirms no dependent | Apply directly once verification is clean | `CREATE POLICY "restore" ON restaurants FOR SELECT TO public USING (true);` (hotfix only) | None | None | `pg_policies` query confirms only owner-scoped policies remain; anon-key test query returns zero rows |
| 4 | `20260709030000_drop_order_items_public_track.sql` | Drop `order_items_public_track` | Independent, ship any time | Apply directly — confirmed zero dependents | Recreate policy (hotfix only) | None | None | `pg_policies` confirms removal; anon-key test query returns zero rows |
| 5 | `20260709040000_drop_orders_public_track.sql` | Drop `orders_public_track` | Recommend after PR-014 (OrderTracker replacement) is verified working, though not strictly blocking per this session's realtime-publication finding | Apply directly | Recreate policy (hotfix only) | None | None | `pg_policies` confirms removal; anon-key test query returns zero rows |
| 6 | `20260709050000_enable_realtime_orders.sql` | `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;` | Independent of #5; can ship any time, benefits the admin order list regardless of the customer-tracker fix's timing | Apply directly — purely additive publication membership | `ALTER PUBLICATION supabase_realtime DROP TABLE public.orders;` | None | None | `pg_publication_tables` confirms `orders` is present; admin order list observed to receive a live update after a manual status change |
| 7 | `20260709060000_coupon_redemptions_forensic_columns.sql` | Add `issuing_ip text`, `issuing_user_agent text` (nullable) to `coupon_redemptions` | Independent | Apply directly — additive, nullable | `ALTER TABLE coupon_redemptions DROP COLUMN issuing_ip, DROP COLUMN issuing_user_agent;` | None (forward-only forensic capture) | None | Issue a test coupon post-deploy, confirm both fields populate |
| 8 | `20260709070000_coupon_redemptions_owner_rls_policy.sql` | Add owner-scoped SELECT/UPDATE policy on `coupon_redemptions` | Independent | Apply directly | `DROP POLICY` | None | None | Owner-authenticated test query succeeds for own restaurant's coupons, fails for another's |

**Never combine unrelated schema changes**: confirmed — each migration above touches exactly one table for exactly one purpose. No migration in this plan bundles a policy change with a column addition, or touches two unrelated tables.

**Recommended staging approach (new, this document)**: this project currently has no isolated non-production database — Supabase database branching (`create_branch`/`merge_branch`/`reset_branch`) is available on this project but has never been used (confirmed via `list_branches`: only the default `main` branch exists). Recommend creating a short-lived Supabase branch to apply and verify migrations 1-8 against before applying to production, rather than the current implicit practice of applying directly to the only database that exists. This is a process recommendation, not a code change, and costs nothing to adopt starting with this release.

---

## Part 5 — Testing Strategy

**Current state, verified this session**: one test file platform-wide (`lib/session-play-state.test.ts`), no CI, `vitest` configured but essentially unused. Every recommendation below is sized against that real baseline, not an assumed mature test suite.

| Test type | Scope for Release 1 | Tooling |
|---|---|---|
| **Unit tests** | `create-order.ts` idempotency + guest_id sanitization (PR-003); `payment-orchestrator.ts` idempotency + compensating refund (PR-004); `join-session.ts` retry logic (PR-021); consent-toggle logic (PR-020) | `vitest` (already configured) |
| **Integration tests** | New coupon-redemption service-role route (PR-019); new order-status polling route (PR-014); rate-limit trigger behavior (PR-015) | `vitest` against a local/branch Supabase instance, or mocked Supabase client for pure-logic paths |
| **Database tests** | Trigger rejection (PR-007); soft-delete function correctness (PR-008); migration idempotency (each migration should be safely re-runnable or clearly marked as one-shot) | Direct SQL assertions, run against a Supabase branch (see Part 4) |
| **RLS tests** | The `scripts/verify-rls.ts` harness (PR-005) — anon-key assertions against `restaurants`, `orders`, `order_items`, `coupon_redemptions`; owner-key assertions confirming legitimate access is unaffected | Custom script using `@supabase/supabase-js` with the public anon key, runnable manually now and wired into CI once a Supabase branch is available for CI use |
| **Regression tests** | Every existing checkout/ordering/coupon-issuance flow, run manually against staging/preview before each production deploy in this release, per Part 6 | Manual, until WP0's coverage expands in later releases |
| **Manual QA** | Full checklist per work package (Part 2's "Manual verification checklist" fields) — assign to the QA engineer role per the Master Build Plan's track E |
| **Smoke tests** | Post-deploy: load the public menu page, place a test order, confirm it appears in the admin order list, confirm the order tracker loads | Manual, scripted as a repeatable checklist (candidate for future Playwright automation, not required for Release 1) |
| **Production verification** | Per-migration verification queries specified in Part 4's table | Direct SQL via Supabase MCP or dashboard |

### Recommended CI pipeline structure (PR-001)

```yaml
# .github/workflows/ci.yml — conceptual structure, not literal file content
on: pull_request (target: main)
jobs:
  lint:      next lint
  typecheck: npm run typecheck   (new script, PR-002)
  test:      npm run test        (vitest run)
  build:     next build
# All four required as passing status checks before merge (branch protection rule,
# configured once in GitHub repo settings — not expressible in the workflow file itself).
```

Recommend these four jobs run in parallel (independent, no job depends on another's output) to keep PR feedback fast given the team's current size.

---

## Part 6 — Deployment Plan

Given the confirmed absence of a dedicated staging environment (Vercel preview deployments point at the same, only Supabase project — there is no database isolation between preview and production today), the deployment flow below maps "staging" to Vercel's automatic per-PR preview deployment for **application code**, and to a Supabase branch (Part 4's recommendation) for **database changes** specifically.

| Stage | What happens | Applies to |
|---|---|---|
| **Development** | Feature branch off `main`, one PR per Part 3 row | All 21 PRs |
| **Review** | Reviewer checklist (Part 3, end); CI (PR-001) must be green | All 21 PRs |
| **Merge** | Squash or merge to `main` per existing repo convention | All 21 PRs |
| **Staging** | Vercel auto-generates a preview deployment per PR (application code); migrations (Part 4) should be applied to a Supabase branch first and verified there, not applied directly to production as the first test | App code: automatic. DB: manual, via the Part 4 recommendation |
| **Verification** | Manual verification checklist (Part 2, per work package) executed against the preview deployment / Supabase branch | All packages |
| **Production** | Merge to `main` auto-triggers a Vercel production deployment (existing, confirmed git-integrated pipeline — no change to this mechanism); migrations applied to the production Supabase project via `apply_migration`, following Part 4's order | All 21 PRs / 8 migrations |
| **Monitoring** | Immediately after each production migration, run the corresponding "Production Verification" query from Part 4; immediately after each app-code deploy, run the relevant smoke-test check (Part 5) | Per PR/migration |
| **Rollback** | Per the "Rollback Method"/"Rollback strategy" columns in Parts 3/4 — every item in this release has a same-day, low-complexity rollback path | Per PR/migration |
| **Post-deployment validation** | Re-run `get_advisors` (security) after the RLS-touching migrations (3, 4, 5, 8) to confirm no new `rls_enabled_no_policy` or always-true-policy findings appear | After migrations 3, 4, 5, 8 specifically |

---

## Part 7 — Risk Register

| Risk | Likelihood | Impact | Mitigation | Detection | Recovery |
|---|---|---|---|---|---|
| CI surfaces a large number of pre-existing type errors once `typecheck` is added (PR-002), delaying the release | Medium | Low-Medium (delay, not defect) | Scope PR-002 to allow a tracked, temporary `// @ts-expect-error` allowlist for pre-existing issues rather than blocking on fixing all of them at once, if the count is large | CI run on PR-002 itself | Triage errors into "fix now" vs. "track as follow-up debt," don't let this block PR-001's merge |
| Dropping `restaurants`' open RLS policies breaks an undiscovered browser-side dependency | Low (verification step is designed to catch this) | Medium (a public page could break) | Mandatory pre-merge grep (WP1.2's manual verification checklist) before PR-010 merges | Public flow smoke test post-deploy | Same-day policy-recreate hotfix, then re-investigate the real dependent and fix it properly |
| Rate-limit thresholds (PR-015) are set too aggressively and block legitimate rapid coupon redemption at a busy table | Medium | Low-Medium (degraded UX, not data loss) | Ship with a generous initial threshold per the Phase 0 remediation plan's own recommendation; treat as tunable config, not a code constant | User/restaurant-owner reports of blocked redemption | Adjust threshold, no rollback needed |
| The `BEFORE DELETE` trigger (PR-007) has an unforeseen interaction with a legitimate internal process that relies on hard-deleting a restaurant (none currently known) | Low | Medium (would block a legitimate operation until diagnosed) | None currently known to legitimately need hard delete; the soft-delete function (PR-008) is the sanctioned path for the one known legitimate use case (owner deletes their own restaurant) | Any future PR attempting a direct `DELETE FROM restaurants` fails immediately and loudly in CI/staging, not silently in production | `DROP TRIGGER` as an immediate hotfix, then design the sanctioned path for whatever the new legitimate need turns out to be |
| No isolated staging database means migrations are effectively tested for the first time against production | Medium (today); Low (once Part 4's Supabase-branch recommendation is adopted) | High if a migration is wrong | Adopt the Supabase branch workflow starting with this release's own migrations, not deferred to a future release | Migration failure or unexpected `pg_policies`/`pg_publication_tables` state post-apply | Each migration's rollback (Part 4) is a single reversing statement — apply it, then re-diagnose on the branch before retrying |
| `OrderTracker.tsx`'s polling replacement (PR-014) increases server load compared to the (already-broken) realtime subscription it replaces | Low | Low | Choose a conservative polling interval (10-15s is more than sufficient for a "your order is being prepared" status page); this is explicitly a lower-traffic concern than the security exposure it closes | Server metrics / Vercel function invocation counts post-deploy | Increase polling interval if needed; no data-safety implication either way |
| Two in-flight PRs both modify RLS policies on the same table in the same window, causing a merge conflict or a lost change | Medium (five-person team, several PRs touch the same 4 tables) | Low-Medium (review friction, not data risk) | Reviewer checklist's explicit cross-PR-awareness item (Part 3); sequence RLS-touching PRs (10, 11, 12, 18) through one reviewer's awareness rather than parallel-merging all four blind | Code review; CI would not catch this (it's a coordination issue, not a correctness one) | Rebase the losing PR, re-verify its migration still applies cleanly |

---

## Part 8 — Traceability Matrix

Every implementation task traces back to an approved architectural decision — no row in this release exists without a citation.

| Business Invariant | Architecture Document | Work Package | PR(s) | Migration | Test Suite | Production Verification |
|---|---|---|---|---|---|---|
| R-2 (restaurant deletion is never hard delete), O-2 (orders never disappear), SEC-6 (no competing deletion mechanisms) | Business Invariants §Restaurant, §Orders, §Security; Phase 0 Remediation Plan §Issue 1 | WP1.1 | PR-006, PR-007, PR-008, PR-009 | Migrations 1, 2 | DB trigger-rejection test; soft-delete correctness test | `pg_trigger` check; disposable-restaurant delete-flow test |
| SEC-1 (tenant boundaries are absolute) | Business Invariants §Security; Phase 0 Remediation Plan §Issue 4 (restaurants) | WP1.2 | PR-010 | Migration 3 | RLS anon-read test | `pg_policies` + anon-key query returns zero rows |
| SEC-1 (tenant boundaries are absolute) | Business Invariants §Security; Phase 0 Remediation Plan §Issue 3 (orders/order_items) | WP1.3 | PR-011, PR-012, PR-013, PR-014 | Migrations 4, 5, 6 | RLS anon-read tests; polling-endpoint integration test | `pg_policies` + `pg_publication_tables` + anon-key query + live-update smoke test |
| PR-1/SEC-2 (coupons require ownership validation) | Business Invariants §Promotions, §Security; Phase 0 Remediation Plan §Issue 2; Customer Identity Spine §6 | WP1.4 | PR-015, PR-016, PR-017 | Migration 7 | Rate-limit trigger test; cross-restaurant rejection test | Live rate-limit test; forensic-column population check |
| (Functional correctness, supports PR-1 enforcement) | Phase 0 Remediation Plan §Issue 7 | WP1.5 | PR-018, PR-019 | Migration 8 | End-to-end redemption test; RLS cross-restaurant denial test | Live redemption test through `/admin/validate` |
| C-6/SEC-3 (consent is channel-scoped and revocable) | Business Invariants §Customer Identity, §Security; Phase 0 Remediation Plan §Issue 5; Customer Identity Spine §8 | WP1.6 | PR-020 | None | Both-directions consent write test | Live consent-toggle verification |
| O-4 (orders always belong to exactly one attributable session/guest) | Business Invariants §Orders; Phase 0 Remediation Plan §Issue 6 (corrected finding); Customer Identity Spine §5 | WP1.7 | PR-021 | None | Simulated-failure retry test | Log/metric visibility check post-deploy |
| (Cross-cutting: safety net for every row above) | Master Build Plan §4 WP0; this document's own new finding (zero CI/test infra) | WP0 | PR-001 through PR-005 | None | Self-referential — CI is the test infrastructure | A deliberately-broken PR is demonstrated blocked from merge |

---

## Part 9 — Engineering Standards

Binding on this release and, per the Master Build Plan's own framing, on every release that follows — these are not Release-1-specific preferences.

- **Maximum PR size**: one concern per PR (Part 3's granularity is the standard, not an exception made for this release). A PR that touches both a migration and unrelated application logic should be split.
- **Migration rules**: one table, one purpose, per migration file (Part 4). Every migration ships with an explicit rollback statement identified before it merges, not improvised after a problem is found. No migration is combined with an unrelated schema change, per this task's own explicit constraint, now adopted as a standing rule.
- **Feature flag usage**: none of Release 1's fixes require a feature flag (they are corrections to existing broken/insecure behavior, not new optional product surface) — this is itself a useful calibration for future releases: a feature flag is for new, optional, or risky product surface, not for a security or correctness fix that should simply be correct as soon as it ships.
- **Logging requirements**: any code path that silently swallows an error (per WP1.7's finding) must be treated as a defect, not an acceptable pattern — going forward, a caught exception either gets handled meaningfully or gets logged visibly; "log and continue as if nothing happened" is not an acceptable default.
- **Audit logging**: out of scope for Release 1 by the Master Build Plan's own design (the unified audit trail work is Release 4's `order_events` and later `staff_audit_log`) — no PR in this release should attempt to build a parallel audit mechanism ahead of that work.
- **Security review**: every PR touching RLS, a `SECURITY DEFINER` function, or a secret-bearing code path requires review from whichever engineer is not the author, minimum — per the Master Build Plan's track assignment, this is the senior engineer's primary responsibility area for this release.
- **Performance review**: not a significant concern for this release's scope (no new high-traffic code paths beyond the polling endpoint, which is deliberately low-frequency) — standard code review is sufficient; no dedicated performance-review step required.
- **Backward compatibility**: every migration in Part 4 is additive or purely policy-level — no existing query, RLS-dependent read, or generated TypeScript type is broken by this release, consistent with this platform's established practice (confirmed across every migration this document specifies).
- **Documentation updates**: this document itself is the record of what Release 1 did — no additional architecture document update is required unless a Part-4 migration is found, during implementation, to contradict a binding architecture document, in which case that contradiction must be raised before proceeding, per this task's own constraint ("do not redesign architecture unless a direct contradiction is discovered").
- **Review checklist**: the per-PR checklist at the end of Part 3 is the standing template — copy it into every future release's implementation spec rather than re-deriving it.
