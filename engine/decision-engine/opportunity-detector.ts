// ── Opportunity Detector ──────────────────────────────────────────────────────
//
// Rule engine that inspects live SessionState and emits detected Opportunities.
// Each rule is a named predicate + confidence scorer.
// Pure function — no DB calls, no side effects.
//
// Rules are evaluated independently so multiple opportunities can coexist
// in a single session.

import type { SessionState, Opportunity, OpportunityType } from './types';

// Keyword patterns for category/item classification
const DESSERT_PATTERN =
  /dessert|sweet|cake|ice.?cream|pastry|pudding|brownie|cookie|halwa|kheer|gulab|ladoo|jalebi|rasmalai/i;

const BEVERAGE_PATTERN =
  /tea|coffee|juice|lassi|drink|chai|soda|shake|smoothie|lemonade|beverage|water|mocktail|cocktail|chai/i;

// ── Confidence calculators ─────────────────────────────────────────────────────

function cartAbandonmentConfidence(idleSeconds: number, cartValue: number): number {
  // Idle time scores: 2 min → 0.45, 5 min → 0.65, 10 min → 0.85, 20 min → 0.95
  const idleScore = Math.min(1, idleSeconds / 1200);
  // Cart value bonus: $10 → +0.05, $25 → +0.1, $50+ → +0.15
  const valueBonus = Math.min(0.15, (cartValue / 50) * 0.15);
  return Math.min(0.95, 0.35 + idleScore * 0.5 + valueBonus);
}

function highInterestConfidence(viewDurationMs: number): number {
  // 20s → 0.55, 30s → 0.65, 60s → 0.80, 90s+ → 0.92
  const durSec = viewDurationMs / 1000;
  return Math.min(0.92, 0.45 + Math.min(durSec / 90, 1) * 0.47);
}

function longDecisionConfidence(durationSeconds: number): number {
  // 3 min → 0.50, 5 min → 0.62, 8 min → 0.75, 12+ min → 0.88
  return Math.min(0.88, 0.40 + Math.min(durationSeconds / 720, 1) * 0.48);
}

// ── Individual rules ──────────────────────────────────────────────────────────

function detectCartAbandonment(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;
  if (state.items_in_cart.length === 0) return null;
  if (state.time_since_last_action_seconds === null) return null;

  // Must be idle for at least 2 minutes with cart items
  const IDLE_THRESHOLD_SEC = 120;
  if (state.time_since_last_action_seconds < IDLE_THRESHOLD_SEC) return null;

  const confidence = cartAbandonmentConfidence(
    state.time_since_last_action_seconds,
    state.current_cart_value,
  );

  return {
    type: 'cart_abandonment',
    confidence,
    context: {
      idle_seconds: state.time_since_last_action_seconds,
      cart_item_count: state.items_in_cart.length,
      cart_value: state.current_cart_value,
      cart_items: state.items_in_cart.map((i) => i.name),
    },
    detected_at: state.snapshot_at,
  };
}

function detectHighInterestNoPurchase(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;

  // Session must be active long enough to be meaningful
  if (state.session_duration_seconds < 60) return null;

  const orderedIds = new Set(
    state.orders_placed
      .map(() => null) // orders don't have item-level ids in state
  );

  // Find items with view duration >= 20s that are not in cart and not ordered
  // We use the view duration as the primary signal; no per-item order matching
  // at this layer (that's handled at the intelligence layer)
  const HIGH_INTEREST_MS = 20_000;
  const candidateItems = state.items_viewed.filter(
    (v) =>
      v.total_view_duration_ms >= HIGH_INTEREST_MS &&
      !state.items_in_cart.some(
        (c) => c.menu_item_id && c.menu_item_id === v.menu_item_id,
      ),
  );

  if (candidateItems.length === 0) return null;

  // Pick the highest-duration item as the primary signal
  const top = candidateItems.reduce((best, item) =>
    item.total_view_duration_ms > best.total_view_duration_ms ? item : best,
  );

  const confidence = highInterestConfidence(top.total_view_duration_ms);

  return {
    type: 'high_interest_no_purchase',
    confidence,
    context: {
      top_item_name: top.name,
      top_item_duration_ms: top.total_view_duration_ms,
      top_item_view_count: top.view_count,
      all_high_interest: candidateItems.map((i) => ({
        name: i.name,
        duration_ms: i.total_view_duration_ms,
      })),
    },
    detected_at: state.snapshot_at,
  };
}

