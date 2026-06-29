# Decision Runtime V1

> Status: **Production** — activated 2026-06-29
> Supersedes: engine/decision-engine/dispatcher.ts (stubs remain, not activated)

## Overview

Decision Runtime V1 activates the dormant Decision Engine for real-time autonomous waiter notification. When a guest exhibits a high-value dining signal, the runtime evaluates the session, selects the best intervention, and dispatches a waiter notification to the admin live feed — without any human trigger.

The runtime is deterministic and minimal. No LLM calls. No probability distributions. No UI popups. One dispatcher, two opportunity types, one output: a row in `live_interventions`.

---

## Architecture

```
[Session Event Stream]
     │
     ├── track route → ITEM_VIEW_DURATION
     ├── track route → ITEM_REMOVED_FROM_CART
     └── orders route → ORDER_PLACED
                │
                ▼ fire-and-forget
     [evaluateSession(sessionId, guestId)]
                │
         ┌──────┴──────┐
         │ cooldown?   │ ─── YES → return
         └──────┬──────┘
                │ NO
         ┌──────┴──────────────────────────────┐
         │  Load visit_sessions (active only)  │
         │  Load session_events                │
         │  buildSessionState()                │
         │  detectOpportunities()              │
         │  filter → ENABLED_OPPORTUNITIES     │
         │  resolveInterventions()             │
         │  filter → waiter_notification only  │
         │  filter → confidence >= 0.55        │
         │  dedup → no existing pending row    │
         └──────┬──────────────────────────────┘
                │
         [dispatchWaiterNotification()]
                │
         ┌──────┴──────────────────────────────┐
         │  INSERT live_interventions          │
         │  INSERT intervention_events (audit) │
         │  Broadcast restaurant-decisions:*   │
         └─────────────────────────────────────┘
```

---

## V1 Constraints (HARD — do not relax without explicit mission)

| Constraint | Value |
|---|---|
| Active opportunity types | `high_interest_no_purchase`, `dessert_interest_after_main_order` |
| Active dispatchers | `waiter_notification` only |
| Minimum confidence threshold | 0.55 |
| Cooldown per session | 20 seconds (in-memory) |
| LLM integrations | None |
| Client-side popups | None |
| Coupon engine | Not activated |
| Spin wheel trigger | Not activated |
| AI recommendation dispatcher | Not activated |

---

## Files

| File | Role |
|---|---|
| `engine/decision-runtime/runtime.ts` | Main entry point — `evaluateSession()` |
| `engine/decision-engine/opportunity-detector.ts` | Detects behavioral opportunities (unchanged from V1) |
| `engine/decision-engine/intervention-policy.ts` | Maps opportunities to action candidates — `waiter_notification` added at priority 3 for both enabled types |
| `engine/decision-engine/dispatcher.ts` | Stub file — all dispatchers still return `dispatched: false`. Not called from runtime. |
| `supabase/migrations/20260629200000_live_interventions_v1.sql` | Schema for `live_interventions` |
| `app/api/public/sessions/[visitSessionId]/track/route.ts` | Calls `evaluateSession` after ITEM_VIEW_DURATION, ITEM_REMOVED_FROM_CART |
| `app/api/public/orders/route.ts` | Calls `evaluateSession` after ORDER_PLACED |
| `app/api/admin/sessions/[sessionId]/interventions/route.ts` | GET: returns enriched live_interventions for admin |
| `app/admin/sessions/page.tsx` | `LiveInterventionsPanel` — shows pending/acknowledged decisions |

---

## Database: `live_interventions`

```sql
id                  uuid PRIMARY KEY
session_id          uuid → visit_sessions (CASCADE DELETE)
guest_id            uuid? → session_guests (SET NULL)
restaurant_id       uuid → restaurants (CASCADE DELETE)
opportunity_type    text (enum-checked)
action_type         text DEFAULT 'waiter_notification' (enum-checked)
confidence_score    numeric(4,3)     -- 0.000–1.000
reasoning_summary   text             -- shown to staff
status              text DEFAULT 'pending'
created_at          timestamptz
acknowledged_at     timestamptz?
converted           boolean DEFAULT false
```

### Status lifecycle

```
pending → acknowledged (staff reviewed + acted)
        → dismissed    (staff ignored / not relevant)
        → converted    (future: tracked as revenue event)
        → expired      (future: TTL job marks old pending rows)
```

### Indexes

