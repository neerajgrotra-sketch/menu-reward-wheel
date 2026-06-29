# Decision Engine V1

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Architecture complete — dispatcher stubs only; no live actions dispatched

---

## 1. Architecture Boundary

The Decision Engine is a **pure TypeScript module** with **no DB calls and no side effects**. It lives in `engine/decision-engine/`.

It is a computation kernel. Given a `SessionState` (derived from session_events), it produces a ranked list of `Intervention` objects — describing what action COULD be taken. The dispatcher (a separate concern) is responsible for actually taking the action.

```
Input:  SessionState (derived from session_events by buildSessionState())
Output: Intervention[] (ranked by priority + confidence)
```

No database access. No Supabase client. No React. No network calls.

---

## 2. SessionState

`SessionState` is the structured snapshot of a session's live behavioral state, built by `buildSessionState()` in `engine/decision-engine/session-state.ts`.

```typescript
type SessionState = {
  session_id: string;
  restaurant_id: string;
  touchpoint_id: string | null;
  started_at: string;
  snapshot_at: string;             // when this state was computed

  // Time signals
  session_duration_seconds: number;
  time_since_last_action_seconds: number | null;

  // Navigation
  current_category: string | null; // last CATEGORY_OPENED

  // Item behavior (full session)
  items_viewed: ViewedItem[];

  // Cart (post-last-order only — resets after each ORDER_PLACED)
  items_in_cart: CartItem[];
  items_removed_from_cart: RemovedCartItem[];
  current_cart_value: number;

  // Orders
  orders_placed: PlacedOrder[];

  guest_count: number;
  is_active: boolean;
};
```

`buildSessionState()` takes `RawSessionEvent[]` + `SessionContext` (the session row) and produces this deterministically. Same inputs always produce the same output.

---

## 3. Opportunity Detection

`detectOpportunities(state: SessionState): Opportunity[]`

Six named detectors, each independent:

| Opportunity Type | Trigger Condition | Confidence Range |
|---|---|---|
| `cart_abandonment` | Items in cart, idle ≥2 min | 0.45–0.95 (scales with idle time + cart value) |
| `high_interest_no_purchase` | Item viewed ≥20s, not in cart or ordered | 0.55–0.92 (scales with view duration) |
| `long_decision_without_cart` | Session ≥3 min, items viewed, cart empty | 0.50–0.88 (scales with session duration) |
| `post_order_rebrowse` | Ordered, then viewed items within 5 min | Fixed 0.82 |
| `dessert_interest_after_main_order` | Ordered, then browsed dessert category/items | 0.60–0.90 (scales with dessert view time) |
| `multi_guest_partial_order` | >1 guest, items ordered < guest count, session ≥5 min | 0.55–0.85 |

Each detector returns `Opportunity | null`. Results are sorted by descending confidence. Multiple opportunities can fire simultaneously.

**Patterns:**
- `DESSERT_PATTERN` — keyword regex for dessert item detection (includes halwa, kheer, gulab, ladoo, jalebi, rasmalai for South Asian cuisine)
- `BEVERAGE_PATTERN` — keyword regex for beverage detection (tea, coffee, lassi, chai, etc.)

---

## 4. Intervention Policy

`resolveInterventions(opportunities: Opportunity[]): Intervention[]`

Each opportunity maps to an ordered list of candidate actions via the `POLICY` table:

| Opportunity | Primary Action | Secondary Action |
|---|---|---|
| `cart_abandonment` | `coupon_offer` (p=1) | `waiter_notification` (p=2) |
| `high_interest_no_purchase` | `ai_recommendation` (p=1) | `combo_offer` (p=2) |
| `long_decision_without_cart` | `ai_recommendation` (p=1) | `promotion_popup` (p=2) |
| `post_order_rebrowse` | `combo_offer` (p=1) | `spin_wheel_trigger` (p=2) |
| `dessert_interest_after_main_order` | `combo_offer` (p=1) | `promotion_popup` (p=2) |
| `multi_guest_partial_order` | `waiter_notification` (p=1) | `ai_recommendation` (p=2) |

`selectBestIntervention(opportunities, minConfidence=0.5)` returns the single highest-priority intervention above the confidence threshold.

---

## 5. The Six Action Types

Each `ActionType` corresponds to a delivery channel and an `intervention_events.action_taken` enum value:

| Action Type | Channel | Intended delivery |
|---|---|---|
| `coupon_offer` | `coupon_engine` | Issue coupon and push to customer UI via Realtime |
| `promotion_popup` | `customer_ui` | Broadcast a popup to customer session channel |
| `ai_recommendation` | `ai_agent` | Generate a 1–2 sentence recommendation via Intelligence Engine |
| `spin_wheel_trigger` | `spin_wheel` | Unlock/animate spin wheel CTA on customer page |
| `waiter_notification` | `waiter_dash` | Alert on restaurant admin dashboard |
| `combo_offer` | `combo_overlay` | Display combo deal bottom sheet on customer page |

