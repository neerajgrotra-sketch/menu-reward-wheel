# Session Intelligence Engine V2

**Document version:** 1.2
**Date:** 2026-06-29
**Status:** Live — session-level analysis layer. Superseded at the guest-behavioral layer by V3 (see `intelligence_engine_v3.md`). V2 functions remain in production alongside V3.

> **V3 added:** `analyzeGuestBehavior()` + `aggregateSessionIntelligence()` for per-guest profiles. See `architecture/intelligence_engine_v3.md`.

---

## 1. Architecture Summary

The Session Intelligence Engine V2 is a **pure TypeScript analysis layer** that reads `session_events` (the relational behavioral log) and `orders` tables for a session and produces two structured outputs:

1. **`SessionIntelligence`** — reconstructed session timeline, viewed items, ordered items, derived metrics
2. **`BehavioralIntelligence`** — behavioral patterns, item attention scores, semantic narrative, AI insights

Neither function makes DB calls. They are pure transformations over event data loaded by the API route (`GET /api/admin/sessions/{id}/intelligence`).

**Location:** `lib/session-intelligence.ts`

---

## 2. session_events Input

The raw input is all `session_events` rows for a session, ordered chronologically.

```typescript
type RawSessionEvent = {
  id: string;
  session_id: string;
  guest_id: string | null;   // ephemeral browser-tab UUID; null for server events
  event_type: string;        // one of the 10 registered types
  menu_item_id: string | null;
  promotion_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};
```

The engine also receives a parallel `orders` array from the `orders` join (order_items included).

---

## 3. Behavior Timeline

`reconstructSession()` builds a **chronological timeline** of all events, collapsing `ITEM_VIEW_DURATION` into its paired `ITEM_VIEWED` entry (ITEM_VIEW_DURATION is folded as `detail` text, not rendered as a separate row).

Each timeline entry has:
```typescript
type TimelineEntry = {
  id: string;
  timestamp: string;
  event_type: string;
  label: string;       // human-readable description ("Butter Chicken viewed")
  detail: string | null; // supplementary text ("12 sec", "Order #3 · $28.50")
  menu_item_id: string | null;
};
```

The full timeline is rendered in the admin sessions panel under "Session Timeline".

---

## 4. Cart Funnel Signals

The engine derives cart funnel signals from `ITEM_ADDED_TO_CART` and `ITEM_REMOVED_FROM_CART` events:

| Signal | Derived from |
|---|---|
| `cart_add_count` | Count of ITEM_ADDED_TO_CART events |
| `cart_remove_count` | Count of ITEM_REMOVED_FROM_CART events |
| `cart_abandonment_items` | Items added but not in any order |
| `viewed_added_not_ordered` | Items added to cart but never ordered |
| `added_removed_not_ordered` | Items added then explicitly removed, never ordered |

Cart state resets after each `ORDER_PLACED` event. The engine only tracks the post-last-order cart when computing the live decision engine state.

---

## 5. Viewed Items

`ITEM_VIEWED` and `ITEM_VIEW_DURATION` events are paired per item:

- `view_count` — number of times the item detail was opened
- `total_view_duration_ms` — sum of all ITEM_VIEW_DURATION values for this item
- `avg_view_duration_ms` — used for attention scoring

`viewed_not_ordered` = items with view data that do not appear as ordered items in any order.

---

## 6. Add/Remove Signals

`ITEM_ADDED_TO_CART` and `ITEM_REMOVED_FROM_CART` are keyed by `menu_item_id` (or `__name__{name}` fallback for items with null ID).

These signals feed the `BehavioralPattern.hesitation_items` array: items that were explicitly added then removed, never ordered. These are high-quality signals for friction or price sensitivity.

---

## 7. High Intent Detection

High intent = viewed item with `avg_view_duration_ms >= 20,000ms` (20 seconds) that was **not ordered**.

- Used in `derived_metrics.high_interest_items_not_ordered`
- Used in `BehavioralIntelligence.patterns.high_interest_items`
- Threshold: 15,000ms for behavioral intelligence; 20,000ms for metrics

These items are the primary signal for the Decision Engine's `high_interest_no_purchase` opportunity type.

---

## 8. Purchase Style

Classified by `analyzeSessionBehavior()`:

| Style | Conditions |
|---|---|
| `impulsive` | Decision latency < 90s AND no cart removals AND at least one order placed |
| `hesitant` | Cart removals exist OR ≥2 high-interest items not ordered |
| `deliberate` | All other cases |

**Decision latency** = time from first `MENU_OPENED` event to first `ORDER_PLACED` event.

---

## 9. Decision Complexity

| Complexity | Conditions |
|---|---|
| `low` | ≤3 items viewed, ≤1 category visited, ≤2 total cart actions |
| `high` | ≥8 items viewed OR ≥4 categories visited OR ≥6 cart actions |
| `medium` | All other cases |

