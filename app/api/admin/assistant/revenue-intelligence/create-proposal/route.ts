import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import type { RevenueOpportunity } from '@/lib/restaurant-planner/types';
import { createProposalFromOpportunity } from '@/lib/restaurant-planner/capabilities/revenue-intelligence';
import { isCapabilityAvailable, explainCapabilityUnavailable } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { makeServiceClient } from '@/lib/intelligence/generate-route-helpers';

// POST /api/admin/assistant/revenue-intelligence/create-proposal
// Turns one chosen Revenue Opportunity into a real menu_pricing proposal —
// the exact same buildProposal()/insertProposalVersion() pipeline
// menu_discount_action already uses (lib/restaurant-planner/capabilities/
// revenue-intelligence.ts's createProposalFromOpportunity). Mirrors
// target-selection/route.ts's "never trust client-supplied structured data"
// pattern exactly: the client only ever sends {relatedMessageId,
// opportunityId} — the real opportunity (including its action) is re-read
// server-side from the original message's persisted revenue_opportunities
// column, never round-tripped from the browser.

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
  let opportunityId: string;
  try {
    const body = await request.json();
    restaurantId = (body.restaurantId ?? '').trim();
    conversationId = (body.conversationId ?? '').trim();
    relatedMessageId = (body.relatedMessageId ?? '').trim();
    opportunityId = (body.opportunityId ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!restaurantId || !conversationId || !relatedMessageId || !opportunityId) {
    return NextResponse.json(
      { error: 'restaurantId, conversationId, relatedMessageId, and opportunityId are required.' },
      { status: 400 },
    );
  }

  const serviceClient = makeServiceClient();
  const toolCtx: ToolContext = { supabase: authClient, serviceClient, restaurantId, ownerId: userId };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);
  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
  }

  // Re-checked here too — the capability could have been disabled in the
  // gap between the opportunity list being shown and this click, same
  // precedent as target-selection/route.ts's own re-check.
  const capabilityAvailable = await isCapabilityAvailable(serviceClient, {
    capabilityKey: 'revenue_intelligence',
    restaurantId,
    ownerId: userId,
  });
  if (!capabilityAvailable) {
    return NextResponse.json({ error: explainCapabilityUnavailable('revenue_intelligence') }, { status: 403 });
  }

  const { data: relatedMessage } = await authClient
    .from('dashboard_assistant_messages')
    .select('id, revenue_opportunities')
    .eq('id', relatedMessageId)
    .eq('conversation_id', conversationId)
    .eq('restaurant_id', restaurantId)
    .eq('intent', 'revenue_opportunities')
    .maybeSingle();

  if (!relatedMessage) {
    return NextResponse.json({ error: 'No pending revenue opportunities found for that message.' }, { status: 404 });
  }

  const stored = relatedMessage.revenue_opportunities as unknown as { goal: string; opportunities: RevenueOpportunity[] } | null;
  const opportunity = stored?.opportunities.find((o) => o.id === opportunityId);
  if (!opportunity) {
    return NextResponse.json({ error: 'That opportunity is no longer available — ask again for updated recommendations.' }, { status: 404 });
  }

  const result = await createProposalFromOpportunity(toolCtx, { conversationId, createdBy: userId, opportunity });

  // Breadcrumb only (outcome jsonb is never a decision boundary elsewhere in
  // this system either — see action_outcome messages) — lets the client
  // gray out this one opportunity card as "already proposed" without a
  // second column, and prevents a double-click from drafting two proposals.
  const outcomeBreadcrumb = { sourceOpportunityId: opportunityId } as unknown as Json;

  if (result.kind === 'unresolved') {
    const { data: assistantMessage, error } = await authClient
      .from('dashboard_assistant_messages')
      .insert({
        conversation_id: conversationId,
        restaurant_id: restaurantId,
        role: 'assistant',
        content: result.reason,
        intent: 'clarification',
        action: opportunity.action as unknown as Json,
        candidates: (result.candidates as unknown as Json) ?? null,
        related_message_id: relatedMessageId,
        outcome: outcomeBreadcrumb,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error || !assistantMessage) return NextResponse.json({ error: 'Could not save the response.' }, { status: 500 });
    return NextResponse.json({ assistantMessage });
  }

  const { data: assistantMessage, error: assistantMessageError } = await authClient
    .from('dashboard_assistant_messages')
    .insert({
      conversation_id: conversationId,
      restaurant_id: restaurantId,
      role: 'assistant',
      content: result.content,
      intent: 'menu_discount_action',
      action: opportunity.action as unknown as Json,
      capability: 'menu_pricing',
      proposal_group_id: result.proposal.proposal_group_id,
      proposal_id: result.proposal.id,
      related_message_id: relatedMessageId,
      outcome: outcomeBreadcrumb,
      created_by: userId,
    })
    .select('*')
    .single();

  if (assistantMessageError || !assistantMessage) {
    return NextResponse.json({ error: 'Could not save the response.' }, { status: 500 });
  }

  return NextResponse.json({ assistantMessage, proposal: result.proposal });
}
