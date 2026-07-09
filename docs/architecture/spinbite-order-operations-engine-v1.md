# SpinBite Order Operations Engine v1 — Restaurant Kitchen/Ops Architecture Audit

**Status:** Design/architecture audit only. No code shipped against this document yet. Not authoritative until reviewed and merged into `spinbite-platform-architecture-v4.md` per Rule 42.

**Author framing:** Written as a principal-architect audit against proven restaurant-tech operational patterns (Toast, Square for Restaurants, Clover, SpotOn, Lightspeed K-Series, Revel Systems, Oracle MICROS Simphony, and Shake Shack's 2026 "Project Catalyst" KDS/POS overhaul) — operational philosophy studied, no UI copied. Grounded against SpinBite's live schema and code as of 2026-07-08, verified via Supabase MCP (`viaoholpnysccaijfpox`) and direct code inspection, not assumption.

**Scope discipline (per mission constraints):** this document only extends the ordering system. It does not redesign menus, promotions, session/presence, intelligence, or the multi-tenant/auth model — it identifies where those systems must be *touched minimally* (e.g. a new `restaurant_staff` role table) to make an operations engine possible, and calls those out explicitly as prerequisites rather than in-scope redesigns.

---

## 0. Executive summary

SpinBite has proven the transaction: create → price → pay → attach to table/session/customer → apply promotion. What doesn't exist yet is the *operational* layer between "order placed" and "order done" — the part that determines whether food actually gets made correctly, on time, and communicated back to the guest. Today that gap is invisible because order volume is low and the only "kitchen" is a person glancing at `/admin/orders`. It will not survive a real service rush.

The single biggest structural finding is not a missing feature — it's a missing **actor model**. Every part of today's system (`orders`, `/admin/orders`, RLS policies) assumes exactly one authenticated human per restaurant: the owner. A Kitchen Display System requires a cook, an expo, a server, and a manager to each see something different and act on it, often on a shared kitchen terminal with no individual login. That has to be solved before KDS is a real product, not after.

---

## 1. Architecture Review — current state (verified live)

| Layer | Current reality | Source |
|---|---|---|
| Order state | `orders.status` CHECK: `pending, preparing, ready, completed, cancelled` (5 states, flat) | live schema |
| Order timestamps | Single overwritable columns: `preparing_at, ready_at, completed_at, cancelled_at` — last-write-wins, not an append-only history | live schema |
| Item state | **None.** `order_items` has no `status` column at all — an order is atomic, items are not individually trackable | live schema |
| Station routing | **None.** No `kitchen_stations` table, no per-item routing | live schema |
| Location reference | `orders.table_identifier` (legacy free text) + `orders.visit_session_id → visit_sessions.touchpoint_id` (indirect, one join away). **`orders.touchpoint_id` does not exist** despite v4 §5.4 asserting it as "the structured reference... authoritative" — confirmed doc/schema drift, direct-link orders (no session) have no structured location at all | live schema query, contradicts `spinbite-platform-architecture-v4.md:262` |
| Kitchen notes | `orders.kitchen_notes` column exists, is never read or written anywhere in app code — dead column | code inspection |
| Special instructions | `order_items.special_instructions` exists, is *displayed* in the admin Orders card, but no input anywhere (customer or staff) can ever write a value into it | code inspection |
| Staff/roles | `profiles.role ∈ {restaurant_owner, super_admin}` only. Orders API authorizes solely via `restaurants.owner_id === auth.uid()`. No cashier/kitchen/server/manager distinction exists anywhere | code inspection |
| Admin Orders UI | One flat page, two tabs (Inbox = pending/preparing/ready, Completed = completed/cancelled), one `OrderCard` per order, linear "Start Preparing → Mark Ready → Complete" buttons, `Cancel` from any active state | `app/admin/orders/page.tsx` |
| Status transition API | `PATCH /api/admin/orders/[orderId]/status` — hardcoded transition table (`pending→{preparing,cancelled}`, `preparing→{ready,cancelled}`, `ready→{completed,cancelled}`), owner-only auth, `console.log` for audit (no table) | `app/api/admin/orders/[orderId]/status/route.ts` |
| Realtime | `orders` table subscribed in admin Orders page and the customer `OrderTracker`, **but `orders` is not registered in the `supabase_realtime` publication** (confirmed open gap from the 2026-07-07 audit) — RLS is correct, delivery is a silent no-op | `project_realtime_publication_gap` memory, v4 §8.7 |
| Notifications | None. No sound, push, SMS, or desktop notification on new order — staff must have the tab open and watch it | code inspection |
| Payments | Separate `payments` table, own status enum including `refunded` — but `orders.status` has no `refunded` counterpart, so a refunded payment cannot be reflected on the order itself | live schema |

**What this proves:** the ordering *transaction* is solid (idempotency, server-side pricing, capability gating, rate limiting are all real and correctly built). The ordering *operation* — what happens to a placed order inside four walls — has zero purpose-built primitives. This is expected: v4's own locked decisions explicitly deferred "POS integration" and treated direct ordering as long-term until 2026-07-01. The foundation was sequenced correctly; this document is the next sequence step, not a correction.

---

## 2. Gap Analysis

| Capability the mission asks about | Exists today? | Gap |
|---|---|---|
| Order lifecycle | Partial (5 flat states) | No `accepted` (kitchen ack ≠ cooking started), no `served` (food delivered ≠ tab closed), no `refunded`, no `expired` |
| Kitchen workflow | None | No station concept, no ticket routing, no bump workflow |
| Order ownership | Owner-only | No per-staff attribution of who accepted/bumped/cancelled |
| Preparation status | Order-level only | No item-level status |
| Item status | None | No `order_items.status`, no per-item timestamps |
| Station routing | None | No stations, no routing rules |
| Fire times | None | No prep-time model, no course/fire synchronization |
| Bumping orders | Crude (full-order "Complete" button) | No item-level bump, no un-bump/recall |
| Kitchen timers | Elapsed-time string only, client-computed | No SLA thresholds, no color-coded urgency, no alerting |
| Ready for pickup | Exists (`ready` status) | Not differentiated by fulfillment type (dine-in serve vs. pickup counter vs. delivery handoff) |
| Completed | Exists | Conflates "food done" with "financially closed" |
| Cancelled | Exists | No reason code, no attribution, no distinction between kitchen-cancel and payment-decline-cancel |
| Refunded | Payment-level only | Not reflected on order state |
| Expired | None | No SLA-based auto-expiry for abandoned/never-accepted orders |
| Payment verification | Solid (separate `payments` ledger) | Fine as-is; only needs an order-status hook for `refunded` |
| Kitchen notes | Column exists, unused | Dead code — either wire it up or remove it |
| Special requests | Displayed, not writable | No customer or staff input path |
| Priority orders | None | No priority/rush flag anywhere |
| Large party handling | None beyond `visit_sessions.guest_count` | No large-order kitchen handling logic |
| Staff roles/permissions | None (owner-only) | **Prerequisite gap** — blocks nearly every other phase below |
| Order timeline/audit | None (overwrite columns only) | No append-only event log |
| Realtime to kitchen | Broken (publication gap) | Must fix before any KDS is buildable |
| Analytics/KPIs | None | No prep-time, station-utilization, or bottleneck data captured anywhere |

---

## 3. Order Lifecycle — State Machine v2

### 3.1 Design principle

Borrow the industry-universal pattern (Toast/Square/Clover/Revel all converge on it): **order status is a read-only projection of item statuses, never set directly except for the terminal/financial states.** An order becomes `ready` because its last non-cancelled item became `ready` — not because someone clicked an order-level button. This is what makes item-level tracking (Phase 4) actually load-bearing rather than decorative.

### 3.2 States (extends the current 5, backward compatible)

```
pending ──accept──> accepted ──(auto, first item starts)──> preparing ──(auto, last item ready)──> ready
   │                    │                                        │                                    │
   │                    │                                        │                          (dine-in) serve ──> completed
   cancel              cancel                                  cancel                     (pickup/delivery) hand-off ──> completed
   │                    │                                        │                                    │
   ▼                    ▼                                        ▼                                    ▼
cancelled           cancelled                                cancelled                            completed ──refund──> refunded

pending ──(no accept within SLA)──> expired
```

| State | New? | Who/what triggers it | DB update | Notification |
|---|---|---|---|---|
| `pending` | existing | Customer completes checkout (or payment succeeds) | `orders` row inserted | Kitchen: new-ticket alert (sound + visual) |
| `accepted` | **new** | Kitchen staff taps "Accept" on the KDS/order card — distinct from "preparing" because acceptance can precede any item actually starting (queue depth) | `accepted_at`, `accepted_by` (staff id) | Customer tracker: "Kitchen has your order" |
| `preparing` | existing (redefined) | **Derived**, not manually set: first `order_items.status = 'preparing'` transition | `preparing_at` (first time only) | Customer tracker: "Preparing" |
| `ready` | existing (redefined) | **Derived**: all non-cancelled `order_items.status = 'ready'` | `ready_at` | Customer tracker + server/runner alert: "Ready for pickup/serve" |
| `served` | **new**, dine-in/counter only | Server or runner taps "Served" (food physically delivered) | `served_at`, `served_by` | none (internal bookkeeping) |
| `completed` | existing | Bill closed — for pay-first flows (SpinBite's current model) this can fire automatically at `served`/pickup hand-off; for pay-later flows a manager/cashier action | `completed_at` | Customer: receipt/thank-you |
| `cancelled` | existing (extended) | Any authorized actor, any non-terminal state | `cancelled_at`, `cancelled_by`, `cancel_reason` (new enum: `kitchen_86, guest_request, payment_failed, duplicate, other`) | Customer: cancellation notice + refund status |
| `refunded` | **new** | Triggered by `payments.status → refunded`, one-way hook from payment layer | `refunded_at` | Customer: refund confirmation |
| `expired` | **new** | System, via SLA sweep (e.g. `pending` with no `accepted_at` after N minutes — mirrors `mark_stale_sessions_abandoned()` pattern already live for sessions) | `expired_at` | Manager alert only (missed-order signal) |

**Compatibility note:** this requires widening `orders.status`'s CHECK constraint (additive — `pending/preparing/ready/completed/cancelled` all keep their exact current meaning for existing rows) and adding four nullable timestamp/actor columns. No existing query, RLS policy, or UI branch breaks; `ACTIVE_ORDER_STATUSES` in `lib/orders/order-status.ts` gains `accepted` and (for dine-in) `served`.

---

## 4. Item-Level State Machine

Yes — every `order_items` row gets its own lifecycle, and it is the actual source of truth. This directly closes the largest functional gap found in Phase 1/2 (no item tracking at all) and mirrors the "ticket/item duality" pattern universal across all eight researched systems.

```
queued ──fire──> fired ──start──> preparing ──finish──> ready ──> served
   │                │                 │
   └──────cancel─────┴────────cancel───┘──> cancelled
```

| State | Meaning | Set by |
|---|---|---|
| `queued` | Item exists, not yet sent to a station (used for held/course-timed items — see §6) | order creation |
| `fired` | Sent to its station's display; station cook can see it but hasn't started | auto-fire on order accept, or manual/course-timed fire |
| `preparing` | Cook tapped "Start" | station staff |
| `ready` | Cook tapped "Done"/bumped | station staff |
| `served` | Expo/runner delivered (dine-in) or bagged for handoff (pickup) | expo/server |
| `cancelled` | 86'd or voided after firing | kitchen or manager, requires reason |

**Order-level `ready` gate:** an order is `ready` iff every non-`cancelled` item is `ready`. This is the exact aggregation rule Revel's Expo screen and Toast's ticket-clear logic both use. **Un-bump/recall:** any single item can move `ready → preparing` (recall) independently — Square's community explicitly complains this is clumsy in their product; making single-item recall a first-class, cheap operation is a concrete SpinBite differentiator, not a nice-to-have.

**Late additions (Revel's sub-ticket pattern, worth adopting):** if items are added to an order that's already `accepted`/`preparing`, tag the new `order_items` rows with an incrementing `fire_batch` integer (0 = original fire, 1, 2, ... for each subsequent addition) instead of re-showing the whole ticket. The KDS renders batch 0 as the base ticket and later batches as a visually distinct "ADD" strip on the same card — kitchen sees exactly what's new without re-reading everything.

---

## 5. Kitchen Display System (KDS)

### 5.1 Ticket card contents (per item found necessary across all 8 systems + SpinBite-specific fields)

```
┌─────────────────────────────────────┐
│ #142           Table 7        04:12 │  ← order #, table/touchpoint name, elapsed timer (color-coded)
│ Guest: Priya            🎁 promo    │  ← guest name (from session_guests), promotion/coupon indicator
├─────────────────────────────────────┤
│ 2× Cheeseburger          [preparing]│
│    no onion, extra pickle           │  ← special_instructions, finally wired up
│ 1× Fries                    [ready] │
│ 1× Milkshake (choc)         [fired] │
├─────────────────────────────────────┤
│ ⚠ ADD: +1 Fries          batch 1    │  ← late addition, sub-ticket style
├─────────────────────────────────────┤
│  [ Bump Item ]      [ Bump All ]    │
└─────────────────────────────────────┘
```

Required fields: order #, elapsed time since fire (not since placement — a held/course-timed item's clock starts at fire, per Toast/Oracle prep-time-relative firing), table/touchpoint or pickup/delivery label, guest name if known (reuses existing Guest Identity Engine — no new capture needed), modifiers/special instructions, promotion/coupon indicator (reuses `coupon_id`), item count, per-item status chips, fire-status/batch indicator for late adds. **Allergens**: not currently modeled anywhere in the menu schema (`menu_items` has no allergen field) — flagged as a menu-catalog gap, out of scope for this doc, but the KDS card layout above reserves space for it once it exists.

### 5.2 Layout modes

| Mode | Who | Shows |
|---|---|---|
| **Station view** | Line cook | Only items routed to *this* station, across all open orders — filtered projection, same pattern Toast/Square/Clover/Lightspeed all use |
| **All-Day view** | Line cook (toggle) | Items grouped/tallied across all open tickets ("14× Fries") for batch cooking — direct adoption of Toast's highest-value, cheapest-to-build concept |
| **Expo view** | Expo/manager | Full ticket, all stations, gated "Bump All" only enabled when every item is `ready` |
| **Large kitchen screen (§9)** | Whole line, TV/monitor | Grid of station-view + expo strip, tuned for distance viewing |

### 5.3 Timers, urgency, priority

Universal pattern, adopted as-is: green (`0 – target×0.7`), yellow (`target×0.7 – target`), red (`> target`) where `target` is a per-item or per-station configurable prep-time estimate (new `kitchen_stations.target_prep_seconds` / optional `menu_items` override — see §12). Priority flag (`orders.priority boolean`, manager-settable) renders as a pinned/highlighted card regardless of position. Rush-hour behavior: once open-ticket count per station exceeds a configurable threshold, All-Day view becomes the default rather than opt-in (a config, not new logic).

---

## 6. Staff Roles

**This is the prerequisite, not a parallel phase.** Recommend a minimal, additive `restaurant_staff` table:

```sql
CREATE TABLE restaurant_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  user_id uuid REFERENCES auth.users(id),        -- nullable: shared kitchen terminals may use a PIN instead of a login
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','manager','cashier','kitchen','expo','server')),
  pin_code_hash text,                              -- for shared-terminal PIN entry, not full auth
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

`restaurants.owner_id` stays exactly as-is (backward compatible — owner is just the first `restaurant_staff` row with `role='owner'`). RLS on all new operational tables scopes by `restaurant_id IN (SELECT restaurant_id FROM restaurant_staff WHERE user_id = auth.uid() AND active)`, additive to the existing owner-only policies rather than replacing them.

| Role | Sees | Can do |
|---|---|---|
| Cashier | POS-style order entry, payment status | Take orders, apply refunds, view completed |
| Kitchen | Station-view KDS only | Start/bump items in their station |
| Expo | Expo-view KDS | Bump-all, recall, reprioritize |
| Server | Assigned tables' order status, "ready" alerts | Mark served, view special instructions |
| Manager | Everything + analytics | Override any transition, void, refund, edit stations/routing |
| Owner | Everything manager has + billing/settings | Full control (today's existing role, unchanged) |

PIN-based identity (not full Supabase Auth per person) matches how real kitchens operate — one shared tablet, cooks clock in with a 4-digit code — and keeps `user_id` optional rather than mandatory, so this doesn't force a heavier auth rebuild.

---

## 7. Multi-Station Kitchens

```sql
CREATE TABLE kitchen_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,                                   -- "Grill", "Fryer", "Pizza Oven", "Bar", "Desserts"
  station_type text,                                     -- free-form/enum for reporting grouping
  target_prep_seconds integer DEFAULT 600,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE menu_item_station_routing (
  menu_item_id uuid NOT NULL REFERENCES menu_items(id),
  station_id uuid NOT NULL REFERENCES kitchen_stations(id),
  PRIMARY KEY (menu_item_id, station_id)     -- one item CAN route to >1 station (e.g. burger→grill AND fryer via its fries side, if items aren't decomposed further)
);
```

**Deliberately a separate join table, not a column on `menu_items`.** Architecture Invariant #1 ("menu is catalog — no promotion logic on menu items") is about *commerce* logic specifically, but the same discipline applies here: operational routing is restaurant-specific and can change without touching the catalog item, and a single item can map to zero stations (falls back to a default/"kitchen" station) without a schema change. Auto-routing at order-accept time: for each `order_item`, look up `menu_item_station_routing`; if none, route to the restaurant's designated default station. This mirrors Toast/Square/Clover/Lightspeed's category→station rule pattern; Oracle's heavier "distribution groups + load balancing + production lanes" is explicitly *not* recommended at this stage — real value, but enterprise-grade complexity this product doesn't need yet (see §13 differentiation notes: a lighter station-load signal is the right-sized version of that idea).

---

## 8. Order Timeline

Replace "single overwritable timestamp columns" with an append-only log — the same pattern already proven in this codebase for `session_events`:

```sql
CREATE TABLE order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  order_item_id uuid REFERENCES order_items(id),   -- null for order-level events
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  event_type text NOT NULL,        -- 'created','accepted','item_fired','item_started','item_ready','item_cancelled','served','completed','cancelled','refunded','expired'
  actor_type text NOT NULL CHECK (actor_type IN ('customer','staff','system')),
  actor_id uuid,                    -- restaurant_staff.id or session_guests.id, per actor_type
  from_status text,
  to_status text,
  station_id uuid REFERENCES kitchen_stations(id),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON order_events (order_id, created_at);
CREATE INDEX ON order_events (restaurant_id, created_at);
```

Existing `orders.preparing_at/ready_at/completed_at/cancelled_at` columns are kept as **denormalized "latest" convenience reads** for the existing Orders page (zero breakage) but `order_events` becomes the actual source of truth for the timeline UI and all analytics in §11. This is the identical relationship `session_events` already has to `visit_sessions`' older denormalized counters — a proven, not novel, pattern in this codebase.

---

## 9. Real-Time System

**Prerequisite, already known and open:** `orders` is not in the `supabase_realtime` publication (confirmed 2026-07-07, still unresolved). No KDS can ship until this is fixed — it is the same class of bug that silently broke two admin channels for a week; fix it as step one, not as part of this feature.

**Recommended channel design**, following the two patterns this codebase already uses correctly rather than inventing a third:

| Channel | Mechanism | Why |
|---|---|---|
| `kitchen:{restaurantId}:{stationId}` | `postgres_changes` on `order_events` filtered by `restaurant_id` (station filtering client-side, or a second filtered column if volume demands it) | Staff-authenticated read, RLS-scoped via `restaurant_staff` — same shape as existing `session-presence` channels |
| `kitchen-expo:{restaurantId}` | `postgres_changes` on `order_events`, unfiltered by station | Same table, different consumer — no new publication membership needed once `order_events` is added |
| `order-status:{orderId}` | Broadcast REST (not `postgres_changes`) | Customer-facing order tracker has no business reading raw `order_events`; server-dispatched broadcast on status change, same reasoning as the existing `session-lifecycle:{sessionId}` broadcast (avoids opening anon SELECT on an internal table) |

**Resilience — a genuine differentiation opportunity, not boilerplate.** Both Revel ("Offline Mode never worked") and Clover ("servers down during peak," 2+ hour support holds) are repeatedly called out in reviews for kitchens going dark mid-service. Recommend the KDS client (not the customer-facing app) maintain a local buffer: on reconnect, re-fetch `order_events` since `last_seen_event_id` rather than trusting the channel not to have dropped anything — a reconciliation read, not just a live subscription. Cheap to build, directly closes a documented competitor weak point.

---

## 10. Screen/Role Recommendations (wireframe-level, not visual)

| Screen | Route (proposed) | Core layout |
|---|---|---|
| Kitchen station view | `/kitchen/[restaurantId]/[stationId]` | Card grid, oldest-first, color-timer border, tap-to-start/tap-to-bump |
| Expo view | `/kitchen/[restaurantId]/expo` | Full-ticket cards, "Bump All" gated on all-items-ready, recall control |
| Large kitchen screen | `/kitchen/[restaurantId]/display` | Same data, TV-tuned: bigger type, fixed grid columns by station count, auto-scroll if overflow, audio chime on new fire, dimmed "night mode" toggle |
| Server/runner view | `/staff/[restaurantId]/tables` | Table-grouped, "Ready to serve" push-to-top, tap "Served" |
| Cashier | `/staff/[restaurantId]/pos` | Existing order-creation flow, extended with refund/void actions gated to `cashier`+ role |
| Manager | Extends existing `/admin/orders` | Add: override any transition, priority flag, void with reason, station config, live KPI strip (§11) |

---

## 11. Analytics / Operational KPIs

All derivable from `order_events` without new raw-data tables:

| KPI | Computation |
|---|---|
| Avg. accept time | `accepted_at − created_at`, per order |
| Avg. prep time (per item/station) | `ready` event `created_at` − `fired` event `created_at`, grouped by `station_id`/`menu_item_id` |
| Avg. fulfillment time | `completed_at − created_at` |
| Station utilization | % of time window a station has ≥1 non-terminal item |
| Cancellation rate | `count(cancelled) / count(total)`, groupable by `cancel_reason` |
| SLA breaches | count of `expired` events, and count of items whose prep time exceeded `target_prep_seconds` |
| Peak periods | order/item volume histogram by hour-of-day, reusing the same time-bucketing already used in existing session/intelligence reporting |
| First response time | `accepted_at − created_at` (same as accept time — named separately because it's the metric managers actually watch) |

Recommend surfacing these as a read-only aggregation layer (materialized view or scheduled rollup), not a new always-on table — consistent with treating `order_events` as the single source of truth and everything else as a derived read.

---

## 12. Database Recommendations (consolidated)

| Table | Type | Notes |
|---|---|---|
| `restaurant_staff` | new | §6 — prerequisite for everything role-gated |
| `kitchen_stations` | new | §7 |
| `menu_item_station_routing` | new | §7 — join table, not a menu_items column |
| `order_events` | new | §8 — append-only timeline, source of truth for analytics |
| `orders.status` CHECK | altered (additive) | add `accepted, served, refunded, expired` |
| `orders` new columns | additive | `accepted_at, accepted_by, served_at, served_by, cancelled_by, cancel_reason, refunded_at, expired_at, priority boolean, touchpoint_id uuid` |
| `orders.touchpoint_id` | **fix, not new feature** | actually add the column v4 §5.4 already (incorrectly) documents as existing, backfilled from `visit_sessions.touchpoint_id` where `visit_session_id` is present |
| `order_items.status` | additive | queued/fired/preparing/ready/served/cancelled |
| `order_items` new columns | additive | `station_id, fire_batch integer DEFAULT 0, fired_at, started_at, ready_at, served_at` |
| `orders.kitchen_notes` | **decision needed** | either wire up a real input path (server-facing "rush this table" note) or remove — a documented, unused column is exactly the kind of drift the 2026-07-07 audit flagged elsewhere |
| Realtime publication | fix | add `orders` (already tracked open debt) + `order_events` to `supabase_realtime` |
| Indexes | new | `order_events(order_id, created_at)`, `order_events(restaurant_id, created_at)`, `order_items(status, station_id)` for KDS station queries |

All additions are additive/nullable — no existing query, RLS policy, or generated TypeScript type consuming today's `orders`/`order_items` shape breaks.

---

## 13. API Recommendations

| Endpoint | Purpose |
|---|---|
| `POST /api/staff/orders/:id/accept` | `pending → accepted`, requires `kitchen`+ role, writes `order_events` |
| `PATCH /api/staff/order-items/:id/status` | Item-level transitions, derives parent order status per §3.1's aggregation rule server-side (never trust client-computed order status) |
| `POST /api/staff/orders/:id/priority` | Manager-only toggle |
| `POST /api/staff/orders/:id/cancel` | Requires `cancel_reason`, role-gated by current state (kitchen can 86 pre-ready, only manager+ can cancel post-ready) |
| `GET /api/staff/kitchen/:stationId/tickets` | Station-filtered active tickets, backing initial KDS load (realtime channel handles deltas after) |
| `GET /api/admin/orders/:id/timeline` | Renders `order_events` for the order-detail/audit view |
| `GET /api/admin/restaurants/:id/kitchen-kpis` | Backs §11's manager KPI strip |

All staff-facing routes authorize via `restaurant_staff` membership + role, not `owner_id` equality — the actual unblock for every role in §6.

---

## 14. Future AI Hooks (design-for, not build-now)

Per research: **no competitor has publicly shipped ML-driven kitchen sequencing** — Toast IQ, Square's AI messaging, and Shake Shack's Project Catalyst are all front-of-house/analytics/voice overlays; Oracle's Capacity Scheduling is the closest thing to "smart" routing and it's rules/load-based, not learned. This is genuine whitespace, not a catch-up feature, provided the primitives below exist first (per the platform's own locked principle: *"do not build AI automation before operational primitives are stable"*).

The `order_events` + `order_items` schema in this document is deliberately the exact feature set a future model needs, with no redesign required later:
- Per-item, per-station historical fire→ready durations (prep-time prediction)
- Real-time open-item-count per station (dynamic load-aware routing — a lighter version of Oracle's Capacity Scheduling, right-sized for SMB rather than enterprise)
- `priority`/`cancel_reason`/`expired` fields (delay/risk prediction, "notify manager before a ticket breaches SLA")
- Time-bucketed volume (§11) already shaped for rush/staffing prediction

Recommend, when that phase arrives, extending the **existing** `intelligence_features` / `intelligence_generation_logs` pattern already live for AI image generation rather than building a parallel AI subsystem — this keeps a single AI-integration convention platform-wide, consistent with Architecture Principle #6 ("build every subsystem so AI can control it later").

---

## 15. Implementation Roadmap

Sequenced so every phase ships something independently useful and nothing later depends on something not yet real:

1. **Staff/roles foundation** — `restaurant_staff` table, RLS extension, PIN-terminal login. *Prerequisite for everything below.*
2. **Order state machine v2 + `order_events`** — schema-only, additive, backward-compatible. Unblocks accurate timelines even before any KDS UI exists.
3. **Realtime hardening** — fix the `orders` publication gap (already tracked debt) + add `order_events` to the publication. Do this before building UI that depends on it, not after discovering it's silent.
4. **Item-level lifecycle** — `order_items.status`, single default "Kitchen" station (no multi-station yet) — smallest possible KDS: one screen, one queue, bump per item.
5. **Multi-station routing** — `kitchen_stations`, `menu_item_station_routing`, station-view + Expo-view split.
6. **Staff role screens** — server "ready to serve" view, cashier refund/void actions, manager overrides — built on primitives from steps 1-5, not new state.
7. **Analytics/KPI layer** — read-only, derived entirely from `order_events` already being written since step 2.
8. **Large kitchen screen mode** — TV-tuned layout, audio alerts, night mode — presentation layer over data that's existed since step 4.
9. **AI hooks** — only after 1-8 are live and stable in production, per the platform's own non-negotiable sequencing principle.

---

*Cross-references: `spinbite-platform-architecture-v4.md` §5.4 (touchpoint drift being corrected here), §7 (Ordering Engine v1, extended not replaced), §8.7/`realtime_presence_v1.md` (realtime publication gap, shared prerequisite fix). This document should be folded into v4 as a new §12 ("Order Operations Engine") once reviewed, per Rule 42.*
