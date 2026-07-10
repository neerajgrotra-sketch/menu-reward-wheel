import { describe, it, expect } from 'vitest';
import { cancelPromotion } from './promotion';
import type { ToolContext } from './types';
import type { ProposalRow } from '../proposals';

// Minimal chainable fake matching the two query shapes
// insertProposalVersion runs: a .select()...maybeSingle() version lookup,
// then a .insert()...select().single() write. No real Supabase client
// exists in this repo's test infra — scoped to exactly these chains.
function fakeSupabase(insertResult: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    maybeSingle: async () => ({ data: null, error: null }), // no prior version — fresh group
    single: async () => insertResult,
  };
  return { from: () => chain } as any;
}

const openProposal: ProposalRow = {
  id: 'p1',
  proposal_group_id: 'g1',
  version: 1,
  restaurant_id: 'r1',
  conversation_id: 'c1',
  capability: 'menu_pricing',
  action: {},
  resolved_snapshot: null,
  confidence: 'high',
  reasoning: 'because',
  plan_tasks: null,
  status: 'draft',
  related_message_id: null,
  created_by: 'o1',
  created_at: '2026-01-01T00:00:00Z',
} as unknown as ProposalRow;

describe('cancelPromotion', () => {
  it('appends a cancelled version and returns it on success', async () => {
    const cancelledRow = { ...openProposal, version: 2, status: 'cancelled' };
    const ctx: ToolContext = { supabase: fakeSupabase({ data: cancelledRow, error: null }), serviceClient: {} as any, restaurantId: 'r1', ownerId: 'o1' };
    const outcome = await cancelPromotion.execute({ openProposal }, ctx);
    expect(outcome).toEqual({ ok: true, data: cancelledRow });
  });

  // Regression test for the throw-safety bug: insertProposalVersion throws
  // (via `if (error || !data) throw ...`) on a DB error. The original inline
  // outcome-route code caught this around a "best-effort" call — a failure
  // to log the cancellation must not break the primary flow. cancelPromotion
  // must convert that throw into a ToolOutcome fail(), not let it propagate.
  it('returns a fail() outcome instead of throwing when the insert fails', async () => {
    const ctx: ToolContext = {
      supabase: fakeSupabase({ data: null, error: { message: 'db unavailable' } }),
      serviceClient: {} as any,
      restaurantId: 'r1',
      ownerId: 'o1',
    };
    const outcome = await cancelPromotion.execute({ openProposal }, ctx);
    expect(outcome).toEqual({ ok: false, reason: 'db unavailable' });
  });
});
