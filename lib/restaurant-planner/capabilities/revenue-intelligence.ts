// The revenue_intelligence capability — Revenue Intelligence Agent V1.
// Mirrors menu-pricing.ts's role exactly: this is the one file that owns
// everything the capability contributes beyond the shared planner/tool-
// library plumbing. Two entry points:
//
//   - generateRevenueOpportunities: given a goal, gathers real evidence via
//     the Restaurant Tool Library (never a direct query here), runs the
//     matching pure per-goal function in ../revenue-intelligence/opportunities/,
//     and resolves its real revenue-impact estimate/affected items via the
//     EXISTING buildProposal() — no new impact math. Returns either a
//     ranked opportunity list or (for a goal with no honest executable
//     lever, or too little evidence) a plain data-driven answer.
//
//   - createProposalFromOpportunity: turns one chosen opportunity into a
//     REAL restaurant_planner_proposals row via the EXISTING buildProposal()
//     + insertProposalVersion() — the exact same pipeline
//     menu_discount_action already uses. Not a thin pass-through: it
//     overrides confidence/reasoning before persisting (see the comment on
//     createProposalFromOpportunity for why this override is load-bearing,
//     not decorative).

import { randomUUID } from 'crypto';
import type { ToolContext } from '../tools/types';
import type { RevenueGoalKey, RevenueOpportunity, PlannerCandidate } from '../types';
import { searchMenuCategories } from '../tools/menu';
import { getCategorySalesBreakdown, getPromotionCoverage, getOrdersByDaypart, getFrequentlyCoOrderedItems, getQrAdoptionStats, getCouponEngagementStats } from '../tools/analytics';
import { evaluateThinDataGate, minConfidence, type RevenueOpportunityCandidate } from '../revenue-intelligence/facts';
import { findGoalCategory, buildCategorySalesOpportunity, buildPromotionEngagementOpportunity, type CategoryGoalKey } from '../revenue-intelligence/opportunities/category-coverage-goals';
import { buildTrafficOpportunity, type TrafficGoalKey } from '../revenue-intelligence/opportunities/traffic-goals';
import { buildAovOpportunity } from '../revenue-intelligence/opportunities/aov-goal';
import { buildProposal } from './menu-pricing';
import { insertProposalVersion, type ProposalRow } from '../proposals';
import { describeProposedAction } from '@/lib/dashboard-assistant/describe-action';
import type { Json } from '@/lib/supabase/database.types';
import type { Confidence } from '../proposal';

export type RevenueIntelligenceResult = { kind: 'opportunities'; opportunities: RevenueOpportunity[] } | { kind: 'answer'; text: string };

export async function generateRevenueOpportunities(ctx: ToolContext, goal: RevenueGoalKey): Promise<RevenueIntelligenceResult> {
  const gate = await evaluateThinDataGate(ctx);
  if (gate.kind === 'insufficient_data') {
    return {
      kind: 'answer',
      text: `SpinBite needs more order history before recommending revenue moves for this restaurant — only ${gate.completedOrders30d} completed order${gate.completedOrders30d === 1 ? '' : 's'} in the last 30 days. Check back once more orders have come through.`,
    };
  }

  const candidate = await buildCandidateForGoal(ctx, goal, gate.confidenceCap);
  if (!candidate) {
    return { kind: 'answer', text: await answerOnlyText(ctx, goal) };
  }

  const opportunity = await resolveCandidateImpact(ctx, candidate);
  if (!opportunity) {
    // The candidate's action didn't actually resolve against live menu data
    // (e.g. the category was renamed/removed between fact-gathering and
    // resolution) — degrade to the same honest answer a goal with no
    // candidate at all would get, rather than show a broken opportunity.
    return { kind: 'answer', text: await answerOnlyText(ctx, goal) };
  }

  return { kind: 'opportunities', opportunities: [opportunity] };
}

async function buildCandidateForGoal(ctx: ToolContext, goal: RevenueGoalKey, confidenceCap: Confidence | null): Promise<RevenueOpportunityCandidate | null> {
  switch (goal) {
    case 'increase_dessert_sales':
    case 'increase_beverage_sales': {
      const categoriesResult = await searchMenuCategories.execute({}, ctx);
      const categories = categoriesResult.ok ? categoriesResult.data : [];
      const category = findGoalCategory(goal as CategoryGoalKey, categories);
      if (!category) return null;

      const [salesResult, coverageResult] = await Promise.all([
        getCategorySalesBreakdown.execute({}, ctx),
        getPromotionCoverage.execute({ categoryId: category.id }, ctx),
      ]);
      if (!coverageResult.ok) return null;
      const categorySales = salesResult.ok ? salesResult.data : [];

      return buildCategorySalesOpportunity({ goal: goal as CategoryGoalKey, category, categorySales, coverage: coverageResult.data, confidenceCap });
    }

    case 'increase_lunch_traffic':
    case 'increase_dinner_traffic': {
      const daypart = goal === 'increase_lunch_traffic' ? 'lunch' : 'dinner';
      const statsResult = await getOrdersByDaypart.execute({ daypart }, ctx);
      if (!statsResult.ok) return null;
      return buildTrafficOpportunity({ goal: goal as TrafficGoalKey, stats: statsResult.data, confidenceCap });
    }

    case 'increase_average_order_value': {
      const pairsResult = await getFrequentlyCoOrderedItems.execute({}, ctx);
      if (!pairsResult.ok) return null;
      return buildAovOpportunity({ pairs: pairsResult.data, confidenceCap });
    }

    case 'increase_promotion_engagement': {
      const [salesResult, coverageResult] = await Promise.all([
        getCategorySalesBreakdown.execute({}, ctx),
        getPromotionCoverage.execute({}, ctx),
      ]);
      if (!coverageResult.ok) return null;
      const categorySales = salesResult.ok ? salesResult.data : [];
      return buildPromotionEngagementOpportunity({ categorySales, restaurantWideCoverage: coverageResult.data, confidenceCap });
    }

    // No honest MenuDiscountAction lever exists for either — see the
    // architecture doc's "central design tension" table. Always answer-only.
    case 'increase_qr_adoption':
    case 'increase_coupon_redemption':
      return null;
  }
}

