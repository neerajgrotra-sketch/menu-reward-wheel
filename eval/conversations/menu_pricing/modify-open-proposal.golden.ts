import type { GoldenConversation } from '../../runner/types';

// Multi-turn — proves proposal VERSIONING is a real connected chain, not an
// isolated-function check: turn 2's refersToProposalId must resolve against
// the SAME proposal_group_id turn 1 actually created (substituted via the
// __OPEN_PROPOSAL_GROUP_ID__ placeholder — see eval/runner/replay.ts), and
// the resulting row must be a NEW version in that same group, status
// 'modified', not a new group. A dedicated cross-conversation check in
// eval/run.test.ts inspects the fake client's restaurant_planner_proposals
// table directly to confirm the real version-increment behavior (see
// eval/README.md's verification runbook).
export const conversation: GoldenConversation = {
  id: 'menu_pricing/modify-open-proposal',
  capability: 'menu_pricing',
  description: '"Apply 25% off Naan Kabab" then "actually make it 15%" modifies the SAME open proposal group instead of starting a new one.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Apply 25% off Naan Kabab',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'Naan Kabab' }, discount: { discountType: 'percentage', value: 25 } },
      }),
      expected: { intent: 'menu_discount_action', matchKind: 'item_exact', confidence: 'high', resolvedItemCount: 1 },
    },
    {
      userMessage: 'Actually make it 15%',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({
        intent: 'menu_discount_action',
        action: { type: 'set_discount', target: { scope: 'item', name: 'Naan Kabab' }, discount: { discountType: 'percentage', value: 15 } },
        refersToProposalId: '__OPEN_PROPOSAL_GROUP_ID__',
      }),
      expected: { intent: 'menu_discount_action', matchKind: 'item_exact', confidence: 'high', resolvedItemCount: 1 },
    },
  ],
};
