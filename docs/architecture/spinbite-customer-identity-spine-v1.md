# SpinBite Customer Identity Spine v1

**Status:** Architecture and implementation planning only. **Nothing in this document has been implemented.** No schema changes, no migrations, no code.
**Date:** 2026-07-08
**Purpose:** Design how SpinBite models a person from anonymous table visitor through phone-verified, repeat, POS-linked customer — without breaking guest-first QR ordering or forcing login.
**Verification method:** Two parallel full-code traces this session (identity-capture flows + admin visibility; session/order/coupon linkage code paths), both with file:line citations, plus live row-population counts queried directly against Supabase project `viaoholpnysccaijfpox`. Nothing below is assumed from prior documents — every current-state claim is either freshly traced in code this session or freshly queried from the live database.
**Relationship to other docs:** Builds on `spinbite-pos-integration-layer-audit-v1.md` (§2's ownership rule: Customer is permanently SpinBite-owned) and `spinbite-canonical-commerce-domain-model-v1.md` (§0's headline finding — Customer is structurally disconnected from the order/session graph — is the reason this document exists). Does not re-litigate either; extends both with the concrete design and the exact code paths that produce the disconnection.

---

## 0. Executive Summary

The prior audit was right, and the live data confirms it's worse in practice than the schema alone suggested. Three numbers make the case:

- **`play_sessions.customer_profile_id` is populated in 3 of 87 rows (3.4%).** The only capture surface (`SaveRewardPanel`, embedded in the post-win coupon reveal on the promotion-play path) is opt-in, skippable, and phone is explicitly labeled "optional." This is by design, not a bug — but it means the identity spine has almost no real data to build on yet, which makes *now* the right time to fix the architecture, before more volume accumulates on top of a broken linkage model.
- **49 of 67 visit-session-linked orders (73%) have no `guest_id` at all**, despite `session_guests` existing for every one of those sessions. This is a bigger, more urgent gap than the "no customer_profile_id" story — even the *already-built* Guest-level attribution is failing most of the time in practice, for a reason traced to a specific race condition in this document (§1.1), not a schema gap.
- **Zero code paths anywhere in the application join `customer_profiles` against `session_guests`, `orders`, or `coupon_redemptions`.** `play_sessions.customer_profile_id` is the only live foreign key into the customer identity table, and nothing downstream — not order attribution, not coupon redemption, not admin reporting, not session intelligence — ever reads it. A customer can win a coupon, submit their phone number, redeem the coupon, and place a paid order, and the system will never once connect those as the same person.

**One finding here is new and more consequential than anything the canonical domain model flagged**: coupon redemption has **no ownership check at all**. `resolveCouponDiscount()` validates that a coupon is unexpired, unredeemed, and belongs to the right restaurant/promotion/reward — but never checks that it belongs to the guest or session applying it. Any valid, unexpired coupon code at a restaurant can currently be applied to *any* order at that restaurant by *any* guest who knows or guesses the code. This is a fraud/abuse exposure independent of the identity-spine work, and this document treats closing it as part of the same fix (§6, §11 Phase 5) because the correct fix — binding a coupon to the guest/session that claimed it — is the same mechanism the identity spine needs anyway.

The design in this document is a **progressive identity resolution chain**, not a login system: Anonymous Visitor → Device Guest → Named Guest → Phone-Verified Customer → Repeat Customer → POS-Linked Customer. Every stage remains a fully legitimate, permanent terminal state — nothing in this design ever requires a guest to advance further, and ordering, coupon redemption, and browsing all continue to work at the "anonymous" or "named guest" stage exactly as today. What changes is that *when* a guest does provide a phone number — at any point, through any surface — that identity becomes durably connected to their session, their orders, and their coupon history, instead of evaporating into an isolated `play_sessions` row as it does today.

Of the ten candidate tables the brief proposed, this document recommends building four, explicitly rejects two as redundant with the existing model, and defers four to later phases with reasoning (§3). It also surfaces a real, currently-unaddressed compliance gap: **`marketing_consent` can only ever be set to `true`, never revoked** — there is no opt-out code path anywhere in the application (§8).

---

## 1. Current State — Exactly How Customer Identity Works Today

### 1.0 Live population data (queried this session, project `viaoholpnysccaijfpox`)

| Metric | Count | % |
|---|---|---|
| `customer_profiles` total | 1 | — |
| `play_sessions` total | 87 | — |
| `play_sessions` with `customer_profile_id` set | 3 | 3.4% |
| `session_guests` total | 87 | — |
| `session_guests` with a `guest_name` | 66 | 75.9% |
| `orders` total | 83 | — |
| `orders` with `guest_id` set | 18 | 21.7% |
| `orders` with `visit_session_id` set | 67 | 80.7% |
| `orders` with `visit_session_id` set but `guest_id` NULL | 49 | 73.1% of session-linked orders |
| `orders` with `guest_id` set but no `visit_session_id` | 0 | — (confirms `guest_id` never appears without a session) |
| `orders` with a coupon applied | 4 | 4.8% |
| `coupon_redemptions` total | 141 | — |
| `coupon_redemptions` with `play_session_id` set | 84 | 59.6% |
| `coupon_redemptions` with `status='redeemed'` | 4 | 2.8% |
| `session_events` total | 542 | — |
| `session_events` with `guest_id` set | 455 | 84.0% |

### 1.1 Anonymous guest entry

A QR scan resolves a `touchpoint_code` to an active `visit_sessions` row and creates/reattaches a `session_guests` row (`app/api/public/sessions/resolve/route.ts` → `resolveSessionJoin()`). `TouchpointMenuPage.tsx` initializes its local `guestId` state to `null` and sets it asynchronously once the resolve call returns. **This is the exact mechanism behind the 73% `guest_id`-missing-on-orders finding above**: any order submitted in the window between page load and resolve completing carries `visit_session_id` but no `guest_id`, and nothing in `lib/orders/create-order.ts` blocks that combination — `guest_id` is accepted independently of whether a valid session exists, sanitized only against a UUID-shape regex. `customer_profiles`: **not linked.** No code touches it at this stage.

### 1.2 Name capture

`GuestNameModal.tsx` posts `{guest_token, guest_name}` to `app/api/public/sessions/[visitSessionId]/guest-name/route.ts`, which does exactly one write: `session_guests.guest_name`. `customer_profiles`: **not linked** — zero reference to it anywhere in this file.

### 1.3 Phone capture

The only phone-capture surface in the entire application is `components/CustomerIdentityScreen.tsx`, which despite its filename exports `SaveRewardPanel` — **not a full-page identity gate**, but a panel embedded inside the post-win coupon-reveal modal on the promotion-play page (`app/play/[restaurantSlug]/[promotionSlug]/page.tsx:549`), shown only after a guest has already won a prize, and only if `localStorage['spinbite_identity_v1']` doesn't already hold a profile ID for this browser. It is never wired into the direct-ordering flow, the QR-menu flow, checkout, or anywhere else — confirmed by repo-wide grep, one import site total.

