# Promotions in the Menu Experience — Reference

**Last updated:** 2026-07-08

This is the practical, use-case-driven reference for how a promotion behaves once it's surfaced on the public menu: every UI state, every capability-gating rule, every edge case a customer can hit, and the invariants that keep coupon state correct. It complements — does not replace — [`spinbite-platform-architecture-v4.md`](./spinbite-platform-architecture-v4.md) §6 (Promotion Engine) and §7 (Ordering Engine), which own the schema and the chronological "what changed when" narrative. When this doc and v4 disagree, v4 is canonical; file a fix here.

## Table of Contents

1. [How a promotion surfaces](#1-how-a-promotion-surfaces)
   - [1.1 Two entry points — touchpoint vs. reusable link](#11-two-entry-points-into-the-same-menu--touchpoint-vs-reusable-link)
2. [Data model, in one paragraph](#2-data-model-in-one-paragraph)
3. [Coupon status lifecycle](#3-coupon-status-lifecycle)
4. [RewardWidget states](#4-rewardwidget-states)
5. [Capability gating — the use-case matrix](#5-capability-gating--the-use-case-matrix)
6. [Redeem Now — coupon-to-cart-to-checkout bridge](#6-redeem-now--coupon-to-cart-to-checkout-bridge)
7. [Rules and invariants](#7-rules-and-invariants)
8. [Known gaps and edge cases](#8-known-gaps-and-edge-cases)
9. [Source file map](#9-source-file-map)

---

## 1. How a promotion surfaces

One promotion is active per restaurant at a time (`restaurants.current_promotion_id`, enforced by a DB trigger that blocks a second simultaneous `active` promotion). It surfaces via the floating `RewardWidget` (bottom-right pill button → bottom sheet), rendered inside `components/public/RestaurantPublicPage.tsx` — the shared menu component both entry points below render. (Earlier design docs, e.g. `docs/deliverable-8-promotion-attachment.md`, describe a separate landing-page "Today's Reward Card" ahead of the menu; that surface was never built — the widget on the menu itself is the only promotion entry point live today.)

A restaurant in `promotion_only` experience mode (§3.3 of v4) skips the menu entirely — both entry points below redirect straight to `/play/[slug]/[promotionSlug]` instead of rendering a menu.

### 1.1 Two entry points into the same menu — touchpoint vs. reusable link

There are two ways a customer reaches the menu, and as of 2026-07-08 they're intentionally kept at parity for guest-facing behavior, with one deliberate exception:

| | `/r/[slug]/[touchpointCode]` (per-table QR) | `/r/[slug]` (reusable/no-touchpoint link) |
|---|---|---|
| Use case | Restaurant prints a QR code per table/patio/counter/pickup spot | Restaurant wants one static link/QR (e.g. the "View" button on a Menu Library card, a website link, a business card) with no per-table setup |
| Renders | `components/public/TouchpointMenuPage.tsx` → `RestaurantPublicPage` | `components/public/DirectMenuPage.tsx` → `RestaurantPublicPage` |
| Guest name prompt | `GuestNameModal` (`components/public/GuestNameModal.tsx`), shown once after session resolve, persisted server-side to `session_guests` | Same `GuestNameModal` component, same copy/UX, shown once per browser — persisted to `sessionStorage` only (`spinbite_direct_guest_name_v1:{restaurantId}`), no server round-trip |
| `RewardWidget` / promotion behavior | Full — coupon status peeked via `confirmedSessionId`-scoped `localStorage` key | Identical widget, identical Rule 66 staleness fix (shared component) — only difference is the coupon token isn't session-scoped (see below) |
| `visit_sessions` / `session_guests` row | Created via `resolveSessionJoin()` (`engine/session-presence/join-session.ts`) | **Never created, by design** — see below |
| Presence ("connected diners"), realtime session-ended modal, session-scoped "My Orders" | Yes | No — "My Orders" falls back to `useDirectOrders()`, a per-browser-tab `sessionStorage` list (`hooks/useDirectOrders.ts`) |
| Order `order_origin` | `restaurant_qr` | `direct_link` |

**Why the no-touchpoint route can't just reuse the touchpoint session machinery.** `resolveSessionJoin()` enforces at most one *active* `visit_sessions` row per `touchpoint_id` (a partial unique index on `status='active'`), and any visitor scanning the same touchpoint within `STALE_HOURS` (2 hours) is joined into that *same* session as another guest of the same party — correct for a table QR code scanned by multiple phones at one table, but would silently merge unrelated strangers who happen to open one shared reusable link within the same 2-hour window into a single fake "party," corrupting presence counts, session-scoped analytics, and — critically — session-scoped "My Orders" visibility (Guest A would see Guest B's orders). This is why `hooks/useDirectOrders.ts` explicitly avoids creating any shared session state, and why `DirectMenuPage` follows the same boundary: it replicates the *visual* guest-name prompt but never calls `/api/public/sessions/resolve`.

**What this means for promotions specifically:** `peekPlaySessionToken()` (`lib/play-session-token.ts`) keys a browser's play-session token by `visitSessionId` when one exists, so a restaurant-*closed* table session followed by a rescan mints a fresh key and lets the next guest play again immediately. With no `visitSessionId` (the no-touchpoint route), it falls back to a plain `restaurant+promotion` key with a flat 24h TTL — documented, intentional, and the correct behavior given there's no restaurant-controlled session boundary to key off in this flow. The coupon lifecycle, capability gating, and the Rule 66 freshness fix (§4, §7) all otherwise behave identically on both routes, because `RewardWidget` is the exact same component either way.

## 2. Data model, in one paragraph

`promotions` (one row, `status: draft|active|ended`, `max_spins`, `coupon_expiry_minutes`, `daily_redeem_limit`) has many `promotion_rewards` (`reward_type: free|discount|custom`, `reward_value`, optional `menu_item_id`, `daily_limit`, `weight`). A play issues a `coupon_redemptions` row (`status: issued|redeemed`, `coupon_code`, `issued_at`, `redeemed_at`, FK to `play_sessions`). Full column-level detail: v4 §6.1/§6.3.

## 3. Coupon status lifecycle

```
 play → coupon issued ──────────────► expires (coupon_expiry_minutes elapses, unredeemed)
   (status: issued)                        │
        │                                  │  (terminal — coupon is dead, no status flip,
        │ "Redeem Now" tapped              │   expiry is computed from issued_at, never
        │ (adds item to cart —             │   persisted as a status)
        │  NOT a status change)            │
        ▼
   item in cart, coupon still
   status: issued
        │
        │ checkout completes
        │ (payment-orchestrator.ts,
        │  payment_simulation only)
        ▼
   status: redeemed  ◄──── OR staff manually validates at the counter
   (redeemed_at set)       (app/admin/validate/page.tsx, same guarded UPDATE)
```

**The one rule that matters most:** *"added to cart" is not "redeemed."* `coupon_redemptions.status` only ever flips `issued → redeemed` in two places, both guarded by `.eq('status', 'issued')` so a double-flip is a no-op:

- `lib/payments/payment-orchestrator.ts:319-328` — on successful simulated payment.
- `app/admin/validate/page.tsx:248-264` — staff manually validating a coupon code.

Clicking "Redeem Now" never touches `status` — it only adds the reward's menu item to the cart via `sessionStorage`-backed client state (§6). The **direct-order path** (`ordering` enabled, `payment_simulation` off, `POST /api/public/orders`) never touches `coupon_redemptions` at all — see §8.

There is no persisted `expired` status. Expiry is always computed at read time from `issued_at + promotion.coupon_expiry_minutes` (default 20 min), both client-side (`RestaurantPublicPage.tsx`) and server-side (`apply-coupon-discount.ts`).

## 4. RewardWidget states

The floating widget (`RewardWidget` in `components/public/RestaurantPublicPage.tsx`) renders one of these states, driven by `statusCoupon` (fetched from `GET /api/public/promotion-play`) and `pendingRedemption` (the `usePendingRedemption()` sessionStorage-backed hook):

| State | Condition | What the customer sees | Can they act? |
|---|---|---|---|
| **Come play** | No `statusCoupon` for this browser/promotion yet | Teaser + "Play Now" | Launches `/play/[slug]/[promotionSlug]` |
| **Won, not yet redeemed** | `statusCoupon` exists, not redeemed, not expired, not already in cart | Coupon code, expiry countdown, **Redeem Now** (auto-redeemable) or **Browse Menu** | Redeem Now adds the item to cart; Browse Menu just closes the sheet |
| **Added to cart** | Same coupon is the active `pendingRedemption.pending` and `autoAdded: true` | "🛒 Added to your order" + expiry countdown | No further action — go to checkout |
| **Expired** | `now >= issuedAt + couponExpiryMinutes` | "⏰ Coupon has expired" | None — dead end, ask staff |
| **Already redeemed** | `statusCoupon.status === 'redeemed'` | "✅ Coupon already redeemed" | None — no button rendered |

**Critical freshness rule (fixed 2026-07-08, see Rule 66):** `statusCoupon` is re-fetched from the server every time the sheet is opened (`openSheet()` calls `fetchStatus()`), not just once on page mount. Before this fix, a customer who paid for their order (flipping `status` to `redeemed` server-side) and then reopened the widget would still see the stale `issued` copy from page-load — the "Already redeemed" branch above existed and was correct, it just never got the fresh data needed to render. See §7 Rule 66.

The separate `AlreadyPlayedView` at `/app/play/[restaurantSlug]/[promotionSlug]/page.tsx` (shown when a returning guest re-opens the play-page URL directly, as opposed to the menu-page widget) does a fresh `GET` on every page load by construction — it has no analogous staleness risk, and has no Redeem Now button at all (just "← Return to Menu").

## 5. Capability gating — the use-case matrix

Two independent `restaurant_capabilities` flags change what "already played" looks like:

| `ordering` | `payment_simulation` | Behavior |
|---|---|---|
| off | — | Widget shows coupon code + "Show this code to staff before ordering." No auto-redeem; this is a manual, staff-validated coupon. `autoRedeemable` is `false` by construction. |
| on | off | Same as above (manual/staff-validated) — `autoRedeemable` requires **both** flags. The direct-order path (`POST /api/public/orders`) never accepts a `coupon_redemption_id`, so even if a customer builds a `redeem_*` URL by hand, checkout can't apply the discount. |
| on | on | `autoRedeemable` is `true` when the coupon is a `discount` or `free` reward tied to a `menu_item_id`. "Redeem Now" auto-adds the item to cart at the discounted price; checkout re-validates and applies the discount server-side. |

`autoRedeemable` additionally requires the coupon to be neither expired nor already redeemed (§4). A `custom` reward type (no `menu_item_id`) is **never** auto-redeemable regardless of capability flags — it always falls back to "Browse Menu" / staff validation, since there's no cart line to attach a discount to.

## 6. Redeem Now — coupon-to-cart-to-checkout bridge

**Flow:** the play-page win screen and the `RewardWidget`'s "Redeem Now" button both build a link back to the menu with `redeem_id`, `redeem_item`, `redeem_type`, `redeem_value`, `redeem_code`, `redeem_exp` query params from the *client's current copy* of the coupon. `usePendingRedemption()` (`hooks/usePendingRedemption.ts`) consumes those params, strips them from the URL, and persists a `PendingRedemption` record to `sessionStorage`. An effect in `RestaurantPublicPage.tsx` then auto-adds the reward's menu item to the cart exactly once, guarded by a synchronous storage-based claim (`claimAutoAdd`) rather than React state alone, so it survives a StrictMode double-invoke or hydration-recovery remount — and syncs into `pending` React state in the same call so the UI reflects it without a reload (Rule 65).

**Discount math is one unit only, by design.** `computeRewardDiscount()` (`lib/orders/reward-discount-math.ts`) is scoped to a single unit's price — never the full line total regardless of cart quantity — because a coupon is issued one-per-play. This function is shared verbatim between the client preview (`CartSheet.tsx`, `PaymentCheckoutScreen.tsx`) and the server-authoritative calculation (`lib/orders/apply-coupon-discount.ts`'s `resolveCouponDiscount()`, called from `payment-orchestrator.ts`), so the previewed discount can never drift from what's actually charged. `CartSheet` also disables the `+` quantity control on the cart line carrying the coupon, so a customer can't visually imply every unit gets the discounted price.

**The server never trusts the client's copy of the coupon.** `resolveCouponDiscount()` re-derives everything from `couponRedemptionId` alone: re-reads `status` (must be `issued`), re-checks expiry from `issued_at`, re-validates the reward type and `menu_item_id`, and re-matches it against the actual resolved cart line. Every failure mode is a silent zero-discount, never a thrown error — a coupon that can't be applied should never block checkout, only forfeit its own discount.

## 7. Rules and invariants

Numbered rules below are also tracked in [`/docs/engineering/claude-engineering-rules.md`](../engineering/claude-engineering-rules.md) for repo-wide visibility.

- **Rule 64** — once a randomized runtime choice (e.g. which game a session resolved to) is persisted, every surface displaying it must read the persisted value, never re-derive or re-randomize it.
- **Rule 65** — an idempotent storage-first claim (e.g. `claimAutoAdd`) must also sync into whatever React state actually drives the UI, not leave the UI to re-derive from storage only on the next reload.
- **Rule 66** *(new, 2026-07-08)* — a client-side status peek that can go stale while the component stays mounted (e.g. `statusCoupon`, fetched once on mount) must be re-fetched at every user-visible re-entry point (here: every time the reward sheet is reopened), not just on first mount. See §4 above and the full rule writeup for the incident this fixed.
- **Server never trusts client-echoed coupon data.** Any discount math the client previews must be re-derived server-side from the `coupon_redemption_id` alone at checkout (§6). This is the invariant that kept the Rule 66 bug from ever being a real financial exploit — it was a UI/trust bug, not a discount-stacking one.
- **One coupon "spend" per checkout.** The `status: 'issued'` guard on both redemption-marking code paths (`payment-orchestrator.ts`, `admin/validate`) prevents a double-flip, but see §8 for the known TOCTOU race on concurrent checkouts sharing one `couponRedemptionId`.

## 8. Known gaps and edge cases

- **Direct-order path doesn't touch coupon status at all.** `POST /api/public/orders` (used when `ordering` is on but `payment_simulation` is off) never accepts or forwards a `coupon_redemption_id`, and never calls `resolveCouponDiscount()`. Not currently reachable via "Redeem Now" (which degrades to "Browse Menu" when `payment_simulation` is off — §5), but if that ever changes, this path needs the same server-side re-validation `payment-orchestrator.ts` has.
- **TOCTOU race on concurrent checkouts.** Two concurrent checkout requests carrying the same `couponRedemptionId` (double-tap, or a second open tab) can both read `status: 'issued'` in `resolveCouponDiscount()`'s `SELECT` before either `UPDATE` commits — both could compute a non-zero discount and create separate paid orders; only one `UPDATE ... WHERE status='issued'` actually flips the row. No row lock exists between read and write today. Not yet fixed; flagged here as a follow-up candidate.
- **`daily_redeem_limit` (promotions) and `daily_limit` (promotion_rewards) are captured by the builder UI and stored in the database, but not enforced anywhere in the issuance path.** `app/api/coupons/issue/route.ts` validates promotion status/window and reward/promotion linkage, but never counts today's issuances against either limit before inserting. An owner setting "10 free desserts per day" today gets no actual cap.
- **Multiple coupons per session (`max_spins > 1`).** `resolveSessionPlayState()` (`lib/session-play-state.ts`) treats "coupons issued" as the source of truth for plays used — a session is only `alreadyPlayed` once `coupons.length >= max_spins`. When picking which coupon to show as `statusCoupon`, the widget prefers the most recently issued still-valid one over an earlier expired one (§6.4 of v4).
- **`custom` reward type has no cart integration.** It's a valid `reward_type` but has no `menu_item_id` to attach a discount to — always manual/staff-validated regardless of capability flags (§5).

## 9. Source file map

| Concern | File |
|---|---|
| Public menu + floating widget | `components/public/RestaurantPublicPage.tsx` |
| Touchpoint (per-table QR) entry point | `app/r/[restaurantSlug]/[touchpointCode]/page.tsx` → `components/public/TouchpointMenuPage.tsx` |
| Reusable/no-touchpoint entry point | `app/r/[restaurantSlug]/page.tsx` → `components/public/DirectMenuPage.tsx` |
| Shared guest-name prompt (both entry points) | `components/public/GuestNameModal.tsx` |
| Play-page win/already-played screens | `app/play/[restaurantSlug]/[promotionSlug]/page.tsx` |
| Coupon status API | `app/api/public/promotion-play/route.ts` |
| Coupon issuance | `app/api/coupons/issue/route.ts` |
| Play/session-completion logic | `lib/session-play-state.ts` |
| Pending redemption (cart bridge) | `hooks/usePendingRedemption.ts` |
| Discount math (shared client/server) | `lib/orders/reward-discount-math.ts` |
| Server-authoritative discount re-derivation | `lib/orders/apply-coupon-discount.ts` |
| Checkout orchestration + redemption-marking | `lib/payments/payment-orchestrator.ts` |
| Direct order path (no payment sim) | `app/api/public/orders/route.ts` |
| Staff manual redemption | `app/admin/validate/page.tsx` |
| Weighted game/reward selection | `lib/game-pool/resolvePromotionGame.ts`, `lib/rewards.ts` |
