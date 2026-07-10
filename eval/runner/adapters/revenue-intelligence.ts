// revenue_intelligence capability adapter.
//
// Unlike menu_pricing's adapter, this one calls the REAL orchestrator
// functions directly — generateRevenueOpportunities and
// createProposalFromOpportunity (lib/restaurant-planner/capabilities/
// revenue-intelligence.ts) both take a plain ToolContext, never touch
// next/headers' cookies(), and were designed from the start to avoid the
// route-handler-entanglement problem menu_pricing's adapter has to work
// around. No hand-mirrored orchestration needed here.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { parsePlannerOutput, type RevenueOpportunity } from '@/lib/restaurant-planner/types';
import { generateRevenueOpportunities, createProposalFromOpportunity, type CreateProposalResult } from '@/lib/restaurant-planner/capabilities/revenue-intelligence';
import type { ToolContext } from '@/lib/restaurant-planner/tools/types';
import type { CapabilityEvalAdapter, EvalContext, GoldenTurn, ConversationState, ActualTurnResult, ExpectedForIntent, ExpectedExecutionOutcome, AssertionResult } from '../types';
import { assertEqual, assertContainsAll, assertTrue } from '../assertions';

const EVAL_CONVERSATION_ID = 'eval-conversation';
const EVAL_ACTOR_ID = 'eval-runner';

function toolContext(ctx: EvalContext): ToolContext {
  const client = ctx.fakeClient as unknown as SupabaseClient<Database>;
  // No RLS in the fake client, so supabase/serviceClient can safely be the
  // same instance — the real distinction (session vs. service-role) exists
  // to cross an RLS boundary that doesn't apply here.
  return { supabase: client, serviceClient: client, restaurantId: ctx.restaurant.id, ownerId: ctx.restaurant.ownerId };
}

type RevenueIntelligenceDetail =
  | { kind: 'not-this-capability' }
  | { kind: 'answer'; text: string }
  | { kind: 'opportunities'; opportunities: RevenueOpportunity[] };

async function runTurn(
  ctx: EvalContext,
  turn: GoldenTurn,
  state: ConversationState,
): Promise<{ actual: ActualTurnResult; state: ConversationState }> {
  const parsed = parsePlannerOutput(turn.recordedPlannerOutputRaw);

  if (parsed.intent !== 'revenue_goal') {
    return { actual: { parsed, detail: { kind: 'not-this-capability' } }, state };
  }

  const result = await generateRevenueOpportunities(toolContext(ctx), parsed.goal);
  const detail: RevenueIntelligenceDetail =
    result.kind === 'answer' ? { kind: 'answer', text: result.text } : { kind: 'opportunities', opportunities: result.opportunities };
  return { actual: { parsed, detail }, state };
}

function assert(expected: ExpectedForIntent, actual: ActualTurnResult): AssertionResult[] {
  const results: AssertionResult[] = [assertEqual(actual.parsed.intent, expected.intent, 'intent')];
  if (actual.parsed.intent !== expected.intent) return results;

  if (expected.intent === 'answer' && actual.parsed.intent === 'answer') {
    results.push(...assertContainsAll(actual.parsed.answer, expected.answerContains, 'answer text'));
  }
  if (expected.intent === 'unsupported' && actual.parsed.intent === 'unsupported') {
    results.push(assertEqual(actual.parsed.capability, expected.capability, 'unsupported capability'));
  }
  if (expected.intent === 'revenue_goal' && actual.parsed.intent === 'revenue_goal') {
    results.push(assertEqual(actual.parsed.goal, expected.goal, 'goal'));
    const detail = actual.detail as RevenueIntelligenceDetail;

    if (expected.deterministicResult) {
      if (expected.deterministicResult.kind === 'answer') {
        results.push(assertTrue(detail.kind === 'answer', `expected an answer-only deterministic result, got "${detail.kind}"`));
        if (detail.kind === 'answer') results.push(...assertContainsAll(detail.text, expected.deterministicResult.textContains, 'deterministic answer text'));
      } else {
        results.push(assertTrue(detail.kind === 'opportunities', `expected opportunities, got "${detail.kind}"`));
        if (detail.kind === 'opportunities') {
          results.push(assertEqual(detail.opportunities.length, expected.deterministicResult.count, 'opportunity count'));
          const first = detail.opportunities[0];
          const expFirst = expected.deterministicResult.firstOpportunity;
          if (expFirst) {
            results.push(assertTrue(!!first, 'a first opportunity exists'));
            if (first) {
              results.push(assertEqual(first.goal, expFirst.goal, 'opportunity goal'));
              results.push(assertEqual(first.confidence, expFirst.confidence, 'opportunity confidence'));
              results.push(assertEqual(first.action.type, expFirst.actionType, 'opportunity action type'));
              results.push(...assertContainsAll(first.reasoning, expFirst.reasoningContains, 'opportunity reasoning'));
            }
          }
        }
      }
    }
  }
  return results;
}

async function runAction(
  ctx: EvalContext,
  turn: GoldenTurn,
  actual: ActualTurnResult,
  state: ConversationState,
): Promise<{ actualAfterAction: unknown; state: ConversationState }> {
  const action = turn.userAction;
  if (!action) throw new Error('runAction called with no userAction on the golden turn');
  const detail = actual.detail as RevenueIntelligenceDetail;
  if (detail.kind !== 'opportunities' || detail.opportunities.length === 0) {
    throw new Error('runAction requires a preceding turn that produced real opportunities');
  }
  const opportunity = detail.opportunities[0];

  if (action.type === 'createProposal') {
    const result: CreateProposalResult = await createProposalFromOpportunity(toolContext(ctx), {
      conversationId: EVAL_CONVERSATION_ID,
      createdBy: EVAL_ACTOR_ID,
      opportunity,
    });
    const nextState: ConversationState = result.kind === 'resolved' ? { openProposalGroupId: result.proposal.proposal_group_id } : state;
    return { actualAfterAction: result, state: nextState };
  }

  throw new Error(`revenue_intelligence eval adapter does not implement user action: ${JSON.stringify(action)}`);
}

function assertAfterAction(expected: ExpectedExecutionOutcome, actualAfterAction: unknown): AssertionResult[] {
  const result = actualAfterAction as CreateProposalResult;
  const results: AssertionResult[] = [];

  if (expected.proposalStatus === 'draft' || expected.proposalStatus === 'modified') {
    results.push(assertTrue(result.kind === 'resolved', `expected a resolved (drafted) proposal, got "${result.kind}"`));
    if (result.kind === 'resolved') {
      results.push(assertEqual(result.proposal.status, expected.proposalStatus, 'proposal status'));
      results.push(assertEqual(result.proposal.capability, 'menu_pricing', 'proposal capability (opportunities always convert into menu_pricing)'));
    }
  }
  // 'cancelled'/'executed' after a createProposal action would require the
  // menu_pricing adapter's approve/cancel path on the resulting proposal —
  // deliberately out of scope here, see the adapter file header.
  return results;
}

export const revenueIntelligenceAdapter: CapabilityEvalAdapter = {
  capability: 'revenue_intelligence',
  runTurn,
  assert,
  runAction,
  assertAfterAction,
};
