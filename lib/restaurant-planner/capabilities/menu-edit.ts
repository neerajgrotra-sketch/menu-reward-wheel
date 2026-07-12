// The menu_edit capability (registry key menu_agent) — the sibling of
// capabilities/menu-pricing.ts for persistent catalog changes. Same shape:
// buildProposal (resolve + confidence + explainability + plan tasks),
// revalidateProposal (diff before write), applyMenuEditProposal (the only
// function that writes menu_items). Deliberately does not import from
// menu-discount-actions/resolve.ts's ResolvedDiscountItem/MatchKind or from
// menu-pricing.ts's business logic — per the approved implementation plan's
// "touch zero menu_pricing business-logic files" constraint. Decision
// Intelligence is reused via the capability-aware composition layer
// (../decision-intelligence.ts) instead: the domain-agnostic pieces live
// there, and this file exports makeMenuEditDecisionCopyAdapter — the
// catalog-appropriate implementation of the same DecisionCopyAdapter
// contract menu-pricing.ts implements for discounts. Neither capability
// file imports the other.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { fetchAssignedMenus, fetchMenuContents } from '@/lib/menu/queries';
import { resolveMenuEditAction, type ResolvedMenuEditItem, type MenuEditResolveResult, type MatchKind, type EditPatch } from '@/lib/menu-edit-actions/resolve';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import type { PlannerCandidate } from '../types';
import type { Confidence, PlanTask } from '../proposal';
import { MIN_ORDERS_FOR_ANY_OPPORTUNITY } from '../revenue-intelligence/facts';
import type { DecisionCopyAdapter, Alternative, ImpactEstimate } from '../decision-intelligence';

// --- confidence -----------------------------------------------------------

// menu_edit has no schedule concept, so unlike menu_pricing's
// computeConfidence this needs no scheduleParseFailed downgrade — the match
// tier alone determines confidence.
const CONFIDENCE_BY_MATCH_KIND: Record<MatchKind, Confidence> = {
  all: 'high',
  category_exact: 'high',
  item_exact: 'high',
  items_explicit: 'high',
  category_substring: 'low',
  item_substring: 'medium',
  name_contains: 'medium',
};

export function computeConfidence(matchKind: MatchKind): Confidence {
  return CONFIDENCE_BY_MATCH_KIND[matchKind];
}

// --- plan tasks -------------------------------------------------------

const PLAN_TASK_TEMPLATE: Array<{ id: string; label: string }> = [
  { id: 'find_items', label: 'Find matching menu items' },
  { id: 'validate_change', label: 'Validate the change' },
  { id: 'create_draft', label: 'Create edit draft' },
  { id: 'generate_proposal', label: 'Generate proposal' },
  { id: 'await_approval', label: 'Await approval' },
];

export function buildPlanTasks(): PlanTask[] {
  return PLAN_TASK_TEMPLATE.map((task) => ({ ...task, status: task.id === 'await_approval' ? 'pending' : 'completed' }));
}

// --- explainability ---------------------------------------------------

function describeEdit(action: MenuEditAction): string {
  switch (action.type) {
    case 'set_price':
      return `setting the price to $${action.price.toFixed(2)}`;
    case 'adjust_price': {
      const { direction, amount } = action.adjustment;
      const amountLabel = amount.kind === 'percentage' ? `${amount.value}%` : `$${amount.value.toFixed(2)}`;
      return `${direction === 'increase' ? 'increasing' : 'decreasing'} the price by ${amountLabel}`;
    }
    case 'rename_item':
      return `renaming to "${action.name}"`;
    case 'update_description':
      return 'updating the description';
    case 'move_category':
      return `moving to "${action.toCategoryName}"`;
    case 'set_availability':
      return action.available ? 'making it visible on the menu' : 'hiding it from the menu';
    case 'set_tag': {
      const tagLabel = action.tag === 'chef_special' ? 'Chef Special' : action.tag === 'popular' ? 'Popular' : 'Featured';
      return action.enabled ? `marking it as ${tagLabel}` : `removing the ${tagLabel} tag`;
    }
  }
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

export function explainProposal(params: { matchKind: MatchKind; itemCount: number; action: MenuEditAction }): string {
  const itemWord = params.itemCount === 1 ? 'item' : 'items';
  return `${MATCH_EXPLANATION[params.matchKind]} ${params.itemCount} ${itemWord} affected, ${describeEdit(params.action)}.`;
}

// --- impact -----------------------------------------------------------

// A catalog edit (rename, hide, move category, price change) has no honest
// revenue estimate to offer the way a discount's demand-elasticity heuristic
// does — margin AND revenueImpact are always null here, never fabricated,
// same discipline as estimateDiscountImpact's margin field.
export function estimateMenuEditImpact(): ImpactEstimate {
  return {
    revenueImpact: null,
    margin: null,
    warnings: ['Revenue impact is not estimated for catalog changes — this affects how the item is presented, not its promotional pricing.'],
  };
}

// --- buildProposal ------------------------------------------------------

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
      resolveResult: Extract<MenuEditResolveResult, { resolved: true }>;
      confidence: Confidence;
      reasoning: string;
      planTasks: PlanTask[];
      impact: ImpactEstimate;
    };

