import type { GoldenConversation } from '../../runner/types';

export const conversation: GoldenConversation = {
  id: 'revenue_intelligence/aov-paired-item',
  capability: 'revenue_intelligence',
  description: '"Increase average order value" finds Cardamom Chai + Ras Malai as the real top co-purchased pair (6 shared orders) and proposes a paired-item discount — never a fabricated "bundle."',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  ordersFixture: 'punjabi-by-nature-orders',
  turns: [
    {
      userMessage: 'Increase average order value',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({ intent: 'revenue_goal', goal: 'increase_average_order_value' }),
      expected: {
        intent: 'revenue_goal',
        goal: 'increase_average_order_value',
        deterministicResult: {
          kind: 'opportunities',
          count: 1,
          firstOpportunity: {
            goal: 'increase_average_order_value',
            confidence: 'high', // 6 co-occurrences, >= the 5-order high-confidence threshold
            actionType: 'set_discount',
            reasoningContains: ['paired-item discount', 'not a single bundled price'],
          },
        },
      },
    },
  ],
};
