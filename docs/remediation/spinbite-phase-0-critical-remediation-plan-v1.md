# SpinBite Phase 0 — Critical Remediation Plan v1

**Status:** Planning only. **No code, no migrations, in this document.**
**Date:** 2026-07-08
**Purpose:** A production-safe plan to fix the seven critical live risks named in the task, before any POS connector, AI automation, or new commerce feature work begins.
**Verification method:** Every claim below was re-verified live this session — not carried forward from the four prior documents without a fresh check. This included: exact FK cascade rules for every table referencing `restaurants(id)` (`information_schema.referential_constraints`), the exact live RLS policy definitions on `restaurants`/`orders`/`order_items`/`coupon_redemptions` (`pg_policies`), a fresh code trace of `TouchpointMenuPage.tsx`/`join-session.ts`/`create-order.ts`, a day-by-day breakdown of the `orders.guest_id` gap, and a trace of exactly what `app/r/order/[orderId]/OrderTracker.tsx` depends on. **One finding from a prior document is corrected below (§Issue 6) based on this re-verification — it is not the live bug it was previously framed as.**

---

## 1. Executive Summary

Of the seven named issues, re-verification confirms six are live, real, and require action — and reveals one (#6, the guest_id gap) is substantially less urgent than previously framed. It also surfaces one new fact that materially changes the risk profile of the single worst issue: **the restaurant hard-delete function likely already fails at runtime** due to an unrelated schema change, which may currently be *preventing* data loss by accident rather than causing it — but this must not be mistaken for the issue being resolved, because the function is still fundamentally wrong and a single unrelated fix to it would silently reactivate full destructive capability.

**The single highest-leverage fix in this entire plan is a database-level trigger, not an application change.** Blocking `DELETE` on `restaurants` at the database level with a `BEFORE DELETE` trigger closes the worst-case scenario (Issue 1) permanently and unconditionally — regardless of whether the broken RPC is ever called again, regardless of whether some future engineer or AI agent writes a new deletion code path, and regardless of whether today's specific bug is ever "fixed" in a way that accidentally re-enables it. This ships first, alone, same-day, with no application code changes at all.

**Three issues can each ship independently, today, with no dependencies**: Issue 1's database trigger, dropping the unused `order_items_public_track` policy (part of Issue 3), and the marketing-consent ratchet removal (Issue 5). **Two issues are coupled and must ship together**: fixing the `orders` anon-read policy (Issue 3) requires simultaneously replacing the mechanism `OrderTracker.tsx` depends on for live status updates (traced precisely in §Issue 3), or customers lose real-time order tracking. **One issue requires no code change at all, only a UI change**: disabling the restaurant delete button (Issue 1's immediate stopgap).

**No feature freeze is required.** Every fix in this plan is additive or narrowly corrective; none require pausing unrelated feature work. The one exception worth naming explicitly: any in-flight PR that touches `app/admin/restaurants/[restaurantId]/page.tsx`'s delete handling, RLS policies on the four named tables, or the coupon redemption/apply path should be paused or coordinated with this plan specifically, to avoid a merge race with these fixes.

---

## 2. Explicit Answers to the Design Questions

**1. Should the restaurant delete button be disabled immediately, before the soft-delete migration is built?**
Yes — same day, as a UI-only change with zero backend risk. This is the cheapest possible risk reduction available (hide the button, or replace its handler with a "contact support to delete your restaurant" message) and should not wait for the database trigger or the soft-delete rewrite, both of which need a normal (if fast) review cycle. See §Issue 1.

**2. Should `delete_restaurant_cascade` be removed, replaced, or modified to soft-delete?**
Replaced. Modifying it in place to soft-delete (i.e., patching its body to `UPDATE ... SET deleted_at` instead of the cascade of `DELETE`s) is functionally equivalent to replacement and is the recommended path — but the function should also be renamed (e.g., `soft_delete_restaurant`) so its name stops asserting a cascade-delete behavior it no longer has. `delete_promotion_cascade` (confirmed dead — zero call sites anywhere in the app) should simply be dropped, not repaired, since nothing depends on it and repairing dead code adds no value.

**3. Should historical orders/payments be protected by database constraints even if app code has a bug?**
Yes, unconditionally, and this is the plan's top recommendation. A `BEFORE DELETE` trigger on `restaurants` that unconditionally raises an exception makes hard-delete structurally impossible regardless of what any current or future application code, RPC, admin script, or AI agent attempts. This is strictly stronger protection than fixing the one known broken code path, because it also protects against paths not yet written. RLS cannot provide this protection — `SECURITY DEFINER` functions run with the function owner's privileges and bypass RLS entirely by design, which is exactly why `delete_restaurant_cascade` was never blocked by any existing policy. The trigger is the correct enforcement point.

**4. What is the safest coupon ownership model using the current schema?**
Not a full identity-binding rebuild (explicitly out of scope for Phase 0) — a layered, current-schema-only tightening: (a) confirm restaurant/promotion scoping in `resolveCouponDiscount()` is airtight (it already appears to be, verify explicitly, cheap); (b) apply the existing `lib/http/rate-limit.ts` utility to the issuance and redemption endpoints, which currently have no rate limiting at all; (c) capture `issuing_ip`/`issuing_user_agent` at issuance (two new nullable columns, no new tables, no identity model) purely as a forensic/staff-visibility signal; (d) route `/admin/validate`'s redemption action through a service-role API endpoint instead of the browser client, so staff-assisted redemption becomes the reliable, auditable path while the RLS fix (Issue 7) is also landing. Full session/customer-based ownership binding remains correctly scoped to the Customer Identity Spine's Phase 5, not Phase 0.

**5. How should coupon redemption behave if the customer/guest identity is unknown?**
Exactly as it does today — it must succeed. Nothing in this plan blocks or degrades anonymous coupon redemption; that would violate the platform's own anonymous-first constitutional rule (C-2/PR-5). The fixes in question 4 add visibility and rate-limiting, not identity requirements.