// Bulk Edit Safety: `bulkConfirmed` is only ever passed `true` by
// target-selection/route.ts, after the owner has explicitly clicked "Apply
// to all" or selected specific items in TargetSelector — i.e., after a real
// confirmation round-trip already happened. The default (omitted/false)
// path, used by the normal chat turn in messages/route.ts, always applies
// resolveMenuEditAction's bulk-safety gate for rename_item/update_description.
export async function buildProposal(
  supabase: SupabaseClient<Database>,
  restaurantId: string,
  action: MenuEditAction,
  opts?: { bulkConfirmed?: boolean },
): Promise<ProposalBuildResult> {
  const menus = await fetchAssignedMenus(supabase, restaurantId);
  const { categories, items } = await fetchMenuContents(supabase, menus.map((m) => m.id));

  const result = resolveMenuEditAction(action, categories, items, opts);

  if (!result.resolved) {
    return {
      kind: 'unresolved',
      reason: result.reason,
      candidates: result.candidates ? candidatesWithCategory(result.candidates, items, categories) : undefined,
    };
  }

  const confidence = computeConfidence(result.matchKind);
  const impact = estimateMenuEditImpact();
  const planTasks = buildPlanTasks();
  const reasoning = explainProposal({ matchKind: result.matchKind, itemCount: result.items.length, action });

  return { kind: 'resolved', resolveResult: result, confidence, reasoning, planTasks, impact };
}

// --- revalidation before execution ---------------------------------

export type RevalidationResult = { ok: true } | { ok: false; reason: string };

function patchesEqual(a: EditPatch, b: EditPatch): boolean {
  const keys = Object.keys(a) as Array<keyof EditPatch>;
  return keys.every((key) => JSON.stringify(a[key]) === JSON.stringify(b[key]));
}

// Diffs a proposal's persisted resolved_snapshot against freshly re-resolved
// live data — same "never trust a client diff, always re-check right before
// writing" property as menu_pricing's revalidateProposal. A missing item
// means it was deleted/archived since the proposal was shown; a before-state
// mismatch means someone else changed it in the meantime.
export function revalidateProposal(snapshot: ResolvedMenuEditItem[] | null, liveItems: ResolvedMenuEditItem[]): RevalidationResult {
  if (!snapshot) return { ok: true };
  const liveById = new Map(liveItems.map((i) => [i.id, i]));
  for (const snap of snapshot) {
    const live = liveById.get(snap.id);
    if (!live) {
      return { ok: false, reason: `"${snap.name}" is no longer available on the menu — generate a new proposal.` };
    }
    if (!patchesEqual(snap.before, live.before)) {
      return { ok: false, reason: `"${snap.name}" changed since this proposal was shown — generate a new proposal.` };
    }
  }
  return { ok: true };
}

// --- apply (write) -------------------------------------------------------

export type ApplyOutcome = { id: string; name: string; success: boolean; error?: string };
export type ApplyMenuEditResult = { applied: number; total: number; failed?: ApplyOutcome[]; skippedNoOp?: string[] };

function isNoOp(item: ResolvedMenuEditItem): boolean {
  return patchesEqual(item.before, item.after);
}

