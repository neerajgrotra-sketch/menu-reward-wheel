import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

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

  const { data: restaurant } = await authClient
    .from('restaurants')
    .select('id')
    .eq('id', restaurantId)
    .eq('owner_id', userData.user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: 'Restaurant not found or access denied.' }, { status: 403 });
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

  return NextResponse.json({ conversation, messages: messages ?? [] });
}
