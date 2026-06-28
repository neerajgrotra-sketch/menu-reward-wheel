// ── SpinBite Decision Engine V1 — Shared Types ───────────────────────────────
//
// All domain types for the real-time decision pipeline.
// Functions live in their respective feature files; types live here.

// ── Session State ─────────────────────────────────────────────────────────────

export type ViewedItem = {
  menu_item_id: string | null;
  name: string;
  view_count: number;
  total_view_duration_ms: number;
  first_viewed_at: string;
  last_viewed_at: string;
};

export type CartItem = {
  menu_item_id: string | null;
  name: string;
  net_quantity: number;
  price_per_item: number;
  last_modified_at: string;
};

export type RemovedCartItem = {
  menu_item_id: string | null;
  name: string;
  remove_count: number;
  last_removed_at: string;
};

export type PlacedOrder = {
  order_id: string | null;
  order_number: number | null;
  placed_at: string;
  item_count: number;
  subtotal: number;
};

export type SessionContext = {
  id: string;
  restaurant_id: string;
  touchpoint_id: string | null;
  started_at: string;
  status: string;
  guest_count: number;
};

export type SessionState = {
  session_id: string;
  restaurant_id: string;
  touchpoint_id: string | null;
  started_at: string;
  snapshot_at: string;

  // Time signals
  session_duration_seconds: number;
  time_since_last_action_seconds: number | null;

  // Navigation
  current_category: string | null;

  // Item behavior
  items_viewed: ViewedItem[];

  // Cart (post-last-order only)
  items_in_cart: CartItem[];
  items_removed_from_cart: RemovedCartItem[];
  current_cart_value: number;

  // Orders
  orders_placed: PlacedOrder[];

  guest_count: number;
  is_active: boolean;
};

// ── Opportunity Detection ─────────────────────────────────────────────────────

export type OpportunityType =
  | 'cart_abandonment'
  | 'high_interest_no_purchase'
  | 'long_decision_without_cart'
  | 'post_order_rebrowse'
  | 'dessert_interest_after_main_order'
  | 'multi_guest_partial_order';

export type Opportunity = {
  type: OpportunityType;
  confidence: number;             // 0.0–1.0
  context: Record<string, unknown>;
  detected_at: string;
};

// ── Intervention Policy ───────────────────────────────────────────────────────

export type ActionType =
  | 'coupon_offer'
  | 'promotion_popup'
  | 'ai_recommendation'
  | 'spin_wheel_trigger'
  | 'waiter_notification'
  | 'combo_offer';

export type Intervention = {
  action: ActionType;
  opportunity: OpportunityType;
  priority: number;               // lower = higher priority
  confidence: number;
  payload: Record<string, unknown>;
};

// ── Dispatcher ────────────────────────────────────────────────────────────────

export type DispatchAction = {
  type: ActionType;
  session_id: string;
  restaurant_id: string;
  opportunity: OpportunityType;
  confidence: number;
  payload: Record<string, unknown>;
};

export type DispatchResult = {
  dispatched: boolean;
  action: ActionType;
  channel: string;
  intervention_event_id: string | null;
  error: string | null;
};
