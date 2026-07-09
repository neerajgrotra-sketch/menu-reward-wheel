# Release 1 — Platform Stabilization: Implementation Specification v1.1

**Status:** Engineering execution plan. **No code implemented by this document.** Every PR, migration, and test below is a specification to execute against, not a completed change. **Supersedes v1** (`release-1-platform-stabilization-implementation-spec-v1.md`, kept as historical record) — this revision changes only sequencing, dependency notes, and rationale, per a dependency validation pass conducted after PR-001 and PR-002 were implemented. No scope, work package, or architectural decision from v1 was redesigned.
**Date:** 2026-07-09
**Binding inputs (not redesigned):** unchanged from v1 — `spinbite-business-invariants-v1.md`, `spinbite-phase-0-critical-remediation-plan-v1.md`, `spinbite-master-build-plan-v1.md` (source of Release 1's scope: WP0, WP1, WP5). The Canonical Domain Model, Customer Identity Spine, POS Integration Audit, Staff & Authentication, and Order Operations Engine documents are referenced only where Release 1 touches their concerns.

## Changelog (v1 → v1.1)

Approved sequencing changes from the post-PR-002 dependency validation pass, applied below:

1. **PR-003 and PR-004 are not true dependencies for any remaining Release 1 work.** Verified this revision by reading `lib/orders/create-order.ts` and `lib/payments/payment-orchestrator.ts` in full — no PR from 006 through 021 touches either file. Reordered both to late in the Part 3 sequence and reworded their "Purpose"/"Dependencies" language, which previously implied they protected upcoming changes.
2. **PR-007 (`BEFORE DELETE` trigger) has no dependency on PR-003/004/005 and is the highest production-risk reduction in the release.** Reordered PR-006/007 to immediately follow PR-002, ahead of the remaining WP0 items.
3. **PR-006 ships immediately before/alongside PR-007** — unchanged from v1's relative ordering, now moved earlier as a pair.
4. **PR-012 must precede PR-013 for a security reason v1 didn't state.** v1 described this pairing as "not strictly blocking." Corrected: enabling the `orders` realtime publication (PR-013) while `orders_public_track` (unconditional anon read) is still active would let anonymous clients subscribe to a *live feed* of every order change platform-wide — worse than the existing exposure. v1's numbering already had 012 before 013 by coincidence; this revision states the actual reason in Part 1, Part 2 (WP1.3), and Part 4 so it survives future reordering attempts.
5. **PR-008's UI re-enablement must not occur until PR-009 completes.** v1 implied PR-008 only depended on PR-007. Corrected: PR-008 bundles a DB-only change (safe as soon as PR-007 is verified) and a UI re-enablement step (must wait for PR-009's `deleted_at`-filter audit, or a freshly-soft-deleted restaurant can leak into an unaudited list). PR-008 is not split into two PRs — that would expand scope beyond a sequencing correction — but its row now states the internal ordering explicitly, and PR-009 is reordered ahead of it.
6. **PR-005 repositioned** immediately before the RLS-dropping PRs it verifies (010 onward), rather than sitting earlier in the WP0 cluster with no clear reason for its position.

**Not included in this revision**, pending separate approval: three additional observations from the same validation pass (a merge-conflict risk between PR-015/016 on `app/api/coupons/issue/route.ts`; PR-017 requiring zero new code; PR-019 not actually depending on PR-018) were not part of the approved change list and are intentionally left out of v1.1 rather than applied unilaterally.

**Current execution status**: PR-001 and PR-002 are implemented and verified (workflow file live, `typecheck` script live, both confirmed against the codebase post-Codespace-restart). Nothing else in Part 3 has been implemented yet.

---

## Part 1 — Release Overview

### Goals
Unchanged from v1: close every live correctness, security, and data-loss risk identified in the Phase 0 remediation plan, and establish the automated testing/CI foundation every subsequent release depends on. Ship zero new customer-facing product surface.

### Business value
Unchanged from v1.

### Architecture dependencies
Unchanged from v1 — Release 1 is the root of the Master Build Plan's dependency graph.

### Expected duration
Unchanged from v1 — not calendar-estimated.

