// Pure opportunity logic for increase_lunch_traffic / increase_dinner_traffic.
// No I/O — see category-coverage-goals.ts's header for the convention this
// follows.
//
// Honesty rule (see the architecture doc's "central design tension"): the
// resulting action NEVER carries startTime/dayOffset. The DB schema only
// supports one absolute start/end pair per discount, not a recurring daily
// window (lib/menu-discount-actions/schedule.ts) — a "lunch-only" discount
// that actually turns on and off every day does not exist. Every candidate
// this file produces discounts the category a daypart's guests order most,
// running continuously, and says so explicitly in its own reasoning.

import type { DaypartStats } from '../../tools/analytics';
import { applyConfidenceCap, type RevenueOpportunityCandidate } from '../facts';
import type { Confidence } from '../../proposal';

export type TrafficGoalKey = 'increase_lunch_traffic' | 'increase_dinner_traffic';

const DAYPART_LABEL: Record<TrafficGoalKey, string> = {
  increase_lunch_traffic: 'lunch',
  increase_dinner_traffic: 'dinner',
};

const DAYPART_WINDOW_LABEL: Record<TrafficGoalKey, string> = {
  increase_lunch_traffic: '11:00–15:00 UTC',
  increase_dinner_traffic: '17:00–22:00 UTC',
};

const STARTER_DISCOUNT_PERCENT = 15;

export function buildTrafficOpportunity(params: {
  goal: TrafficGoalKey;
  stats: DaypartStats;
  confidenceCap: Confidence | null;
}): RevenueOpportunityCandidate | null {
  // "At or above baseline" (baseline = the prior 15-day period's share) —
  // nothing declining to address.
  if (params.stats.currentPeriodShare >= params.stats.priorPeriodShare) return null;

  const topCategory = params.stats.topCategories[0];
  // No evidence of what this daypart's guests actually order — recommending
  // a category anyway would be a guess dressed as evidence.
  if (!topCategory) return null;

  const declineRatio =
    params.stats.priorPeriodShare > 0 ? (params.stats.priorPeriodShare - params.stats.currentPeriodShare) / params.stats.priorPeriodShare : 0;

  const baseConfidence: Confidence = declineRatio >= 0.1 ? 'high' : 'medium';
  const confidence = applyConfidenceCap(baseConfidence, params.confidenceCap);
  const daypart = DAYPART_LABEL[params.goal];
  const capitalizedDaypart = daypart[0].toUpperCase() + daypart.slice(1);

  return {
    goal: params.goal,
    title: `Discount ${topCategory.categoryName} to bring back ${daypart} guests`,
    action: {
      type: 'set_discount',
      target: { scope: 'category', name: topCategory.categoryName },
      discount: { discountType: 'percentage', value: STARTER_DISCOUNT_PERCENT },
    },
    requiredCapability: 'menu_pricing',
    confidence,
    observation: `${capitalizedDaypart} orders made up ${Math.round(params.stats.currentPeriodShare * 100)}% of all completed orders over the last 15 days, down from ${Math.round(params.stats.priorPeriodShare * 100)}% the 15 days before that.`,
    reasoning: `${topCategory.categoryName} is what your ${daypart} guests order most, making it the highest-leverage category to discount. This discount will run continuously once approved — SpinBite doesn't yet support a recurring ${daypart}-only schedule — but it targets what ${daypart} guests actually buy, not just any category.`,
    assumptions: [
      `${capitalizedDaypart} is defined as ${DAYPART_WINDOW_LABEL[params.goal]}, a fixed assumption (no restaurant-specific timezone is configured in SpinBite today).`,
      'Based on completed orders from the last 30 days.',
      `This discount does not turn off outside ${daypart} hours.`,
    ],
    toolsUsed: ['getOrdersByDaypart'],
    rankSignal: Math.round(declineRatio * 100),
  };
}
