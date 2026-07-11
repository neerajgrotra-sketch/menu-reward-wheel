// The menu_pricing capability — Phase 1's only registered capability
// (lib/restaurant-planner/tool-registry.ts), extended in V2 with a real
// buildProposal() step (eager server-side resolution + confidence +
// explainability + plan tasks, persisted as a restaurant_planner_proposals
// row) and explicit pre-execution revalidation. Owns everything a capability
// contributes beyond the shared planner/resolver plumbing:
//   - buildProposal: resolves a raw MenuDiscountAction against real menu
//     data, computes confidence/reasoning/plan_tasks/estimate — everything
//     needed to persist and instantly render a Proposal without a network
//     round trip. Schedule resolution is still only ever authoritative
//     client-side (timezone — see schedule.ts); the schedule fields in the
//     snapshot this returns are a same-request placeholder, corrected by
//     the client on mount and re-derived for real at apply time.
//   - estimateDiscountImpact: a deterministic, clearly-labeled heuristic
//     (not real analytics) for the Proposal's "Estimated Revenue Impact" /
//     "Estimated Margin" fields.
//   - revalidateProposal: diffs a persisted resolved_snapshot against
//     freshly re-resolved live data right before a write, so an approval
//     against a since-changed item is caught and reported instead of
//     silently applied.
//   - applyDiscountProposal: the only function that writes menu_items.
//     Callers (the apply route) must already have re-resolved a
//     ResolveResult against live data before calling this — this function
//     does not re-resolve; that safety property lives in the route.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import {
  resolveMenuDiscountAction,
  type ResolvableAction,
  type ResolvedDiscountItem,
  type ResolveResult,
  type MatchKind,
} from '@/lib/menu-discount-actions/resolve';
import { resolveDiscountSchedule } from '@/lib/menu-discount-actions/schedule';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';
import type { PlannerCandidate } from '../types';
import type { Confidence, PlanTask } from '../proposal';
import type { CoverageKind } from '../tools/analytics';
import { MIN_ORDERS_FOR_ANY_OPPORTUNITY } from '../revenue-intelligence/facts';

export type DiscountImpactEstimate = {
  revenueImpact: string | null;
  margin: string | null;
  warnings: string[];
};

// Rough demand-elasticity buckets by discount depth — intentionally coarse
// and clearly labeled as an estimate. menu_items has no cost/COGS column, so
// true gross margin cannot be computed; margin is always null with an
// explicit warning rather than a fabricated number.
function revenueImpactForPercent(percent: number): string {
  if (percent <= 15) return '+3–6%';
  if (percent <= 30) return '+6–10%';
  return '+8–15%';
}

export function estimateDiscountImpact(action: ResolvableAction, items: ResolvedDiscountItem[]): DiscountImpactEstimate {
  const warnings: string[] = ['Margin estimate unavailable — no cost data is configured for these items.'];

  if (action.type === 'clear_discount') {
    return { revenueImpact: null, margin: null, warnings: [] };
  }

  if (items.length === 0) return { revenueImpact: null, margin: null, warnings };

  let effectivePercent: number;
  if (action.discount.discountType === 'percentage') {
    effectivePercent = action.discount.value;
  } else {
    const withPrice = items.filter((i) => i.price !== null && i.price > 0);
    if (withPrice.length === 0) return { revenueImpact: null, margin: null, warnings };
    const avgPercent =
      withPrice.reduce((sum, i) => sum + (1 - action.discount.value / (i.price as number)) * 100, 0) / withPrice.length;
    effectivePercent = avgPercent;
  }

  return { revenueImpact: revenueImpactForPercent(effectivePercent), margin: null, warnings };
}

// --- V2: buildProposal ------------------------------------------------

const CONFIDENCE_BY_MATCH_KIND: Record<MatchKind, Confidence> = {
  all: 'high',
  category_exact: 'high',
  item_exact: 'high',
  items_explicit: 'high',
  category_substring: 'low',
  item_substring: 'medium',
  name_contains: 'medium',
};

// Exported (alongside buildPlanTasks/explainProposal below) so they're
// independently unit-testable without mocking the Supabase fetch chain that
// buildProposal() itself requires.
export function computeConfidence(matchKind: MatchKind, scheduleParseFailed: boolean): Confidence {
  // A schedule the system couldn't understand overrides an otherwise
  // high-confidence target match — the proposal as a whole is still
  // uncertain even if the item resolution itself was exact.
  if (scheduleParseFailed) return 'low';
  return CONFIDENCE_BY_MATCH_KIND[matchKind];
}

