import type { GoldenConversation } from '../../runner/types';

export const conversation: GoldenConversation = {
  id: 'revenue_intelligence/increase-dessert-sales',
  capability: 'revenue_intelligence',
  description: '"Increase dessert sales" classifies as a goal (not a fabricated discount), and the real deterministic pipeline finds a genuine, uncovered Desserts category to recommend.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  ordersFixture: 'punjabi-by-nature-orders',
  turns: [
    {
      userMessage: 'Increase dessert sales',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({ intent: 'revenue_goal', goal: 'increase_dessert_sales' }),
      expected: {
        intent: 'revenue_goal',
        goal: 'increase_dessert_sales',
        deterministicResult: {
          kind: 'opportunities',
          count: 1,
          firstOpportunity: {
            goal: 'increase_dessert_sales',
            confidence: 'high', // zero item-level coverage on Ras Malai / Halwa in the fixture
            actionType: 'set_discount',
            reasoningContains: ['this category currently has no promotional pull at all'],
          },
        },
      },
      userAction: { type: 'createProposal' },
      expectedAfterAction: { proposalStatus: 'draft' },
    },
  ],
};
