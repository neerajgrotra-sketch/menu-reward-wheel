import type { GoldenConversation } from '../../runner/types';

// Genuinely outside every registered capability — no fabricated capability
// name, no attempted action.
export const conversation: GoldenConversation = {
  id: 'menu_pricing/unsupported-request',
  capability: 'menu_pricing',
  description: '"Create an Instagram campaign" is outside every registered capability — classified unsupported, never attempted.',
  restaurantFixture: 'punjabi-by-nature',
  menuFixture: 'punjabi-by-nature-menu',
  turns: [
    {
      userMessage: 'Create an Instagram campaign',
      recordedSource: 'hand-authored',
      recordedPlannerOutputRaw: JSON.stringify({ intent: 'unsupported', capability: 'campaign_agent' }),
      expected: { intent: 'unsupported', capability: 'campaign_agent' },
    },
  ],
};
