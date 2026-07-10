import { describe, it, expect } from 'vitest';
import { getRestaurant, getRestaurantTimezone, validateOwnership } from './restaurant';
import type { ToolContext } from './types';

// Minimal chainable fake matching the .from().select().eq()...maybeSingle()
// shape every restaurant-ownership query uses — no real Supabase client
// exists in this repo's test infra, so this is deliberately hand-rolled and
// scoped to exactly the chain these tools call.
function fakeSupabase(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => result,
  };
  return { from: () => chain } as any;
}

function ctxWith(result: { data: unknown; error: unknown }): ToolContext {
  return { supabase: fakeSupabase(result), serviceClient: {} as any, restaurantId: 'r1', ownerId: 'o1' };
}

describe('getRestaurant', () => {
  it('fails when no owned, non-deleted restaurant is found', async () => {
    const outcome = await getRestaurant.execute({}, ctxWith({ data: null, error: null }));
    expect(outcome).toEqual({ ok: false, reason: 'Restaurant not found or access denied.' });
  });

  it('succeeds and returns the row when ownership resolves', async () => {
    const outcome = await getRestaurant.execute({}, ctxWith({ data: { id: 'r1' }, error: null }));
    expect(outcome).toEqual({ ok: true, data: { id: 'r1' } });
  });
});

describe('validateOwnership (same query as getRestaurant, boolean-shaped)', () => {
  it('reports owns: false when the query finds nothing', async () => {
    const outcome = await validateOwnership.execute({}, ctxWith({ data: null, error: null }));
    expect(outcome).toEqual({ ok: true, data: { owns: false } });
  });

  it('reports owns: true when the query resolves', async () => {
    const outcome = await validateOwnership.execute({}, ctxWith({ data: { id: 'r1' }, error: null }));
    expect(outcome).toEqual({ ok: true, data: { owns: true } });
  });
});

describe('getRestaurantTimezone (stub)', () => {
  it('always returns timezone: null and never guesses one', async () => {
    const outcome = await getRestaurantTimezone.execute({}, ctxWith({ data: null, error: null }));
    expect(outcome).toEqual({
      ok: true,
      data: { timezone: null, reason: 'No timezone is stored for restaurants in the current schema.' },
    });
  });
});
