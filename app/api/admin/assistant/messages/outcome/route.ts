import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { describeOutcome, isActionOutcomePayload, type ActionOutcomePayload } from '@/lib/dashboard-assistant/outcome';

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

  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found or access denied.' }, { status: 403 });
  }

  const { data: relatedMessage } = await authClient
    .from('dashboard_assistant_messages')
    .select('id')
    .eq('id', relatedMessageId)
    .eq('conversation_id', conversationId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();

  if (!relatedMessage) {
    return NextResponse.json({ error: 'Related message not found.' }, { status: 404 });
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
