import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { generate } from '@/lib/intelligence/intelligence-engine';
import { checkRateLimit, incrementUsage, makeServiceClient, clientSafeError } from '@/lib/intelligence/generate-route-helpers';
import { parseDashboardAssistantOutput, DashboardAssistantParseError } from '@/lib/intelligence/actions/menu-discount-schema';
import { describeProposedAction } from '@/lib/dashboard-assistant/describe-action';
import { buildTranscript } from '@/lib/dashboard-assistant/transcript';

// POST /api/admin/assistant/messages
// The conversation-aware sibling of /api/admin/intelligence/generate for the
// dashboard_assistant feature specifically: persists the user's message,
// folds recent conversation history into the model context via a
// conversation_history rawInput key (so a short follow-up like "only
// cardamom chai" can be resolved against the prior turn's request — see
// lib/intelligence/context-builder.ts), and persists the assistant's reply.
// Reuses the same generate() engine and rate-limit helpers as the generic
// route rather than forking a parallel AI-calling path, so usage is metered
// identically.
//
// Never writes to menu_items — a menu_discount_action reply only stores the
// raw AI action; resolving/previewing/applying it still goes through the
// unchanged discount-action/preview and /apply routes via
// DiscountActionPreview.tsx.

export async function POST(request: Request) {
  const authClient = createServerAuthClient();
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const userId = userData.user.id;

  let restaurantId: string;
  let conversationId: string | undefined;
  let message: string;
  let dashboardContext: Record<string, string>;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    conversationId =
      typeof body.conversationId === 'string' && body.conversationId.trim() ? body.conversationId.trim() : undefined;
    message = (body.message ?? '').trim();
    dashboardContext =
      typeof body.dashboardContext === 'object' && body.dashboardContext !== null ? body.dashboardContext : {};
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId) return NextResponse.json({ error: 'restaurantId is required.' }, { status: 400 });
  if (!message) return NextResponse.json({ error: 'message is required.' }, { status: 400 });

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

  // Resolve (or create) the conversation. A client-supplied conversationId is
  // re-verified against this restaurant rather than trusted outright.
  let activeConversationId: string;
  if (conversationId) {
    const { data: existing } = await authClient
      .from('dashboard_assistant_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found.' }, { status: 404 });
    }
    activeConversationId = existing.id;
  } else {
    const { data: created, error: createError } = await authClient
      .from('dashboard_assistant_conversations')
      .insert({ restaurant_id: restaurantId, created_by: userId })
      .select('id')
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: 'Could not start a new conversation.' }, { status: 500 });
    }
    activeConversationId = created.id;
  }

  // Prior turns only — fetched before inserting this user message, used to
  // build the transcript handed to the model.
  const { data: priorMessages } = await authClient
    .from('dashboard_assistant_messages')
    .select('*')
    .eq('conversation_id', activeConversationId)
    .order('created_at', { ascending: true });

  const transcript = buildTranscript(priorMessages ?? []);

  const { data: userMessage, error: userMessageError } = await authClient
    .from('dashboard_assistant_messages')
    .insert({
      conversation_id: activeConversationId,
      restaurant_id: restaurantId,
      role: 'user',
      content: message,
      created_by: userId,
    })
    .select('*')
    .single();

  if (userMessageError || !userMessage) {
    return NextResponse.json({ error: 'Could not save your message.' }, { status: 500 });
  }

  const serviceClient = makeServiceClient();
  const rateLimitCheck = await checkRateLimit(serviceClient, restaurantId);
  if (!rateLimitCheck.ok) {
    // The user's message was already persisted above — return it (and the
    // conversation id) alongside the error so the client doesn't silently
    // drop it from the thread while it waits out the rate limit.
    return NextResponse.json(
      { error: rateLimitCheck.error, conversationId: activeConversationId, userMessage },
      { status: rateLimitCheck.status },
    );
  }
  const { limits } = rateLimitCheck;

  try {
    const result = await generate({
      featureKey: 'dashboard_assistant',
      restaurantId,
      userId,
      rawInput: { question: message, conversation_history: transcript, ...dashboardContext },
    });

    await incrementUsage(serviceClient, restaurantId, limits);

    let content: string;
    let intent: 'answer' | 'menu_discount_action';
    let action: Json | null = null;
    try {
      const parsed = parseDashboardAssistantOutput(result.output);
      if (parsed.intent === 'answer') {
        content = parsed.answer;
        intent = 'answer';
      } else {
        content = describeProposedAction(parsed.action);
        intent = 'menu_discount_action';
        action = parsed.action as unknown as Json;
      }
    } catch (parseErr) {
      const reason = parseErr instanceof DashboardAssistantParseError ? parseErr.message : 'unexpected response';
      content = `SpinBite gave an answer that couldn't be understood (${reason}). Try rephrasing.`;
      intent = 'answer';
    }

    const { data: assistantMessage, error: assistantMessageError } = await authClient
      .from('dashboard_assistant_messages')
      .insert({
        conversation_id: activeConversationId,
        restaurant_id: restaurantId,
        role: 'assistant',
        content,
        intent,
        action,
        created_by: userId,
      })
      .select('*')
      .single();

    if (assistantMessageError || !assistantMessage) {
      return NextResponse.json(
        { error: 'Could not save the response.', conversationId: activeConversationId, userMessage },
        { status: 500 },
      );
    }

    return NextResponse.json({ conversationId: activeConversationId, userMessage, assistantMessage });
  } catch (err: unknown) {
    console.error('[assistant/messages] Error:', err);
    const { message: errorMessage, status } = clientSafeError(err);
    return NextResponse.json({ error: errorMessage, conversationId: activeConversationId, userMessage }, { status });
  }
}
