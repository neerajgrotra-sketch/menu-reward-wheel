import type { GoldenConversation } from '../../runner/types';

// The real menu has 3 items containing "chai" (Cardamom Chai, Kashmiri
// Chai, Masala Chai) and one that doesn't (Mint Tea) — scope:'item' with a
// bare substring is genuinely ambiguous. The deterministic resolver must
// surface real candidates, never guess.
export const conversation: GoldenConversation = {
  id: 'menu_pricing/clarify-ambiguous-item',
  capability: 'menu_pricing',
  description: '"Apply 15% off chai" is genuinely ambiguous across 3 real items — surfaces real candidates instead of guessing.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Apply 15% off chai',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'chai' }, discount: { discountType: 'percentage', value: 15 } },
      }),
      expected: {
        intent: 'menu_discount_action',
        unresolved: {
          candidateNames: ['Cardamom Chai', 'Kashmiri Chai', 'Masala Chai'],
        },
      },
    },
  ],
};