function detectLongDecisionWithoutCart(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;

  // At least 3 minutes elapsed with items viewed but nothing in cart
  const MIN_DURATION_SEC = 180;
  if (state.session_duration_seconds < MIN_DURATION_SEC) return null;
  if (state.items_in_cart.length > 0) return null;
  if (state.items_viewed.length === 0) return null;

  const confidence = longDecisionConfidence(state.session_duration_seconds);

  return {
    type: 'long_decision_without_cart',
    confidence,
    context: {
      session_duration_seconds: state.session_duration_seconds,
      items_viewed_count: state.items_viewed.length,
      current_category: state.current_category,
    },
    detected_at: state.snapshot_at,
  };
}

function detectPostOrderRebrowse(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;
  if (state.orders_placed.length === 0) return null;

  const lastOrder = state.orders_placed[state.orders_placed.length - 1];
  const msSinceOrder = Date.now() - new Date(lastOrder.placed_at).getTime();
  const secSinceOrder = msSinceOrder / 1000;

  // Customer has been browsing again within 5 minutes of ordering
  const REBROWSE_WINDOW_SEC = 300;
  if (secSinceOrder > REBROWSE_WINDOW_SEC) return null;

  // Must have viewed something after the order
  const viewedAfterOrder = state.items_viewed.filter(
    (v) => new Date(v.last_viewed_at).getTime() > new Date(lastOrder.placed_at).getTime(),
  );
  if (viewedAfterOrder.length === 0) return null;

  return {
    type: 'post_order_rebrowse',
    confidence: 0.82,
    context: {
      seconds_since_order: Math.floor(secSinceOrder),
      items_viewed_after_order: viewedAfterOrder.map((v) => v.name),
      current_category: state.current_category,
      last_order_value: lastOrder.subtotal,
    },
    detected_at: state.snapshot_at,
  };
}

function detectDessertInterestAfterMainOrder(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;
  if (state.orders_placed.length === 0) return null;

  const lastOrder = state.orders_placed[state.orders_placed.length - 1];

  // Customer is browsing a dessert category after ordering
  const inDessertCategory =
    state.current_category !== null && DESSERT_PATTERN.test(state.current_category);

  // Or they've viewed a dessert-named item after ordering
  const dessertItemsViewed = state.items_viewed.filter(
    (v) =>
      DESSERT_PATTERN.test(v.name) &&
      new Date(v.last_viewed_at).getTime() > new Date(lastOrder.placed_at).getTime(),
  );

  if (!inDessertCategory && dessertItemsViewed.length === 0) return null;

  const topDessert = dessertItemsViewed.length > 0
    ? dessertItemsViewed.reduce((best, item) =>
        item.total_view_duration_ms > best.total_view_duration_ms ? item : best,
      )
    : null;

  const durMs = topDessert?.total_view_duration_ms ?? 0;
  const confidence = Math.min(0.90, 0.60 + Math.min(durMs / 30_000, 1) * 0.30);

  return {
    type: 'dessert_interest_after_main_order',
    confidence,
    context: {
      in_dessert_category: inDessertCategory,
      current_category: state.current_category,
      dessert_items_viewed: dessertItemsViewed.map((i) => i.name),
      top_dessert: topDessert?.name ?? null,
      main_order_value: lastOrder.subtotal,
    },
    detected_at: state.snapshot_at,
  };
}

function detectMultiGuestPartialOrder(state: SessionState): Opportunity | null {
  if (!state.is_active) return null;
  if (state.guest_count <= 1) return null;

  // Has ordered but likely not all guests have ordered yet
  // Heuristic: orders_count < guest_count (rough proxy)
  const totalItemsOrdered = state.orders_placed.reduce(
    (sum, o) => sum + o.item_count,
    0,
  );

  // If fewer items were ordered than there are guests, some guests may not have ordered
  if (totalItemsOrdered >= state.guest_count) return null;

  // Session must be old enough (5+ minutes) to be meaningful
  if (state.session_duration_seconds < 300) return null;

  const guestCoverage = totalItemsOrdered / state.guest_count;
  const confidence = Math.min(0.85, 0.55 + (1 - guestCoverage) * 0.3);

  return {
    type: 'multi_guest_partial_order',
    confidence,
    context: {
      guest_count: state.guest_count,
      total_items_ordered: totalItemsOrdered,
      estimated_coverage: guestCoverage,
      orders_placed: state.orders_placed.length,
    },
    detected_at: state.snapshot_at,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function detectOpportunities(state: SessionState): Opportunity[] {
  const detectors = [
    detectCartAbandonment,
    detectHighInterestNoPurchase,
    detectLongDecisionWithoutCart,
    detectPostOrderRebrowse,
    detectDessertInterestAfterMainOrder,
    detectMultiGuestPartialOrder,
  ];

  const results: Opportunity[] = [];
  for (const detect of detectors) {
    const opp = detect(state);
    if (opp !== null) results.push(opp);
  }

  // Sort by descending confidence so callers get the strongest signal first
  return results.sort((a, b) => b.confidence - a.confidence);
}