- `li_session_idx` — `(session_id, created_at DESC)` — admin card expand
- `li_restaurant_pending_idx` — `(restaurant_id, created_at DESC) WHERE status = 'pending'` — restaurant-level feed
- `li_session_opportunity_pending_uniq` — `(session_id, opportunity_type) WHERE status = 'pending'` — deduplication (unique index)

### RLS

- `live_interventions_owner_read` — SELECT by restaurant owner
- `live_interventions_owner_update` — UPDATE by restaurant owner (acknowledge/dismiss)
- INSERT is service-role only (runtime uses service key)

---

## Opportunity Detectors

### `high_interest_no_purchase`

Fires when a guest has viewed any single item for ≥ 20 seconds cumulatively without ordering it.

Confidence: `min(0.92, 0.45 + min(durationSec/90, 1) * 0.47)`

Reasoning summary example:
> Guest showed strong interest in "Lamb Biryani" (also: Mango Lassi). 78% confidence — consider a recommendation or pairing.

### `dessert_interest_after_main_order`

Fires when a guest has placed an order AND views a dessert item or dessert category.

Confidence: `min(0.90, 0.60 + min(durationMs/30_000, 1) * 0.30)`

Reasoning summary example:
> Guest browsing desserts after placing $34.50 main order (81% confidence). Ideal moment to suggest Gulab Jamun.

---

## Cooldown Design

- Module-level `Map<sessionId, timestamp>` — one entry per session per Lambda instance
- Cooldown stamped **before** async work — prevents concurrent invocations within the same 20s window
- Cold starts reset the map: means slightly higher evaluation frequency on cold start (acceptable; never means lower frequency)
- Does NOT persist across instances — each server instance has independent cooldown state

---

## Deduplication

Two layers:
1. **Pre-insert check**: query `live_interventions` for existing `pending` row with same `session_id + opportunity_type`
2. **Unique index**: `li_session_opportunity_pending_uniq` — INSERT fails with code `23505` if duplicate; runtime catches and returns silently

This ensures at most one pending intervention per opportunity type per session at any time. A previous pending intervention must be acknowledged/dismissed before a new one can be created for the same opportunity type.

---

## Admin Live Feed

`LiveInterventionsPanel` in `app/admin/sessions/page.tsx`:
- Loads on session card expand via `GET /api/admin/sessions/:id/interventions`
- Auto-refreshes every 30 seconds for active sessions
- Pending rows: amber border + "Done" (acknowledge) / "Skip" (dismiss) buttons
- Resolved rows: muted stone style with status badge
- Guest name enrichment from `session_guests`

Supabase Realtime channel `restaurant-decisions:{restaurantId}` is broadcast by the runtime on each dispatch. The admin page is not yet subscribed to this channel — V1 relies on the 30-second poll. Real-time push subscription is a V2 enhancement.

---

## Engineering Invariants (V1)

1. `evaluateSession` must never throw — all errors are caught internally and logged
2. `evaluateSession` is always called fire-and-forget — callers use `void evaluateSession(...).catch()`
3. Only `waiter_notification` dispatcher may be activated in V1
4. Only `high_interest_no_purchase` and `dessert_interest_after_main_order` may trigger interventions in V1
5. Confidence threshold is 0.55 — below this, no dispatch even if opportunity detected
6. `intervention_events` is the immutable audit log — never UPDATE or DELETE rows there
7. `live_interventions` INSERT is service-role only — no client path to write this table
8. Cooldown is per-session, not per-restaurant — one session can be evaluated at most once per 20s
9. The unique index on `(session_id, opportunity_type) WHERE status = 'pending'` is the authoritative dedup constraint
10. Dispatcher stubs in `engine/decision-engine/dispatcher.ts` must NOT be called from the runtime — they remain stubs

---

## Activation Record

| Component | Date | Notes |
|---|---|---|
| `live_interventions` migration | 2026-06-29 | Applied to production (ca-central-1) |
| `intervention-policy.ts` updated | 2026-06-29 | `waiter_notification` added at priority 3 for 2 opportunity types |
| `runtime.ts` created | 2026-06-29 | `engine/decision-runtime/runtime.ts` |
| Track route wired | 2026-06-29 | ITEM_VIEW_DURATION + ITEM_REMOVED_FROM_CART |
| Orders route wired | 2026-06-29 | ORDER_PLACED |
| Admin live feed | 2026-06-29 | `LiveInterventionsPanel` in sessions page |
| Supabase types regenerated | 2026-06-29 | `lib/supabase/database.types.ts` updated |
