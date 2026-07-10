import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// GET /api/admin/assistant/conversations?restaurantId=...
// Returns the most recent Ask SpinBite conversation for a restaurant (Phase 1
// always has at most one active thread per restaurant — no "start new
// thread" UI yet) plus its messages, so CommandCenter.tsx can rehydrate the
// chat on page load. No conversation yet is a normal empty-state response,
// not an error. Session client throughout — RLS
// (20260709050000_dashboard_assistant_conversations.sql) is the real
// boundary, same precedent as the discount-action routes.

export async function GET(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const restaurantId = (searchParams.get('restaurantId') ?? '').trim();
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userData.user.id };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const { data: conversation } = await authClient
    .from('dashboard_assistant_conversations')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) {
    return NextResponse.json({ conversation: null, messages: [] });
  }

  const { data: messages } = await authClient
    .from('dashboard_assistant_messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });

  // V2: batch-fetch the exact proposal row each message represents (not
  // just the latest in its group — an older chat bubble must keep showing
  // the resolved_snapshot/confidence/reasoning it had at the time it was
  // sent), keyed by proposal id so the client can render ProposalCard
  // immediately on reload with no per-message round trip.
  const proposalIds = Array.from(
    new Set((messages ?? []).map((m) => m.proposal_id).filter((id): id is string => id !== null)),
  );
  let proposals: Record<string, unknown> = {};
  if (proposalIds.length > 0) {
    const { data: proposalRows } = await authClient
      .from('restaurant_planner_proposals')
      .select('*')
      .in('id', proposalIds);
    proposals = Object.fromEntries((proposalRows ?? []).map((p) => [p.id, p]));
  }

  return NextResponse.json({ conversation, messages: messages ?? [], proposals });
}
