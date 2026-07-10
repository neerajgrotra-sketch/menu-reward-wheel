import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { isMenuDiscountAction, type MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import { buildProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { insertProposalVersion } from '@/lib/restaurant-planner/proposals';
import { describeProposedAction } from '@/lib/dashboard-assistant/describe-action';
import { isCapabilityAvailable, explainCapabilityUnavailable } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/assistant/target-selection
// Objective 2 — structured target selection: turns a checkbox choice made
// against a clarification message's real, resolver-sourced candidates
// (lib/restaurant-planner/types.ts's PlannerCandidate — never model-invented)
// directly into a new proposal, without another model round trip. The
// clarification message being resolved must still carry the original
// MenuDiscountAction (messages/route.ts persists it specifically for this) —
// only its `target` is replaced with the caller's selection; discountType/
// value/schedule are carried over unchanged.

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
  let selection: string[] | 'all';
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    conversationId = (body.conversationId ?? '').trim();
    relatedMessageId = (body.relatedMessageId ?? '').trim();
    if (body.selection === 'all') {
      selection = 'all';
    } else if (Array.isArray(body.selection) && body.selection.length > 0 && body.selection.every((n: unknown) => typeof n === 'string')) {
      selection = body.selection;
    } else {
      return NextResponse.json({ error: 'selection must be "all" or a non-empty array of item names.' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId || !conversationId || !relatedMessageId) {
    return NextResponse.json({ error: 'restaurantId, conversationId, and relatedMessageId are required.' }, { status: 400 });
  }

  const serviceClient = makeServiceClient();
  const toolCtx: ToolContext = { supabase: authClient, serviceClient, restaurantId, ownerId: userId };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  const { data: relatedMessage } = await authClient
    .from('dashboard_assistant_messages')
    .select('*')
    .eq('id', relatedMessageId)
    .eq('conversation_id', conversationId)
    .eq('restaurant_id', restaurantId)
    .eq('intent', 'clarification')
    .maybeSingle();

  if (!relatedMessage || !isMenuDiscountAction(relatedMessage.action)) {
    return NextResponse.json({ error: 'No pending menu-pricing clarification found for that message.' }, { status: 404 });
  }

  // Capability Management: re-checked here too — the capability could have
  // been disabled in the gap between the clarification being shown and the
  // checkbox selection being submitted.
  const capabilityAvailable = await isCapabilityAvailable(serviceClient, {
    capabilityKey: 'menu_pricing',
    restaurantId,
    ownerId: userId,
  });
  if (!capabilityAvailable) {
    return NextResponse.json({ error: explainCapabilityUnavailable('menu_pricing') }, { status: 403 });
  }

  const candidates = (relatedMessage.candidates as unknown as Array<{ name: string; categoryName: string }> | null) ?? [];
  const names = selection === 'all' ? candidates.map((c) => c.name) : selection;
  if (names.length === 0) {
    return NextResponse.json({ error: 'No candidates available to select from.' }, { status: 409 });
  }

  const originalAction = relatedMessage.action as unknown as MenuDiscountAction;
  const narrowedAction: MenuDiscountAction =
    originalAction.type === 'clear_discount'
      ? { type: 'clear_discount', target: { scope: 'items', names } }
      : { type: 'set_discount', target: { scope: 'items', names }, discount: originalAction.discount };

  const built = await buildProposal(authClient, restaurantId, narrowedAction);

  // Record the selection as an ordinary user turn so the transcript reads
  // coherently and future follow-ups ("make it 15%") have the same
  // conversation-history context they'd have gotten from typing it.
  const selectionLabel = selection === 'all' ? 'Selected: all of them' : `Selected: ${names.join(', ')}`;
  const { data: userMessage } = await authClient
    .from('dashboard_assistant_messages')
    .insert({ conversation_id: conversationId, restaurant_id: restaurantId, role: 'user', content: selectionLabel, created_by: userId })
    .select('*')
    .single();

  if (built.kind === 'unresolved') {
    const { data: assistantMessage, error } = await authClient
      .from('dashboard_assistant_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'assistant',
        content: built.reason,
        intent: 'clarification',
        action: narrowedAction as unknown as Json,
        candidates: (built.candidates as unknown as Json) ?? null,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error || !assistantMessage) return NextResponse.json({ error: 'Could not save the response.' }, { status: 500 });
    return NextResponse.json({ userMessage, assistantMessage });
  }

  const proposal = await insertProposalVersion(authClient, {
    restaurantId,
    conversationId,
    capability: 'menu_pricing',
    action: narrowedAction as unknown as Json,
    resolvedSnapshot: built.resolveResult.items as unknown as Json,
    confidence: built.confidence,
    reasoning: built.reasoning,
    planTasks: built.planTasks as unknown as Json,
    status: 'draft',
    createdBy: userId,
  });

  const { data: assistantMessage, error: assistantMessageError } = await authClient
    .from('dashboard_assistant_messages')
    .insert({
      conversation_id: conversationId,
      restaurant_id: restaurantId,
      role: 'assistant',
      content: describeProposedAction(narrowedAction),
      intent: 'menu_discount_action',
      action: narrowedAction as unknown as Json,
      capability: 'menu_pricing',
      proposal_group_id: proposal.proposal_group_id,
      proposal_id: proposal.id,
      created_by: userId,
    })
    .select('*')
    .single();

  if (assistantMessageError || !assistantMessage) {
    return NextResponse.json({ error: 'Could not save the response.' }, { status: 500 });
  }

  return NextResponse.json({ userMessage, assistantMessage, proposal });
}