const PLAN_TASK_TEMPLATE: Array<{ id: string; label: string }> = [
  { id: 'find_items', label: 'Find matching menu items' },
  { id: 'validate_pricing', label: 'Validate pricing' },
  { id: 'create_draft', label: 'Create promotion draft' },
  { id: 'configure_schedule', label: 'Configure schedule' },
  { id: 'estimate_impact', label: 'Estimate revenue impact' },
  { id: 'generate_proposal', label: 'Generate proposal' },
  { id: 'await_approval', label: 'Await approval' },
];

export function buildPlanTasks(params: { scheduleRequested: boolean; scheduleParseFailed: boolean }): PlanTask[] {
  return PLAN_TASK_TEMPLATE.map((task) => {
    if (task.id === 'await_approval') return { ...task, status: 'pending' };
    if (task.id === 'configure_schedule' && params.scheduleRequested) {
      return { ...task, status: params.scheduleParseFailed ? 'failed' : 'completed' };
    }
    return { ...task, status: 'completed' };
  });
}

function describeDiscount(action: MenuDiscountAction): string {
  if (action.type === 'clear_discount') return 'removing the discount';
  return action.discount.discountType === 'percentage'
    ? `${action.discount.value}% off`
    : `a fixed price of $${action.discount.value}`;
}

const MATCH_EXPLANATION: Record<MatchKind, string> = {
  all: 'Every menu item was targeted explicitly.',
  category_exact: 'The category name matched exactly.',
  category_substring: 'The category name was matched approximately — double-check this is the right category.',
  item_exact: 'The item name matched exactly.',
  item_substring: 'The item name was matched approximately — double-check this is the right item.',
  items_explicit: 'These items were selected explicitly.',
  name_contains: 'Every item whose name contains the requested text was matched.',
};

export function explainProposal(params: {
  matchKind: MatchKind;
  itemCount: number;
  action: MenuDiscountAction;
  scheduleRequested: boolean;
  scheduleParseFailed: boolean;
  impact: DiscountImpactEstimate;
}): string {
  const itemWord = params.itemCount === 1 ? 'item' : 'items';
  const scheduleLine = !params.scheduleRequested
    ? 'starts immediately'
    : params.scheduleParseFailed
      ? "the requested start time couldn't be understood, so it will start immediately instead"
      : 'starts at the requested time';
  const impactLine = params.impact.revenueImpact ? ` Estimated revenue impact: ${params.impact.revenueImpact}.` : '';
  return `${MATCH_EXPLANATION[params.matchKind]} ${params.itemCount} ${itemWord} affected, ${describeDiscount(params.action)}, ${scheduleLine}.${impactLine}`;
}

// --- V2: Proposal Experience — evidence-based presentation composers -----
// Everything below turns facts the engine already computes (matchKind,
// impact, category coverage, order counts) into card copy. None of it
// changes resolution, confidence, or apply behavior — these are called from
// the preview route (see discount-action/preview/route.ts), not from
// buildProposal, so a stale persisted proposal never shows facts fresher
// than what was true when it was built.

export function explainProposalBullets(params: {
  matchKind: MatchKind;
  itemCount: number;
  scheduleParseFailed: boolean;
  impact: DiscountImpactEstimate;
}): string[] {
  const itemWord = params.itemCount === 1 ? 'item' : 'items';
  const bullets = [MATCH_EXPLANATION[params.matchKind], `This change affects ${params.itemCount} ${itemWord}.`];
  if (params.scheduleParseFailed) {
    bullets.push("The requested start time couldn't be understood, so it will start immediately instead.");
  }
  if (params.impact.revenueImpact) {
    bullets.push(`Estimated revenue impact: ${params.impact.revenueImpact}.`);
  }
  return bullets;
}

export function composeExecutiveSummary(params: { confidence: Confidence; considerationCount: number; impact: DiscountImpactEstimate }): string {
  if (params.confidence === 'low') {
    return 'Experimental recommendation — confidence is low, so treat this as a test rather than a sure win.';
  }
  if (params.considerationCount > 0) {
    const pointWord = params.considerationCount === 1 ? 'one point' : `${params.considerationCount} points`;
    return `Reasonable recommendation, with ${pointWord} worth reviewing before approving.`;
  }
  const impactPhrase = params.impact.revenueImpact
    ? `expected to lift revenue ${params.impact.revenueImpact}`
    : 'expected to have a modest, hard-to-measure effect';
  return `Low-risk recommendation, ${impactPhrase}.`;
}