**6. What is the minimum RLS policy set needed for orders, order_items, restaurants, and coupon_redemptions?**
- `restaurants`: owner-scoped SELECT/INSERT/UPDATE only (already exist, correctly scoped) — drop both open `SELECT ... USING (true)` policies. No anon policy needed at all, provided the pre-deployment check in §Issue 4 confirms no browser-side code depends on one (the public restaurant page already reads via the service-role client server-side).
- `orders`: owner-scoped SELECT only (already exists, correctly scoped) — drop `orders_public_track`, replacing the mechanism it enabled (see Issue 3). No anon policy needed once the replacement ships.
- `order_items`: owner-scoped SELECT only (already exists) — drop `order_items_public_track` immediately; confirmed zero current dependents.
- `coupon_redemptions`: add one owner-scoped SELECT/UPDATE policy (restaurant-scoped, mirroring the pattern already used on `promotion_rewards`) as defense-in-depth, and move `/admin/validate`'s actual mutation through a service-role route as the primary fix (per question 4).

**7. How should marketing consent revocation be represented without overbuilding a full consent ledger yet?**
Remove the one-way-forward restriction in `app/api/public/customer-identity/route.ts` so `marketing_consent` can be set to `false`, not just `true` — a one-line logic change to an existing route, no new table. This closes the invariant violation (a consent flag that can only move forward is not a consent record) using the current schema. It deliberately does not build a self-service opt-out UI or a channel-scoped consent ledger — there is no live outbound marketing communication for a customer to opt out of yet (`campaigns` is a dead, empty table), so building that UI now would be solving a problem that doesn't exist yet. The full `customer_consents` ledger remains correctly scoped to Identity Spine Phase 2/9, to build when real campaign sending is imminent, not before.

**8. What is the smallest fix for the `TouchpointMenuPage` guest_id race?**
Re-scoped based on this session's fresh data: it is not an active race requiring a UI gate. See §Issue 6 for the full correction. The smallest appropriate fix is an observability improvement in `join-session.ts` (upgrade a swallowed `console.warn` to something that surfaces a metric/alert) plus one bounded retry of the `session_guests` insert before giving up — not a submit-button gate, which would add friction to effectively 100% of real traffic to guard against a condition that affected 0 of the last 18 relevant orders.

**9. Which issue must be fixed first, and why?**
Issue 1's database trigger. It is the single highest-severity finding, requires zero application code changes, cannot be broken by any other change in this plan, and closes the worst-case outcome (irrecoverable loss of a restaurant's entire commercial history) permanently in one small, self-contained change. Every other issue in this plan is either a narrower exposure (affecting specific data categories, not "everything") or a lower-severity functional bug. The delete-button UI disable (question 1) should land same-day alongside or just before it, since it costs nothing and further reduces exposure while the trigger is reviewed.

**10. What should block future PRs until resolved?**
Per the companion constitutional document's priority scale: any PR that (a) adds or modifies a `DELETE` code path against `restaurants`, `orders`, or `payments`, (b) adds or modifies an RLS policy on any of the four tables named in this plan, or (c) touches coupon redemption/application logic, should not merge until the corresponding fix in this plan has shipped — not because the PR itself is necessarily unsafe, but because reviewing it correctly requires the fixed baseline to reason from. This is a narrow, time-boxed gate tied to this remediation, not a general new PR-review policy.

---

## 3. Critical Risk Ranking

| # | Issue | Severity | Live/Active? | Fix complexity |
|---|---|---|---|---|
| 1 | Restaurant hard delete cascades to orders/payments/everything | Critical | Likely currently non-functional (see §Issue 1) but structurally live | Trivial (DB trigger) + Small (RPC replace) |
| 2 | Coupon redemption ownership fraud gap | Critical | Live, ongoing | Small |
| 3 | `orders`/`order_items` unconditional anon read | High | Live, ongoing | Small–Medium (coupled to realtime replacement) |
| 4 | `restaurants` public-read RLS drift (incl. orphan policy) | High | Live, ongoing | Small |
| 5 | `marketing_consent` cannot be revoked | High (compliance-latent) | Live, ongoing, but zero current real-world trigger (no campaigns exist yet) | Trivial |
| 7 | `coupon_redemptions` zero RLS breaks staff redemption | Medium (functional bug, not exposure) | Live, ongoing | Small |
| 6 | `guest_id` gap in ordering flow | **Downgraded to Low** — historical only, zero live incidence since 2026-06-29 | Not currently active | Trivial (observability only) |

---

## 4. Dependency Map

```
Issue 1 (DB trigger)          — fully independent, ships alone, first
Issue 1 (delete button UI)    — fully independent, ships alone, same day, no dependency on the trigger
Issue 1 (RPC replace)         — depends on nothing, but should land after the trigger is live (belt + suspenders order)

Issue 4 (restaurants RLS)     — independent; verify no browser-side restaurants read exists first (cheap check)

Issue 3 (orders/order_items)  — order_items_public_track: fully independent, ships alone, zero dependents
                               — orders_public_track: MUST ship together with OrderTracker's replacement
                                 mechanism (polling or Broadcast) — these two are one atomic unit of work

Issue 5 (consent ratchet)     — fully independent, ships alone

Issue 7 (coupon_redemptions RLS) — independent; can ship alongside Issue 2's rate-limiting work
                                    since both touch the same route file, but neither blocks the other

Issue 2 (coupon ownership)    — independent of everything else; touches lib/orders/apply-coupon-discount.ts
                                 and app/api/coupons/issue/route.ts, disjoint from all other issues' files

Issue 6 (guest_id)            — independent, lowest priority, can ship whenever convenient
```

No issue in this plan blocks any other. The only *coupled pair* is Issue 3's two policies — `order_items_public_track` can drop immediately, but `orders_public_track` cannot drop without its replacement shipping in the same change.

---

