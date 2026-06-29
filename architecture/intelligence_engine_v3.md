# Session Intelligence Engine V3 / V3.1

**Document version:** 1.1
**Date:** 2026-06-29
**Status:** Live — V3.1 (identity attribution) deployed alongside V3.

---

## 1. Upgrade Summary

**V3** upgrades intelligence from session-level to per-guest-level reasoning.

V2 analyzed all `session_events` together, collapsing all guest devices into a single behavioral profile. V3 partitions events by `guest_id` and builds one `GuestBehaviorProfile` per device, then aggregates into `GuestSessionSummary`.

**V3.1** completes identity attribution. `guest_id` in events and orders now links to a real `session_guests` row (and to the guest's captured name). Admin intelligence now shows named guests ("Ishaan", "Sarah") instead of anonymous labels ("Guest 1", "Guest 2"). Order attribution is displayed per guest. Cross-guest behavioral insights surface group-level patterns.

**No new database tables.** No LLM integrations. No Decision Runtime activation.

---

## 2. Architecture

```
session_events rows (all guest_ids)
  ↓
analyzeGuestBehavior(events, guestId) × N guests    [pure, lib/session-intelligence.ts]
  → GuestBehaviorProfile[]
  ↓
aggregateSessionIntelligence(guestProfiles, orderedItems)  [pure]
  → GuestSessionSummary (+ cross_guest_insights[])
  ↓
                       ← API layer enrichment (intelligence/route.ts) →
session_guests JOIN guest_id → guest_name
orders JOIN guest_id        → orders_placed[]
  ↓
EnrichedGuestProfile[] (= GuestBehaviorProfile + guest_name + orders_placed)
GuestIdentitySummary (connected, named, ordered, not_ordered, anonymous)
  ↓
Admin UI: GuestIntelligencePanel
```

---

## 3. Types

### GuestBehaviorProfile (pure — lib/session-intelligence.ts)
```typescript
type GuestBehaviorProfile = {
  guest_id: string;                          // session_guests.id (V1+) or legacy client UUID
  items_viewed: ViewedItem[];
  high_interest_items: ViewedItem[];         // avg view ≥ 15s
  hesitation_items: CartAbandonmentItem[];   // added then removed
  cart_add_count: number;
  cart_remove_count: number;
  attention_score: AttentionScore | null;    // dominant: dismissed|considered|interested|high_intent
  purchase_style: PurchaseStyle;             // impulsive|deliberate|hesitant
  decision_complexity: DecisionComplexity;   // low|medium|high
  session_duration_ms: number | null;
  event_count: number;
};
```

### EnrichedGuestProfile (API layer — route.ts join)
```typescript
type EnrichedGuestProfile = GuestBehaviorProfile & {
  guest_name: string | null;        // from session_guests.guest_name
  orders_placed: Array<{            // from orders WHERE orders.guest_id = profile.guest_id
    name: string;
    quantity: number;
    menu_item_id: string | null;
  }>;
};
```

### GuestSessionSummary (pure — lib/session-intelligence.ts)
```typescript
type GuestSessionSummary = {
  guest_count: number;
  guests_with_cart_activity: number;
  guests_showing_hesitation: number;
  partial_table_ordering: boolean;
  most_viewed_across_table: CrossGuestItem[];
  collective_high_interest: ViewedItem[];
  dessert_interest: boolean;
  beverage_interest: boolean;
  cross_guest_insights: string[];   // V3.1: human-readable group observations
};
```

### GuestIdentitySummary (API layer — route.ts)
```typescript
type GuestIdentitySummary = {
  connected_guests: number;    // session_guests row count
  named_guests: number;        // guests with guest_name != null
  guests_ordered: number;      // enriched profiles with orders_placed.length > 0
  guests_not_ordered: number;  // connected_guests - guests_ordered
  anonymous_guests: number;    // connected_guests - named_guests
};
```

---

## 4. Guest Identity Attribution Flow

```
Guest scans QR → resolve API returns session_guests.id as guest_id
  ↓
TouchpointMenuPage captures guest_id, stores in state
  ↓
useSessionTracking uses guest_id for ALL events fired
  ↓
session_events.guest_id = session_guests.id  (V1+ data)
  ↓
Guest optionally enters name in GuestNameModal
  ↓
POST /api/public/sessions/:vsid/guest-name → session_guests.guest_name
  ↓
Name persisted to sessionStorage spinbite_gn_{sessionId}
  ↓
On reconnect: name auto-applied from sessionStorage, modal not shown again
```

---

## 5. Order Attribution Flow

```
Guest places order → CartSheet includes guest_id in POST body
  ↓
POST /api/public/orders validates UUID, writes orders.guest_id
  ↓
orders.guest_id FK → session_guests.id
  ↓
Intelligence API joins:
  orders WHERE visit_session_id = sessionId → group by guest_id
  → EnrichedGuestProfile.orders_placed
  ↓
Admin UI shows "Orders Placed" per guest card
```

---

## 6. Cross-Guest Insights

`aggregateSessionIntelligence()` now generates `cross_guest_insights: string[]` — human-readable group observations:

- "N diners showed interest in [item]" (for each item viewed by >1 guest)
- "N diners explored dessert options" (when ≥2 guests viewed dessert items ≥8s)
- "N diners considered beverages" (when ≥2 guests viewed beverage items ≥8s)
- "N diners showed hesitation signals" (when ≥2 guests have hesitation items)

These are prepared for future group-level AI reasoning by the Decision Engine.

---

## 7. API Response (V3.1)

`GET /api/admin/sessions/{id}/intelligence` returns:

```json
{
  // ...all existing SessionIntelligence fields (backward compatible)...
  "behavior": { ...BehavioralIntelligence... },
  "guest_profiles": [ ...EnrichedGuestProfile[] ... ],
  "table_summary": { ...GuestSessionSummary (+ cross_guest_insights)... },
  "guest_identity_summary": { ...GuestIdentitySummary... }
}
```

`guest_profiles` now returns `EnrichedGuestProfile[]` (superset of V3's `GuestBehaviorProfile[]`). All V3 fields are present — existing consumers are unaffected.

---

## 8. Admin UI (V3.1)

`GuestIntelligencePanel` in `app/admin/sessions/page.tsx`:

### Identity Summary Strip (new)
- Connected / Named / Ordered / Not Ordered counts

### Behavioral Summary Strip
- Cart activity / Hesitating / Partial order / Anonymous counts

### Group Insights (new)
- `cross_guest_insights[]` rendered as bullet list

### Shared Interest
- "Viewed by Multiple Guests" — items seen by >1 guest
- "Table High Interest" — collective high-interest union

### Per-Guest Profiles (expandable — V3.1 changes)
- **Label**: `guest_name` if available, else `Guest N` — anonymous labels replaced
- **Summary line**: items · events · orders count
- **Orders Placed section** (new): bullet list of ordered items
- Purchase style badge, attention badge, complexity badge
- Cart metrics, high-interest items, hesitation items

---

## 9. Key Limitation: Legacy guest_id UUIDs

Historical `session_events` rows (before Guest Identity V1, 2026-06-29) contain client-generated UUIDs that do NOT link to `session_guests` rows. The Intelligence V3 engine handles these gracefully:
- Profiles are computed correctly from event data
- `guest_name` will be `null` (no matching `session_guests.id`)
- `orders_placed` will be `[]` (no matching `orders.guest_id`)
- Admin UI falls back to "Guest 1", "Guest 2" labels for these profiles

All data from sessions after 2026-06-29 carries correct server-assigned guest_ids.

---

## 10. Functions

| Function | Location | Purpose |
|---|---|---|
| `analyzeGuestBehavior(events, guestId)` | `lib/session-intelligence.ts` | Build `GuestBehaviorProfile` for one guest_id |
| `aggregateSessionIntelligence(profiles, orderedItems)` | `lib/session-intelligence.ts` | Build `GuestSessionSummary` + `cross_guest_insights` |
| Identity enrichment | `intelligence/route.ts` | Join session_guests + orders → `EnrichedGuestProfile[]` + `GuestIdentitySummary` |

---

## 11. Relationship to V2

V3/V3.1 is **additive**. V2 functions (`reconstructSession`, `analyzeSessionBehavior`) are unchanged. Both layers are computed and returned in the same API response.

- V2: session-level timeline, metrics, patterns, AI insights
- V3: per-guest behavioral profiles + table-level aggregation
- V3.1: identity attribution (names + orders) + group insights

---

## 12. Invariants

1. `analyzeGuestBehavior` and `aggregateSessionIntelligence` are pure — no DB calls.
2. `guest_id = null` events (ORDER_PLACED, SESSION_ENDED) are excluded from all guest profiles.
3. A session with one guest produces `guest_count: 1` — degrades gracefully.
4. `partial_table_ordering` fires only when actual orders exist.
5. `EnrichedGuestProfile.guest_name = null` when guest skipped the name modal or session predates V1 — never throw.
6. `EnrichedGuestProfile.orders_placed = []` when no attributed orders exist — never throw.
7. `guest_id` from orders body is UUID-validated before DB insert; invalid values silently become null.
8. Guest labels fall back to "Guest N" (N = array index) when `guest_name` is null — always shown.
9. `cross_guest_insights` may be empty — UI only renders the section when array.length > 0.
10. `GuestIdentitySummary` is computed from `session_guests` row count, not from `guest_profiles` count — these may differ when presence rows exist for inactive/disconnected guests who generated no events.

---

## 13. Validation

`scripts/test-guest-identity.ts` — run to verify identity attribution for any session:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/test-guest-identity.ts [sessionId]
```

Checks:
- session_guests rows exist and guest names present
- session_events.guest_id links to valid session_guests rows
- orders.guest_id links to valid session_guests rows
- Per-guest order attribution breakdown
- Name persistence (named guests have attributed events)