export function composeWhyNow(params: { campaignCoverage: CoverageKind; itemCoverage: CoverageKind; hasRecentDiscount: boolean }): string[] {
  const signals: string[] = [];
  if (params.campaignCoverage !== 'active') signals.push('No active campaign is currently running in this category.');
  if (params.itemCoverage === 'none') signals.push('This category has no other active promotions right now.');
  if (!params.hasRecentDiscount) signals.push('This item has not been discounted recently.');
  if (signals.length === 0) signals.push('No special timing factors were detected for this recommendation.');
  return signals;
}

export type ConfidenceEvidenceItem = { met: boolean; label: string };

export function composeConfidenceEvidence(params: {
  matchKind: MatchKind;
  scheduleParseFailed: boolean;
  allPricesKnown: boolean;
  orderCount: number;
}): ConfidenceEvidenceItem[] {
  const strongMatch = params.matchKind === 'all' || params.matchKind === 'category_exact' || params.matchKind === 'item_exact' || params.matchKind === 'items_explicit';
  const orderEvidenceAdequate = params.orderCount >= MIN_ORDERS_FOR_ANY_OPPORTUNITY;
  return [
    { met: strongMatch, label: strongMatch ? 'Strong item match' : 'Approximate item match — double-check this is the right item' },
    { met: params.allPricesKnown, label: params.allPricesKnown ? 'Complete pricing information' : 'Some affected items are missing price data' },
    { met: !params.scheduleParseFailed, label: params.scheduleParseFailed ? "Requested start time couldn't be understood" : 'Schedule understood as requested' },
    {
      met: orderEvidenceAdequate,
      label: orderEvidenceAdequate
        ? `${params.orderCount} completed orders in the last 30 days`
        : `Only ${params.orderCount} completed order${params.orderCount === 1 ? '' : 's'} in the last 30 days`,
    },
  ];
}

export function composeConsiderations(params: { warnings: string[]; campaignOverlap: boolean; orderCount: number }): string[] {
  const considerations = [...params.warnings];
  if (params.campaignOverlap) considerations.push('An active campaign-level promotion already covers this category.');
  if (params.orderCount < MIN_ORDERS_FOR_ANY_OPPORTUNITY) {
    considerations.push(`Limited historical sales data — only ${params.orderCount} completed order${params.orderCount === 1 ? '' : 's'} in the last 30 days.`);
  }
  return considerations;
}

function candidatesWithCategory(
  names: string[],
  items: Array<{ name: string; category_id: string }>,
  categories: Array<{ id: string; name: string }>,
): PlannerCandidate[] {
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  return names.map((name) => {
    const item = items.find((i) => i.name === name);
    return { name, categoryName: (item && categoryNameById.get(item.category_id)) || '' };
  });
}

export type ProposalBuildResult =
  | { kind: 'unresolved'; reason: string; candidates?: PlannerCandidate[] }
  | {
      kind: 'resolved';
      resolveResult: Extract<ResolveResult, { resolved: true }>;
      confidence: Confidence;
      reasoning: string;
      planTasks: PlanTask[];
      impact: DiscountImpactEstimate;
    };

// Resolves a raw, model-authored MenuDiscountAction against the restaurant's
// real menu. Schedule fields in the returned resolveResult's `after` are a
// same-request placeholder (computed with whatever clock this server
// happens to be running on) — never authoritative. The client corrects them
// on mount using the browser's local time (same as Phase 1's
// toResolvableAction), and the apply route re-derives the real schedule and
// re-resolves everything from scratch again before writing regardless.
export async function buildProposal(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
  action: MenuDiscountAction,
): Promise<ProposalBuildResult> {
  const menus = await fetchAssignedMenus(supabase, restaurantId);
  const { categories, items } = await fetchMenuContents(supabase, menus.map((m) => m.id));

  const scheduleRequested = action.type === 'set_discount' && Boolean(action.discount.startTime);
  const resolvable: ResolvableAction =
    action.type === 'clear_discount' ? action : { type: 'set_discount', target: action.target, discount: resolveDiscountSchedule(action.discount) };
  const scheduleParseFailed = resolvable.type === 'set_discount' ? resolvable.discount.startTimeParseFailed === true : false;

  const result = resolveMenuDiscountAction(resolvable, categories, items);

  if (!result.resolved) {
    return {
      kind: 'unresolved',
      reason: result.reason,
      candidates: result.candidates ? candidatesWithCategory(result.candidates, items, categories) : undefined,
    };
  }

  const confidence = computeConfidence(result.matchKind, scheduleParseFailed);
  const impact = estimateDiscountImpact(resolvable, result.items);
  const planTasks = buildPlanTasks({ scheduleRequested, scheduleParseFailed });
  const reasoning = explainProposal({
    matchKind: result.matchKind,
    itemCount: result.items.length,
    action,
    scheduleRequested,
    scheduleParseFailed,
    impact,
  });

  return { kind: 'resolved', resolveResult: result, confidence, reasoning, planTasks, impact };
}

