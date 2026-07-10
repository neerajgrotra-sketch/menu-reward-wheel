import type { GoldenConversation } from '../../runner/types';

// A specific, parameterized instruction — never routes to revenue_goal
// (see the dashboard_assistant v2 prompt's REVENUE GOALS boundary rule:
// a named percentage/category stays menu_discount_action).
export const conversation: GoldenConversation = {
  id: 'menu_pricing/apply-percentage-discount',
  capability: 'menu_pricing',
  description: '"Apply 20% off desserts" resolves cleanly against a real, unambiguous category and produces a high-confidence draft proposal.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Apply 20% off desserts',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'category', name: 'Desserts' }, discount: { discountType: 'percentage', value: 20 } },
      }),
      expected: {
        intent: 'menu_discount_action',
        matchKind: 'category_exact',
        confidence: 'high',
        resolvedItemCount: 2, // Ras Malai, Halwa
        reasoningContains: ['category name matched exactly', '20% off'],
      },
    },
  ],
};