### Blocking issues
**Revised in v1.1.** None external. Two internal sequencing constraints, both corrected in this revision:

1. **PR-012 (drop `orders_public_track`) must ship before PR-013 (add `orders` to the `supabase_realtime` publication) — a hard security dependency, not a soft preference.** If `orders` is added to the realtime publication while the unconditional anon-read policy is still active, anonymous clients gain the ability to subscribe to a live stream of every order change platform-wide via `postgres_changes`, delivered as changes happen — a strictly worse exposure than the current bulk-read-on-request one. Migration 5 (policy drop) must apply and be verified before Migration 6 (publication membership) applies.
2. **PR-009 (the `deleted_at` filter audit) must complete before PR-008's UI-re-enablement step, not after it.** PR-008's database half (replacing `delete_restaurant_cascade` with a soft-delete function) has no such constraint and may ship as soon as PR-007 is verified. Only the step that re-enables the delete button in the admin UI needs to wait for PR-009 — otherwise the first real soft-delete could leak into a list PR-009 hasn't audited yet.

The original v1 constraint (PR-012 should follow PR-014 for UX-continuity reasons) still holds as a soft preference, not a hard block, per the realtime-publication-gap finding already established before v1.1: the tracker's live-update behavior was already silently non-functional, so dropping the policy causes no regression in practice even if PR-014 hasn't landed yet.

### Success criteria
Unchanged from v1.

### Exit criteria
Unchanged from v1.

---

## Part 2 — Work Package Breakdown

Unchanged in structure and scope from v1 — eight work packages, same boundaries. Dependency notes updated within WP0, WP1.1, and WP1.3 only; every other field (Purpose, Scope, Files, Database objects, Application layers, Security implications, Risk level, Acceptance criteria, Rollback strategy, Manual verification checklist, Automated test requirements) is unchanged from v1 and not reproduced in full here except where noted — see v1 for the complete original text of every unmodified field.

### WP0 — CI & Automated Testing Foundation
- **Dependencies (revised in v1.1)**: none for the CI/typecheck items (PR-001/002, both shipped and verified). **`create-order.ts`/`payment-orchestrator.ts` test coverage (PR-003/004) is general regression-safety investment** — verified this revision, by reading both target files in full, to have zero technical relationship to any other Release 1 PR; no later work in this release touches either file. This does not make the tests less worth writing, but nothing downstream is waiting on them. **The RLS verification script (PR-005) is different**: it has a real, if soft, dependency relationship to WP1.2 and WP1.3 (PR-010, PR-011, PR-012, PR-018), which it exists to verify — it should land immediately before those, not simply "sometime in WP0."
- All other WP0 fields unchanged from v1.

### WP1.1 — Restaurant Hard-Delete Protection
- **Dependencies (revised in v1.1)**: none upstream from other work packages — and, per this revision's validation pass, no dependency on WP0's test-coverage items (PR-003/004) either, so this package should not wait behind them. Internally: PR-006 and PR-007 ship together with no dependency on each other beyond a clean release story; PR-008's database change (the soft-delete function) may ship as soon as PR-007 is verified, but **PR-008's UI-re-enablement step must wait for PR-009** (the `deleted_at` filter audit) — re-enabling the button before every restaurant-list read path is confirmed to filter `deleted_at` correctly risks a real soft-deleted restaurant briefly leaking into an unaudited list, which would directly violate PR-009's own acceptance criterion.
- All other WP1.1 fields unchanged from v1.

### WP1.2 — Restaurant Public-Read RLS Remediation
Unchanged from v1.

### WP1.3 — Orders/Order Items RLS Remediation + Realtime Hardening
- **Dependencies (revised in v1.1)**: the RLS drop (PR-012) and the polling replacement (PR-014) should still land in the same release window as a soft preference — the drop itself causes no regression if PR-014 hasn't shipped yet, since the tracker's live-update behavior was already silently non-functional (the pre-v1.1 finding). **A separate, harder dependency exists between PR-012 and PR-013 specifically**: PR-012 must complete before PR-013 ships, because Supabase Realtime respects RLS for `postgres_changes` delivery — enabling publication membership while the unconditional anon-read policy is still active would let anonymous clients subscribe to a live feed of every order change platform-wide, a materially worse exposure than the current bulk-read-on-request one. v1's PR numbering already had 012 before 013, but its stated rationale ("not strictly blocking") didn't capture why that specific pairing is a hard requirement — this revision corrects the stated reason so it survives a future reordering attempt that might otherwise "fix" the pairing based on the incomplete original text.
- All other WP1.3 fields unchanged from v1.

