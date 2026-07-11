import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { OPEN_STATUSES } from '@/lib/restaurant-planner/proposals';
import type { ProposalStatus } from '@/lib/restaurant-planner/proposal';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';
import { summarizeConversations } from '@/lib/dashboard-assistant/conversation-summary';

// GET /api/admin/assistant/conversations/list?restaurantId=...&includeArchived=true
// Lightweight conversation summaries for the History panel (Conversation
// Management V1) — title, last-message preview, updated time, archived
// state, and whether an open proposal exists. Never returns a full
// transcript; selecting a row re-fetches via
// GET /api/admin/assistant/conversations?conversationId=... Session client
// throughout — RLS is the real boundary, same precedent as every other
// assistant route.

export async function GET(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const restaurantId = (searchParams.get('restaurantId') ?? '').trim();
  const includeArchived = searchParams.get('includeArchived') === 'true';
  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userData.user.id };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  let query = authClient
    .from('dashboard_assistant_conversations')
    .select('id, title, last_message_at, archived_at')
    .eq('restaurant_id', restaurantId)
    .order('last_message_at', { ascending: false });
  if (!includeArchived) query = query.is('archived_at', null);

  const { data: conversations } = await query;
  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  const conversationIds = conversations.map((c) => c.id);

  const { data: messageRows } = await authClient
    .from('dashboard_assistant_messages')
    .select('conversation_id, role, content, created_at')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: true });

  const { data: openProposalRows } = await authClient
    .from('restaurant_planner_proposals')
    .select('conversation_id, status')
    .eq('restaurant_id', restaurantId)
    .in('conversation_id', conversationIds);

  const openProposalConversationIds = new Set(
    (openProposalRows ?? [])
      .filter((row) => OPEN_STATUSES.includes(row.status as ProposalStatus))
      .map((row) => row.conversation_id),
  );

  const summaries = summarizeConversations(conversations, messageRows ?? [], openProposalConversationIds);

  return NextResponse.json({ conversations: summaries });
}
