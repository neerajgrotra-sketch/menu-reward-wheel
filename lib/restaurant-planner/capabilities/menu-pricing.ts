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
import { MIN_ORDERS_FOR_ANY_OPPORTUNITY } from '../revenue-intelligence/facts';
import {
  MATCH_EXPLANATION,
  type DecisionCopyAdapter,
  type Alternative,
  type ImpactEstimate,
} from '../decision-intelligence';

// DiscountImpactEstimate is menu_pricing's own name for the shared
// ImpactEstimate shape (lib/restaurant-planner/decision-intelligence.ts) —
// kept as a local alias rather than importing ImpactEstimate directly at
// every call site in this file, since every existing signature here already
// says "Discount". Structurally identical, so this is a type alias, not a
// separate shape.
export type DiscountImpactEstimate = ImpactEstimate;

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

// --- Decision Intelligence — menu_pricing's DecisionCopyAdapter ----------
// The domain-specific half of the Decision Card (see
// lib/restaurant-planner/decision-intelligence.ts for the shared half and
// the contract this implements). Every string below is byte-identical to
// the standalone functions this replaced — a behavior-preserving move, not
// a rewrite — now gathered into one factory so a preview route gets the
// full adapter in one call instead of importing 7 functions individually.
// `allPricesKnown` is pricing-specific derived data (are all resolved
// items' prices non-null) the shared DecisionCopyAdapter interface doesn't
// carry generically — captured here via closure instead, since it's not
// something every future capability would have an equivalent of. `action`
// is closed over too, so composeAlternatives/composeWhyThisRecommendation
// can preserve the exact pre-existing rule that alternatives are only
// meaningful for set_discount, never clear_discount (removing a discount
// has no "alternative" to a discount) — previously a conditional inline in
// the preview route, now inside the adapter where the route no longer
// needs to know menu_pricing's action shape at all.

