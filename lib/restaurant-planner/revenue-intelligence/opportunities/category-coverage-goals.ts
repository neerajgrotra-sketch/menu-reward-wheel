// Pure opportunity logic for the three goals whose evidence is "does a
// category/the whole menu currently have promotional coverage" —
// increase_dessert_sales, increase_beverage_sales, and
// increase_promotion_engagement. No I/O here — every input is already
// fetched by the orchestrator (../../capabilities/revenue-intelligence.ts),
// matching this repo's established convention (resolve.ts/schedule.ts/
// menu-pricing.ts keep DB-fetching thin and push all real logic into plain,
// independently-testable functions over already-fetched data).

import type { CategorySales, PromotionCoverage } from '../../tools/analytics';
import { applyConfidenceCap, type RevenueOpportunityCandidate } from '../facts';
import type { Confidence } from '../../proposal';

export type CategoryGoalKey = 'increase_dessert_sales' | 'increase_beverage_sales';

const GOAL_KEYWORDS: Record<CategoryGoalKey, string[]> = {
  increase_dessert_sales: ['dessert', 'sweet'],
  increase_beverage_sales: ['beverage', 'drink'],
};

const GOAL_LABEL: Record<CategoryGoalKey, string> = {
  increase_dessert_sales: 'dessert',
  increase_beverage_sales: 'beverage',
};

// A conservative, fixed starting depth — deliberately not derived from the
// model or from category revenue share (which measures opportunity size,
// not the discount that should serve it). Adjustable per-proposal via the
// existing Modify flow.
const STARTER_DISCOUNT_PERCENT = 15;

export function findGoalCategory(
  goal: CategoryGoalKey,
  categories: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const keywords = GOAL_KEYWORDS[goal];
  return categories.find((c) => keywords.some((kw) => c.name.toLowerCase().includes(kw))) ?? null;
}

export function buildCategorySalesOpportunity(params: {
  goal: CategoryGoalKey;
  category: { id: string; name: string };
  categorySales: CategorySales[];
  coverage: PromotionCoverage;
  confidenceCap: Confidence | null;
}): RevenueOpportunityCandidate | null {
  // Already covered by an active item-level special — nothing to recommend.
  if (params.coverage.itemCoverage === 'active') return null;

  const totalRevenue = params.categorySales.reduce((sum, c) => sum + c.revenue, 0);
  const thisCategory = params.categorySales.find((c) => c.categoryId === params.category.id);
  const revenue = thisCategory?.revenue ?? 0;
  const share = totalRevenue > 0 ? revenue / totalRevenue : 0;

  const baseConfidence: Confidence = params.coverage.itemCoverage === 'stale' ? 'medium' : 'high';
  const confidence = applyConfidenceCap(baseConfidence, params.confidenceCap);
  const rankSignal = share < 0.05 ? 3 : share < 0.15 ? 2 : 1;
  const goalLabel = GOAL_LABEL[params.goal];

  const coverageLine =
    params.coverage.itemCoverage === 'none'
      ? `No active discount or promotion exists on ${params.category.name} today.`
      : `${params.category.name} had a promotion, but it has expired.`;
  const shareLine =
    totalRevenue > 0 ? ` ${params.category.name} made up ${Math.round(share * 100)}% of order-item revenue over the last 30 days.` : '';

  return {
    goal: params.goal,
    title: `Discount ${params.category.name} to increase ${goalLabel} sales`,
    action: {
      type: 'set_discount',
      target: { scope: 'category', name: params.category.name },
      discount: { discountType: 'percentage', value: STARTER_DISCOUNT_PERCENT },
    },
    requiredCapability: 'menu_pricing',
    confidence,
    observation: `${coverageLine}${shareLine}`,
    reasoning: `A ${STARTER_DISCOUNT_PERCENT}% discount on ${params.category.name} is a direct, low-risk way to increase ${goalLabel} sales — ${params.coverage.itemCoverage === 'none' ? 'this category currently has no promotional pull at all' : "its last promotion has lapsed"}. It will appear on the QR menu and promotion banner, the same as any active promotion.`,
    assumptions: [
      'Based on completed orders from the last 30 days.',
      `Starting discount depth (${STARTER_DISCOUNT_PERCENT}%) is a conservative default — adjust it with Modify before approving.`,
    ],
    toolsUsed: ['searchMenuCategories', 'getCategorySalesBreakdown', 'getPromotionCoverage'],
    rankSignal,
  };
}

export function buildPromotionEngagementOpportunity(params: {
  categorySales: CategorySales[];
  restaurantWideCoverage: PromotionCoverage;
  confidenceCap: Confidence | null;
}): RevenueOpportunityCandidate | null {
  // Any existing item-level coverage anywhere means this goal is answered
  // deterministically (no gap to fill), not proposed — see the orchestrator's
  // answer-only fallback.
  if (params.restaurantWideCoverage.itemCoverage !== 'none') return null;

  const top = [...params.categorySales].sort((a, b) => b.revenue - a.revenue)[0];
  if (!top) return null;

  const confidence = applyConfidenceCap('medium', params.confidenceCap);
  const percentOff = 10;

  return {
    goal: 'increase_promotion_engagement',
    title: `Start a promotion on ${top.categoryName}`,
    action: {
      type: 'set_discount',
      target: { scope: 'category', name: top.categoryName },
      discount: { discountType: 'percentage', value: percentOff },
    },
    requiredCapability: 'menu_pricing',
    confidence,
    observation: 'No menu-pricing promotion is currently active anywhere on your menu.',
    reasoning: `Starting with your top-selling category (${top.categoryName}) gives a first promotion the broadest exposure. This is a conservative starting point, not a strategic recommendation about which category matters most — review before approving, or use Modify to target a different one.`,
    assumptions: [
      'Based on completed orders from the last 30 days.',
      'Top category is chosen by revenue only — it may not be the best strategic fit for a first promotion.',
    ],
    toolsUsed: ['getCategorySalesBreakdown', 'getPromotionCoverage'],
    rankSignal: 1,
  };
}
