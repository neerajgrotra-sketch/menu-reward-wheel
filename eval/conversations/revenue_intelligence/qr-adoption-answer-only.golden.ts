import type { GoldenConversation } from '../../runner/types';

// increase_qr_adoption never produces a proposal — no menu discount
// causally shifts which channel a guest orders through (see the Revenue
// Intelligence architecture doc's "central design tension" table). This
// conversation proves the real number is reported, not fabricated, and no
// opportunity is invented to fill the gap.
export const conversation: GoldenConversation = {
  id: 'revenue_intelligence/qr-adoption-answer-only',
  capability: 'revenue_intelligence',
  description: '"Increase QR ordering adoption" always returns a real, data-driven answer — never a fabricated proposal.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  ordersFixture: 'punjabi-by-nature-orders',
  turns: [
    {
      userMessage: 'Increase QR ordering adoption',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({ intent: 'revenue_goal', goal: 'increase_qr_adoption' }),
      expected: {
        intent: 'revenue_goal',
        goal: 'increase_qr_adoption',
        deterministicResult: {
          kind: 'answer',
          // 16 of 22 fixture orders are restaurant_qr = 72.7%, rounds to 73%.
          textContains: ['73% of your last 22 completed orders came from QR ordering', "doesn't have a lever that specifically shifts orders toward QR"],
        },
      },
    },
  ],
};