export function makeMenuPricingDecisionCopyAdapter(action: MenuDiscountAction, params: { allPricesKnown: boolean }): DecisionCopyAdapter {
  return {
    composeExecutiveSummary: (facts) => {
      if (facts.confidence === 'low') {
        return 'Experimental recommendation — confidence is low, so treat this as a test rather than a sure win.';
      }
      if (facts.considerationCount > 0) {
        const pointWord = facts.considerationCount === 1 ? 'one point' : `${facts.considerationCount} points`;
        return `Reasonable recommendation, with ${pointWord} worth reviewing before approving.`;
      }
      const impactPhrase = facts.impact.revenueImpact
        ? `expected to lift revenue ${facts.impact.revenueImpact}`
        : 'expected to have a modest, hard-to-measure effect';
      return `Low-risk recommendation, ${impactPhrase}.`;
    },

    composeWhyNow: (facts) => {
      const signals: string[] = [];
      if (facts.campaignCoverage !== 'active') signals.push('No active campaign is currently running in this category.');
      if (facts.itemCoverage === 'none') signals.push('This category has no other active promotions right now.');
      if (!facts.hasRecentActivity) signals.push('This item has not been discounted recently.');
      if (signals.length === 0) signals.push('No special timing factors were detected for this recommendation.');
      return signals;
    },

    composeConfidenceEvidence: (facts) => {
      const strongMatch =
        facts.matchKind === 'all' || facts.matchKind === 'category_exact' || facts.matchKind === 'item_exact' || facts.matchKind === 'items_explicit';
      const orderEvidenceAdequate = facts.orderCount >= MIN_ORDERS_FOR_ANY_OPPORTUNITY;
      return [
        { met: strongMatch, label: strongMatch ? 'Strong item match' : 'Approximate item match — double-check this is the right item' },
        { met: params.allPricesKnown, label: params.allPricesKnown ? 'Complete pricing information' : 'Some affected items are missing price data' },
        { met: !facts.scheduleParseFailed, label: facts.scheduleParseFailed ? "Requested start time couldn't be understood" : 'Schedule understood as requested' },
        {
          met: orderEvidenceAdequate,
          label: orderEvidenceAdequate
            ? `${facts.orderCount} completed orders in the last 30 days`
            : `Only ${facts.orderCount} completed order${facts.orderCount === 1 ? '' : 's'} in the last 30 days`,
        },
      ];
    },

    composeConsiderations: (facts) => {
      const considerations = [...facts.warnings];
      if (facts.campaignOverlap) considerations.push('An active campaign-level promotion already covers this category.');
      if (facts.orderCount < MIN_ORDERS_FOR_ANY_OPPORTUNITY) {
        considerations.push(`Limited historical sales data — only ${facts.orderCount} completed order${facts.orderCount === 1 ? '' : 's'} in the last 30 days.`);
      }
      return considerations;
    },

    // Decision 2: prefer real co-order evidence (evidenceBacked: true) over
    // the two generic, always-applicable templates — the templates are only
    // used as a fallback when no co-order pairs exist for the affected item(s).
    // Not meaningful for clear_discount (removing a discount has no
    // "alternative" to a discount) — preserves the exact pre-existing rule.
    composeAlternatives: (facts) => {
      if (action.type !== 'set_discount') return [];
      const primary = facts.itemNames.length === 1 ? facts.itemNames[0] : 'these items';
      const alternatives: Alternative[] = facts.coOrderedNames
        .slice(0, 2)
        .map((name) => ({ text: `Bundle ${primary} with ${name} — frequently ordered together`, evidenceBacked: true }));
      if (alternatives.length === 0) {
        alternatives.push(
          { text: `Feature ${primary} on the menu instead of discounting it`, evidenceBacked: false },
          { text: `Include ${primary} in a combo or bundle offer`, evidenceBacked: false },
        );
      }
      return alternatives;
    },

    // menu_pricing is currently the only registered, automatically-executable
    // capability with a discount lever (tool-registry.ts) — bundling or
    // featuring an item has no apply path yet, which is the real (not
    // fabricated) reason a direct discount is recommended over the
    // alternatives above. null for clear_discount, matching the pre-existing
    // rule (never "No deterministic alternative..." filler for a removal).
    composeWhyThisRecommendation: (alternatives) => {
      if (action.type !== 'set_discount') return null;
      if (alternatives.length === 0) {
        return 'No deterministic alternative was identified — this is the most direct way to reach the objective.';
      }
      const considered = alternatives.map((a) => a.text).join('; ');
      return `${considered}. A direct discount is recommended first because it is the change Ask SpinBite can apply automatically today — the alternatives above would need to be set up manually.`;
    },

    // Named after the real read-only tools that already exist
    // (tools/analytics.ts) — never invents a metric with no query backing
    // it. "Promotion redemption" is deliberately not listed here: a
    // menu_items special has no separate redemption event, unlike a coupon.
    composeSuccessMetrics: (facts) => {
      const itemWord = facts.itemNames.length === 1 ? facts.itemNames[0] : 'these items';
      const metrics = [`Orders containing ${itemWord}`];
      if (facts.categoryName) metrics.push(`${facts.categoryName} category revenue`);
      metrics.push('Average order value');
      return metrics;
    },
  };
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

export type ApplyOutcome = { id: string; name: string; success: boolean; error?: string; description?: string };
export type ApplyDiscountResult = {
  applied: number;
  total: number;
  failed?: ApplyOutcome[];
  skippedNoOp?: string[];
  appliedItems?: Array<{ name: string; description: string }>;
};

// Human-readable summary of what actually changed for one resolved item,
// post-write — the chat-visible confirmation's building block (see
// lib/dashboard-assistant/outcome.ts's describeOutcome). Deliberately
// separate from describeDiscount/explainProposal above, which describe the
// proposed action pre-approval, not the concrete resolved before/after.
export function describeAppliedItem(item: ResolvedDiscountItem): string {
  if (!item.after.specialEnabled) {
    return item.price !== null ? `${item.name}: discount removed, back to $${item.price.toFixed(2)}` : `${item.name}: discount removed`;
  }
  const discountedPrice =
    item.after.specialType === 'fixed_price' && item.after.specialPrice !== null
      ? item.after.specialPrice
      : item.after.specialType === 'percentage' && item.price !== null && item.after.specialPercent !== null
        ? item.price * (1 - item.after.specialPercent / 100)
        : null;
  if (discountedPrice === null) return `${item.name}: discount applied`;
  const fromLabel = item.price !== null ? `$${item.price.toFixed(2)}` : 'its price';
  return `${item.name}: ${fromLabel} → $${discountedPrice.toFixed(2)}`;
}

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
  const succeeded = outcomes.filter((o) => o.success);
  const failed = outcomes.filter((o) => !o.success);
  return {
    applied: succeeded.length,
    total: items.length,
    failed: failed.length > 0 ? failed : undefined,
    skippedNoOp: skippedNoOp.length > 0 ? skippedNoOp : undefined,
    appliedItems: succeeded.length > 0 ? succeeded.map((o) => ({ name: o.name, description: o.description! })) : undefined,
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

  return { id: item.id, name: item.name, success: true, description: describeAppliedItem(item) };
}