// --- V2: revalidation before execution ---------------------------------

export type RevalidationResult = { ok: true } | { ok: false; reason: string };

// Diffs a proposal's persisted resolved_snapshot against freshly resolved
// live data (the apply route always re-resolves from scratch — this is Phase
// 1's existing "never trust a client diff" property). A missing item means
// it was deleted/archived since the proposal was shown; a before-state
// mismatch means someone else changed its price or discount in the
// meantime. Either way the caller should refuse to write and ask for a new
// proposal, per Objective 3 ("Do not execute. Generate a new proposal.").
export function revalidateProposal(snapshot: ResolvedDiscountItem[] | null, liveItems: ResolvedDiscountItem[]): RevalidationResult {
  if (!snapshot) return { ok: true };
  const liveById = new Map(liveItems.map((i) => [i.id, i]));
  for (const snap of snapshot) {
    const live = liveById.get(snap.id);
    if (!live) {
      return { ok: false, reason: `"${snap.name}" is no longer available on the menu — generate a new proposal.` };
    }
    const changed =
      live.price !== snap.price ||
      live.before.specialEnabled !== snap.before.specialEnabled ||
      live.before.specialType !== snap.before.specialType ||
      live.before.specialPercent !== snap.before.specialPercent ||
      live.before.specialPrice !== snap.before.specialPrice;
    if (changed) {
      return { ok: false, reason: `"${snap.name}" changed since this proposal was shown — generate a new proposal.` };
    }
  }
  return { ok: true };
}

// --- apply (write) -------------------------------------------------------

export type ApplyOutcome = { id: string; name: string; success: boolean; error?: string };
export type ApplyDiscountResult = { applied: number; total: number; failed?: ApplyOutcome[]; skippedNoOp?: string[] };

export async function applyDiscountProposal(
  authClient: SupabaseClient<Database>,
  restaurantId: string,
  actorUserId: string,
  items: ResolvedDiscountItem[],
): Promise<ApplyDiscountResult> {
  // Objective 3 — duplicate/no-op detection: an item whose live state
  // already exactly matches the proposed after-state is skipped (no write,
  // no audit row) rather than silently re-applying an identical discount.
  const realWrites = items.filter((item) => !isNoOp(item));
  const skippedNoOp = items.filter(isNoOp).map((item) => item.name);

  const outcomes = await Promise.all(realWrites.map((item) => applyOne(authClient, restaurantId, actorUserId, item)));
  const applied = outcomes.filter((o) => o.success).length;
  const failed = outcomes.filter((o) => !o.success);
  return {
    applied,
    total: items.length,
    failed: failed.length > 0 ? failed : undefined,
    skippedNoOp: skippedNoOp.length > 0 ? skippedNoOp : undefined,
  };
}

function isNoOp(item: ResolvedDiscountItem): boolean {
  return (
    item.before.specialEnabled === item.after.specialEnabled &&
    item.before.specialType === item.after.specialType &&
    item.before.specialPercent === item.after.specialPercent &&
    item.before.specialPrice === item.after.specialPrice
  );
}

async function applyOne(
  authClient: SupabaseClient<Database>,
  restaurantId: string,
  actorUserId: string,
  item: ResolvedDiscountItem,
): Promise<ApplyOutcome> {
  const updateResult = await authClient
    .from('menu_items')
    .update({
      special_enabled: item.after.specialEnabled,
      special_type: item.after.specialType,
      special_percent: item.after.specialPercent,
      special_price: item.after.specialPrice,
      special_start_at: item.after.specialStartAt,
      special_end_at: item.after.specialEndAt,
      special_no_expiry: item.after.specialNoExpiry,
    })
    .eq('id', item.id)
    .eq('restaurant_id', restaurantId);

  if (updateResult.error) {
    return { id: item.id, name: item.name, success: false, error: updateResult.error.message };
  }

  // A logging failure must not be reported as an apply failure — the write
  // already succeeded. Best-effort, matching intelligence-engine.ts's own
  // "log failure never masks a real result" convention.
  const logResult = await authClient.from('menu_discount_change_log').insert({
    restaurant_id: restaurantId,
    actor_user_id: actorUserId,
    menu_item_id: item.id,
    old_value: item.before,
    new_value: item.after,
    source: 'ai_action',
  });

  if (logResult.error) {
    console.error('[menu-pricing/applyDiscountProposal] Failed to write change log:', logResult.error.message);
  }

  return { id: item.id, name: item.name, success: true };
}