---

## 10. Attention Score (Per Item)

Each viewed item is assigned one of four attention scores based on `avg_view_duration_ms`:

| Score | Threshold | Meaning |
|---|---|---|
| `dismissed` | 0–3s | Glanced at briefly; not engaged |
| `considered` | 3–12s | Read the description; actively considering |
| `interested` | 12–25s | Strong consideration; comparison shopping |
| `high_intent` | >25s | Near-commit; typically orders this or a similar item |

The full `scored_items` list is rendered in the admin intelligence panel under "Item Attention".

---

## 11. AI Insights Panel

`analyzeSessionBehavior()` produces `SessionInsight[]` — a list of structured findings with recommendations:

| Finding trigger | Recommendation strategy |
|---|---|
| High-interest item not ordered | Limited-time deal or combo |
| Item added then removed | Smaller portion or lower price point |
| Impulsive purchase style | Surface premium add-ons at checkout |
| Hesitant purchase style | Chef's Picks or staff recommendation |
| Deliberate purchase style | Detailed descriptions and visible ratings |
| Strong category preference | Feature items from that category |
| Low conversion rate (≥4 items viewed, <30% ordered) | Improve photography or descriptions |
| Unconverted beverage engagement | Beverage combo promotion |

Insights are rendered as expandable cards in the admin sessions panel under "AI Insights".

---

## 12. Semantic Timeline

`analyzeSessionBehavior()` also produces `TimelineNarrative[]` — a natural-language interpretation of key events:

- `significance: 'high'` — Order placed, item removed from cart, high-duration view of unordered item
- `significance: 'medium'` — Item added to cart, item view (12–25s)
- `significance: 'low'` — Menu opened, category browsed, promotion viewed

The admin panel shows key moments only (high + medium significance) under "Behavioral Narrative".

---

## 13. Full Event Taxonomy (Stabilization Sprint — 2026-06-29)

All 10 event types are now fully wired. The complete behavioral pipeline:

```
Customer scans QR code → session resolves
  ↓
MENU_OPENED
  Powers: session start marker, decision latency calculation, total session duration

Customer taps a category pill in the nav bar
  ↓
CATEGORY_OPENED
  Powers: category preference analysis, decision complexity, category path in timeline
  Note: fires on explicit nav tap only. Scroll-based section transitions are not tracked (intentional — explicit intent only).
  Metadata: category_id, category_name, previous_category_id, previous_category_name

Customer taps an item card to open the detail sheet
  ↓
ITEM_VIEWED
  Powers: viewed_not_ordered list, viewed items count, cart funnel, AI insights, item attention scoring
  Metadata: item_name, price_snapshot, effective_price_snapshot, is_on_special, discount_percent, has_image, dietary_tags, category_id, category_name

Customer closes the item detail sheet
  ↓
ITEM_VIEW_DURATION
  Powers: attention scoring (dismissed/considered/interested/high_intent), high_interest_no_purchase opportunity detection
  Metadata: item_name, duration_ms
  Thresholds: dismissed (0–3s) | considered (3–12s) | interested (12–25s) | high_intent (>25s)

Customer taps + on the menu card OR taps "Add to Order" in the detail sheet
  ↓
ITEM_ADDED_TO_CART
  Powers: cart funnel, cart abandonment detection, purchase style classification, hesitation detection
  Sources: 'menu_card' (quick-add grid button) | 'detail_sheet' (panel Add to Order)
  Metadata: item_id, item_name, quantity, price_snapshot, effective_price_snapshot, source, special_instructions_present

Customer taps − or Remove in the cart sheet
  ↓
ITEM_REMOVED_FROM_CART
  Powers: hesitation_items, cart_abandonment, deliberate vs hesitant purchase style, ai_recommendation triggers
  Two firing paths:
    - Partial decrement (qty 3→2): quantity_removed=1, previous_quantity=3
    - Full removal (qty 1→0 or Remove button): quantity_removed=full_qty, previous_quantity=full_qty
  Metadata: item_id, item_name, quantity_removed, previous_quantity, cart_subtotal_before, cart_subtotal_after

Customer submits their order
  ↓
ORDER_PLACED (server-side only — not client-fireable)
  Powers: orders_count, total_spend, decision latency end, cart state reset, semantic timeline milestone
  Written by: /api/public/orders route after successful insert + counter increment
  Metadata: order_id, order_number, item_count, subtotal

Customer opens the promotion widget bottom sheet
  ↓
PROMOTION_VIEWED
  Powers: promotion engagement rate, promotion funnel, future AI promotion targeting
  Sources: 'widget_sheet' (floating button tap) | 'entry_modal' (auto-shown game entry modal)
  Metadata: promotion_name, source
  promotionId FK: stored in session_events.promotion_id column

Customer taps Play Now on the promotion widget or game entry modal
  ↓
PROMOTION_PLAYED
  Powers: promotion conversion rate, game type preference, future AI promotion A/B
  Sources: 'widget_sheet' | 'entry_modal'
  Metadata: promotion_name, source, game_type
  Note: fires before navigation to /play/{slug}/{promoSlug}; always captured even with reduced motion

Admin clicks End Session
  ↓
SESSION_ENDED (server-side only — not client-fireable)
  Powers: session duration analytics, session lifecycle timeline, abandoned vs completed segmentation
  Written by: /api/admin/sessions/[sessionId]/end route after status update
  Metadata: reason ('manual'), duration_seconds
```

