// menu_pricing capability adapter.
//
// IMPORTANT: the branch logic below is a hand-mirrored copy of real
// orchestration that lives inline in two route handlers — it exists here
// only because those routes construct their Supabase client via
// lib/supabase/server.ts's createClient(), which calls next/headers'
// cookies() unconditionally and therefore cannot run inside a plain vitest
// test. This file must stay an intentionally dumb, literal mirror of:
//   - app/api/admin/assistant/messages/route.ts's 'menu_discount_action' case
//   - app/api/admin/menus/discount-action/apply/route.ts's POST handler
//   - lib/restaurant-planner/tools/promotion.ts's cancelPromotion
// Update it ONLY when those change. Never add eval-only business logic,
// precedence rules, or handling for states (e.g. 'approved') that don't
// exist in the real code paths.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { parsePlannerOutput } from '@/lib/restaurant-planner/types';
import { buildProposal, revalidateProposal, applyDiscountProposal } from '@/lib/restaurant-planner/capabilities/menu-pricing';
import { insertProposalVersion, type ProposalRow } from '@/lib/restaurant-planner/proposals';
import { resolveMenuDiscountAction, type ResolvableAction, type ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import { resolveDiscountSchedule } from '@/lib/menu-discount-actions/schedule';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { CapabilityEvalAdapter, EvalContext, GoldenTurn, ConversationState, ActualTurnResult, ExpectedForIntent, ExpectedExecutionOutcome, AssertionResult } from '../types';
import { assertEqual, assertContainsAll, assertArrayContainsAll, assertTrue } from '../assertions';

const EVAL_CONVERSATION_ID = 'eval-conversation';
const EVAL_ACTOR_ID = 'eval-runner';

// Mirrors CommandCenter.tsx's toResolvableAction — the client-side schedule
// resolution every proposal already goes through before apply.
function toResolvableAction(action: MenuDiscountAction): ResolvableAction {
  if (action.type === 'clear_discount') return action;
  return { type: 'set_discount', target: action.target, discount: resolveDiscountSchedule(action.discount) };
}

type MenuPricingDetail =
  | { kind: 'unresolved'; reason: string; candidates?: Array<{ name: string; categoryName: string }> }
  | { kind: 'resolved'; matchKind: string; confidence: string; reasoning: string; itemCount: number; proposal: ProposalRow };

async function runTurn(
  ctx: EvalContext,
  turn: GoldenTurn,
  state: ConversationState,
): Promise<{ actual: ActualTurnResult; state: ConversationState }> {
  const parsed = parsePlannerOutput(turn.recordedPlannerOutputRaw);
  const supabase = ctx.fakeClient as unknown as SupabaseClient<Database>;

  if (parsed.intent !== 'menu_discount_action') {
    return { actual: { parsed, detail: null }, state };
  }

  // Mirrors messages/route.ts: re-verify refersToProposalId against the
  // currently-open group before trusting it as a modification target.
  let targetGroupId: string | undefined;
  if (parsed.refersToProposalId && state.openProposalGroupId === parsed.refersToProposalId) {
    targetGroupId = state.openProposalGroupId;
  }

  const built = await buildProposal(supabase, ctx.restaurant.id, parsed.action);

  if (built.kind === 'unresolved') {
    const detail: MenuPricingDetail = { kind: 'unresolved', reason: built.reason, candidates: built.candidates };
    return { actual: { parsed, detail }, state };
  }

  const proposal = await insertProposalVersion(supabase, {
    proposalGroupId: targetGroupId,
    restaurantId: ctx.restaurant.id,
    conversationId: EVAL_CONVERSATION_ID,
    capability: 'menu_pricing',
    action: parsed.action as unknown as Json,
    resolvedSnapshot: built.resolveResult.items as unknown as Json,
    confidence: built.confidence,
    reasoning: built.reasoning,
    planTasks: built.planTasks as unknown as Json,
    status: targetGroupId ? 'modified' : 'draft',
    createdBy: EVAL_ACTOR_ID,
  });

  const detail: MenuPricingDetail = {
    kind: 'resolved',
    matchKind: built.resolveResult.matchKind,
    confidence: built.confidence,
    reasoning: built.reasoning,
    itemCount: built.resolveResult.items.length,
    proposal,
  };
  return { actual: { parsed, detail }, state: { openProposalGroupId: proposal.proposal_group_id } };
}

function assert(expected: ExpectedForIntent, actual: ActualTurnResult): AssertionResult[] {
  const results: AssertionResult[] = [assertEqual(actual.parsed.intent, expected.intent, 'intent')];
  if (actual.parsed.intent !== expected.intent) return results;

  if (expected.intent === 'answer' && actual.parsed.intent === 'answer') {
    results.push(...assertContainsAll(actual.parsed.answer, expected.answerContains, 'answer text'));
  }
  if (expected.intent === 'clarification' && actual.parsed.intent === 'clarification') {
    results.push(...assertContainsAll(actual.parsed.question, expected.questionContains, 'clarification question'));
  }
  if (expected.intent === 'unsupported' && actual.parsed.intent === 'unsupported') {
    results.push(assertEqual(actual.parsed.capability, expected.capability, 'unsupported capability'));
  }
  if (expected.intent === 'menu_discount_action' && actual.parsed.intent === 'menu_discount_action') {
    const detail = actual.detail as MenuPricingDetail | null;
    if (expected.unresolved) {
      results.push(assertEqual(detail?.kind, 'unresolved', 'resolution kind'));
      if (detail?.kind === 'unresolved') {
        results.push(...assertContainsAll(detail.reason, expected.unresolved.reasonContains, 'unresolved reason'));
        if (expected.unresolved.candidateNames) {
          results.push(assertArrayContainsAll((detail.candidates ?? []).map((c) => c.name), expected.unresolved.candidateNames, 'candidates'));
        }
      }
    } else {
      results.push(assertEqual(detail?.kind, 'resolved', 'resolution kind'));
      if (detail?.kind === 'resolved') {
        if (expected.matchKind) results.push(assertEqual(detail.matchKind, expected.matchKind, 'matchKind'));
        if (expected.confidence) results.push(assertEqual(detail.confidence, expected.confidence, 'confidence'));
        if (expected.resolvedItemCount !== undefined) results.push(assertEqual(detail.itemCount, expected.resolvedItemCount, 'resolved item count'));
        results.push(...assertContainsAll(detail.reasoning, expected.reasoningContains, 'reasoning'));
      }
    }
  }
  return results;
}

async function runAction(
  ctx: EvalContext,
  _turn: GoldenTurn,
  actual: ActualTurnResult,
  state: ConversationState,
): Promise<{ actualAfterAction: unknown; state: ConversationState }> {
  const action = _turn.userAction;
  if (!action) throw new Error('runAction called with no userAction on the golden turn');
  const detail = actual.detail as MenuPricingDetail | null;
  if (!detail || detail.kind !== 'resolved') throw new Error('runAction requires a resolved proposal from the preceding turn');
  const supabase = ctx.fakeClient as unknown as SupabaseClient<Database>;

  if (action.type === 'cancel') {
    // Mirrors lib/restaurant-planner/tools/promotion.ts's cancelPromotion.
    const cancelled = await insertProposalVersion(supabase, {
      proposalGroupId: detail.proposal.proposal_group_id,
      restaurantId: ctx.restaurant.id,
      conversationId: EVAL_CONVERSATION_ID,
      capability: detail.proposal.capability,
      action: detail.proposal.action,
      resolvedSnapshot: detail.proposal.resolved_snapshot,
      confidence: detail.proposal.confidence,
      reasoning: detail.proposal.reasoning,
      planTasks: detail.proposal.plan_tasks,
      status: 'cancelled',
      createdBy: EVAL_ACTOR_ID,
    });
    return { actualAfterAction: { kind: 'cancelled', proposal: cancelled }, state };
  }

  if (action.type === 'modify') {
    // Real behavior: Modify dismisses the card and prefills a new chat
    // message the user edits (ProposalCard.tsx's handleModify) — it is NOT
    // a direct DB action. The eval framework represents it the same way:
    // no execution happens here, the next golden turn is what continues
    // the conversation.
    return { actualAfterAction: { kind: 'modify_prefilled', draftText: action.draftText }, state };
  }

  if (action.type === 'approve') {
    // Mirrors app/api/admin/menus/discount-action/apply/route.ts exactly:
    // re-resolve against live data -> revalidate against the persisted
    // snapshot -> apply -> (only if applied>0) insert an 'executed' version.
    const resolvable = toResolvableAction(detail.proposal.action as unknown as MenuDiscountAction);
    const menus = await fetchAssignedMenus(supabase, ctx.restaurant.id);
    const { categories, items } = await fetchMenuContents(supabase, menus.map((m) => m.id));
    const resolved = resolveMenuDiscountAction(resolvable, categories, items);
    if (!resolved.resolved) {
      return { actualAfterAction: { kind: 'apply_failed_unresolved', reason: resolved.reason }, state };
    }

    const revalidation = revalidateProposal(detail.proposal.resolved_snapshot as unknown as ResolvedDiscountItem[] | null, resolved.items);
    if (!revalidation.ok) {
      return { actualAfterAction: { kind: 'apply_blocked_stale', reason: revalidation.reason }, state };
    }

    const applyResult = await applyDiscountProposal(supabase, ctx.restaurant.id, ctx.restaurant.ownerId, resolved.items);

    let executedProposal: ProposalRow | null = null;
    if (applyResult.applied > 0) {
      executedProposal = await insertProposalVersion(supabase, {
        proposalGroupId: detail.proposal.proposal_group_id,
        restaurantId: ctx.restaurant.id,
        conversationId: EVAL_CONVERSATION_ID,
        capability: detail.proposal.capability,
        action: detail.proposal.action,
        resolvedSnapshot: resolved.items as unknown as Json,
        confidence: detail.proposal.confidence,
        reasoning: detail.proposal.reasoning,
        planTasks: detail.proposal.plan_tasks,
        status: 'executed',
        createdBy: EVAL_ACTOR_ID,
      });
    }

    // Re-fetch post-apply item state for assertion (mirrors what the public
    // menu route would read next).
    const { items: itemsAfter } = await fetchMenuContents(supabase, menus.map((m) => m.id));
    return { actualAfterAction: { kind: 'applied', applyResult, executedProposal, itemsAfter }, state };
  }

  throw new Error(`menu_pricing eval adapter does not implement user action: ${JSON.stringify(action)}`);
}

function assertAfterAction(expected: ExpectedExecutionOutcome, actualAfterAction: unknown): AssertionResult[] {
  const results: AssertionResult[] = [];
  const detail = actualAfterAction as
    | { kind: 'cancelled'; proposal: ProposalRow }
    | { kind: 'modify_prefilled'; draftText: string }
    | { kind: 'apply_failed_unresolved'; reason: string }
    | { kind: 'apply_blocked_stale'; reason: string }
    | { kind: 'applied'; applyResult: { applied: number; total: number; skippedNoOp?: string[] }; executedProposal: ProposalRow | null; itemsAfter: Array<{ name: string; special_enabled: boolean; special_percent: number | null; special_price: number | null }> };

  if (expected.proposalStatus === 'cancelled') {
    results.push(assertTrue(detail.kind === 'cancelled', `expected a cancelled outcome, got ${detail.kind}`));
    if (detail.kind === 'cancelled') results.push(assertEqual(detail.proposal.status, 'cancelled', 'proposal status'));
    return results;
  }

  if (expected.proposalStatus === 'executed') {
    results.push(assertTrue(detail.kind === 'applied', `expected an applied outcome, got ${detail.kind}`));
    if (detail.kind !== 'applied') return results;
    results.push(assertTrue(detail.executedProposal !== null, 'an executed proposal version was written'));
    if (detail.executedProposal) results.push(assertEqual(detail.executedProposal.status, 'executed', 'proposal status'));
    if (expected.applied !== undefined) results.push(assertEqual(detail.applyResult.applied, expected.applied, 'applied count'));
    if (expected.total !== undefined) results.push(assertEqual(detail.applyResult.total, expected.total, 'total count'));
    if (expected.skippedNoOp) results.push(assertArrayContainsAll(detail.applyResult.skippedNoOp, expected.skippedNoOp, 'skippedNoOp'));
    if (expected.affectedItemAfterState) {
      for (const expectedItem of expected.affectedItemAfterState) {
        const row = detail.itemsAfter.find((i) => i.name === expectedItem.name);
        results.push(assertTrue(!!row, `item "${expectedItem.name}" exists after apply`));
        if (row) {
          results.push(assertEqual(row.special_enabled, expectedItem.specialEnabled, `${expectedItem.name}.special_enabled`));
          if (expectedItem.specialPercent !== undefined) results.push(assertEqual(row.special_percent, expectedItem.specialPercent, `${expectedItem.name}.special_percent`));
          if (expectedItem.specialPrice !== undefined) results.push(assertEqual(row.special_price, expectedItem.specialPrice, `${expectedItem.name}.special_price`));
        }
      }
    }
    return results;
  }

  // draft/modified: nothing further to check post-action — those statuses
  // are asserted by the ordinary turn-level `assert()` at insert time.
  return results;
}

export const menuPricingAdapter: CapabilityEvalAdapter = {
  capability: 'menu_pricing',
  runTurn,
  assert,
  runAction,
  assertAfterAction,
};
