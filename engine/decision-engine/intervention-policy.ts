// ── Intervention Policy Engine ────────────────────────────────────────────────
//
// Maps detected opportunities to allowed actions.
// Policy is deterministic — same opportunity always yields the same candidate
// action set, ranked by priority.
//
// The dispatcher is responsible for deciding WHICH action to actually fire
// (e.g. respecting cooldowns, restaurant settings, budget constraints).
// The policy engine only answers: "what COULD we do here?"
//
// Priority: 1 = highest urgency.

import type { Opportunity, OpportunityType, ActionType, Intervention } from './types';

type PolicyRule = {
  action: ActionType;
  priority: number;
  payloadBuilder: (opp: Opportunity) => Record<string, unknown>;
};

// ── Policy table ──────────────────────────────────────────────────────────────
// Each opportunity maps to an ordered list of candidate actions.

const POLICY: Record<OpportunityType, PolicyRule[]> = {
  cart_abandonment: [
    {
      action: 'coupon_offer',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'cart_abandonment',
        idle_seconds: opp.context.idle_seconds,
        cart_value: opp.context.cart_value,
        cart_items: opp.context.cart_items,
        suggested_discount_percent: 10,
        expiry_minutes: 10,
      }),
    },
    {
      action: 'waiter_notification',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'cart_abandonment',
        idle_seconds: opp.context.idle_seconds,
        cart_items: opp.context.cart_items,
        message: 'Table may need assistance — items in cart, no order placed.',
      }),
    },
  ],

  high_interest_no_purchase: [
    {
      action: 'ai_recommendation',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'high_interest_no_purchase',
        focus_item: opp.context.top_item_name,
        all_high_interest: opp.context.all_high_interest,
        prompt_hint: `Customer showed strong interest in ${opp.context.top_item_name}. Suggest pairing or highlight value.`,
      }),
    },
    {
      action: 'combo_offer',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'high_interest_no_purchase',
        anchor_item: opp.context.top_item_name,
        message: `Try a combo featuring ${opp.context.top_item_name}`,
      }),
    },
    // V1 active dispatcher — waiter notification is the fallback when AI/combo are not yet wired
    {
      action: 'waiter_notification',
      priority: 3,
      payloadBuilder: (opp) => ({
        trigger: 'high_interest_no_purchase',
        focus_item: opp.context.top_item_name,
        all_high_interest: opp.context.all_high_interest,
        message: `Guest showing strong interest in "${opp.context.top_item_name}" — consider a recommendation.`,
      }),
    },
  ],

  long_decision_without_cart: [
    {
      action: 'ai_recommendation',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'long_decision_without_cart',
        session_duration_seconds: opp.context.session_duration_seconds,
        current_category: opp.context.current_category,
        prompt_hint: `Customer has been browsing for ${Math.round((opp.context.session_duration_seconds as number) / 60)} minutes without adding anything to cart. Suggest popular items.`,
      }),
    },
    {
      action: 'promotion_popup',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'long_decision_without_cart',
        current_category: opp.context.current_category,
        message: 'Not sure what to order? Check out today\'s specials.',
      }),
    },
  ],

  post_order_rebrowse: [
    {
      action: 'combo_offer',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'post_order_rebrowse',
        seconds_since_order: opp.context.seconds_since_order,
        browsing_items: opp.context.items_viewed_after_order,
        current_category: opp.context.current_category,
        message: 'Add more to your order? Enjoy a second-round deal.',
      }),
    },
    {
      action: 'spin_wheel_trigger',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'post_order_rebrowse',
        seconds_since_order: opp.context.seconds_since_order,
        message: 'Order another round and spin the reward wheel!',
      }),
    },
  ],

  dessert_interest_after_main_order: [
    {
      action: 'combo_offer',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'dessert_interest_after_main_order',
        dessert_items: opp.context.dessert_items_viewed,
        top_dessert: opp.context.top_dessert,
        main_order_value: opp.context.main_order_value,
        message: `Add ${opp.context.top_dessert ?? 'a dessert'} to complete your meal.`,
        suggested_discount_percent: 15,
      }),
    },
    {
      action: 'promotion_popup',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'dessert_interest_after_main_order',
        top_dessert: opp.context.top_dessert,
        message: 'Treat yourself — dessert discount available today only.',
      }),
    },
    // V1 active dispatcher — waiter notification is the fallback when combo/popup are not yet wired
    {
      action: 'waiter_notification',
      priority: 3,
      payloadBuilder: (opp) => ({
        trigger: 'dessert_interest_after_main_order',
        top_dessert: opp.context.top_dessert,
        dessert_items: opp.context.dessert_items_viewed,
        message: `Guest browsing desserts after ordering — suggest ${opp.context.top_dessert ?? 'a dessert'}.`,
      }),
    },
  ],

  multi_guest_partial_order: [
    {
      action: 'waiter_notification',
      priority: 1,
      payloadBuilder: (opp) => ({
        trigger: 'multi_guest_partial_order',
        guest_count: opp.context.guest_count,
        total_items_ordered: opp.context.total_items_ordered,
        message: `Table has ${opp.context.guest_count} guests but only ${opp.context.total_items_ordered} items ordered. Check if anyone still needs to order.`,
      }),
    },
    {
      action: 'ai_recommendation',
      priority: 2,
      payloadBuilder: (opp) => ({
        trigger: 'multi_guest_partial_order',
        guest_count: opp.context.guest_count,
        prompt_hint: `Party of ${opp.context.guest_count}. Suggest group-friendly or shareable items.`,
      }),
    },
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function resolveInterventions(opportunities: Opportunity[]): Intervention[] {
  const interventions: Intervention[] = [];

  for (const opp of opportunities) {
    const rules = POLICY[opp.type] ?? [];
    for (const rule of rules) {
      interventions.push({
        action: rule.action,
        opportunity: opp.type,
        priority: rule.priority,
        confidence: opp.confidence,
        payload: rule.payloadBuilder(opp),
      });
    }
  }

  // Sort: primary by priority (1 first), secondary by confidence (highest first)
  return interventions.sort(
    (a, b) => a.priority - b.priority || b.confidence - a.confidence,
  );
}

// ── Best intervention selector ────────────────────────────────────────────────
// Returns the single highest-priority intervention above a confidence threshold.
// Used when you want to take exactly one action per decision cycle.

export function selectBestIntervention(
  opportunities: Opportunity[],
  minConfidence = 0.5,
): Intervention | null {
  const ranked = resolveInterventions(opportunities).filter(
    (i) => i.confidence >= minConfidence,
  );
  return ranked.length > 0 ? ranked[0] : null;
}