// Fills in the two fields a pure opportunity function cannot honestly
// compute itself (expectedImpact, affectedItems) by resolving the candidate
// action against real, live menu data via the EXISTING buildProposal() — no
// new impact math is written for this capability. Returns null if the
// candidate's action doesn't actually resolve (rare: something changed
// between fact-gathering and this call).
async function resolveCandidateImpact(ctx: ToolContext, candidate: RevenueOpportunityCandidate): Promise<RevenueOpportunity | null> {
  const built = await buildProposal(ctx.supabase, ctx.restaurantId, candidate.action);
  if (built.kind !== 'resolved') return null;

  const { rankSignal: _rankSignal, ...rest } = candidate;
  return {
    ...rest,
    id: randomUUID(),
    expectedImpact: built.impact.revenueImpact,
    affectedItems: built.resolveResult.items.map((i) => i.name),
  };
}

async function answerOnlyText(ctx: ToolContext, goal: RevenueGoalKey): Promise<string> {
  switch (goal) {
    case 'increase_qr_adoption': {
      const result = await getQrAdoptionStats.execute({}, ctx);
      if (!result.ok || result.data.totalOrders === 0) return "SpinBite doesn't have enough recent order data to report QR ordering adoption yet.";
      const { qrAdoptionRate, totalOrders } = result.data;
      return `${Math.round(qrAdoptionRate * 100)}% of your last ${totalOrders} completed orders came from QR ordering. SpinBite doesn't have a lever that specifically shifts orders toward QR today — a menu discount doesn't change which channel a guest orders through.`;
    }
    case 'increase_coupon_redemption': {
      const result = await getCouponEngagementStats.execute({}, ctx);
      if (!result.ok || result.data.issued === 0) return "SpinBite doesn't have enough recent coupon activity to report a redemption rate yet.";
      const { issued, redeemed, redemptionRate } = result.data;
      return `${redeemed} of ${issued} coupons issued in the last 30 days were redeemed (${Math.round(redemptionRate * 100)}%). The real levers here — coupon expiry window, reminder messaging — aren't menu-pricing actions SpinBite can propose yet.`;
    }
    case 'increase_promotion_engagement': {
      const result = await getPromotionCoverage.execute({}, ctx);
      if (result.ok && result.data.itemCoverage === 'active') {
        return 'You already have an active menu-pricing promotion running — no coverage gap to fill right now.';
      }
      return "SpinBite doesn't have enough menu or order data to recommend a starting promotion yet.";
    }
    case 'increase_average_order_value':
      return "I didn't find a strong item-pairing pattern in your recent orders yet — check back once you have more order history.";
    case 'increase_dessert_sales':
    case 'increase_beverage_sales':
      return "I couldn't find a matching category on your menu for that — check your category names, or ask about a specific category directly.";
    case 'increase_lunch_traffic':
    case 'increase_dinner_traffic':
      return "That daypart's order share isn't declining right now, or there isn't enough recent order data to say — no proposal to recommend.";
  }
}

export type CreateProposalResult = { kind: 'resolved'; proposal: ProposalRow; content: string } | { kind: 'unresolved'; reason: string; candidates?: PlannerCandidate[] };

// Not a thin pass-through. buildProposal()'s own `confidence` is purely
// about NAME-RESOLUTION MATCH QUALITY (did we correctly identify what
// "Beverages" refers to) — an opportunity's action always targets a real
// category/item name sourced straight from the menu, so it always resolves
// at the top of CONFIDENCE_BY_MATCH_KIND ('high'). Passing that through
// unchanged would silently overwrite every carefully-computed BUSINESS
// confidence (thin order history, stale coverage, weak pairing evidence)
// with 'high' on the proposal the owner actually reads. `reasoning` is
// likewise never buildProposal's own mechanical match-explanation text —
// that would duplicate what ProposalCard's Promotion/Schedule/Visibility
// fields already show. Only these two fields are overridden; resolved_snapshot/
// plan_tasks/impact all pass through from buildProposal untouched.
export async function createProposalFromOpportunity(
  ctx: ToolContext,
  params: { conversationId: string; createdBy: string; opportunity: RevenueOpportunity },
): Promise<CreateProposalResult> {
  const built = await buildProposal(ctx.supabase, ctx.restaurantId, params.opportunity.action);

  if (built.kind === 'unresolved') {
    return { kind: 'unresolved', reason: built.reason, candidates: built.candidates };
  }

  const confidence = minConfidence(params.opportunity.confidence, built.confidence);

  const proposal = await insertProposalVersion(ctx.supabase, {
    restaurantId: ctx.restaurantId,
    conversationId: params.conversationId,
    capability: 'menu_pricing',
    action: params.opportunity.action as unknown as Json,
    resolvedSnapshot: built.resolveResult.items as unknown as Json,
    confidence,
    reasoning: params.opportunity.reasoning,
    planTasks: built.planTasks as unknown as Json,
    status: 'draft',
    createdBy: params.createdBy,
  });

  return { kind: 'resolved', proposal, content: describeProposedAction(params.opportunity.action) };
}
