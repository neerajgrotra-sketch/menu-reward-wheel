import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// PATCH /api/admin/assistant/conversations/:conversationId
// Body: { restaurantId, archived: boolean }
// The only mutation ever allowed on a conversation row — sets or clears
// archived_at. Archive is a visibility flag, not a delete: see
// 20260711050000_dashboard_assistant_conversations_archive.sql for why hard
// delete isn't offered (cascade to messages AND proposal/audit history).
// Session client — RLS's new UPDATE policy (same migration) is the real
// boundary.

export async function PATCH(request: Request, { params }: { params: { conversationId: string } }) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const conversationId = (params.conversationId ?? '').trim();
  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required.' }, { status: 400 });
  }

  let restaurantId: string;
  let archived: boolean;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    if (typeof body.archived !== 'boolean') {
      return NextResponse.json({ error: 'archived (boolean) is required.' }, { status: 400 });
    }
    archived = body.archived;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) {
    return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  }

  const toolCtx: ToolContext = { supabase: authClient, serviceClient: makeServiceClient(), restaurantId, ownerId: userData.user.id };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const { data: conversation, error } = await authClient
    .from('dashboard_assistant_conversations')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', conversationId)
    .eq('restaurant_id', restaurantId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not update the conversation.' }, { status: 500 });
  }
  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}