### WP1.4 — Coupon Ownership & Rate-Limit Hardening
Unchanged from v1.

### WP1.5 — Coupon Redemption RLS Fix (Staff Validate Flow)
Unchanged from v1.

### WP1.6 — Marketing Consent Revocation
Unchanged from v1.

### WP1.7 — Guest Attribution Observability
Unchanged from v1.

---

## Part 3 — Pull Request Plan

21 PRs, unchanged in content from v1 — **only the row order and specific dependency-relevant cells below are updated.** PR identifiers (PR-001 through PR-021) are stable labels referring to content, not execution position; the table is presented pre-sorted in the recommended execution order so the sequence is visible without renumbering.

**Recommended execution order**: 001 → 002 → 006 → 007 → 009 → 008 → 005 → 010 → 011 → 012 → 013 → 014 → 015 → 016 → 017 → 018 → 019 → 020 → 003 → 004 → 021.

| Order | PR | Status | Title | Purpose | Files | Size | Migration? | Deployment Risk | Rollback Method |
|---|---|---|---|---|---|---|---|---|---|
| 1 | PR-001 | ✅ Done | Add CI workflow (lint/typecheck/test/build) | Establish the PR gate | `.github/workflows/ci.yml` | S | No | None | Delete workflow file |
| 2 | PR-002 | ✅ Done | Add `typecheck` script + fix surfaced errors | Make type-checking a fast, separate CI step | `package.json` | S-M | No | Low | Revert script |
| 3 | PR-006 | Not started | Disable restaurant delete button | Same-day stopgap, zero backend risk | `app/admin/restaurants/[restaurantId]/page.tsx` | S | No | None | Revert one component change |
| 4 | PR-007 | Not started | `BEFORE DELETE` trigger on `restaurants` | Database-level, unconditional hard-delete block — **highest production-risk reduction in the release, no dependency on 003/004/005 (v1.1 finding)** | new migration | S | **Yes** | Low | `DROP TRIGGER` |
| 5 | PR-009 | Not started | Audit + fix missing `deleted_at` filters | Prevent soft-deleted restaurants leaking into lists — **moved ahead of PR-008 in v1.1; must complete before PR-008's UI step** | any restaurant-list query found non-compliant | S-M | No | Low | Revert filter additions |
| 6 | PR-008 | Not started | Replace `delete_restaurant_cascade` with soft-delete; drop `delete_promotion_cascade`; re-point UI | Close the root cause, not just the trigger symptom | new migration; `app/admin/restaurants/[restaurantId]/page.tsx` | M | **Yes** | Low-Medium — **the DB half may ship right after PR-007; the UI re-enablement half must wait for PR-009 (v1.1 correction)** | Revert function body; revert UI re-point |
| 7 | PR-005 | Not started | RLS verification script | Repeatable anon-key assertions against the 4 flagged tables — **repositioned in v1.1 to sit immediately before the RLS PRs it verifies** | `scripts/verify-rls.ts` | S-M | No | None | Delete script |
| 8 | PR-010 | Not started | Drop open `restaurants` SELECT policies | Close unauthenticated bulk-read exposure | new migration | S | **Yes** | Medium (pending pre-merge verification grep) | `CREATE POLICY ... USING (true)` (hotfix only) |
| 9 | PR-011 | Not started | Drop `order_items_public_track` | Close unused, unconditional anon policy | new migration | S | **Yes** | Low (confirmed zero dependents) | `CREATE POLICY ... USING (true)` (hotfix only) |
| 10 | PR-012 | Not started | Drop `orders_public_track` | Close unauthenticated bulk-read exposure on orders — **must precede PR-013 (v1.1 hard dependency, see Part 1/Part 2)** | new migration | S | **Yes** | Low | `CREATE POLICY ... USING (true)` (hotfix only) |
| 11 | PR-013 | Not started | Add `orders` to `supabase_realtime` publication | Fix the admin order list's silently-broken live updates — **requires PR-012 to have shipped first (v1.1 hard dependency)** | new migration | S | **Yes** | Low, conditional on PR-012 having shipped | `ALTER PUBLICATION ... DROP TABLE` |
| 12 | PR-014 | Not started | Rewrite `OrderTracker.tsx` to poll | Replace the dropped anon realtime dependency with a working mechanism | component + new status route | M | No | Low-Medium | Revert component (resumes pre-existing silent non-function) |
| 13 | PR-015 | Not started | Apply rate limiting to coupon issue + redemption | Close the no-rate-limit gap | issue + redemption routes | S-M | No | Low-Medium (threshold tuning) | Revert rate-limit calls |
| 14 | PR-016 | Not started | Add `coupon_redemptions` forensic columns | Capture `issuing_ip`/`issuing_user_agent` | new migration; issue route | S | **Yes** | Low | Drop columns |
| 15 | PR-017 | Not started | Cross-restaurant coupon rejection test | Verify (not assume) existing scoping holds | new test file | S | No | None | Delete test |
| 16 | PR-018 | Not started | Add owner-scoped RLS policy on `coupon_redemptions` | Defense-in-depth correctness fix | new migration | S | **Yes** | Low | Drop policy |
| 17 | PR-019 | Not started | Service-role redemption route + `/admin/validate` update | Fix the actually-broken staff redemption flow | new route; admin page | M | No | Low | Revert to browser-client path |
| 18 | PR-020 | Not started | Remove one-way consent restriction | Enable revocation | one route file | S | No | Low | Revert conditional |
| 19 | PR-003 | Not started | Unit tests: `create-order.ts` | **General regression-safety investment (v1.1: confirmed no later PR touches this file — not a dependency for anything else in this release)** | `lib/orders/create-order.test.ts` | M | No | None | Delete test file |
| 20 | PR-004 | Not started | Unit tests: `payment-orchestrator.ts` | **Same status as PR-003 (v1.1)** | `lib/payments/payment-orchestrator.test.ts` | M | No | None | Delete test file |
| 21 | PR-021 | Not started | `join-session.ts` retry + visible failure signal | Observability for the (low-priority) guest-attribution gap | `engine/session-presence/join-session.ts` | S | No | Low | Revert change |