export async function applyMenuEditProposal(
  authClient: SupabaseClient<Database>,
  restaurantId: string,
  actorUserId: string,
  items: ResolvedMenuEditItem[],
): Promise<ApplyMenuEditResult> {
  // Objective 3 parity with menu_pricing — an item whose live state already
  // exactly matches the proposed after-state is skipped (no write, no audit
  // row) rather than silently re-applying an identical change.
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

async function applyOne(
  authClient: SupabaseClient<Database>,
  restaurantId: string,
  actorUserId: string,
  item: ResolvedMenuEditItem,
): Promise<ApplyOutcome> {
  const updateResult = await authClient
    .from('menu_items')
    .update(item.after as never)
    .eq('id', item.id)
    .eq('restaurant_id', restaurantId);

  if (updateResult.error) {
    return { id: item.id, name: item.name, success: false, error: updateResult.error.message };
  }

  // A logging failure must not be reported as an apply failure — the write
  // already succeeded. Best-effort, matching applyDiscountProposal's own
  // "log failure never masks a real result" convention.
  const logResult = await authClient.from('menu_edit_change_log').insert({
    restaurant_id: restaurantId,
    actor_user_id: actorUserId,
    menu_item_id: item.id,
    old_value: item.before,
    new_value: item.after,
    source: 'ai_action',
  });

  if (logResult.error) {
    console.error('[menu-edit/applyMenuEditProposal] Failed to write change log:', logResult.error.message);
  }

  return { id: item.id, name: item.name, success: true };
}

// --- Decision Intelligence — menu_edit's DecisionCopyAdapter -------------
// The domain-specific half of the Decision Card (see
// ../decision-intelligence.ts for the shared half and the contract this
// implements). Every string here was written for a catalog/structural
// change — never pricing/discount language borrowed from menu_pricing's
// adapter, which is exactly what the pre-merge audit's Important finding
// #1 flagged as missing. Takes the actual action being proposed via
// closure, so composeSuccessMetrics/composeAlternatives can give an honest,
// action-type-specific answer instead of a one-size-fits-all sales metric.

const PRICE_ACTION_TYPES = new Set<MenuEditAction['type']>(['set_price', 'adjust_price']);

function tagLabel(tag: 'featured' | 'chef_special' | 'popular'): string {
  return tag === 'chef_special' ? 'Chef Special' : tag === 'popular' ? 'Popular' : 'Featured';
}

export function makeMenuEditDecisionCopyAdapter(action: MenuEditAction): DecisionCopyAdapter {
  const isPriceAction = PRICE_ACTION_TYPES.has(action.type);

  return {
    composeExecutiveSummary: (facts) => {
      if (facts.confidence === 'low') {
        return 'Experimental recommendation — confidence is low, so treat this as a test rather than a sure win.';
      }
      if (facts.considerationCount > 0) {
        const pointWord = facts.considerationCount === 1 ? 'one point' : `${facts.considerationCount} points`;
        return `Reasonable recommendation, with ${pointWord} worth reviewing before approving.`;
      }
      if (isPriceAction && facts.impact.revenueImpact) {
        return `Low-risk recommendation, expected to lift revenue ${facts.impact.revenueImpact}.`;
      }
      return 'Low-risk recommendation — this updates how the item is presented on the menu, not a pricing or revenue decision.';
    },

    // Campaign/item coverage is still legitimately useful context for ANY
    // edit (e.g. "heads up, this item is currently on promotion" matters
    // whether you're about to hide it or reprice it) — kept, reworded away
    // from "discounted." hasRecentActivity here means recent menu_edit
    // activity on this item (queried from menu_edit_change_log by the
    // route), not recent discount activity.
    composeWhyNow: (facts) => {
      const signals: string[] = [];
      if (facts.campaignCoverage === 'active') signals.push('An active promotion currently covers this category — this change may affect it.');
      if (facts.itemCoverage === 'active') signals.push('This item currently has an active discount.');
      if (facts.hasRecentActivity) signals.push('This item was edited recently — double-check this change is still intended.');
      if (signals.length === 0) signals.push('No special timing factors were detected for this recommendation.');
      return signals;
    },

    // Omits the pricing-specific "Complete pricing information" and the
    // schedule line entirely for non-price actions — menu_edit's resolver
    // already guarantees any surviving item's price is known when a price
    // action is involved (resolveMenuEditAction filters out unpriceable
    // items before this stage), and there is no schedule concept at all.
    composeConfidenceEvidence: (facts) => {
      const strongMatch =
        facts.matchKind === 'all' || facts.matchKind === 'category_exact' || facts.matchKind === 'item_exact' || facts.matchKind === 'items_explicit';
      const orderEvidenceAdequate = facts.orderCount >= MIN_ORDERS_FOR_ANY_OPPORTUNITY;
      const evidence = [
        { met: strongMatch, label: strongMatch ? 'Strong item match' : 'Approximate item match — double-check this is the right item' },
      ];
      if (isPriceAction) {
        evidence.push({ met: true, label: 'Price data is fully known for every affected item' });
      }
      evidence.push({
        met: orderEvidenceAdequate,
        label: orderEvidenceAdequate
          ? `${facts.orderCount} completed orders in the last 30 days`
          : `Only ${facts.orderCount} completed order${facts.orderCount === 1 ? '' : 's'} in the last 30 days`,
      });
      return evidence;
    },

    composeConsiderations: (facts) => {
      const considerations = [...facts.warnings];
      if (facts.campaignOverlap) {
        considerations.push('An active promotion already covers this category — confirm this change should still go ahead.');
      }
      if (isPriceAction && facts.orderCount < MIN_ORDERS_FOR_ANY_OPPORTUNITY) {
        considerations.push(`Limited historical sales data — only ${facts.orderCount} completed order${facts.orderCount === 1 ? '' : 's'} in the last 30 days.`);
      }
      return considerations;
    },

    // "Bundle X with Y instead" only makes sense as an alternative to a
    // PRICE change — suggesting a bundle as an "alternative" to a rename or
    // a category move doesn't. Structural actions get no alternatives
    // rather than a forced, nonsensical one; the "Alternative Approaches"
    // section simply doesn't render (ProposalCard only shows it when
    // alternatives.length > 0).
    composeAlternatives: (facts) => {
      if (!isPriceAction) return [];
      const primary = facts.itemNames.length === 1 ? facts.itemNames[0] : 'these items';
      const alternatives: Alternative[] = facts.coOrderedNames
        .slice(0, 2)
        .map((name) => ({ text: `Bundle ${primary} with ${name} — frequently ordered together`, evidenceBacked: true }));
      if (alternatives.length === 0) {
        alternatives.push({ text: `Feature ${primary} on the menu instead of changing the price`, evidenceBacked: false });
      }
      return alternatives;
    },

    // Unlike menu_pricing, never claims "this is the most direct way to
    // reach the objective" — menu_edit has no revenue objective to be
    // "the most direct way" toward for 5 of its 7 action types, and
    // fabricating that framing for a rename/hide would be dishonest.
    // Alternatives (when present, price actions only) are already
    // self-explanatory bullets.
    composeWhyThisRecommendation: () => null,

    // Action-type-specific, never a one-size-fits-all sales metric — the
    // audit's exact finding: "monitor Average Order Value" makes no sense
    // for a rename.
    composeSuccessMetrics: (facts) => {
      const itemWord = facts.itemNames.length === 1 ? facts.itemNames[0] : 'these items';
      switch (action.type) {
        case 'set_price':
        case 'adjust_price': {
          const metrics = [`Orders containing ${itemWord}`];
          if (facts.categoryName) metrics.push(`${facts.categoryName} category revenue`);
          metrics.push('Average order value');
          return metrics;
        }
        case 'rename_item':
          return [`Confirm the new name displays correctly on the public menu for ${itemWord}`];
        case 'update_description':
          return [`Confirm the new description displays correctly on the public menu for ${itemWord}`];
        case 'move_category':
          return [`Confirm ${itemWord} appears under its new category on the public menu`];
        case 'set_availability':
          return [action.available ? `Confirm ${itemWord} is visible on the public menu` : `Confirm ${itemWord} no longer appears on the public menu`];
        case 'set_tag':
          return [`Confirm the "${tagLabel(action.tag)}" badge displays correctly for ${itemWord}`];
      }
    },
  };
}