## 5. Issue-by-Issue Remediation Plan

### Issue 1 — Restaurant hard delete destroys historical orders/payments

**Current behavior**: `app/admin/restaurants/[restaurantId]/page.tsx:113-126` wires the "Delete" button's confirm action to `.rpc('delete_restaurant_cascade', {target_restaurant_id})`. That function (verified via `pg_get_functiondef` this session):
```sql
CREATE OR REPLACE FUNCTION public.delete_restaurant_cascade(target_restaurant_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from restaurants where id = target_restaurant_id and owner_id = auth.uid()) then
    raise exception 'Restaurant not found or not owned by current user';
  end if;
  delete from rewards where restaurant_id = target_restaurant_id;
  delete from promotions where restaurant_id = target_restaurant_id;
  delete from menu_items where restaurant_id = target_restaurant_id;
  delete from menus where restaurant_id = target_restaurant_id;
  delete from restaurants where id = target_restaurant_id;
end;
$function$
```

**New finding this session, materially changing the risk assessment**: `menus.restaurant_id` **does not exist** in the live schema — it was removed by the 2026-07-03 Menu Library v1 migration, which rescoped `menus` to `owner_id` and moved the restaurant relationship to `restaurant_menu_assignments`. The line `delete from menus where restaurant_id = target_restaurant_id;` references a column that has not existed for five days as of this writing. Executing this function today almost certainly raises a runtime SQL error (`column "restaurant_id" does not exist`) at that statement — and because a single top-level function call is one transaction, the earlier `delete from rewards`/`delete from promotions`/`delete from menu_items` statements would roll back along with it. **This means the delete button, if clicked today, most likely errors out rather than succeeding — probably preventing data loss by accident, not by design.** This was not confirmed by executing the function (correctly avoided, given the destructive potential if the reasoning is wrong) — it is a strong inference from the verified schema mismatch, not a certainty, and must not be treated as "the issue is resolved." A future, unrelated fix to the `menus` line (e.g., someone "helpfully" updates it to `delete from restaurant_menu_assignments where restaurant_id = ...` while doing unrelated menu work) would silently reactivate full destructive capability with no review of this specific risk.

**Full cascade scope, now completely verified** (`information_schema.referential_constraints`, all FKs to `restaurants(id)`): every one of `orders`, `payments`, `promotions`, `promotion_rewards`, `rewards`, `menu_items`, `restaurant_menu_assignments`, `restaurant_touchpoints`, `restaurant_capabilities`, `restaurant_settings`, `restaurant_order_counters`, `visit_sessions`, `session_guests`, `session_events`, `live_interventions`, `intervention_events`, `image_generation_jobs`, `ai_generated_assets`, `restaurant_intelligence_profile`, `intelligence_usage_limits`, `campaigns`, `guest_sessions` carries `ON DELETE CASCADE` to `restaurants`. `intelligence_generation_logs.restaurant_id` is the one exception (`SET NULL`, preserving the log row). `order_items.restaurant_id` itself is `NO ACTION`, but `order_items` is separately cascade-linked via `order_id → orders(id) ON DELETE CASCADE`, so it is still fully destroyed transitively through `orders`. **This is a larger blast radius than the function's own five `DELETE` statements suggest** — a successful hard delete would destroy essentially every record the restaurant ever produced platform-wide, not just the four tables the function explicitly names.

**Invariant violated**: R-2 (restaurant deletion is never hard delete), O-2 (orders never disappear), SEC-6 (competing deletion mechanisms).

**Production impact**: If the function is currently broken as inferred, impact today is "confusing error shown to an owner clicking Delete" rather than data loss — still a bug, much lower severity than previously assessed. If the inference is wrong, or if the function is ever "fixed" without this context, impact is full, silent, irrecoverable loss of a restaurant's entire order/payment/session/intelligence history in one click.

**User/business risk**: Reputational and legal (loss of financial records) if triggered; today, more likely a confusing broken-button UX bug.

**Proposed fix** (in order):
1. Disable the delete button in the admin UI (§ Design Question 1) — same day, zero risk.
2. Add a `BEFORE DELETE` trigger on `public.restaurants` that unconditionally raises an exception, making hard delete structurally impossible regardless of caller or code path.
3. Replace `delete_restaurant_cascade`'s body with a soft-delete (`UPDATE restaurants SET deleted_at = now() WHERE id = target_restaurant_id AND owner_id = auth.uid()`), rename to `soft_delete_restaurant`, and re-point the admin UI's delete handler at it.
4. Drop `delete_promotion_cascade` (confirmed dead code, zero call sites).
5. Audit every restaurant-joined read path for a missing `deleted_at` filter (per constitutional rule R-5) before re-enabling the delete button in the UI — a restaurant that's soft-deleted but still appears in an active list is a regression of its own.

**Database changes required**: One `BEFORE DELETE` trigger + trigger function on `restaurants`; one function replacement (`delete_restaurant_cascade` → `soft_delete_restaurant`, or in-place body rewrite with a rename); one `DROP FUNCTION delete_promotion_cascade`.

**Application changes required**: Re-point the delete button's RPC call to the new function name; add/confirm `deleted_at IS NULL` filtering on every restaurant-list/detail query (several already do this per the confirmed audit — `app/admin/restaurants/page.tsx`, `RestaurantOverviewTab.tsx`, `RestaurantMenusTab.tsx` — verify the remainder, e.g. any super-admin restaurant list).

**RLS/security changes required**: None directly — this is a trigger/function fix, not an RLS fix, since `SECURITY DEFINER` bypasses RLS regardless. Worth noting explicitly so nobody mistakes an RLS policy addition as sufficient protection here.

