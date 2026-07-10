import type { GoldenConversation } from '../../runner/types';

// The global thin-data gate (lib/restaurant-planner/revenue-intelligence/
// facts.ts) applies to EVERY goal, including ones that would otherwise
// produce an opportunity — 2 completed orders is below
// MIN_ORDERS_FOR_ANY_OPPORTUNITY (5), so this must degrade to an honest
// "not enough history" answer, never a fabricated recommendation.
export const conversation: GoldenConversation = {
  id: 'revenue_intelligence/thin-data-gate',
  capability: 'revenue_intelligence',
  description: 'A goal-shaped ask against a restaurant with almost no order history gets an honest "not enough data" answer, not a fabricated opportunity.',
  restaurantFixture: 'small-cafe',
  menuFixture: 'small-cafe-menu',
  ordersFixture: 'small-cafe-thin-data-orders',
  turns: [
    {
      userMessage: 'Help me sell more drinks',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({ intent: 'revenue_goal', goal: 'increase_beverage_sales' }),
      expected: {
        intent: 'revenue_goal',
        goal: 'increase_beverage_sales',
        deterministicResult: {
          kind: 'answer',
          textContains: ['needs more order history', 'only 2 completed orders'],
        },
      },
    },
  ],
};
