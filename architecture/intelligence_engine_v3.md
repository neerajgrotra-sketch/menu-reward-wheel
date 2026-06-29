# Session Intelligence Engine V3

**Document version:** 1.0
**Date:** 2026-06-29
**Status:** Live — implemented and wired to admin sessions UI.

---

## 1. Upgrade Summary

V3 upgrades intelligence from **session-level** to **per-guest-level** reasoning.

V2 analyzed all `session_events` together, collapsing all guest devices into a single behavioral profile. This was sufficient for single-device sessions but produced misleading signals for multi-guest tables: one hesitant guest and one impulsive guest averaged into a "deliberate" profile that described neither.

V3 partitions events by `guest_id` and builds one `GuestBehaviorProfile` per device, then aggregates these into a `GuestSessionSummary` for table-level signals.

**No new database tables.** No LLM integrations. No Decision Runtime activation. Pure TypeScript analysis layer only.

---

## 2. Architecture

```
session_events rows (all guest_ids)
  ↓
analyzeGuestBehavior(events, guestId) × N guests
  → GuestBehaviorProfile[]
  ↓
aggregateSessionIntelligence(guestProfiles, orderedItems)
  → GuestSessionSummary
```

Both functions are pure TypeScript in `lib/session-intelligence.ts`. No DB calls. No side effects.

---

## 3. GuestBehaviorProfile Type

```typescript
type GuestBehaviorProfile = {
  guest_id: string;                          // ephemeral browser-tab UUID
  items_viewed: ViewedItem[];                // per-guest view stats with durations
  high_interest_items: ViewedItem[];         // avg view ≥ 15s
  hesitation_items: CartAbandonmentItem[];   // added then removed by this guest
  cart_add_count: number;
  cart_remove_count: number;
  attention_score: AttentionScore | null;    // dominant score: dismissed|considered|interested|high_intent
  purchase_style: PurchaseStyle;             // impulsive|deliberate|hesitant
  decision_complexity: DecisionComplexity;   // low|medium|high
  session_duration_ms: number | null;        // first → last event for this guest
  event_count: number;
};
```

### Notes

- **`attention_score`** is the *dominant* (highest) score across all items this guest viewed.
- **`purchase_style`** uses proxy signals since `ORDER_PLACED` is server-side and carries no `guest_id` — order attribution is impossible at the per-guest level.
  - `hesitant`: cart removals exist OR ≥2 high-interest items not in cart
  - `impulsive`: cart adds exist, no removals
  - `deliberate`: browsed without adding to cart
- **`high_interest_items`** threshold: 15s (same as `analyzeSessionBehavior`)

---

## 4. GuestSessionSummary Type

```typescript
type GuestSessionSummary = {
  guest_count: number;
  guests_with_cart_activity: number;
  guests_showing_hesitation: number;
  partial_table_ordering: boolean;            // orders placed but some guests never added to cart
  most_viewed_across_table: CrossGuestItem[]; // items viewed by >1 guest (top 5)
  collective_high_interest: ViewedItem[];     // union of high-interest items across guests (top 5)
  dessert_interest: boolean;
  beverage_interest: boolean;
};
```

**`partial_table_ordering`**: true when `orders.length > 0` AND `guests_with_cart_activity < guest_count`. This signals that not all guests engaged with the cart despite orders being placed — a key multi-guest opportunity signal for the Decision Engine.

**Dessert/beverage interest**: detected when any guest viewed a matching item for ≥8 seconds (lower threshold than high-interest to catch awareness signals).

---

## 5. Key Limitation: Order Attribution

`ORDER_PLACED` events are written server-side by `/api/public/orders` and carry `guest_id = null`. This means:

- We cannot determine which guest device placed a specific order.
- `GuestBehaviorProfile.cart_add_count / cart_remove_count` reflects pre-order intent signals only.
- Ordered items remain a session-level concept in `SessionIntelligence.ordered_items`.

This is a fundamental DB-level constraint. Resolving it would require the order API to accept and store the client's `guest_id` — a future option, not implemented here.

---

## 6. API Response (V3)

`GET /api/admin/sessions/{id}/intelligence` now returns:

```json
{
  // ...all existing SessionIntelligence fields (backward compatible)...
  "behavior": { ...BehavioralIntelligence... },
  "guest_profiles": [ ...GuestBehaviorProfile[] ... ],
  "table_summary": { ...GuestSessionSummary... }
}
```

`guest_profiles` and `table_summary` are new fields added to the existing response. All existing fields are unchanged — no breaking changes.

---

## 7. Admin UI

The admin sessions page (`app/admin/sessions/page.tsx`) renders a new **Guest Intelligence** section at the bottom of each session card's `IntelligencePanel`.

### Table Summary Strip
- Metric chips: Guests, Cart activity, Hesitating, Partial order
- Dessert/beverage interest badges (when detected)
- "Viewed by Multiple Guests" list (items seen by >1 guest)
- "Table High Interest" list (collective high-interest items)

### Per-Guest Profiles (expandable)
Each guest card shows:
- Guest label (Guest 1, Guest 2...) ordered by first event appearance
- Purchase style badge + dominant attention score badge
- Event count + items viewed count
- On expand: decision complexity, cart metrics, high interest items, hesitation items

---

## 8. Functions

| Function | Location | Purpose |
|---|---|---|
| `analyzeGuestBehavior(events, guestId)` | `lib/session-intelligence.ts` | Build `GuestBehaviorProfile` for one guest_id |
| `aggregateSessionIntelligence(profiles, orderedItems)` | `lib/session-intelligence.ts` | Build `GuestSessionSummary` for the whole table |

---

## 9. Relationship to V2

V3 is **additive**. V2 functions (`reconstructSession`, `analyzeSessionBehavior`) are unchanged. The V3 functions add a new analytical layer on top of the same raw events.

- V2: session-level timeline, metrics, patterns, AI insights
- V3: per-guest profiles + table-level aggregation

Both layers are computed and returned in the same API response.

---

## 10. Invariants

1. `analyzeGuestBehavior` is pure — no DB calls, no side effects.
2. `aggregateSessionIntelligence` is pure — no DB calls, no side effects.
3. A `guest_id = null` event (server-side: ORDER_PLACED, SESSION_ENDED) is excluded from all guest profiles.
4. A session with only one guest produces `guest_count: 1` — V3 degrades gracefully to single-device behavior.
5. `partial_table_ordering` requires evidence of actual orders (`orderedItems.length > 0`) — it never fires speculatively.
6. Guest labels (Guest 1, Guest 2...) are derived from the order `guest_ids` appear in the events array — they are not persisted and may shift if events are reordered.

---

## 11. Future: Order Attribution

When the ordering flow is ready to capture and transmit the client's `guest_id` to `/api/public/orders`, the per-guest profile can be enriched with:
- `ordered_items: OrderedItem[]` — items this specific guest ordered
- `total_spend: number` — spend attributed to this guest
- `conversion_rate: number` — items viewed vs. ordered by this guest

This would unlock per-guest conversion funnel analysis and enable the Decision Engine's `multi_guest_partial_order` opportunity to be attributed to specific un-converted guests.
