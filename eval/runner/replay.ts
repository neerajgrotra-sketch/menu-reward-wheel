// Tier 1 — the deterministic replay engine. Feeds a golden conversation's
// recorded planner output through the real parser and the real downstream
// pipeline (via a capability adapter), never calling the LLM. See
// eval/README.md for the two-tier design this is half of.

import { menuPricingAdapter } from './adapters/menu-pricing';
import { revenueIntelligenceAdapter } from './adapters/revenue-intelligence';
import { FakeSupabaseClient } from './fake-supabase';
import type { GoldenConversation, GoldenTurn, EvalContext, ConversationState, CapabilityEvalAdapter, AssertionResult, RestaurantFixture, MenuFixture, OrdersFixture } from './types';
import type { CapabilityKey } from '@/lib/restaurant-planner/tool-registry';

import { punjabiByNature } from '../fixtures/restaurants/punjabi-by-nature';
import { smallCafe } from '../fixtures/restaurants/small-cafe';
import { punjabiByNatureMenu } from '../fixtures/menus/punjabi-by-nature-menu';
import { smallCafeMenu } from '../fixtures/menus/small-cafe-menu';
import { punjabiByNatureOrders } from '../fixtures/orders/punjabi-by-nature-orders';
import { smallCafeThinDataOrders } from '../fixtures/orders/small-cafe-thin-data-orders';

// One manual entry per capability, matching CAPABILITY_REGISTRY's and
// TOOL_REGISTRY's own convention ("a future capability's tools get added
// the same way — one entry each"). Golden conversation FILES are
// auto-discovered (see discover.ts); this mapping of "how to run one" is
// the one piece that can't be, since each capability's pipeline has a
// different shape.
export const CAPABILITY_EVAL_ADAPTERS: Partial<Record<CapabilityKey, CapabilityEvalAdapter>> = {
  menu_pricing: menuPricingAdapter,
  revenue_intelligence: revenueIntelligenceAdapter,
};

const RESTAURANT_FIXTURES: Record<string, RestaurantFixture> = {
  'punjabi-by-nature': punjabiByNature,
  'small-cafe': smallCafe,
};
const MENU_FIXTURES: Record<string, MenuFixture> = {
  'punjabi-by-nature-menu': punjabiByNatureMenu,
  'small-cafe-menu': smallCafeMenu,
};
const ORDERS_FIXTURES: Record<string, OrdersFixture> = {
  'punjabi-by-nature-orders': punjabiByNatureOrders,
  'small-cafe-thin-data-orders': smallCafeThinDataOrders,
};

export type TurnResult = {
  turnIndex: number;
  userMessage: string;
  assertions: AssertionResult[];
  actionAssertions?: AssertionResult[];
};

export type ConversationResult = {
  conversation: GoldenConversation;
  turns: TurnResult[];
  ctx?: EvalContext;
  error?: string;
};

function buildFakeClient(menu: MenuFixture, orders?: OrdersFixture): FakeSupabaseClient {
  return new FakeSupabaseClient({
    restaurant_menu_assignments: menu.assignments,
    menus: menu.menus,
    menu_categories: menu.categories,
    menu_items: menu.items,
    restaurant_planner_proposals: [],
    menu_discount_change_log: [],
    orders: orders?.orders ?? [],
    order_items: orders?.orderItems ?? [],
    promotions: orders?.promotions ?? [],
    promotion_rewards: orders?.promotionRewards ?? [],
    coupon_redemptions: orders?.couponRedemptions ?? [],
  });
}

export async function replayConversation(conversation: GoldenConversation): Promise<ConversationResult> {
  const adapter = CAPABILITY_EVAL_ADAPTERS[conversation.capability];
  if (!adapter) {
    return {
      conversation,
      turns: [],
      error: `No eval adapter registered for capability "${conversation.capability}" — see eval/runner/replay.ts's CAPABILITY_EVAL_ADAPTERS. Every future capability needs exactly one entry here before its golden conversations can run.`,
    };
  }

  const restaurant = RESTAURANT_FIXTURES[conversation.restaurantFixture];
  const menu = MENU_FIXTURES[conversation.menuFixture];
  if (!restaurant) return { conversation, turns: [], error: `Unknown restaurantFixture "${conversation.restaurantFixture}".` };
  if (!menu) return { conversation, turns: [], error: `Unknown menuFixture "${conversation.menuFixture}".` };
  const orders = conversation.ordersFixture ? ORDERS_FIXTURES[conversation.ordersFixture] : undefined;
  if (conversation.ordersFixture && !orders) return { conversation, turns: [], error: `Unknown ordersFixture "${conversation.ordersFixture}".` };

  const ctx: EvalContext = { restaurant, menu, fakeClient: buildFakeClient(menu, orders) };
  let state: ConversationState = {};
  const turnResults: TurnResult[] = [];

  for (let i = 0; i < conversation.turns.length; i++) {
    const turn = conversation.turns[i];
    // A "modify this proposal" golden turn can't hard-code a real
    // proposal_group_id in its fixture file — that id is only generated at
    // runTurn time (randomUUID(), a fresh value every replay). Golden
    // conversations reference the CURRENTLY open group via this literal
    // placeholder in their recordedPlannerOutputRaw, substituted here
    // (mirrors what a real conversation_history [proposal:<id>] tag +
    // model echo does) before the adapter ever sees the JSON.
    const effectiveTurn: GoldenTurn = {
      ...turn,
      recordedPlannerOutputRaw: turn.recordedPlannerOutputRaw.replace(/__OPEN_PROPOSAL_GROUP_ID__/g, state.openProposalGroupId ?? ''),
    };
    const { actual, state: stateAfterTurn } = await adapter.runTurn(ctx, effectiveTurn, state);
    state = stateAfterTurn;
    const assertions = adapter.assert(turn.expected, actual);

    let actionAssertions: AssertionResult[] | undefined;
    if (turn.userAction) {
      if (!adapter.runAction || !adapter.assertAfterAction) {
        actionAssertions = [
          { pass: false, message: `Capability "${conversation.capability}" adapter has no runAction/assertAfterAction, but turn ${i} declares a userAction.` },
        ];
      } else {
        const { actualAfterAction, state: stateAfterAction } = await adapter.runAction(ctx, turn, actual, state);
        state = stateAfterAction;
        actionAssertions = turn.expectedAfterAction ? adapter.assertAfterAction(turn.expectedAfterAction, actualAfterAction) : [];
      }
    }

    turnResults.push({ turnIndex: i, userMessage: turn.userMessage, assertions, actionAssertions });
  }

  return { conversation, turns: turnResults, ctx };
}