---

## 14. Event Wiring Map (as of 2026-06-29)

| Event | Source | File | Status |
|---|---|---|---|
| `MENU_OPENED` | Client | `TouchpointMenuPage.tsx:339` (direct fetch after resolve) | ✅ Wired |
| `CATEGORY_OPENED` | Client | `RestaurantPublicPage.tsx` nav pill → `onCategoryOpened` → `useSessionTracking.fireEvent` | ✅ Wired |
| `ITEM_VIEWED` | Client | `RestaurantPublicPage.tsx openSheet()` → `useItemViewTracking.onItemOpen` | ✅ Wired |
| `ITEM_VIEW_DURATION` | Client | `RestaurantPublicPage.tsx closeSheet()` → `useItemViewTracking.onItemClose` | ✅ Wired |
| `ITEM_ADDED_TO_CART` | Client | Two paths in `RestaurantPublicPage.tsx` → `onItemAddedToCart` → `fireEvent` | ✅ Wired |
| `ITEM_REMOVED_FROM_CART` | Client | `CartSheet.tsx` minus button + Remove button → `onItemRemovedFromCart` → `fireEvent` | ✅ Wired (incl. partial) |
| `ORDER_PLACED` | Server | `app/api/public/orders/route.ts` step 16 | ✅ Wired |
| `PROMOTION_VIEWED` | Client | `RewardWidget.openSheet()` + `GameEntryModal` mount → `onPromotionViewed` → `fireEvent` | ✅ Wired |
| `PROMOTION_PLAYED` | Client | `RewardWidget.handlePlay()` + `GameEntryModal.handlePlay()` → `onPromotionPlayed` → `fireEvent` | ✅ Wired |
| `SESSION_ENDED` | Server | `app/api/admin/sessions/[sessionId]/end/route.ts` | ✅ Wired |

---

## 15. Remaining Limitations

| Limitation | Root cause |
|---|---|
| Cart state resets fully after each order | Multi-round ordering may lose pre-order cart signals — by design; tracks post-last-order state only |
| Order attribution not per-guest | `ORDER_PLACED` is server-side with no `guest_id`; ordered items remain session-level only (see V3 invariant 3) |
| Decision Engine V1 is architecture-only | Opportunity detection runs but all 6 dispatcher handlers are stubs; `dispatched: false` always |
| Intelligence route is on-demand | No background pre-computation; first load after session card expand |
| Scroll-based category changes not tracked | `CATEGORY_OPENED` only fires on explicit nav tap (intentional — passive scrolls are not intent signals) |

---

## 16. Data Flow

```
Customer browses menu
  ↓ client fires ITEM_VIEWED, ITEM_VIEW_DURATION, etc.
  POST /api/public/sessions/{id}/track
    → INSERT into session_events (non-blocking)

Customer places order
  POST /api/public/orders
    → server INSERTs ORDER_PLACED into session_events

Admin expands session card
  GET /api/admin/sessions/{id}/intelligence
    ↓
    load session_events (all events, chronological)
    load orders + order_items (all orders for session)
    ↓
    reconstructSession(events, orders, session)
      → SessionIntelligence
    ↓
    analyzeSessionBehavior(intelligence, events)
      → BehavioralIntelligence
    ↓
  return { ...intelligence, behavior }
    ↓
  Admin UI renders:
    - Derived metrics strip
    - Cart funnel metrics
    - Category path
    - Session timeline
    - Viewed not ordered
    - Ordered items
    - Cart funnel detail
    - AI Insights panel
    - Session metadata
```

---

## 17. Entry Points

| Function | Location | Purpose |
|---|---|---|
| `reconstructSession()` | `lib/session-intelligence.ts` | Build SessionIntelligence from raw events + orders |
| `analyzeSessionBehavior()` | `lib/session-intelligence.ts` | Build BehavioralIntelligence from SessionIntelligence |
| `GET /api/admin/sessions/{id}/intelligence` | `app/api/admin/sessions/[sessionId]/intelligence/route.ts` | API entry point; fetches data, calls both functions |
| `IntelligencePanel` | `app/admin/sessions/page.tsx` | React component rendering the full intelligence view |