- Fields: country code, phone number, a marketing-consent checkbox. No name, no email.
- **Phone is explicitly optional** — the label reads "Phone Number (optional)," and an empty submission (or the explicit "Maybe Later" button) is treated identically to a real skip: `dismissPromotion()` fires and the panel closes, no API call made.
- On real submission: `POST /api/public/customer-identity` with `{play_session_id, phone_country_code, phone_number_raw, marketing_consent}`.
- That route upserts `customer_profiles` by `phone_number_e164` (unique key), and **writes to exactly one other table: `play_sessions.customer_profile_id`.** It never touches `session_guests`, `visit_sessions`, or `session_events`. There is no linkage attempt to the dining session the guest is actually part of — only to the specific game-play attempt.
- Consent can only move forward: `if (marketing_consent && !existing.marketing_consent)` — an existing `true` is never overwritten. **There is no code path to set it back to `false`.**

`customer_profiles`: **linked to `play_sessions` only, nothing else.**

### 1.4 Coupon claiming

`app/api/coupons/issue/route.ts` requires only `promotion_id`, `promotion_reward_id`, `restaurant_id`, `coupon_code` — **no `customer_profile_id`, no phone number, at all.** A fully anonymous player who never opens `SaveRewardPanel` gets a coupon issued identically to one who does. `coupon_redemptions.customer_session_id` is populated from a **client-generated random UUID stored in `localStorage['spinbite_customer_session_id']`** — unrelated to `play_sessions.session_token`, `visit_sessions.id`, or `customer_profiles` in any way. `coupon_redemptions.play_session_id` is the only durable anchor, and — critically — **nothing in the codebase ever joins that column against `play_sessions.customer_profile_id`.** The join is structurally possible; it is never actually performed anywhere.

### 1.5 Ordering / cart / session behavior tracking

Every `session_events` row requires an active confirmed session to fire at all (`useSessionTracking.ts` returns early if no `confirmedSessionId`) — so fully anonymous, session-less browsing generates zero events, which is correct. Within a session, `guest_id` is set on the event insert only if the client supplied a UUID-shaped value (`app/api/public/sessions/[visitSessionId]/track/route.ts`); no existence check against `session_guests` is performed, and a malformed/legacy fallback ID silently fails the insert's FK constraint (caught and swallowed) rather than producing a bad row. This accounts for the 16% of `session_events` with no `guest_id`. `customer_profiles`: **not linked**, and — confirmed by reading the only mutation path into `play_sessions.customer_profile_id` — **there is no retroactive backfill of earlier `session_events` once a guest later identifies themselves.** Events recorded before a phone-capture moment stay permanently unattributed to that identity.

### 1.6 Order submission

`orders.customer_name` is **client-supplied free text**, pre-filled (not locked) from `session_guests.guest_name` and fully editable in `CartSheet.tsx`; the server never reconciles it against the actual guest row. `order_origin` is computed server-side from whether a valid `visit_session_id` was supplied (`restaurant_qr` if so, `409 SESSION_INVALID` if an invalid one was supplied, `direct_link` if none was supplied at all — never silently downgraded). `guest_id` flows through independently, as described in §1.1. `customer_profiles`: **not linked at any point** — no phone field exists anywhere in the order-creation payload, checkout screen, or API route.

### 1.7 Payment flow

`PaymentCheckoutScreen.tsx` collects simulated card fields (never persisted) and the same free-typed `customerName` — **no phone field.** `lib/payments/payment-orchestrator.ts` has zero references to `customer_profiles` or phone data anywhere (confirmed by grep). `customer_profiles`: **not linked.**

### 1.8 Repeat visit handling

**Does not exist, even partially.** No code anywhere looks up `customer_profiles` by phone on a subsequent visit, joins it against session/order history, or shows a "welcome back" signal. `localStorage['spinbite_identity_v1']` stores a `profileId` but it is used only client-side, to suppress re-showing the reveal-modal panel — it is never sent to the server for a lookup. Ten other `localStorage`/`sessionStorage` keys exist for various UX-continuity purposes (cart contents, pending redemption, typed guest names, play-session replay guards) — none of them are server-verified "remember me" mechanisms; all are purely local convenience flags.

### 1.9 Session closure

`visit_sessions.status` transitions to `completed`/`abandoned` independently of any customer identity concept — no interaction with `customer_profiles` at closure.

### 1.10 Staff / admin views

**No customer-facing admin screen exists at all.** Grepping `app/admin/**` and `app/super-admin/**` for `customer_profiles` returns nothing. `app/admin/orders/page.tsx` displays the free-typed `orders.customer_name` as a per-order label — no aggregation, no cross-order rollup, no link to `customer_profiles`. `app/admin/validate/page.tsx` (staff coupon lookup) joins `coupon_redemptions` to `promotions`/`restaurants`/`promotion_rewards` only — **never to `play_sessions` or `customer_profiles`**, so staff validating a coupon see zero customer identity even when one technically exists. Session intelligence (`lib/session-intelligence.ts`, `engine/decision-runtime/runtime.ts`, all `app/api/admin/sessions/**` routes) confirmed to have zero `customer_profile` references anywhere.

---

## 2. Confirmed Gaps

Ranked by how much value they block, not by how they were discovered.

1. **No linkage from `session_guests`/`orders`/`coupon_redemptions` to `customer_profiles`**, at all, anywhere. This is the foundational gap everything else in this document exists to fix.
2. **`orders.guest_id` is missing on 73% of session-linked orders today**, due to a resolve-timing race, not a schema limitation — this is arguably more urgent than the customer-linkage gap itself, since it breaks even guest-level (not just customer-level) order attribution that the schema already supports.
3. **Coupon redemption has no ownership/session check.** Any valid coupon code at a restaurant can be applied by any guest to any order — a live fraud/abuse exposure, unrelated to but fixable alongside the identity spine.
4. **No retroactive attribution.** Behavior recorded before a guest identifies themselves is permanently orphaned from that identity — by design of the current write path, not a missing feature that was planned and skipped.
5. **No repeat-visit recognition of any kind** — not by phone, not by device, not even informally.
6. **No admin visibility into customer identity whatsoever** — not a missing report, a missing *concept* in the admin surface.
7. **No consent revocation path** — `marketing_consent` is a one-way ratchet. Flagged here and expanded in §8 as a compliance risk, not just a modeling gap.
8. **Phone capture is narrow and opt-in by construction** (promotion-play only, skippable) — correctly so, per the constraint that ordering must never require it, but this means the design must actively create *additional*, still-optional, capture opportunities elsewhere (§4) rather than assuming volume will grow on its own.

---

## 3. Target Identity Architecture

### 3.1 The progressive resolution chain

```
Anonymous Visitor
   │  (browses, no active session — generates zero durable records)
   ▼
Device Guest  (session_guests row, device_fingerprint — currently unreliable, see §5)
   │  (joins a Visit Session via QR; orders/plays anonymously; fully legitimate terminal state)
   ▼
Named Guest  (session_guests.guest_name set — a display convenience, not an identity claim)
   │  (optionally, at ANY point: promotion win, checkout, coupon claim — see §4)
   ▼
Phone-Verified Customer  (customer_profiles row exists + linked back to the Guest that provided it)
   │  (returns on a later visit — recognized by phone lookup or, later, device match)
   ▼
Repeat Customer  (customer_profiles row with ≥2 attributed Visit Sessions across time)
   │  (restaurant connects a POS with customer records)
   ▼
POS-Linked Customer  (customer_profiles row mapped to one external POS customer ID per connection)
```

