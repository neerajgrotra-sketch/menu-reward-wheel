import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { describeOutcome, isActionOutcomePayload, type ActionOutcomePayload } from '@/lib/dashboard-assistant/outcome';
import { findOpenProposalGroup } from '@/lib/restaurant-planner/proposals';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { cancelPromotion } from '@/lib/restaurant-planner/tools/promotion';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/assistant/messages/outcome
// Records what happened to a menu_discount_action proposal — ambiguous (from
// /api/admin/menus/discount-action/preview), applied (from .../apply), or
// cancelled by the user — as a new follow-up chat message, rather than
// mutating the original proposal message. This is what lets a clarifying
// reply like "only cardamom chai" see real candidate item names in
// conversation_history (only known after /preview resolves against live
// menu data), and what marks a proposal resolved so CommandCenter.tsx stops
// rendering Apply on it after a reload. Content is composed deterministically
// server-side from fixed templates (lib/dashboard-assistant/outcome.ts), not
// AI-authored — no Rule 20 concern. Does not touch menu_items or
// menu_discount_change_log — this only records the chat-visible outcome,
// /apply already wrote its own audit rows.

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  let restaurantId: string;
  let conversationId: string;
  let relatedMessageId: string;
  let payload: ActionOutcomePayload;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    conversationId = (body.conversationId ?? '').trim();
    relatedMessageId = (body.relatedMessageId ?? '').trim();
    if (!isActionOutcomePayload(body.payload)) {
      return NextResponse.json({ error: 'Malformed payload.' }, { status: 400 });
    }
    payload = body.payload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId || !conversationId || !relatedMessageId) {
    return NextResponse.json(
      { error: 'restaurantId, conversationId, and relatedMessageId are required.' },
      { status: 400 },
    );
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userId };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const { data: relatedMessage } = await authClient
    .from('dashboard_assistant_messages')
    .select('id, proposal_group_id')
    .eq('id', relatedMessageId)
    .eq('conversation_id', conversationId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!relatedMessage) {
    return NextResponse.json({ error: 'Related message not found.' }, { status: 404 });
  }

  // V2 — Objective 8: a cancellation is also a proposal status transition,
  // appended as a new version (never an update) so the group's history
  // shows it was explicitly declined rather than just going stale.
  if (payload.kind === 'cancelled' && relatedMessage.proposal_group_id) {
    const openProposal = await findOpenProposalGroup(authClient, {
      proposalGroupId: relatedMessage.proposal_group_id,
      conversationId,
      restaurantId,
    });
    if (openProposal) {
      const result = await cancelPromotion.execute({ openProposal }, toolCtx);
      if (!result.ok) {
        console.error('[assistant/messages/outcome] Failed to record cancelled proposal version:', result.reason);
      }
    }
  }

  const { data: outcomeMessage, error: insertError } = await authClient
    .from('dashboard_assistant_messages')
    .insert({
      conversation_id: conversationId,
      restaurant_id: restaurantId,
      role: 'assistant',
      content: describeOutcome(payload),
      intent: 'action_outcome',
      outcome: payload as unknown as Json,
      related_message_id: relatedMessageId,
      created_by: userId,
    })
    .select('*')
    .single();

  if (insertError || !outcomeMessage) {
    return NextResponse.json({ error: 'Could not save the outcome.' }, { status: 500 });
  }

  return NextResponse.json({ outcomeMessage });
}
