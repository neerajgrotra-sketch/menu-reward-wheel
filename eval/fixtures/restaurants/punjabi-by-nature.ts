import type { RestaurantFixture } from '../../runner/types';

// Real restaurant, pulled via Supabase MCP during the Revenue Intelligence
// V1 controlled activation (2026-07-10). A second, empty "Punjabi By
// Nature" duplicate was found during that audit (zero orders/conversations)
// — deliberately not used here; this is the one with real activity.
export const punjabiByNature: RestaurantFixture = {
  id: '6c739587-e50c-421d-9fbf-c2cd3f9d6f89',
  ownerId: '9ae1992c-01ab-4256-9295-59041e449a70',
  name: 'Punjabi By Nature',
};
