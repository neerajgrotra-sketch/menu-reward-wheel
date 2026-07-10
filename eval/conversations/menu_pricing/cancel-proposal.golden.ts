import type { GoldenConversation } from '../../runner/types';

export const conversation: GoldenConversation = {
  id: 'menu_pricing/cancel-proposal',
  capability: 'menu_pricing',
  description: 'A drafted proposal, when cancelled, writes a real "cancelled" version — never touches menu_items.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Apply 20% off Kadhi',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'Kadhi' }, discount: { discountType: 'percentage', value: 20 } },
      }),
      expected: { intent: 'menu_discount_action', matchKind: 'item_exact', confidence: 'high', resolvedItemCount: 1 },
      userAction: { type: 'cancel' },
      expectedAfterAction: { proposalStatus: 'cancelled' },
    },
  ],
};
