import type { RestaurantFixture } from '../../runner/types';

// Synthetic — deliberately not tied to any real restaurant, so edge-case
// golden conversations (empty category, zero coverage anywhere, thin order
// history) don't depend on production data staying a particular shape.
export const smallCafe: RestaurantFixture = {
  id: 'eval-fixture-small-cafe',
  ownerId: 'eval-fixture-small-cafe-owner',
  name: 'Small Cafe (eval fixture)',
};
