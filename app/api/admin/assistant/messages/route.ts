import { NextResponse } from 'next/server';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/supabase/database.types';
import { runPlannerTurn } from '@/lib/restaurant-planner/planner-engine';
import { PlannerParseError } from '@/lib/restaurant-planner/types';
import { buildProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { buildProposal as buildMenuEditProposal } from '@/lib/restaurant-planner/capabilities/menu-edit';
import { insertProposalVersion, findOpenProposalGroup } from '@/lib/restaurant-planner/proposals';
import { isCapabilityAvailable, explainCapabilityUnavailable, describeUnsupportedRequest } from '@/lib/restaurant-planner/tool-registry';
import { getRestaurant } from '@/lib/restaurant-planner/tools/restaurant';
import { getConversationContext } from '@/lib/restaurant-planner/tools/conversation';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import { checkRateLimit, incrementUsage, makeServiceClient, clientSafeError } from '@/lib/intelligence/generate-route-helpers';
import { describeProposedAction } from '@/lib/dashboard-assistant/describe-action';
import { describeProposedMenuEditAction } from '@/lib/dashboard-assistant/describe-menu-edit-action';
import { generateRevenueOpportunities } from '@/lib/restaurant-planner/capabilities/revenue-intelligence';
import { REVENUE_GOAL_LABEL } from '@/lib/restaurant-planner/types';

// POST /api/admin/assistant/messages
// The conversation-aware sibling of /api/admin/intelligence/generate for the
// dashboard_assistant feature specifically: persists the user's message,
// folds recent conversation history into the model context via a
// conversation_history rawInput key (so a short follow-up like "only
// cardamom chai" can be resolved against the prior turn's request — see
// lib/intelligence/context-builder.ts), and persists the assistant's reply.
// The actual model call + structured-output classification is owned by the
// Restaurant Planner (lib/restaurant-planner/planner-engine.ts), which reuses
// the same generate() engine and rate-limit helpers as the generic route so
// usage is metered identically — this route stays about persistence and
// auth, not AI orchestration.
//
// Never writes to menu_items — a menu_discount_action reply only stores the
// raw planner action; resolving/previewing/applying it still goes through
// the unchanged discount-action/preview and /apply routes via
// ProposalCard.tsx.

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

  // Restaurant Tool Library: this exact ownership query used to be
  // inline-duplicated in all 6 Restaurant-Planner routes — one
  // implementation now (lib/restaurant-planner/tools/restaurant.ts).
  const serviceClient = makeServiceClient();
  const toolCtx: ToolContext = { supabase: authClient, serviceClient, restaurantId, ownerId: userId };
  const restaurantResult = await getRestaurant.execute({}, toolCtx);

  if (!restaurantResult.ok) {
    return NextResponse.json({ error: restaurantResult.reason }, { status: 403 });
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

  // Prior turns + transcript (V2: tagged with the currently-open proposal,
  // if any, so the model can reference it via refersToProposalId on a
  // follow-up like "make it 15% instead" — Objective 7). Previously two
  // separate inline steps (a raw message fetch + a duplicated open-status
  // filter); one tool call now.
  const conversationContext = await getConversationContext.execute({ conversationId: activeConversationId }, toolCtx);
  const transcript = conversationContext.ok ? conversationContext.data.transcript : '';

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
    // A PlannerParseError means the model call itself succeeded (and
    // consumed quota) but returned output that didn't match PlannerOutput —
    // handled locally as a graceful fallback message. Any other error
    // (disabled feature, missing template, provider failure) rethrows to
    // the outer catch below, which maps it via clientSafeError.
    let turn: Awaited<ReturnType<typeof runPlannerTurn>> | null = null;
    let parseFailureReason: string | null = null;
    try {
      turn = await runPlannerTurn({
        restaurantId,
        userId,
        message,
        conversationHistory: transcript,
        dashboardContext,
        supabase: authClient,
      });
    } catch (err) {
      if (err instanceof PlannerParseError) {
        parseFailureReason = err.message;
      } else {
        throw err;
      }
    }

    await incrementUsage(serviceClient, restaurantId, limits);

    let content: string;
    let intent: 'answer' | 'clarification' | 'unsupported' | 'menu_discount_action' | 'revenue_opportunities' | 'menu_edit_action';
    let action: Json | null = null;
    let capability: string | null = null;
    let candidates: Json | null = null;
    let proposalGroupId: string | null = null;
    let proposalId: string | null = null;
    let revenueOpportunities: Json | null = null;
    // The freshly built/inserted proposal row, if any — returned alongside
    // the message so the client can render ProposalCard's confidence,
    // reasoning, and resolved_snapshot immediately, with no second fetch.
    let proposalPayload: Awaited<ReturnType<typeof insertProposalVersion>> | null = null;

    if (!turn) {
      content = `SpinBite gave an answer that couldn't be understood (${parseFailureReason}). Try rephrasing.`;
      intent = 'answer';
    } else {
      switch (turn.output.intent) {
        case 'answer':
          content = turn.output.answer;
          intent = 'answer';
          break;
        case 'clarification':
          content = turn.output.question;
          intent = 'clarification';
          candidates = (turn.output.candidates as unknown as Json) ?? null;
          break;
        case 'unsupported':
          content = turn.output.note || describeUnsupportedRequest(turn.output.capability);
          intent = 'unsupported';
          capability = turn.output.capability;
          break;
        case 'revenue_goal': {
          // Revenue Intelligence Agent V1: same capability-gate pattern as
          // menu_discount_action below — checked here, not inside the
          // planner, same reasoning. Everything past this gate is
          // deterministic code (lib/restaurant-planner/capabilities/revenue-
          // intelligence.ts) — no second model call.
          const available = await isCapabilityAvailable(serviceClient, {
            capabilityKey: 'revenue_intelligence',
            restaurantId,
            ownerId: userId,
          });
          if (!available) {
            content = explainCapabilityUnavailable('revenue_intelligence');
            intent = 'unsupported';
            capability = 'revenue_intelligence';
            break;
          }

          const result = await generateRevenueOpportunities(toolCtx, turn.output.goal);
          capability = 'revenue_intelligence';

          if (result.kind === 'answer') {
            content = result.text;
            intent = 'answer';
          } else {
            const label = REVENUE_GOAL_LABEL[turn.output.goal];
            content =
              result.opportunities.length === 1
                ? `I found one way to increase ${label}.`
                : `I found ${result.opportunities.length} ways to increase ${label}.`;
            intent = 'revenue_opportunities';
            revenueOpportunities = { goal: turn.output.goal, opportunities: result.opportunities } as unknown as Json;
          }
          break;
        }
        case 'menu_discount_action': {
          // Capability Management: query the registry before selecting
          // tools — checked here, not inside the planner, so a future
          // capability's route gets this for free by calling the same
          // function with its own key (no planner change needed). A
          // disabled capability explains itself instead of attempting
          // resolution; the model already thinks menu_pricing is generally
          // supported (its system prompt says so), so this is a
          // server-side override of its classification, same pattern as
          // the ambiguous-resolution downgrade below.
          const available = await isCapabilityAvailable(serviceClient, {
            capabilityKey: turn.output.capability,
            restaurantId,
            ownerId: userId,
          });
          if (!available) {
            content = explainCapabilityUnavailable(turn.output.capability);
            intent = 'unsupported';
            capability = turn.output.capability;
            break;
          }

          // V2: a follow-up that modifies the conversation's currently-open
          // proposal (per the [proposal:<id>] tag in conversation_history)
          // re-verifies refersToProposalId before trusting it — belongs to
          // this conversation/restaurant and is still open — rather than
          // accepting it outright (Objective 7).
          let targetGroupId: string | undefined;
          if (turn.output.refersToProposalId) {
            const openGroup = await findOpenProposalGroup(authClient, {
              proposalGroupId: turn.output.refersToProposalId,
              conversationId: activeConversationId,
              restaurantId,
            });
            targetGroupId = openGroup?.proposal_group_id;
          }

          const built = await buildProposal(authClient, restaurantId, turn.output.action);

          if (built.kind === 'unresolved') {
            // Deterministic resolution (never the model) found the target
            // ambiguous or absent — surfaces as a clarification with real,
            // never-hallucinated candidates instead of a proposal. The
            // original action is still persisted (target intentionally
            // left as-is, not yet resolvable) so a TargetSelector checkbox
            // submission can rebuild the same discount against a narrowed
            // {scope:'items', names:[...]} target without another model
            // call — see target-selection/route.ts.
            content = built.reason;
            intent = 'clarification';
            capability = turn.output.capability;
            action = turn.output.action as unknown as Json;
            candidates = (built.candidates as unknown as Json) ?? null;
          } else {
            const proposal = await insertProposalVersion(authClient, {
              proposalGroupId: targetGroupId,
              restaurantId,
              conversationId: activeConversationId,
              capability: turn.output.capability,
              action: turn.output.action as unknown as Json,
              resolvedSnapshot: built.resolveResult.items as unknown as Json,
              confidence: built.confidence,
              reasoning: built.reasoning,
              planTasks: built.planTasks as unknown as Json,
              status: targetGroupId ? 'modified' : 'draft',
              createdBy: userId,
            });

            content = describeProposedAction(turn.output.action);
            intent = 'menu_discount_action';
            capability = turn.output.capability;
            action = turn.output.action as unknown as Json;
            proposalGroupId = proposal.proposal_group_id;
            proposalId = proposal.id;
            proposalPayload = proposal;
          }
          break;
        }
        case 'menu_edit_action': {
          // Same capability-gate/refersToProposalId/build-or-clarify shape
          // as menu_discount_action above — the menu_edit sibling, swapping
          // in capabilities/menu-edit.ts's buildProposal and
          // describeProposedMenuEditAction. No new pattern introduced here.
          const available = await isCapabilityAvailable(serviceClient, {
            capabilityKey: turn.output.capability,
            restaurantId,
            ownerId: userId,
          });
          if (!available) {
            content = explainCapabilityUnavailable(turn.output.capability);
            intent = 'unsupported';
            capability = turn.output.capability;
            break;
          }

          let targetGroupId: string | undefined;
          if (turn.output.refersToProposalId) {
            const openGroup = await findOpenProposalGroup(authClient, {
              proposalGroupId: turn.output.refersToProposalId,
              conversationId: activeConversationId,
              restaurantId,
            });
            targetGroupId = openGroup?.proposal_group_id;
          }

          const built = await buildMenuEditProposal(authClient, restaurantId, turn.output.action);

          if (built.kind === 'unresolved') {
            content = built.reason;
            intent = 'clarification';
            capability = turn.output.capability;
            action = turn.output.action as unknown as Json;
            candidates = (built.candidates as unknown as Json) ?? null;
          } else {
            const proposal = await insertProposalVersion(authClient, {
              proposalGroupId: targetGroupId,
              restaurantId,
              conversationId: activeConversationId,
              capability: turn.output.capability,
              action: turn.output.action as unknown as Json,
              resolvedSnapshot: built.resolveResult.items as unknown as Json,
              confidence: built.confidence,
              reasoning: built.reasoning,
              planTasks: built.planTasks as unknown as Json,
              status: targetGroupId ? 'modified' : 'draft',
              createdBy: userId,
            });

            content = describeProposedMenuEditAction(turn.output.action);
            intent = 'menu_edit_action';
            capability = turn.output.capability;
            action = turn.output.action as unknown as Json;
            proposalGroupId = proposal.proposal_group_id;
            proposalId = proposal.id;
            proposalPayload = proposal;
          }
          break;
        }
      }
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
        capability,
        candidates,
        proposal_group_id: proposalGroupId,
        proposal_id: proposalId,
        revenue_opportunities: revenueOpportunities,
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

    return NextResponse.json({ conversationId: activeConversationId, userMessage, assistantMessage, proposal: proposalPayload });
  } catch (err: unknown) {
    console.error('[assistant/messages] Error:', err);
    const { message: errorMessage, status } = clientSafeError(err);
    return NextResponse.json({ error: errorMessage, conversationId: activeConversationId, userMessage }, { status });
  }
}
