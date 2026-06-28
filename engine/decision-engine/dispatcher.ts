// ── Action Dispatcher V1 ──────────────────────────────────────────────────────
//
// Architecture-only. Each action handler is a stub that defines the interface
// contract for the delivery mechanism. No UI, no live integrations yet.
//
// The dispatcher's job:
//   1. Receive a DispatchAction from the policy engine
//   2. Route to the appropriate handler
//   3. Persist an intervention_events record (via service client)
//   4. Return a DispatchResult indicating success/failure + channel used
//
// When a handler is wired up, replace the stub body with the real implementation.
// The interface contract must not change — only the body changes.

import type { ActionType, DispatchAction, DispatchResult } from './types';

// ── Delivery channel identifiers ──────────────────────────────────────────────

export const CHANNELS = {
  CUSTOMER_UI: 'customer_ui',         // Toast / popup on the public menu page
  WAITER_DASHBOARD: 'waiter_dash',    // Notification on the restaurant staff view
  SPIN_WHEEL: 'spin_wheel',           // Triggers the reward wheel flow on public UI
  AI_AGENT: 'ai_agent',              // Routes to the intelligence engine for copy generation
  COUPON_ENGINE: 'coupon_engine',     // Issues a coupon via the existing coupon system
  COMBO_OVERLAY: 'combo_overlay',     // Displays a combo deal overlay on public menu
} as const;

export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

// ── Handler stubs ─────────────────────────────────────────────────────────────
// Each function describes WHAT it will do and returns a stub DispatchResult.
// Replace the body with the real implementation when wiring up the delivery layer.

async function handleCouponOffer(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Call POST /api/coupons/issue with action.payload (discount_percent, expiry_minutes)
  //   2. Associate the issued coupon with action.session_id
  //   3. Push coupon code to the customer UI via Supabase Realtime broadcast
  //   4. Record the intervention_events row
  console.log('[dispatcher] coupon_offer stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.COUPON_ENGINE);
}

async function handlePromotionPopup(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Select the best matching active promotion for this restaurant
  //   2. Broadcast a Realtime event to the customer's session channel
  //   3. Customer UI listens on channel `session:{session_id}:events` and renders popup
  //   4. Record the intervention_events row
  console.log('[dispatcher] promotion_popup stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.CUSTOMER_UI);
}

async function handleAIRecommendation(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Feed action.payload.prompt_hint to the intelligence engine (lib/intelligence/)
  //   2. Intelligence engine generates a 1–2 sentence natural-language recommendation
  //   3. Broadcast recommendation text to session channel
  //   4. Customer UI renders as an AI suggestion card
  //   5. Record the intervention_events row
  console.log('[dispatcher] ai_recommendation stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.AI_AGENT);
}

async function handleSpinWheelTrigger(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Check restaurant has an active promotion with available spins
  //   2. Broadcast a spin_wheel_unlock event to session channel
  //   3. Customer UI enables the reward wheel CTA with unlock animation
  //   4. Record the intervention_events row
  console.log('[dispatcher] spin_wheel_trigger stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.SPIN_WHEEL);
}

async function handleWaiterNotification(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Broadcast to `restaurant:{restaurant_id}:waiter` Realtime channel
  //   2. Restaurant admin dashboard listens and displays an alert badge on the session card
  //   3. Notification includes table/touchpoint name, trigger type, and context message
  //   4. Record the intervention_events row
  console.log('[dispatcher] waiter_notification stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.WAITER_DASHBOARD);
}

async function handleComboOffer(action: DispatchAction): Promise<DispatchResult> {
  // IMPLEMENTATION STUB
  // Will:
  //   1. Identify relevant combo from restaurant's active combos (by anchor item)
  //   2. Broadcast combo details to session channel
  //   3. Customer UI renders a bottom-sheet combo card
  //   4. Record the intervention_events row
  console.log('[dispatcher] combo_offer stub — session:', action.session_id, action.payload);
  return stub(action, CHANNELS.COMBO_OVERLAY);
}

// ── Stub helper ───────────────────────────────────────────────────────────────

function stub(action: DispatchAction, channel: Channel): DispatchResult {
  return {
    dispatched: false,             // stubs never actually dispatch
    action: action.type,
    channel,
    intervention_event_id: null,   // set by real implementation after DB write
    error: 'STUB: implementation not yet wired',
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

const HANDLER_MAP: Record<ActionType, (action: DispatchAction) => Promise<DispatchResult>> = {
  coupon_offer:        handleCouponOffer,
  promotion_popup:     handlePromotionPopup,
  ai_recommendation:   handleAIRecommendation,
  spin_wheel_trigger:  handleSpinWheelTrigger,
  waiter_notification: handleWaiterNotification,
  combo_offer:         handleComboOffer,
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function dispatcher(action: DispatchAction): Promise<DispatchResult> {
  const handler = HANDLER_MAP[action.type];
  if (!handler) {
    return {
      dispatched: false,
      action: action.type,
      channel: 'none',
      intervention_event_id: null,
      error: `Unknown action type: ${action.type}`,
    };
  }

  try {
    return await handler(action);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Dispatcher error';
    return {
      dispatched: false,
      action: action.type,
      channel: 'none',
      intervention_event_id: null,
      error: message,
    };
  }
}

// ── Decision cycle helper ─────────────────────────────────────────────────────
// Convenience wrapper: builds an action from a resolved Intervention and fires it.

import type { Intervention } from './types';

export function interventionToAction(
  intervention: Intervention,
  session_id: string,
  restaurant_id: string,
): DispatchAction {
  return {
    type: intervention.action,
    session_id,
    restaurant_id,
    opportunity: intervention.opportunity,
    confidence: intervention.confidence,
    payload: intervention.payload,
  };
}