**Every stage is a permanent, legitimate terminal state.** A guest who orders anonymously and never returns has completed a fully valid lifecycle — nothing in this design treats "Anonymous Visitor" as a defect to be corrected. The only thing this architecture changes is that advancement between stages, whenever it happens, is captured durably instead of lost.

### 3.2 Is `customer_profiles` global, restaurant-scoped, or hybrid?

**Global, unambiguously — reaffirmed, not revisited.** The POS audit and canonical domain model both already established this as correct and load-bearing (a phone number is one person regardless of which restaurant they're standing in), and this document's own finding in §8 (restaurant access boundaries) depends on it staying global: if `customer_profiles` were restaurant-scoped, a restaurant could never legitimately query "has this person been here before," because there'd be a separate row per restaurant with no way to know they're the same person. The hybrid part of the model isn't the Customer table itself — it's the **linkage and visibility layer** around it: a restaurant should see everything about a Customer's activity *at that restaurant*, and nothing about their activity elsewhere (§8). Global identity, restaurant-scoped visibility.

### 3.3 Explicit support for each required scenario

| Scenario | How it's supported |
|---|---|
| Anonymous visitor | Fully unaffected — no new requirement, no new record |
| Device/browser guest | `session_guests`, already exists |
| Named session guest | `session_guests.guest_name`, already exists |
| Phone-verified customer | `customer_profiles`, already exists — gains real linkage (§4) |
| Repeat customer | Derived: ≥2 distinct Visit Sessions (via the new link, §4) attributed to one `customer_profiles.id` — no new table, a query pattern |
| Customer across multiple restaurants | Already true structurally (global table) — becomes *usable* once linkage exists |
| Customer scoped to one restaurant's view | An access-control rule (§8), not a data-model change — the same global row, filtered at read time |
| Customer linked to POS customer ID | Reuses `pos_external_mappings` (`entity_type='customer'`) from the POS audit — **not** a new table (§3.4 explains why) |
| Customer with multiple devices | `customer_devices` (new, §3.4) — many devices, one `customer_profiles.id` |
| Customer with multiple phone numbers over time | Deferred to `customer_contact_points` (new, later phase, §3.4) — not urgent given current 1-phone-per-customer reality, designed for but not built yet |
| Customer merged from duplicate profiles | `customer_merge_events` (new, §3.4) |
| Customer in a group/table session | Already supported structurally — multiple `session_guests` share one `visit_sessions`; each can independently link to its own `customer_profiles` row via `session_guest_customer_links` (§3.4) |

### 3.4 Core identity tables — recommendation per candidate, including explicit rejections

The brief proposed ten candidate tables. Four are recommended, two are explicitly rejected, four are deferred with reasoning — this is a deliberate, opinionated cut, not an oversight.

**Recommended:**

| Table | Purpose | Owner | Key columns | FKs | Indexes | RLS | Phase |
|---|---|---|---|---|---|---|---|
| `session_guest_customer_links` | The missing link — connects a Guest within a specific Visit Session to a permanent Customer identity, with provenance | SpinBite | `id, session_guest_id, customer_profile_id, link_method CHECK(phone_capture\|coupon_claim\|staff_manual\|device_recognition\|pos_match), confidence CHECK(self_reported\|verified), linked_at, superseded_at, created_at` | `session_guest_id → session_guests`, `customer_profile_id → customer_profiles` | Partial unique `(session_guest_id) WHERE superseded_at IS NULL` (one active link per guest); `(customer_profile_id)` | Owner-scoped SELECT (restaurant-filtered via the guest's session, §8), service-role write | 1 (schema) / 2-3 (populated) |
| `orders.customer_profile_id` (new column, not a table) | Direct, resilient customer attribution at the order level — not solely derived transitively, given the 73% `guest_id`-missing finding (§1) means transitive derivation alone would miss most current orders | SpinBite | Nullable FK | `→ customer_profiles` | `(customer_profile_id)` | Follows existing `orders` RLS | 1 (schema) / 4 (populated) |
| `customer_devices` | Anonymous, pre-phone-verification repeat-device recognition | SpinBite | `id, device_fingerprint, customer_profile_id (nullable), first_seen_at, last_seen_at, visit_count, last_restaurant_id` | `customer_profile_id → customer_profiles` (nullable) | Unique `(device_fingerprint)`, `(customer_profile_id)` | Service-role only (fingerprints are sensitive; surfaced only via aggregated admin views, §7 Phase 6) | 3 — **blocked on fixing the device-fingerprint capture bug first** (§5.4) |
| `customer_consents` | Append-only, channel-scoped consent audit trail — replaces the current one-way boolean, which has no opt-out path (§8, a real compliance gap) | SpinBite | `id, customer_profile_id, channel CHECK(sms\|email\|push\|wallet), consent_type CHECK(marketing\|transactional\|terms), granted boolean, source, consent_text_version, created_at` | `customer_profile_id → customer_profiles` | `(customer_profile_id, channel, created_at)` | Service-role only | 2 — treated as urgent given the live compliance gap, not deferred with the other consent-adjacent work |
| `customer_merge_events` | Audit trail for de-duplicating customer profiles (e.g., discovered during POS customer-matching, §9) | SpinBite | `id, surviving_customer_profile_id, merged_customer_profile_id, reason, merged_by, merged_at, reversed_at` | Both `→ customer_profiles` | `(surviving_customer_profile_id)`, `(merged_customer_profile_id)` | Service-role / super-admin read only | 3+, only needed once any merge logic exists |

**Explicitly rejected — do not build:**

- **`customer_identities`** — this would be a second aggregate root overlapping with `customer_profiles`, violating the canonical domain model's own constitutional rule that every canonical entity has exactly one SpinBite-issued identity. `customer_profiles` *is* the Customer aggregate. Building a parallel `customer_identities` table would immediately raise "which one is authoritative," the exact ambiguity this whole document exists to eliminate. If the underlying concern was "the current table conflates identity with a single phone number," the correct fix is `customer_contact_points` (below), not a second identity table.
- **`customer_pos_mappings`** — the POS Integration Audit already designed a generic `pos_external_mappings` table (`entity_type`, `spinbite_id`, `external_id`, per `pos_connection_id`) specifically so every future integration extends one mapping table rather than inventing its own. A customer-POS mapping is `pos_external_mappings` with `entity_type='customer'`, `spinbite_id=customer_profiles.id` — nothing about customer mapping is different enough from menu-item or order mapping to justify a bespoke table, and building one would directly violate the canonical domain model's constitutional rule 8 ("new integrations are modeled as new instances of the existing provider-abstraction pattern, not bespoke one-off designs").
- **`order_customer_links`** (as a separate table) — rejected in favor of a plain `orders.customer_profile_id` nullable column. An Order is an immutable snapshot with exactly one customer attribution, decided once at creation time — it never gets "relinked" the way a `session_guest` might be corrected. A link table's value (history, provenance, supersession) is real for `session_guest_customer_links` because a guest's identity claim can be revised; it's unnecessary weight for something that's set once and never changes.

**Deferred, with reasoning (not rejected — designed for, not built yet):**

- **`customer_contact_points`** — decouples "a person" from "their current phone number," supporting multiple phone numbers over time and cleaner merge semantics. Not built now because the current reality (1 customer_profiles row = 1 phone number, unique) handles today's actual volume (1 live row) and every near-term phase's needs without friction. Recommended trigger to actually build it: the first time a real merge scenario (§9's POS-import matching) or a real "customer changed their number" support request occurs — design it then, informed by the real case, not speculatively now.
- **`customer_household_members`** (not in the original candidate list, but implied by "household/group intelligence" in the brief) — a join table linking multiple `customer_profiles` rows as a household, for cross-visit group recognition beyond a single Visit Session. No product requirement drives this yet; Visit Session's existing multi-guest structure already covers *within-visit* group intelligence (§6 handles this). Flagged as an open question (§13), not designed further here — building it now would be exactly the kind of speculative abstraction this document should avoid.
- **`customer_preferences`** (dietary, item/category affinity) — implied by the AI personalization ask (§7) but not in the candidate list. No current storage location exists for this at all. Deferred to Phase 7, and even then recommended as a *derived read model* over Order/Behavior Event history first, with an explicit `customer_preferences` table only if a feature genuinely needs to cache/override a computed preference (e.g., an explicitly-stated dietary restriction) rather than infer one.
- **Restaurant-scoped Customer *view*** (not a table — a recommendation to build a server-side API/view layer, not a schema object) — the mechanism that lets a restaurant see "this customer, filtered to my restaurant's history only" without a new table; this is addressed in §8 as an access-control design, not a data-model one.

---

## 4. Session Linkage Model

**Does every `session_guest` eventually point to a `customer_profile`?** No, by design — most never will, and that's correct. `session_guest_customer_links` is populated opportunistically, whenever a linking event happens (§4.1), and a guest with no such row is simply an anonymous guest, permanently, with no error state or "incomplete" implication.

**Can a `session_guest` remain anonymous forever?** Yes, explicitly and permanently — this is a hard requirement (§ Constraints) and this design treats it as the default, not an edge case.

### 4.1 Linking events — every point a `session_guest` can become linked

Today there is exactly one (weak) capture surface. This design adds linking *opportunities* without adding *requirements*:

1. **Phone capture on promotion win** (exists today, `SaveRewardPanel`) — extend the existing `POST /api/public/customer-identity` route to also attempt a `session_guest_customer_links` insert when the calling `play_session_id` can be traced to an active `session_guests` row at the same restaurant/device (via the existing `spinbite_guest_{sessionId}` localStorage correlation, or, once §5.4's device-fingerprint fix lands, via device match). This is the single highest-leverage, lowest-risk fix in this document — it requires no new UI, only wiring an existing write path to also populate the new link table.
2. **Optional phone capture at checkout** (new, opt-in, never blocking) — a single optional field on `CartSheet.tsx`/`PaymentCheckoutScreen.tsx`, framed as "get your receipt by text" or similar value-exchange framing, not as an identity gate. Submission writes `customer_profiles` (same upsert-by-phone logic as today) and a `session_guest_customer_links` row directly, with `link_method='phone_capture'`.
3. **Coupon claim** (new, opt-in) — if a guest is already phone-verified (link exists) when redeeming a coupon, the redemption event carries that identity forward automatically; if not, no new prompt is forced at this step (redemption must stay frictionless per the constraints) — but the *fraud-prevention* fix (§6) still binds the coupon to the claiming guest/session regardless of whether that guest is phone-linked.
4. **Device recognition** (new, later — blocked on §5.4) — once device fingerprinting actually works, a returning device with a prior `customer_devices` match can silently pre-fill "welcome back" state without requiring the guest to re-enter anything.
5. **Staff manual link** (new, later, Phase 6 admin timeline) — a staff member resolving a support/loyalty question can manually associate a guest with a known customer profile, recorded with `link_method='staff_manual'`.
6. **POS match** (new, later, Phase 8) — during POS customer sync, a matched external customer record can establish or confirm a link, recorded with `link_method='pos_match', confidence='verified'`.

### 4.2 What happens when phone capture occurs after behavior events already exist?

The events themselves are **not** retroactively rewritten — `session_events.guest_id` stays as it was. What changes is that a *query* joining `session_events → session_guests → session_guest_customer_links → customer_profiles` now resolves correctly for all events from that point forward, and, because the join key is `guest_id` (not a per-event customer stamp), **historical events automatically become attributable retroactively through the join** the moment the link is created — no backfill needed for events, only for the link itself. This is a meaningful improvement over today's actual behavior (§1.5), where no such join exists at all, and it requires no event-table mutation.

### 4.3 How do multiple guests at one table map to one or more customer profiles?

Unchanged from today's structural reality, now made queryable: one `visit_sessions` row, multiple `session_guests`, each independently zero-or-one `session_guest_customer_links` → `customer_profiles`. A family of four might resolve to four distinct customers, one customer (if only one links), or zero (if none do) — the model doesn't force convergence, and shouldn't; that's real household-level nuance a forced single-customer-per-table model would destroy.

### 4.4 How should anonymous carts and orders be attributed?

Unchanged — carts remain purely client-side and ephemeral (§ canonical domain model §1, reaffirmed), never gaining a server identity of their own. An order resulting from an anonymous cart simply has `orders.customer_profile_id = null`, which is a fully valid, expected, permanent state.

### 4.5 How should guest names differ from canonical customer names?

They should remain **entirely separate concepts, not reconciled** — this document does not recommend adding a `customer_profiles.name` field at all. `session_guests.guest_name` is a per-visit display convenience ("Sarah," typed fresh each visit, possibly different every time, possibly a nickname or a joke) with zero identity-verification weight. A phone number is the only field this design treats as an identity claim. Conflating the two — e.g., auto-filling a "canonical name" from whatever was typed once — would import exactly the kind of unverified, freely-editable data (`orders.customer_name`'s current problem, §1.6) into the one place that's supposed to be trustworthy.

---

## 5. Order Attribution Model

### Should `orders.customer_id` exist?

**Yes** — as `orders.customer_profile_id`, nullable, per §3.4's reasoning: direct capture is more resilient than transitive derivation through `guest_id`, given that 73% of current session-linked orders lack a populated `guest_id` in the first place. Relying solely on the `orders → session_guests → session_guest_customer_links → customer_profiles` chain would silently fail for most of today's real order volume.

### Should attribution be direct, indirect through `session_guest`, or both?

**Both, deliberately redundant.** At order-creation time, `create-order.ts` should:
1. If a `guest_id` is present and that guest has an active `session_guest_customer_links` row, copy `customer_profile_id` onto the order directly (denormalized, snapshot-style — consistent with `order_items`' existing snapshot philosophy).
2. If no `guest_id` is present (the 73% case, or a genuine `direct_link` order) but a phone was captured at checkout in the same request (§4.1 item 2), resolve/create the `customer_profiles` row and set `orders.customer_profile_id` directly, with no `session_guest` involved at all.
3. Otherwise, `orders.customer_profile_id` stays null — the correct, common, permanent case.

This also fixes the underlying `guest_id` gap as a side effect worth calling out on its own: §11 Phase 4 includes actually fixing the resolve-timing race in `TouchpointMenuPage.tsx` (retry/await guest resolution before allowing order submission, or block submission until `guestId` is non-null when a session exists) — not just working around it with a second attribution path. Both fixes ship together.

### How do group/table orders work?

Confirmed today (§1, item 3 of the linkage trace) and preserved unchanged: each `session_guest` submits their own independent order; there is no merge/split/shared-bill concept. This document does not propose adding one — bill-splitting is a distinct, larger feature (closer to the Order Operations Engine's kitchen-workflow scope) than an identity-spine concern. What this document *does* ensure is that each of those independent orders, once identity-linked, correctly attributes to potentially four different customers at the same table, rather than none.

### How do split orders work?

Not a supported concept today, and not introduced by this document (see above) — noted so the roadmap doesn't implicitly promise it.

### How are guest-level order items attributed?

Unchanged — `order_items` remain scoped to their parent `order_id` only; no per-item customer attribution is proposed (an order has at most one customer attribution, per the immutable-snapshot reasoning in §3.4).

### What if the customer never enters a phone number?

`orders.customer_profile_id` stays null, permanently, with zero degradation to any other part of the order flow — this is the default, expected case and must remain fast and frictionless.

### What if one phone number claims a coupon but another guest submits the order?

This is a real, legitimate scenario (one person plays the game and wins, hands the phone to a friend who's actually paying) and should **not** be treated as fraud or blocked. The order's `customer_profile_id` reflects whoever is attributable *at order time* (the guest submitting it, if linked) — independent of who claimed the coupon being redeemed. The coupon's own attribution (§6) is tracked separately via `coupon_redemptions`' linkage to the *issuing* guest, not forced to match the *redeeming* guest's identity. Two different facts, both worth keeping, neither should overwrite the other.

### What should admin reports show?

Per-order: `customer_name` (as today, cosmetic/free-text) **plus**, when available, a "Known Customer" indicator (a phone icon or similar) linking to the customer's cross-visit timeline (§11 Phase 6) — the first time this becomes possible at all, since no such view exists today (§1.10).

---

## 6. Promotion and Coupon Attribution Model

| Scenario | Design |
|---|---|
| Anonymous reward exposure | Unchanged — `PROMOTION_VIEWED`/`PROMOTION_PLAYED` events fire regardless of identity, as today |
| Phone capture before coupon issue | Already possible today (win screen shows the panel before/alongside the coupon reveal) — once `session_guest_customer_links` exists, this becomes attributable, not just stored in isolation |
| Coupon claimed by phone number | The claim itself doesn't require a phone (§1.4, unchanged) — but if the claiming guest is already phone-linked, `coupon_redemptions` should carry that `customer_profile_id` forward (new nullable column, denormalized like `orders`, same reasoning) |
| Coupon redeemed in same visit | Should require, going forward, that the redeeming order's `guest_id`/`session_id` matches the coupon's issuing context — **this is the fraud-prevention fix** (below) |
| Coupon redeemed in a later visit | Fully supported — a coupon's validity window (`coupon_expiry_minutes`) is independent of identity; once `customer_profile_id` is attached, a later-visit redemption is attributable to the same customer even across visits, which is new (today there's no cross-visit concept for coupons at all) |
| Coupon shared with another person | A real, legitimate use case (a discount is low-stakes to share) — this design does **not** hard-block redemption by a different guest than the claimant. It *does* fix the current total absence of any ownership check (§0's headline new finding) by binding a coupon to the **session/visit it was issued into**, not to a specific person — so a coupon claimed at Table 7 can be redeemed by anyone still active in that visit session, but not scraped and redeemed by an unrelated party at a different restaurant or a different day. This is a deliberate middle ground between "no check at all" (today, a real exposure) and "hard identity lock" (would break the legitimate sharing case) |
| Fraud prevention | Add `coupon_redemptions.issuing_session_guest_id` (nullable, populated at issuance from the caller's actual session context — not the current client-generated `customer_session_id` UUID, which is unverifiable) and check it at redemption time in `resolveCouponDiscount()`: if the coupon has an issuing guest, the redeeming order's session should match (same `visit_session_id`, or same `customer_profile_id` if phone-linked across visits) — treated as a soft warning surfaced to staff for manual override at `/admin/validate`, not necessarily a hard block, since a false positive (family member redeeming) is worse than a rare true fraud case for a low-value discount |
| Cross-restaurant behavior | Once `customer_profile_id` is attached to redemptions, a query like "has this customer redeemed coupons at other restaurants I don't own" becomes technically possible — this must be **actively prevented** at the access-control layer (§8), not merely left unbuilt; a restaurant owner must never see another restaurant's redemption history for a shared customer |
| Campaign attribution | Deferred to Phase 9/Campaign context per the canonical domain model — once campaigns exist, `CampaignEngaged` events (already defined in that document's event catalog) naturally join through the same `customer_profile_id` this document establishes |

---

## 7. AI Memory and Personalization Model

### What AI can remember, and the identity dependency for each

| Capability | Requires customer identity? | Why |
|---|---|---|
| Real-time hesitation/upsell nudges (today's live `waiter_notification` scope) | **No — session-only, already working** | Decision Runtime V1 operates entirely on the current session's `session_events`; this is the model example of an AI feature that correctly needs no customer identity at all, and should stay that way |
| Within-visit menu-layout signal | **No — session-only** | Aggregate `ITEM_VIEWED`/`ITEM_VIEW_DURATION` across all sessions at a restaurant, no per-customer resolution needed |
| Item/category preferences (cross-visit) | **Yes** | Requires resolving multiple Visit Sessions to one `customer_profiles.id` — blocked until §11 Phase 4 |
| Promo response history | **Yes** | Same |
| Order history / visit frequency | **Yes** | Same |
| Churn risk | **Yes** | Needs a time series of visits per customer — structurally impossible today (§0) |
| Lifetime value (LTV) | **Yes** | Needs `orders.customer_profile_id` populated and summed across visits |
| Group behavior (within one visit) | **No — session-only** | Already available via `visit_sessions` ↔ `session_guests`, no identity linkage needed |
| Group/household behavior (across visits) | **Yes, and further deferred** | Needs the not-yet-designed household concept (§3.4) — explicitly out of scope for now |
| Dietary preferences | **Yes, and needs new storage** | No location exists today for a customer-stated preference (`menu_items.tags` is restaurant-authored, not customer-declared) — deferred to Phase 7, and recommended as explicit-input-only (never inferred as a hard constraint, since a wrong inferred allergen claim is a safety risk, not just a personalization miss) |
| Hesitation signals feeding a *personalized* (not generic) intervention | **Yes** | Generic hesitation detection is session-only (works today); making the intervention personalized ("last time you loved the mango lassi") requires the identity link |

### Consent boundary — a hard rule, not a preference

**Any AI/personalization feature that uses cross-visit customer data must first check `customer_consents` for a current, non-revoked, channel-appropriate consent record** (§3.4, §8) — this is stricter than today's marketing-only consent boundary, deliberately: even *internal* AI personalization (not just outbound marketing) should respect the same consent signal, since a customer who declined marketing consent has expressed a preference about being tracked/profiled, not just about receiving texts. Session-only AI features (the "No" rows above) are exempt from this check entirely, since they never resolve to a persistent identity in the first place — this is another reason to keep the session-only/customer-linked distinction sharp rather than blurring it "for simplicity."

---

## 8. Privacy, Consent, and Compliance Model

**Confirmed critical gap, not previously documented**: `marketing_consent` is a one-way boolean — there is no code path anywhere in the application that sets it back to `false`. Before any real SMS/email campaign automation ships (Campaign & Communication Engine, per the canonical domain model), this must be fixed — TCPA (US SMS marketing law) requires honoring opt-out requests, and "STOP" handling has no destination to write to today even if the SMS provider side supported it. `customer_consents` (§3.4) fixes this structurally by making consent an append-only event log rather than a mutable-forward-only flag — the *current* consent state is always "the most recent row per channel," which naturally supports revocation as just another row.

**Data minimization**: current capture (phone + consent timestamp only, no name/email/address) is already a good baseline — this document does not recommend adding fields without a specific, consent-scoped purpose attached to each one (e.g., don't add an email field "for completeness"; add it only when a feature needs it, gated by its own consent record).

**Deletion requests**: no code path exists today to delete or anonymize a `customer_profiles` row (confirmed by grep — zero hits for any deletion/anonymization logic touching this table). This should be built (Phase 9) as a service-role-only operation that: removes `phone_number_raw`/`phone_number_e164` (replacing with a tombstone), leaves aggregate/anonymized behavioral data intact (a deleted customer's historical orders/events shouldn't vanish from a restaurant's sales history, just lose their PII linkage), and records the deletion in `customer_merge_events`-adjacent audit fashion for compliance evidence.

**Restaurant access boundaries — the most important new rule this document adds**: because `customer_profiles` is global (§3.2), **a restaurant owner must never be able to query a customer's activity at a different restaurant.** Every admin-facing read of customer data (the Phase 6 timeline, any future report) must be implemented as a server-side API route that joins `customer_profiles` through `session_guest_customer_links`/`orders`/`coupon_redemptions` **filtered by `restaurant_id` first**, never as a direct client query against the global table. `customer_profiles` itself should remain zero-client-RLS-policy (service-role only, as it already is) — this is the correct enforcement point, not a UI-level filter that could be bypassed.

**Staff/admin visibility**: once `restaurant_staff` exists (a prerequisite flagged by three now-independent audits — POS, Order Operations, Canonical Domain Model), staff should get exactly the same restaurant-scoped-only visibility as owners, never more. Super-admin (platform operator) is the only role that could technically see cross-restaurant customer activity — and even then, any such access should be audit-logged (a lightweight reuse of the existing `intelligence_audit_log` pattern is the right precedent, not a new bespoke logging table), given how sensitive cross-tenant customer visibility is.

**Retention**: no policy exists today. Recommend defining one before Phase 9 ships any real campaign automation — e.g., a `customer_profiles` row with no consent, no order history, and no activity for N years becomes purge-eligible. Left as an explicit open question (§13) rather than a hard number, since it's a legal/business decision, not an engineering one.

**SMS/email marketing compliance**: the channel-scoped design of `customer_consents` (§3.4) exists specifically because TCPA-style regimes distinguish consent by channel (SMS marketing consent ≠ email marketing consent ≠ transactional-message consent) — today's single boolean cannot represent this distinction at all, which becomes a real problem the moment more than one outbound channel is built.

---

## 9. POS Compatibility Model

Consistent with, and does not redesign, the POS Integration Audit's `pos_external_mappings` table and its constitutional rule that Customer is permanently SpinBite-owned.

- **POS customer import**: when a restaurant connects a POS, imported POS customer records should be **matched, not blindly created** — normalize the POS customer's phone number and look up an existing `customer_profiles` row by `phone_number_e164` first. A match creates a `pos_external_mappings` row (`entity_type='customer'`) against the *existing* SpinBite customer; no match creates a new `customer_profiles` row (enrichment, never replacement, per the POS audit's constitutional rule 3). Ambiguous matches (e.g., a POS customer with no phone, or a phone shared across multiple SpinBite profiles) should go to a staged review queue, mirroring the menu-import staging pattern the POS audit already recommends — not auto-merged silently.
- **Duplicate handling**: any merge resulting from POS-import matching is recorded in `customer_merge_events` (§3.4) — never a silent, unaudited row deletion.
- **External IDs**: `pos_external_mappings (restaurant_id, pos_connection_id, entity_type='customer', spinbite_id=customer_profiles.id, external_id=<POS customer id>)` — a customer maps 1-to-many across restaurants/connections, exactly matching the POS audit's design for every other entity type. No Clover/Square/Toast-specific concept is introduced here.
- **Disconnected POS / POS switch**: `pos_external_mappings` rows for the old connection simply go stale (kept, not deleted, for historical order-export integrity) — `customer_profiles` itself is completely unaffected. This is the direct payoff of keeping Customer permanently SpinBite-owned: switching from Clover to Square never touches a customer's actual identity or history, only the mapping rows pointing at whichever POS happens to be connected right now.
- **Who owns customer truth**: SpinBite, always — reaffirmed as binding here, not just inherited from the POS audit.
- **What happens when the POS has no customer record** (walk-in, cash sale, no POS-side loyalty signup): the order still exports normally per the POS audit's order pipeline; SpinBite-side identity linkage (§4, §5) is entirely independent of whether the POS itself ever tracked the customer — a customer can be a fully resolved, repeat, phone-verified SpinBite customer while being a complete unknown to the connected POS, and that's expected, not a gap.

---

## 10. Migration Strategy

**Principle, stated once and applied everywhere below**: every change in this document is additive — new nullable columns, new tables, new opt-in capture surfaces. Nothing existing is modified in a way that could break a currently-working flow, and nothing requires a single sweeping migration.

### Backfill opportunities (safe)

- **Orders missing `guest_id` where the visit session had exactly one `session_guest`**: a genuine, safe, one-time backfill — if a `visit_sessions` row has exactly one associated `session_guests` row, any of its orders with a null `guest_id` can be confidently backfilled to that guest's ID. This should meaningfully reduce the 73% gap for single-guest sessions (likely a large share of the total, though the exact fraction wasn't queried this session and should be checked before running the backfill).
- **`play_sessions.customer_profile_id` (3 rows) → `session_guest_customer_links`**: best-effort backfill by correlating the play session's timing/restaurant against an active `session_guests` row on the same device, where determinable. Given only 3 rows exist, this is low-value but zero-risk to attempt.

### Data that cannot be safely backfilled

- **`session_events` with null `guest_id` (16% of all events)**: permanently unattributable after the fact — accept as a fixed historical gap; the forward-looking fix (§1.5's write-path hardening) prevents it from growing, but does not retroactively repair it.
- **Orders where the visit session had multiple guests and `guest_id` is null**: no safe heuristic exists to guess which of several guests placed the order — leave unbackfilled rather than guess.

### Adding nullable links first

Every new column/table in §3.4 ships nullable and unenforced in Phase 1, with zero behavior change, before any feature in Phase 2+ starts populating or depending on it — this is the same "ship the schema, then ship the behavior" discipline the codebase has already used successfully for prior hardening passes (per the POS audit's migration-discipline findings).

### Phased enforcement

"Enforcement" in this document never means "require a phone number to order" — that's explicitly out of scope, permanently. It means: once a `session_guest_customer_links` row exists, its `customer_profile_id` must always resolve to a real row (standard FK integrity) — not that every guest must eventually get one.

### Rollback strategy

Every phase's schema work is purely additive — rollback is "drop the new column/table," with zero impact on any existing flow, since nothing existing ever reads or depends on the new fields until the specific phase that populates them ships its corresponding feature work. No phase in this roadmap requires a corresponding "undo" migration beyond a straightforward drop.

### Migration tests

- Regression-test the checkout flow, coupon issue/redeem flow, and admin orders list after each schema addition to confirm the new nullable columns don't change existing query behavior.
- Dry-run the `guest_id` backfill (§ above) against a snapshot first, reviewing the row-count/diff before running it against production — specifically verify the single-guest-session heuristic doesn't misfire on any edge case (e.g., a `session_guests` row that's `status='blocked'` shouldn't count as "the one guest").

### Production safety checks

Run all backfills in report-only/dry-run mode first with a reviewed diff before executing, consistent with the codebase's existing ship-then-audit-then-fix-forward migration culture (already observed and judged sound in the POS audit's migration-discipline review).

---

## 11. Implementation Roadmap

### Phase 0 — Confirm current identity gaps and production risks
- **Backend/DB work**: none (this document + the two prior audits *are* Phase 0's output).
- **Risks**: none — audit only.
- **Acceptance criteria**: this document reviewed and accepted as the binding design.

### Phase 1 — Add canonical identity spine (schema only, no behavior change)
- **Database work**: create `session_guest_customer_links` (nullable, unenforced); add `orders.customer_profile_id` (nullable); add `coupon_redemptions.customer_profile_id` and `coupon_redemptions.issuing_session_guest_id` (nullable, unenforced — schema groundwork for Phase 5's fraud fix); create `customer_consents`.
- **Backend work**: none functional yet — no code path writes to the new columns/tables in this phase.
- **Frontend work**: none.
- **Tests**: schema/migration correctness only; confirm zero behavior change to any existing flow (full regression pass on checkout, coupon issue/redeem, order list).
- **Risks**: low — purely additive; the main risk is scope creep into Phase 2 behavior during the same PR.
- **Acceptance criteria**: all new columns/tables exist in the live schema, are nullable, RLS is correctly restrictive (service-role only / owner-scoped per §3.4), and every existing test/flow passes unchanged.

### Phase 2 — Link phone capture to customer profile
- **Backend work**: extend `POST /api/public/customer-identity` to also write `session_guest_customer_links` when the play session can be traced to an active `session_guests` row (§4.1 item 1); add the optional checkout phone-capture endpoint (§4.1 item 2); wire `customer_consents` writes anywhere `marketing_consent` is currently set, replacing the boolean-only write.
- **Database work**: none beyond Phase 1 (already shipped).
- **Frontend work**: add the optional, clearly-skippable phone field to `CartSheet.tsx`/`PaymentCheckoutScreen.tsx`, framed around a concrete benefit (receipt by text), never as a blocking step.
- **Tests**: verify order submission still succeeds with the field empty (no regression to the guest-first flow — this is the single most important test in this phase); verify a submitted phone number correctly creates/updates both `customer_profiles` and the new link.
- **Risks**: UI/UX risk of the new field feeling like a soft paywall if framed poorly — copy review matters as much as the code here.
- **Acceptance criteria**: a guest can complete checkout with zero friction change if they skip the field; a guest who provides a phone number ends up with a populated `session_guest_customer_links` row, not just a `play_sessions` row.

### Phase 3 — Link session_guests and visit_sessions
- **Backend work**: fix the `device_fingerprint` capture bug (currently always `'unknown'`, a known prior finding) as a prerequisite; build `customer_devices` and wire device-based silent recognition.
- **Database work**: create `customer_devices`.
- **Frontend work**: none required for the backend recognition to function; an optional "welcome back" UI treatment can follow once recognition is reliable, but isn't required for this phase's acceptance.
- **Tests**: verify device fingerprint is actually captured (regression test against the specific prior bug); verify recognition doesn't misfire across genuinely different devices sharing a fingerprint-collision edge case.
- **Risks**: device fingerprinting is inherently fuzzy — false-positive "recognition" (treating a different person as a returning one) is a worse failure mode than false-negative (missing a real repeat visit); bias the matching logic conservatively.
- **Acceptance criteria**: `session_guests.device_fingerprint` is reliably populated (not `'unknown'`) for new sessions; a real repeat device across two visits produces a `customer_devices` row with `visit_count=2`.

### Phase 4 — Link orders and order_items
- **Backend work**: implement the dual attribution logic in `create-order.ts` (§5); fix the `guest_id` resolve-timing race in `TouchpointMenuPage.tsx` (§5) so new orders reliably carry `guest_id` when a session exists; run the safe single-guest-session backfill (§10) for historical orders.
- **Database work**: none beyond Phase 1 (already shipped).
- **Frontend work**: block order submission until guest resolution completes, or retry once resolved — whichever proves less disruptive to perceived checkout speed in testing.
- **Tests**: verify the 73% `guest_id`-missing rate drops substantially for new orders (target: near-zero for QR-session orders going forward); verify the backfill's dry-run diff before executing against production.
- **Risks**: the resolve-timing fix could add perceived latency to checkout if implemented as a hard block rather than a fast retry — measure before/after checkout completion time.
- **Acceptance criteria**: new QR-session orders reliably carry `guest_id`; orders from phone-linked guests carry `customer_profile_id`; the historical backfill runs cleanly with a reviewed diff.

### Phase 5 — Link coupons and redemptions
- **Backend work**: populate `coupon_redemptions.issuing_session_guest_id` at issuance from actual session context (not the client-generated UUID); implement the soft ownership check in `resolveCouponDiscount()` (§6) with a staff-facing override at `/admin/validate` rather than a hard customer-facing block.
- **Database work**: none beyond Phase 1 (already shipped) plus populating the columns.
- **Frontend work**: surface the ownership-mismatch soft-warning in `/admin/validate`'s UI for staff review.
- **Tests**: verify legitimate cross-guest redemption (coupon shared within a visit) still succeeds; verify an attempted redemption from an unrelated session/restaurant surfaces the warning; verify no regression to the 2.8% baseline redemption success rate.
- **Risks**: over-tightening this check could block legitimate sharing scenarios — bias toward warn-not-block, consistent with §6's reasoning.
- **Acceptance criteria**: coupon issuance captures real session context; redemption from an unrelated context is flagged, not silently allowed as today.

### Phase 6 — Admin customer timeline
- **Backend work**: build the first-ever customer-facing admin API — restaurant-scoped (§8's access-control rule enforced server-side), returning a customer's visit/order/coupon history at that restaurant only.
- **Database work**: none new — pure read model over Phases 1-5's linkage data.
- **Frontend work**: a new admin screen (doesn't exist today, confirmed by this audit) — customer profile view, cross-visit order/coupon history, "known customer" indicators on the existing orders list.
- **Tests**: verify a restaurant owner cannot retrieve another restaurant's view of a shared customer (the critical §8 boundary) — this should be a dedicated, explicit security test, not an incidental one.
- **Risks**: this is the first screen that makes the restaurant-boundary rule (§8) load-bearing in a UI a human actually clicks through — get the security test right before shipping the UI.
- **Acceptance criteria**: staff can see a returning customer's history at their own restaurant; a cross-restaurant access attempt (tested directly, not just assumed) is denied.

### Phase 7 — AI personalization memory
- **Backend work**: build read models for the "Yes" rows in §7's table (preferences, order history, churn signal, LTV) as derived views over now-linked data — no new write paths into canonical entities.
- **Database work**: `customer_preferences` only if a genuine explicit-input need arises (§3.4) — not built speculatively in this phase by default.
- **Frontend work**: surfaces AI-driven recommendations in existing admin/decision-runtime UI patterns (`live_interventions`-style), not a new dedicated system.
- **Tests**: verify the consent-check gate (§7) is actually enforced before any cross-visit personalization feature runs — a dedicated test per feature, not a single blanket check assumed to cover everything.
- **Risks**: the temptation to over-build personalization features ahead of real data volume (1 live `customer_profiles` row today) — sequence this phase by actual data availability, not calendar time.
- **Acceptance criteria**: at least one cross-visit AI feature (e.g., a repeat-customer-aware promotion recommendation) works end-to-end against real linked data, gated correctly on consent.

### Phase 8 — POS customer mapping
- **Backend work**: implement the phone-match-first import logic (§9) as part of the POS Integration Layer's `CustomerProvider` (per the POS audit's interface design); wire `customer_merge_events` for any resulting merges.
- **Database work**: `pos_external_mappings` (already designed in the POS audit, `entity_type='customer'` usage confirmed here, not redesigned).
- **Frontend work**: the staged-review UI for ambiguous POS customer matches (mirroring the menu-import review screen the POS audit already recommends).
- **Tests**: verify a POS-imported customer with a matching phone number links to the existing SpinBite profile rather than duplicating it; verify an ambiguous match correctly routes to review rather than auto-merging.
- **Risks**: this phase depends on POS Integration Phases 1-3 (kernel, connector, catalog) already being live — sequence accordingly, do not start before the POS roadmap reaches that point.
- **Acceptance criteria**: connecting a POS with existing customer records does not create duplicate SpinBite customer profiles for people who already have one.

### Phase 9 — Consent/marketing automation hardening
- **Backend work**: build the opt-out/revocation code path (§8's critical gap) end-to-end, including any SMS-provider-side "STOP" handling once a real SMS channel exists; build the deletion/anonymization operation (§8).
- **Database work**: none new beyond what Phase 1-2 already shipped (`customer_consents` already supports revocation structurally — this phase is about actually wiring the missing code paths, not new schema).
- **Frontend work**: any customer-facing opt-out surface required by the chosen SMS/email provider's compliance requirements; an admin-facing deletion-request tool.
- **Tests**: verify a revoked consent is actually honored by any campaign-send logic (this is the test that matters most — a consent table nobody checks is worse than no consent table, since it creates false confidence).
- **Risks**: this phase carries real legal exposure if rushed or skipped — treat its acceptance criteria as non-negotiable before any Campaign & Communication Engine work goes live with real customer contact.
- **Acceptance criteria**: a customer who opts out stops receiving marketing communication verifiably; a deletion request removes PII while preserving anonymized aggregate history; both are covered by an explicit, passing test, not just code review.

---

## 12. Open Questions

1. **Should the checkout phone-capture field (Phase 2) be restaurant-configurable** (some owners may want it more/less prominent), or is a single platform-wide treatment correct for Phase 2, with configurability deferred?
2. **What is the actual retention period** for a `customer_profiles` row with no consent and no activity (§8)? This is a legal/business decision this document deliberately does not answer.
3. **Should the coupon ownership check (§6, Phase 5) ever become a hard block rather than a staff-facing soft warning**, for restaurants that report real abuse? Recommend leaving this restaurant-configurable rather than a single global policy.
4. **Is `customer_household_members` (§3.4) ever going to be needed**, or does within-visit group intelligence (already supported) satisfy the actual product need behind "household intelligence" in the original brief? Recommend revisiting only if a concrete feature request drives it.
5. **Who reviews ambiguous POS-customer-match cases (§9, Phase 8)** — restaurant staff, SpinBite ops, or an automated confidence threshold? Needs a product decision before Phase 8 begins.
6. **Should `customer_consents` be designed to support consent *withdrawal reasons*** (useful for compliance reporting) now, or is a simple granted/revoked boolean-per-row sufficient for Phase 2? Leaning toward keeping it simple now and extending later if a real compliance review requires more.

---

## 13. Constitutional Rules

Binding on all future work touching customer identity — extends, and is consistent with, the ten rules already established in `spinbite-canonical-commerce-domain-model-v1.md` §14.

1. **Phone capture never blocks ordering.** Every capture surface added by this document is optional and skippable, with zero degradation to the guest-first flow when skipped — no exceptions, no future feature may add a hard phone gate to checkout.
2. **Anonymous is a permanent, legitimate terminal state**, not a pending or incomplete one — no UI, report, or AI feature may treat an anonymous guest as a problem to be solved.
3. **`customer_profiles` is global and stays global.** No future feature may restaurant-scope it directly; restaurant-level visibility is enforced at the query/access-control layer (§8), never by partitioning the identity table itself.
4. **A restaurant may only ever see a customer's activity at that restaurant.** This is enforced server-side on every customer-data read, with no exceptions for convenience — restated here as the single most safety-critical rule in this document.
5. **Historical behavioral data is never retroactively rewritten** when a later identity link is established — attribution happens through the join at read time, not through mutating past records.
6. **A coupon's ownership check protects against unrelated-party redemption, not legitimate in-household sharing.** Any future tightening of this check must preserve the ability for one guest to claim and another, related guest to redeem within the same visit.
7. **Consent is channel-scoped and revocable, never a single global boolean.** Any new communication channel added to the platform must add its own `customer_consents.channel` value, not overload an existing one.
8. **AI personalization features that resolve to a persistent customer identity must check current consent before running** — this applies even to internal-only features with no outbound communication, not just marketing sends.
9. **POS customer mapping never creates a duplicate SpinBite customer for a person who already has a profile**, wherever phone-number matching can establish that with reasonable confidence — ambiguous cases go to review, never silent auto-creation or silent auto-merge.
10. **New identity-adjacent tables are added only when a concrete, current need drives them** (`customer_contact_points`, `customer_household_members`, `customer_preferences`) — this document deliberately defers four candidate tables with reasoning rather than building them speculatively, and that discipline should continue for anything not explicitly justified here.
