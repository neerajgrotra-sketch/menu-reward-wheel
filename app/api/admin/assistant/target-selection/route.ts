import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { isMenuDiscountAction, type MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import { isMenuEditAction, type MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import { buildProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { buildProposal as buildMenuEditProposal } from '@/lib/restaurant-planner/capabilities/menu-edit';
import { insertProposalVersion } from '@/lib/restaurant-planner/proposals';
import { describeProposedAction } from '@/lib/dashboard-assistant/describe-action';
import { describeProposedMenuEditAction } from '@/lib/dashboard-assistant/describe-menu-edit-action';
import { isCapabilityAvailable, explainCapabilityUnavailable } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/assistant/target-selection
// Objective 2 — structured target selection: turns a checkbox choice made
// against a clarification message's real, resolver-sourced candidates
// (lib/restaurant-planner/types.ts's PlannerCandidate — never model-invented)
// directly into a new proposal, without another model round trip. Dispatches
// on the clarification message's stored `capability` column — menu_pricing
// (unchanged) or menu_agent — rather than hardcoding menu_pricing, so a
// menu_edit clarification's checkbox re-submit works the same way instead
// of failing with "No pending menu-pricing clarification found."

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

  if (!relatedMessage) {
    return NextResponse.json({ error: 'No pending clarification found for that message.' }, { status: 404 });
  }

  const capabilityKey = relatedMessage.capability;
  const isMenuPricing = capabilityKey === 'menu_pricing' && isMenuDiscountAction(relatedMessage.action);
  const isMenuEdit = capabilityKey === 'menu_agent' && isMenuEditAction(relatedMessage.action);

  if (!isMenuPricing && !isMenuEdit) {
    return NextResponse.json({ error: 'No pending clarification found for that message.' }, { status: 404 });
  }

  const capabilityAvailable = await isCapabilityAvailable(serviceClient, {
    capabilityKey: capabilityKey as string,
    restaurantId,
    ownerId: userId,
  });
  if (!capabilityAvailable) {
    return NextResponse.json({ error: explainCapabilityUnavailable(capabilityKey as string) }, { status: 403 });
  }

  const candidates = (relatedMessage.candidates as unknown as Array<{ name: string; categoryName: string }> | null) ?? [];
  const names = selection === 'all' ? candidates.map((c) => c.name) : selection;
  if (names.length === 0) {
    return NextResponse.json({ error: 'No candidates available to select from.' }, { status: 409 });
  }

  const selectionLabel = selection === 'all' ? 'Selected: all of them' : `Selected: ${names.join(', ')}`;
  const { data: userMessage } = await authClient
    .from('dashboard_assistant_messages')
    .insert({ conversation_id: conversationId, restaurant_id: restaurantId, role: 'user', content: selectionLabel, created_by: userId })
    .select('*')
    .single();

  if (isMenuPricing) {
    const originalAction = relatedMessage.action as unknown as MenuDiscountAction;
    const narrowedAction: MenuDiscountAction =
      originalAction.type === 'clear_discount'
        ? { type: 'clear_discount', target: { scope: 'items', names } }
        : { type: 'set_discount', target: { scope: 'items', names }, discount: originalAction.discount };

    const built = await buildProposal(authClient, restaurantId, narrowedAction);

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

  // menu_agent (menu_edit) path — same shape, narrows `target` only, every
  // other field on the original action (price/name/description/etc.)
  // carries over unchanged. bulkConfirmed:true — this call only happens
  // after the owner explicitly clicked "Apply to all" or selected specific
  // items in TargetSelector, which is exactly the confirmation Bulk Edit
  // Safety (resolve.ts's NEEDS_EXPLICIT_BULK_TARGET gate) requires. Without
  // this flag, "Apply to all" on a rename/description clarification would
  // just re-trigger the same gate against its own explicit items list.
  const originalAction = relatedMessage.action as unknown as MenuEditAction;
  const narrowedAction: MenuEditAction = { ...originalAction, target: { scope: 'items', names } };

  const built = await buildMenuEditProposal(authClient, restaurantId, narrowedAction, { bulkConfirmed: true });

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
    capability: 'menu_agent',
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
      content: describeProposedMenuEditAction(narrowedAction),
      intent: 'menu_edit_action',
      action: narrowedAction as unknown as Json,
      capability: 'menu_agent',
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