**Backfill or data repair needed**: None currently known — no restaurant appears to have been successfully hard-deleted yet (all 12 live restaurants are present and accounted for in this session's row counts). If a staging/test verification (below) reveals the function does still succeed in some path not yet considered, an immediate incident-response check of restaurant/order/payment counts against expectations would be needed before shipping anything else in this plan.

**Test plan**: In a non-production environment only — attempt to call `delete_restaurant_cascade` against a disposable test restaurant to confirm the "likely broken" inference before relying on it for prioritization (do not run this against production data, and do not run it at all if a safe non-production environment isn't available — treat the inference as sufficient without execution-based confirmation in that case). After the trigger ships: attempt a direct `DELETE FROM restaurants` in a non-production environment and confirm it's rejected. After the RPC replacement ships: confirm `soft_delete_restaurant` sets `deleted_at` and that the restaurant disappears from every admin list but its `orders`/`payments` rows remain queryable by ID.

**Rollback plan**: The trigger can be dropped in one statement if it's ever found to block a legitimate operation (none is currently known — restaurants are never hard-deleted by any other legitimate path). The RPC replacement's rollback is reverting to the previous function body — not recommended, since that reintroduces the original risk, but mechanically trivial if ever needed for a hotfix reason unrelated to this plan.

**Deployment order**: Delete button disabled (same day) → trigger (next) → RPC replacement + admin UI re-point (same change or immediately after) → dead-code function drop (anytime after) → deleted_at filter audit (before re-enabling delete UI with the new soft-delete flow).

**Acceptance criteria**: A direct `DELETE FROM restaurants` fails with a clear exception in every environment. The admin delete action soft-deletes (verified by row still existing, `deleted_at` set, and `orders`/`payments` for that restaurant still present and unchanged). No admin/public list shows a soft-deleted restaurant.

---

### Issue 2 — Coupon redemption ownership fraud gap

**Current behavior**: `lib/orders/apply-coupon-discount.ts`'s `resolveCouponDiscount()` selects `id, status, issued_at, promotion_reward_id, promotion_id, restaurant_id` from `coupon_redemptions` and validates promotion/reward/expiry/menu-item match and restaurant scoping — it never checks the redeeming guest/session against the issuing one. `app/api/coupons/issue/route.ts` requires only `promotion_id, promotion_reward_id, restaurant_id, coupon_code` — no identity anchor is required at issuance either. `coupon_redemptions.customer_session_id` is a client-generated, unverifiable `localStorage` UUID with no server-side trust value. Neither the issuance nor redemption route has rate limiting applied, despite `lib/http/rate-limit.ts` already existing in the codebase for this purpose.

**Exact files**: `lib/orders/apply-coupon-discount.ts` (`resolveCouponDiscount`), `app/api/coupons/issue/route.ts`, `app/admin/validate/page.tsx` (staff-side lookup, currently browser-client-based — see Issue 7).

**Tables**: `coupon_redemptions` (columns: `id, promotion_id, promotion_reward_id, restaurant_id, coupon_code, status, customer_session_id, issued_at, redeemed_at, play_session_id`).

**Invariant violated**: PR-1/SEC-2 (coupons have exactly one owner, ownership validated at redemption).

**Production impact**: 141 live coupons issued, only 4 redeemed — any of the 137 unredeemed, unexpired coupons is currently applicable by anyone who obtains the code, not just the intended winner.

**User/business risk**: A restaurant's promotional budget can be drained by anyone who discovers/shares a valid code, with no mechanism today to detect or rate-limit this pattern.

**Proposed fix** (current-schema-only, per Design Question 4):
1. Confirm (test, don't just read) that `resolveCouponDiscount()`'s restaurant/promotion scoping actually rejects a coupon from a different restaurant/promotion than the one being checked out against.
2. Apply `lib/http/rate-limit.ts` to both `app/api/coupons/issue/route.ts` and the redemption/apply path.
3. Add `coupon_redemptions.issuing_ip`/`issuing_user_agent` (nullable, additive columns) captured at issuance — a forensic signal for staff/ops, not an enforcement mechanism.
4. Route `/admin/validate`'s redemption mutation through a service-role API endpoint (shared work with Issue 7).

**Database changes required**: Two new nullable columns on `coupon_redemptions` (`issuing_ip text`, `issuing_user_agent text`); no new tables, no FK changes.

**Application changes required**: Rate-limit wiring on two routes; capture the two new fields at issuance; new service-role redemption endpoint for `/admin/validate` to call (shared with Issue 7's fix).

**RLS/security changes required**: See Issue 7 — the two issues share the `coupon_redemptions` RLS work.

**Backfill or data repair needed**: None — the two new columns are forward-only forensic capture, not something that needs historical backfill.

**Test plan**: Verify a coupon issued at Restaurant A cannot be applied to an order at Restaurant B (should already pass — confirm, don't assume). Verify rate limiting actually triggers under rapid repeated issuance/redemption attempts from one source. Verify `issuing_ip`/`issuing_user_agent` populate correctly on new issuances.

**Rollback plan**: Rate limiting can be disabled via a feature flag/config value if it's ever found to block legitimate rapid multi-guest-at-one-table redemption patterns — recommend shipping with a generous limit initially and tightening based on real usage data, not the reverse.

**Deployment order**: Independent of all other issues; can ship any time. Recommend after Issue 1 (highest severity ships first) but has no technical dependency on it.

**Acceptance criteria**: Cross-restaurant coupon application is confirmed blocked (not just assumed). Rate limiting is live and tested on both routes. New forensic columns populate on every new issuance.

---

### Issue 3 — Anonymous `orders`/`order_items` read RLS exposure

**Current behavior** (exact live policies, `pg_policies`, verified this session):
```
orders_public_track       | roles: {anon} | cmd: SELECT | qual: true
order_items_public_track  | roles: {anon} | cmd: SELECT | qual: true
```
Both grant unconditional, unfiltered anonymous read access to the full table — not scoped by order ID, despite the originating migration's comment (`20260621010000_ordering_hardening.sql:44-55`) claiming an "unguessable UUID" access model. Because `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the anon key) is shipped in every page's JavaScript bundle, this is trivially exploitable by anyone who inspects network traffic or the client bundle — no guessing required, a plain unfiltered `SELECT * FROM orders` returns all 83 rows across all 12 restaurants today.

**Critical dependency, traced precisely this session**: `app/r/order/[orderId]/OrderTracker.tsx:59-80` uses a browser (anon-key) Supabase client to subscribe to Postgres `postgres_changes` events directly against `orders`, filtered to one order ID, to drive live status updates after the initial page load. Supabase Realtime's `postgres_changes` is RLS-gated — this subscription requires `orders_public_track` (or an equivalent scoped policy) to keep functioning. The initial page load itself (`app/r/order/[orderId]/page.tsx:78-96`) already uses the service-role client and is **not** affected by either policy. `order_items_public_track` is confirmed unused by any current client-side query — `order_items` are only ever read server-side and rendered from the initial load, never re-fetched in the browser.

**Exact files**: `supabase/migrations/20260621010000_ordering_hardening.sql:44-55` (policy origin), `app/r/order/[orderId]/OrderTracker.tsx:55-80` (the dependent), `app/r/order/[orderId]/page.tsx:78-96` (the unaffected initial load).

**Invariant violated**: SEC-1 (tenant boundaries are absolute).

**Production impact**: All 83 orders and 105 order items, across every restaurant, currently readable by any anonymous caller with no filtering — customer names, table identifiers, subtotals, coupon references all exposed platform-wide, not just to someone holding one order's own tracking link.

**Proposed fix**:
1. Drop `order_items_public_track` immediately — zero dependents, zero risk, ships alone.
2. Drop `orders_public_track` **only together with** a replacement mechanism for `OrderTracker.tsx`'s live updates. Two viable replacements, either acceptable for Phase 0:
   - **Polling** (simpler, faster to ship): replace the `postgres_changes` subscription with a short-interval poll (e.g., every 5-10 seconds) against a new or existing service-role-backed API route returning just `{status, preparing_at, ready_at, completed_at}`. No RLS exposure at all; near-imperceptible UX difference for a "your order is being prepared" status page.
   - **Broadcast** (more consistent with existing architecture): this exact problem — needing live updates without an open anon SELECT policy — was already solved for `visit_sessions` via server-dispatched Supabase Broadcast (`session-lifecycle:{sessionId}`, per the session architecture's existing pattern, specifically because "`visit_sessions` has no public SELECT policy... Broadcast REST avoids opening a dangerous anon policy"). The order-status-update route (`app/api/admin/orders/[orderId]/status/route.ts`) would need to additionally dispatch a Broadcast event on each transition. Slightly more work than polling, but reuses a proven pattern rather than introducing a new one.
   
   Recommend polling as the Phase 0 minimal patch, with a note that migrating to the existing Broadcast pattern is a reasonable near-term follow-up for consistency, not required to close this specific risk.

**Database changes required**: None for the policy drops themselves (pure `DROP POLICY`). None for the polling replacement (reads existing columns). If Broadcast is chosen instead, no schema change either — it's a code-only addition to an existing route.

**Application changes required**: `OrderTracker.tsx` rewritten to poll instead of subscribing to `postgres_changes` (or to subscribe to a Broadcast channel instead, if that path is chosen).

**RLS/security changes required**: `DROP POLICY order_items_public_track ON order_items;` and `DROP POLICY orders_public_track ON orders;` (the second only once the replacement mechanism is deployed and confirmed working).

**Backfill or data repair needed**: None.

**Test plan**: Confirm `order_items_public_track` removal doesn't affect `/r/order/[orderId]` (should be a no-op, per the confirmed trace). Confirm the new polling/Broadcast mechanism correctly reflects a status change end-to-end (staff changes status in admin → customer's tracker page updates within the expected interval) before dropping `orders_public_track`. After dropping both policies, confirm an anonymous `SELECT * FROM orders`/`order_items` via the anon key returns zero rows.

**Rollback plan**: Both policy drops are trivially reversible (`CREATE POLICY ... USING (true)` restores prior behavior) if the replacement mechanism is found to have an unforeseen issue post-deployment — but this reintroduces the exposure, so should only be used as a last-resort same-day hotfix while a forward fix is prepared, not a standing rollback position.

**Deployment order**: `order_items_public_track` drop ships independently, any time. The `orders_public_track` drop must ship in the same release as (or strictly after confirming) the tracker's replacement mechanism — never before.

**Acceptance criteria**: Anonymous bulk read of `orders`/`order_items` returns zero rows. The order tracker page continues to reflect live status changes within an acceptable delay (target: under 15 seconds for polling, near-instant for Broadcast).

---

### Issue 4 — `restaurants` public-read RLS drift

**Current behavior** (exact live policies, verified this session):
```
public read restaurants     | roles: {public} | cmd: SELECT | qual: true   (traced to supabase/schema.sql:53, untracked legacy file)
allow select restaurants    | roles: {public} | cmd: SELECT | qual: true   (no source file anywhere, tracked or untracked)
owners read own restaurants | roles: {authenticated} | cmd: SELECT | qual: owner_id = auth.uid()   (correct, keep)
```
Two of the three SELECT policies grant unconditional public access; the properly-scoped third policy (added in a 2026-06-09 hardening pass) coexists alongside them without ever having removed them, so that hardening pass had no actual effect on public exposure. `"allow select restaurants"` is a confirmed instance of the same "lives only in the live database, no corresponding migration file" drift pattern already seen elsewhere in this platform's history (the `play_sessions` constraint, the `supabase_realtime` publication gap).

**Exact tables/policies**: `restaurants` — drop `"public read restaurants"` and `"allow select restaurants"`; keep `"owners read own restaurants"`, `"authenticated users create restaurants"`, `"owners update own restaurants"`.

**Invariant violated**: SEC-1.

**Production impact**: Any anonymous caller can currently retrieve every restaurant's full row — `contact_email`, `phone`, `address_line1`, `owner_name`, `average_ticket`, `main_goal`, and other business-sensitive fields — across all 12 restaurants, unauthenticated.

**Proposed fix**: Drop both open policies. Public-facing restaurant pages (`/r/[slug]`) already resolve via the service-role client server-side and are unaffected.

**Pre-deployment verification required** (not yet performed this session — flagged explicitly, not skipped): grep every browser-side (client component) code path for a direct `.from('restaurants').select(...)` call using the anon-key client, to confirm nothing else depends on the open policy the way `OrderTracker.tsx` depended on `orders_public_track`. This is the one remaining unknown in this plan and should be resolved before the drop ships, not assumed.

**Database changes required**: `DROP POLICY "public read restaurants" ON restaurants;` and `DROP POLICY "allow select restaurants" ON restaurants;`.

**Application changes required**: None expected, pending the verification above; if a dependent is found, it needs the same treatment as Issue 3 (replace with a service-role-backed read before dropping the policy).

**RLS/security changes required**: The two `DROP POLICY` statements themselves.

**Backfill or data repair needed**: None.

**Test plan**: The grep verification above. After dropping, confirm anonymous `SELECT * FROM restaurants` via the anon key returns zero rows, and confirm every known public restaurant page/flow (`/r/[slug]`, `/r/[slug]/[touchpointCode]`, QR resolution, order placement, order tracking) still functions correctly end-to-end.

**Rollback plan**: Trivially reversible (`CREATE POLICY ... USING (true)`) if the pre-deployment verification missed a real dependent — treat as a same-day hotfix path only, not a standing option.

**Deployment order**: Independent of all other issues. Ship after the verification grep confirms no dependent exists.

**Acceptance criteria**: Anonymous bulk read of `restaurants` returns zero rows. Every public-facing restaurant flow continues to work end-to-end.

---

### Issue 5 — `marketing_consent` cannot be revoked

**Current behavior**: `app/api/public/customer-identity/route.ts` — `if (marketing_consent && !existing.marketing_consent)` only ever moves the flag from `false` to `true`; no code path anywhere sets it back to `false`. `customer_profiles.marketing_consent` is otherwise a plain boolean with a `marketing_consent_timestamp`.

**Exact files/tables**: `app/api/public/customer-identity/route.ts`; `customer_profiles.marketing_consent`, `customer_profiles.marketing_consent_timestamp`.

**Invariant violated**: C-6/SEC-3 (consent is channel-scoped and revocable, never a one-way boolean).

**Production impact**: None demonstrated yet in practice — only 1 live `customer_profiles` row, no outbound campaigns exist (`campaigns` table is dead, 0 rows). This is a latent compliance gap, not an active harm today.

**Proposed fix** (per Design Question 7 — minimal, current-schema-only): remove the one-way restriction — accept and write `marketing_consent` as sent (`true` or `false`), always refreshing `marketing_consent_timestamp` to reflect the latest change, regardless of direction.

**Database changes required**: None — same columns, same table.

**Application changes required**: One conditional in one route file, loosened from "only if moving forward" to "write whatever was sent."

**RLS/security changes required**: None.

**Backfill or data repair needed**: None.

**Test plan**: Confirm a follow-up call with `marketing_consent: false` actually updates the existing row to `false` and refreshes the timestamp. Confirm a call with `marketing_consent: true` still works as today.

**Rollback plan**: Revert the conditional — trivial, no data implications either direction since no revocation has ever been recorded yet to lose.

**Deployment order**: Fully independent, ships any time, no dependencies.

**Acceptance criteria**: `marketing_consent` can be verified to move in both directions via the existing API, with the timestamp always reflecting the most recent change.

**Explicitly out of scope for this fix** (per Design Question 7): a self-service customer-facing opt-out UI/link, and the channel-scoped `customer_consents` ledger — both remain correctly scoped to the Customer Identity Spine's later phases, to build when real outbound communication exists to opt out of.

---

### Issue 6 — `guest_id` gap in the ordering flow (re-scoped this session)

**Correction to prior framing**: the Customer Identity Spine and Business Invariants documents both characterized this as an active "73%-of-orders" resolve-timing race requiring an urgent fix. A fresh day-by-day breakdown this session shows this is not accurate as a description of current risk:

| Period | Session-linked orders with `guest_id` | Session-linked orders without `guest_id` |
|---|---|---|
| 2026-06-23 to 2026-06-28 (pre-feature) | 0 | 49 |
| 2026-06-29 onward (post-feature) | 18 | **0** |

`orders.guest_id` and the `session_guests` table itself both shipped on 2026-06-29 (Guest Identity Engine V1). **All 49 affected orders predate the feature's existence entirely** — there was no `guest_id` column and no `session_guests` table yet when those rows were created, so this is not a bug that was live and has since been silently continuing; it is a one-time historical artifact from before the capability existed. **Every session-linked order created since the feature shipped has `guest_id` populated correctly (18 of 18).**

A smaller, real, still-live edge case was found by tracing the code precisely (not by the aggregate statistic): `engine/session-presence/join-session.ts:151-205` deliberately degrades gracefully if the `session_guests` INSERT fails (a caught exception, logged via `console.warn` only), returning `guest_id: ''` while still confirming the session — a design choice, not an accident, per the code's own comment ("session resolution still succeeds and guest tracking degrades gracefully"). Nothing currently makes this failure visible, and nothing downstream blocks order submission on it (`lib/orders/create-order.ts:84-88` only validates UUID *shape* if a value is present, never checks for its absence). This exists in the current code, but the fresh data above shows it is not presently manifesting at any meaningful rate.

**Exact files**: `engine/session-presence/join-session.ts:151-205`, `lib/orders/create-order.ts:84-88`, `components/public/CartSheet.tsx:126-150` (no guestId guard), `components/public/PaymentCheckoutScreen.tsx:124-140,470-472` (no guard of any kind, not even the weaker one `CartSheet` has).

**Invariant violated**: O-4, but at low current severity given the data above.

**Production impact**: Zero measured impact since the feature shipped 10 days ago. The historical 49 rows remain permanently unattributed at the guest level (see backfill note below).

**Proposed fix** (per Design Question 8 — deliberately small, observability-first, not a UI gate): add one bounded retry of the `session_guests` insert in `join-session.ts` before giving up, and upgrade the swallowed `console.warn` to something that increments a visible metric or alert — so if this ever starts happening at a meaningful rate again, it's noticed immediately rather than requiring another ad hoc data query to discover. **Do not add a submit-button gate tied to `guestId` readiness** — that would add friction to effectively all real traffic to guard against a condition with zero recent incidence, which is a worse trade than the risk it addresses.

**Database changes required**: None.

**Application changes required**: A bounded retry + improved logging/metric in `join-session.ts`. No changes to `CartSheet.tsx`/`PaymentCheckoutScreen.tsx` recommended at this time.

**RLS/security changes required**: None.

**Backfill or data repair needed**: **The 49 historical rows are permanently unrecoverable, not merely "hard to backfill."** Both the `guest_id` column and the `session_guests` table itself postdate these orders — there is no data of any kind to backfill from, even in principle, unlike the "ambiguous multi-guest session" case the Identity Spine document discussed for a different scenario. Recommend explicitly marking these as a known, permanent, accepted historical gap rather than pursuing any backfill effort.

**Test plan**: Confirm the retry logic actually retries once on a simulated `session_guests` insert failure and logs/alerts visibly on final failure.

**Rollback plan**: Trivial — revert the retry/logging change, no data implications.

**Deployment order**: Lowest priority in this plan; ship whenever convenient, no dependencies, no urgency.

**Acceptance criteria**: A simulated `session_guests` insert failure is retried once and, if still failing, produces a visible, monitorable signal instead of a silent `console.warn`.

---

### Issue 7 — `coupon_redemptions` RLS has zero policies, breaking staff redemption

**Current behavior**: `coupon_redemptions` has RLS enabled with **zero policies** (confirmed via this session's `pg_policies` query — no rows returned for this table at all, consistent with the Supabase advisor's `rls_enabled_no_policy` finding). `app/admin/validate/page.tsx` (staff coupon lookup/redemption) queries and updates this table via the browser (authenticated, RLS-subject) client, not a service-role route. With RLS enabled and zero policies, every such query returns nothing — the page's own error handling (`"This coupon was already redeemed or is no longer available"`) currently masks this as if it were a business-logic outcome rather than an RLS default-deny.

**Exact files/tables**: `app/admin/validate/page.tsx` (lines previously traced: lookup ~110-128, redemption update ~248-263); `coupon_redemptions`.

**Invariant violated**: Not itself a tenant-isolation violation (default-deny is directionally safe) — a functional-correctness bug that happens to also touch Issue 2's fraud-prevention work, since the intended human check on redemption (staff visually confirming a coupon) is currently non-functional.

**Production impact**: Staff cannot currently perform manual coupon validation/redemption through the intended admin screen at all — every lookup returns "not found" for a real, valid, unredeemed coupon.

**Proposed fix**: Two complementary changes, sharing work with Issue 2:
1. Add an owner-scoped SELECT/UPDATE RLS policy on `coupon_redemptions` (mirroring the existing pattern on `promotion_rewards`: `EXISTS (SELECT 1 FROM restaurants r WHERE r.id = coupon_redemptions.restaurant_id AND r.owner_id = auth.uid())`), as a correctness fix and defense-in-depth measure.
2. Move `/admin/validate`'s actual redemption mutation to a service-role API route (consistent with the codebase's dominant, safer convention already used for `orders`/`visit_sessions` writes) — the RLS policy alone would technically fix the immediate bug, but routing through a service-role endpoint gives a single place to also apply Issue 2's rate-limiting and ownership-check tightening, rather than duplicating that logic into RLS policy expressions.

**Database changes required**: One new RLS policy (SELECT + UPDATE, owner-scoped) on `coupon_redemptions`.

**Application changes required**: New service-role API route for staff redemption; `/admin/validate` updated to call it instead of the browser client directly.

**RLS/security changes required**: The new policy above.

**Backfill or data repair needed**: None.

**Test plan**: Confirm a restaurant owner/staff member can look up and redeem a real, valid coupon through `/admin/validate` end-to-end after the fix (currently fails 100% of the time — this should be trivial to demonstrate as broken today and fixed after).

**Rollback plan**: Revert to the browser-client path (still broken, but no worse than today) if the new route has an unforeseen issue — trivial, no data implications.

**Deployment order**: Independent; recommend shipping alongside Issue 2 since both touch coupon redemption, but neither blocks the other.

**Acceptance criteria**: Staff can successfully look up and redeem a valid coupon through `/admin/validate`.

---

## 6. Recommended Deployment Sequence

1. **Day 0, same day**: Disable the restaurant delete button (Issue 1, UI-only). Ship the `marketing_consent` ratchet fix (Issue 5). Drop `order_items_public_track` (Issue 3, partial). Both are zero-dependency, zero-risk, immediate wins.
2. **Day 0-1**: Ship the `BEFORE DELETE` trigger on `restaurants` (Issue 1). This is the single highest-priority database change in the plan and should not wait on anything else.
3. **Day 1-2**: Replace `delete_restaurant_cascade` with the soft-delete function and re-point the (still-disabled or newly-re-enabled-with-soft-delete) admin UI (Issue 1, completion). Drop `delete_promotion_cascade` (Issue 1, cleanup).
4. **Day 1-2, in parallel**: Perform the `restaurants` browser-dependency verification grep (Issue 4), then drop the two open policies once confirmed clean.
5. **Day 2-3**: Ship the coupon ownership tightening — rate limiting, forensic columns, restaurant-scoping confirmation (Issue 2) — alongside the `coupon_redemptions` RLS policy and service-role redemption route (Issue 7), since they share files and are natural to review together.
6. **Day 3-5**: Build and ship the `OrderTracker.tsx` replacement mechanism (polling recommended), verify it end-to-end, then drop `orders_public_track` (Issue 3, completion) — the one fix in this plan that legitimately needs the most lead time, since it requires a working replacement before the exposure can be closed.
7. **Whenever convenient, no urgency**: `join-session.ts` retry/observability improvement (Issue 6).

---

## 7. Database / RLS Checklist

- [ ] `CREATE TRIGGER` + function: block all `DELETE` on `public.restaurants`.
- [ ] Replace `delete_restaurant_cascade` body with soft-delete logic; rename to `soft_delete_restaurant`.
- [ ] `DROP FUNCTION delete_promotion_cascade`.
- [ ] `DROP POLICY "public read restaurants" ON restaurants`.
- [ ] `DROP POLICY "allow select restaurants" ON restaurants`.
- [ ] `DROP POLICY order_items_public_track ON order_items`.
- [ ] `DROP POLICY orders_public_track ON orders` (only after OrderTracker replacement ships).
- [ ] `CREATE POLICY` — owner-scoped SELECT/UPDATE on `coupon_redemptions`.
- [ ] `ALTER TABLE coupon_redemptions ADD COLUMN issuing_ip text, ADD COLUMN issuing_user_agent text` (nullable).

## 8. Application Checklist

- [ ] Disable/replace the restaurant delete button handler.
- [ ] Audit restaurant-joined queries for missing `deleted_at IS NULL` filters.
- [ ] Remove the one-way restriction on `marketing_consent` writes.
- [ ] Rewrite `OrderTracker.tsx` to poll a service-role-backed status endpoint instead of subscribing to `postgres_changes` directly.
- [ ] Apply `lib/http/rate-limit.ts` to `app/api/coupons/issue/route.ts` and the coupon redemption/apply path.
- [ ] Capture `issuing_ip`/`issuing_user_agent` at coupon issuance.
- [ ] Build a service-role redemption endpoint for `/admin/validate`; update the page to call it.
- [ ] Add a bounded retry + visible failure signal in `join-session.ts`'s `session_guests` insert.

## 9. Test Checklist

- [ ] Non-production-only: confirm `delete_restaurant_cascade`'s inferred failure mode before relying on it in prioritization.
- [ ] Confirm `DELETE FROM restaurants` is rejected by the new trigger in every environment.
- [ ] Confirm the soft-delete function correctly sets `deleted_at` and preserves all child data.
- [ ] Confirm no admin/public list surfaces a soft-deleted restaurant.
- [ ] Confirm cross-restaurant coupon application is actually rejected (test, don't assume).
- [ ] Confirm rate limiting triggers under rapid repeated coupon issuance/redemption.
- [ ] Confirm anonymous bulk reads of `orders`, `order_items`, and `restaurants` all return zero rows post-fix.
- [ ] Confirm the order tracker's replacement mechanism reflects a real status change within the target interval.
- [ ] Confirm every public restaurant/QR/order flow still works end-to-end after the RLS drops.
- [ ] Confirm staff can look up and redeem a valid coupon through `/admin/validate` post-fix.
- [ ] Confirm `marketing_consent` can be set to both `true` and `false` via the existing API.

## 10. Rollback Strategy

Every fix in this plan is independently, trivially reversible on its own:
- The `restaurants` DELETE trigger: `DROP TRIGGER`.
- The RPC replacement: revert to the previous function body (not recommended, reintroduces the original risk — same-day hotfix only).
- Any dropped RLS policy: recreate with `USING (true)` (reintroduces the corresponding exposure — same-day hotfix only, never a standing rollback position).
- The consent ratchet removal: revert the conditional.
- The `OrderTracker.tsx` replacement: revert to the `postgres_changes` subscription (only viable if `orders_public_track` hasn't been dropped yet — once both ship together, rolling back one without the other breaks the tracker).
- Rate limiting: disable via config/feature flag rather than removing the code.

No fix in this plan has an irreversible forward-only component, and no fix requires a data migration that couldn't itself be undone (the two forensic columns on `coupon_redemptions` can simply be ignored/dropped with no dependent logic if unwound).

## 11. PR Gating Rules

Per Design Question 10: until each corresponding fix in this plan ships, do not merge any PR that:
- Adds or modifies a `DELETE` code path against `restaurants`, `orders`, or `payments`.
- Adds, modifies, or removes an RLS policy on `restaurants`, `orders`, `order_items`, or `coupon_redemptions`.
- Touches coupon issuance or redemption logic.

This gate is scoped narrowly to these four tables/paths and to the duration of this remediation — it is not a general new review policy, and does not block unrelated feature work (menu editing, promotion authoring, session intelligence, etc.).

## 12. Open Questions

1. Is there a safe non-production environment to confirm the `delete_restaurant_cascade` failure inference before treating it as fact in any incident-response prioritization?
2. Does any browser-side code path read `restaurants` directly via the anon client, beyond what this session's research covered? (The one verification step in this plan not yet completed.)
3. What polling interval for the `OrderTracker.tsx` replacement best balances server load against perceived responsiveness — worth a quick real-world check rather than guessing a number in this document.
4. Should the two new `coupon_redemptions` forensic columns (`issuing_ip`/`issuing_user_agent`) have their own data-retention consideration, given IP addresses are personal data in some jurisdictions? Flagged, not answered here — Phase 0 scope is fixing the fraud gap, not designing a full retention policy for a two-column forensic addition.
5. Should `delete_restaurant_cascade`'s replacement (`soft_delete_restaurant`) also become the enforcement point for the `deleted_at`-filter audit (Issue 1, step 5), or should that audit happen as a fully separate pass? Recommend separate, since the audit's scope (every restaurant-joined query in the app) is much broader than the function replacement itself.