---

## 6. DispatchAction

```typescript
type DispatchAction = {
  type: ActionType;
  session_id: string;
  restaurant_id: string;
  opportunity: OpportunityType;
  confidence: number;
  payload: Record<string, unknown>;  // action-specific context
};
```

`interventionToAction(intervention, session_id, restaurant_id)` converts an `Intervention` → `DispatchAction`.

---

## 7. Dispatcher Stub Architecture

`engine/decision-engine/dispatcher.ts` contains six handler functions, one per action type. Each handler is currently a **stub** — it logs to console and returns:

```typescript
function stub(action: DispatchAction, channel: Channel): DispatchResult {
  return {
    dispatched: false,           // stubs never actually dispatch
    action: action.type,
    channel,
    intervention_event_id: null, // real implementation sets this after DB write
    error: 'STUB: implementation not yet wired',
  };
}
```

**When wiring a handler**, replace the stub body. The function signature must not change.

Each handler's intended implementation is documented in the stub comment:
- `coupon_offer` → POST /api/coupons/issue → Realtime broadcast to customer session channel
- `promotion_popup` → Realtime broadcast to `session:{id}:events` → customer UI renders popup
- `ai_recommendation` → Intelligence Engine generate() → Realtime broadcast recommendation text
- `spin_wheel_trigger` → Realtime broadcast spin_wheel_unlock → customer UI enables wheel CTA
- `waiter_notification` → Realtime broadcast to `restaurant:{id}:waiter` → admin alert badge
- `combo_offer` → Realtime broadcast combo details → customer bottom-sheet

---

## 8. intervention_events Logging Contract

When a dispatcher handler is wired, it MUST write to `intervention_events` before returning `dispatched: true`:

```sql
INSERT INTO intervention_events (
  session_id,
  restaurant_id,
  trigger_type,      -- = opportunity.type
  confidence_score,  -- = opportunity.confidence
  action_taken,      -- = action.type
  shown_at           -- = now()
)
```

Outcome updates (`accepted`, `dismissed`, `converted`, `conversion_value`) are written later when customer interaction outcomes are known. The row is created at dispatch time; outcome is filled in asynchronously.

**RLS:** No INSERT policy for anon or owner keys. All inserts use service role.

---

## 9. Decision Cycle

The canonical decision cycle (no live trigger yet — future sprint):

```typescript
// 1. Load events for session
const events = await fetchSessionEvents(sessionId);

// 2. Build state
const state = buildSessionState(events, session);

// 3. Detect opportunities
const opps = detectOpportunities(state);

// 4. Select best intervention
const best = selectBestIntervention(opps, minConfidence=0.5);

// 5. Dispatch
if (best) {
  const action = interventionToAction(best, session.id, session.restaurant_id);
  const result = await dispatcher(action);
  // result.intervention_event_id will be set when dispatcher is real
}
```

---

## 10. What Is Built vs. Not Yet Wired

| Component | Status |
|---|---|
| `engine/decision-engine/types.ts` | Built — all types match DB constraints |
| `engine/decision-engine/session-state.ts` | Built — pure function, no DB |
| `engine/decision-engine/opportunity-detector.ts` | Built — all 6 detectors live |
| `engine/decision-engine/intervention-policy.ts` | Built — full policy table |
| `engine/decision-engine/dispatcher.ts` | Built — stubs only; no live dispatch |
| `intervention_events` table | Built — migration applied, schema live |
| Decision cycle invocation | NOT built — no trigger wires the cycle |
| Customer session channel subscription | NOT built — channel names defined, not subscribed |
| Coupon issue via dispatcher | NOT built |
| Realtime broadcast to customer | NOT built |
| Waiter dashboard notification | NOT built |

---

## 11. Future Wiring Plan

1. **Trigger**: Add a decision cycle invocation to the `/track` route (after ITEM_VIEW_DURATION or ITEM_ADDED_TO_CART events) or run it as a background process per session
2. **Cooldown**: Add per-session intervention cooldown (don't fire twice for same opportunity within N minutes) — likely via a check against `intervention_events`
3. **Customer channel**: Wire customer page to subscribe on `session-lifecycle:{id}` for intervention broadcasts
4. **Coupon dispatcher**: Implement `handleCouponOffer` — issue a coupon and broadcast code
5. **Waiter dispatcher**: Implement `handleWaiterNotification` — broadcast to `restaurant:{id}:waiter`