All fields not shown in this table (Definition of Done, full Purpose text for unchanged rows) are unchanged from v1 — refer to v1 for the complete original per-PR detail; only the ordering and the cells shown above changed.

### Reviewer checklist (unchanged from v1)
- [ ] Does this PR touch exactly one concern (per Part 9's engineering standards), or should it be split further?
- [ ] If it includes a migration, is it the *only* schema change in the PR (never bundled with unrelated changes)?
- [ ] Does the PR description name the exact acceptance criteria from Part 2's matching work package?
- [ ] Does CI (PR-001 onward) pass?
- [ ] If the PR touches `restaurants`/`orders`/`order_items`/`coupon_redemptions` RLS, has the reviewer independently confirmed no other in-flight PR touches the same table's policies in the same window?
- [ ] Is the rollback method in the table above actually sufficient, or does this PR have a hidden forward-only dependency?
- [ ] **(New in v1.1)** If this PR is PR-013, has PR-012 already shipped and been verified? If this PR is PR-008's UI-re-enablement step, has PR-009 already shipped?

---

## Part 4 — Database Migration Plan

Same eight migrations as v1, same filenames — **only the "Order/Deps" column for migrations 2, 5, and 6 is revised.**

| # | Filename | Purpose | Order/Deps (v1.1) | Safe Deployment Strategy |
|---|---|---|---|---|
| 1 | `20260709000000_restaurants_block_hard_delete_trigger.sql` | `BEFORE DELETE` trigger + function on `restaurants` | Independent, ship first | Unchanged from v1 |
| 2 | `20260709010000_soft_delete_restaurant_function.sql` | Redefine `delete_restaurant_cascade` as `soft_delete_restaurant`; drop `delete_promotion_cascade` | After #1. **Revised in v1.1**: this migration itself (the database function) has no dependency on PR-009 — it may apply as soon as #1 is verified. Only the *application-layer* re-enablement of the delete button (part of PR-008, not this migration) must wait for PR-009 to complete. v1 paired "apply with PR-008's UI re-point in the same deploy window" without distinguishing these two — corrected here. | Apply directly once #1 is verified |
| 3 | `20260709020000_drop_open_restaurants_select_policies.sql` | Drop the two open `restaurants` SELECT policies | Independent; after the pre-merge verification grep confirms no dependent | Unchanged from v1 |
| 4 | `20260709030000_drop_order_items_public_track.sql` | Drop `order_items_public_track` | Independent, ship any time | Unchanged from v1 |
| 5 | `20260709040000_drop_orders_public_track.sql` | Drop `orders_public_track` | **Revised in v1.1**: must apply and be verified **before Migration 6**, for a security reason — not just recommended before PR-014 for UX-continuity reasons as v1 stated. See Part 1. | Apply directly; confirm removal via `pg_policies` before proceeding to Migration 6 |
| 6 | `20260709050000_enable_realtime_orders.sql` | `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;` | **Revised in v1.1**: **requires Migration 5 to have applied and been verified first** — enabling publication membership while `orders_public_track` is still active would let anonymous clients subscribe to a live feed of all order changes platform-wide. v1 described this as "independent of #5, can ship any time" — that was incorrect and is corrected here. | Apply only after confirming (via `pg_policies`) that `orders_public_track` no longer exists |
| 7 | `20260709060000_coupon_redemptions_forensic_columns.sql` | Add `issuing_ip`, `issuing_user_agent` to `coupon_redemptions` | Independent | Unchanged from v1 |
| 8 | `20260709070000_coupon_redemptions_owner_rls_policy.sql` | Add owner-scoped SELECT/UPDATE policy on `coupon_redemptions` | Independent | Unchanged from v1 |

All other Part 4 content (Rollback, Backfill, Downtime, Production Verification columns; the "never combine unrelated schema changes" note; the recommended Supabase-branch staging approach) is unchanged from v1.

---

## Part 5 — Testing Strategy

Unchanged from v1 in its entirety — the testing scope described there (what gets tested) is independent of execution order (when it gets tested). No revision needed.

---

## Part 6 — Deployment Plan

Unchanged from v1 in its entirety.

---

## Part 7 — Risk Register

Unchanged from v1, plus one new entry reflecting the v1.1 correction:

| Risk | Likelihood | Impact | Mitigation | Detection | Recovery |
|---|---|---|---|---|---|
| **(New in v1.1)** A future engineer, unaware of the security rationale, reorders PR-013 ahead of PR-012 because v1's stated dependency ("not strictly blocking") didn't explain why the order mattered | Low (now that the rationale is stated explicitly in Part 1/Part 2/Part 4) | High if it happens (opens a live anonymous order feed, worse than the original exposure) | This revision's Changelog and the explicit rationale now present in three places (Part 1, Part 2 WP1.3, Part 4 Migration 6) | Migration 6 should never apply successfully in an environment where `orders_public_track` still exists — recommend the migration itself include a guard (e.g., check the policy is absent before proceeding) at implementation time | Immediately revoke publication membership (`ALTER PUBLICATION ... DROP TABLE`) if this sequencing is ever violated in production |

All eight original risk entries from v1 are unchanged and still apply.

---

## Part 8 — Traceability Matrix

Unchanged from v1 — PR identifiers did not change, so every row remains accurate without modification.

---

## Part 9 — Engineering Standards

Unchanged from v1, plus one addition:

- **Sequencing changes require a versioned spec revision, not a silent reorder.** This document (v1.1) is itself the precedent: when a dependency validation pass changes execution order, it produces a new version of the implementation spec with an explicit changelog, rather than editing PR order in place with no record of why. Future releases' implementation specs should follow the same pattern.

All other Part 9 content is unchanged from v1.
