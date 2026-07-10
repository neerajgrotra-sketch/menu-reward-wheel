import type { GoldenConversation } from '../../runner/types';

// End-to-end: draft -> Approve -> real execution. This is the connected-
// chain proof that Phase 2's fake Supabase client exists for — it exercises
// the EXACT route.ts sequence (re-resolve -> revalidate -> apply -> insert
// 'executed' version) and asserts the post-apply menu_items row directly,
// the same thing the public menu route would read next.
export const conversation: GoldenConversation = {
  id: 'menu_pricing/apply-and-execute',
  capability: 'menu_pricing',
  description: '"Apply 25% off Halwa" then Approve actually writes menu_items.special_* and records an executed proposal version.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Apply 25% off Halwa',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'Halwa' }, discount: { discountType: 'percentage', value: 25 } },
      }),
      expected: { intent: 'menu_discount_action', matchKind: 'item_exact', confidence: 'high', resolvedItemCount: 1 },
      userAction: { type: 'approve' },
      expectedAfterAction: {
        proposalStatus: 'executed',
        applied: 1,
        total: 1,
        affectedItemAfterState: [{ name: 'Halwa', specialEnabled: true, specialPercent: 25 }],
      },
    },
  ],
};
