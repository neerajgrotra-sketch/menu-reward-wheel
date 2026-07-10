// Revenue Intelligence Agent V1 — fact gathering + the global thin-data
// gate. Every per-goal opportunity function (../capabilities/revenue-
// intelligence.ts and ./opportunities/*.ts) is handed already-fetched facts
// rather than querying Supabase itself, so the actual opportunity logic
// stays pure and independently unit-testable (this repo's established
// convention — see resolve.ts/schedule.ts/menu-pricing.ts).
//
// Mirrors an existing precedent exactly: computeConfidence() in
// capabilities/menu-pricing.ts lets a schedule-parse failure override an
// otherwise-high match confidence. evaluateThinDataGate below is the same
// shape — a global signal (order volume) that can only ever pull confidence
// DOWN from whatever a per-goal rule concludes, never up, and can suppress
// opportunity generation entirely when there isn't enough evidence to say
// anything responsible.

import type { ToolContext } from '../tools/types';
import { getAverageOrderValue } from '../tools/analytics';
import type { Confidence } from '../proposal';
import type { RevenueGoalKey } from '../types';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';

// Pre-previewPromotion/buildProposal shape a pure per-goal opportunity
// function returns — missing exactly the two fields
// (expectedImpact/affectedItems) that only buildProposal's real menu
// resolution can honestly fill in (see
// ../capabilities/revenue-intelligence.ts's resolveCandidateImpact). Never
// exposed outside this module — the orchestrator turns this into a real,
// persisted-message-ready RevenueOpportunity (lib/restaurant-planner/types.ts).
export type RevenueOpportunityCandidate = {
  goal: RevenueGoalKey;
  title: string;
  action: MenuDiscountAction;
  requiredCapability: 'menu_pricing';
  confidence: Confidence;
  observation: string;
  reasoning: string;
  assumptions: string[];
  toolsUsed: string[];
  // Goal-internal sort key (revenue-share urgency, decline magnitude, pair
  // frequency — not comparable across goals) — unused while V1 only ever
  // returns one candidate per goal, kept so a future multi-candidate goal
  // needs no shape change here.
  rankSignal: number;
};

// Fixed, documented constants (not silently baked in — surfaced via the
// gate result to whatever calls it).
export const MIN_ORDERS_FOR_ANY_OPPORTUNITY = 5;
export const MIN_ORDERS_FOR_FULL_CONFIDENCE = 20;

export type ThinDataGateResult =
  | { kind: 'insufficient_data'; completedOrders30d: number }
  | { kind: 'ok'; completedOrders30d: number; confidenceCap: Confidence | null };

export async function evaluateThinDataGate(ctx: ToolContext): Promise<ThinDataGateResult> {
  // getAverageOrderValue already computes a trailing-30-day completed-order
  // count as part of its own aggregation — reused here rather than issuing a
  // second, near-identical query just to count rows.
  const result = await getAverageOrderValue.execute({ windowDays: 30 }, ctx);
  const completedOrders30d = result.ok ? result.data.orderCount : 0;

  if (completedOrders30d < MIN_ORDERS_FOR_ANY_OPPORTUNITY) {
    return { kind: 'insufficient_data', completedOrders30d };
  }
  if (completedOrders30d < MIN_ORDERS_FOR_FULL_CONFIDENCE) {
    return { kind: 'ok', completedOrders30d, confidenceCap: 'low' };
  }
  return { kind: 'ok', completedOrders30d, confidenceCap: null };
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

// Never lets a confidence value exceed the lower of the two inputs — used
// both to apply the thin-data cap here and, in
// ../capabilities/revenue-intelligence.ts, to reconcile an opportunity's
// business-evidence confidence with buildProposal()'s own match-quality
// confidence before a proposal is persisted.
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONFIDENCE_RANK[a] <= CONFIDENCE_RANK[b] ? a : b;
}

export function applyConfidenceCap(confidence: Confidence, cap: Confidence | null): Confidence {
  return cap ? minConfidence(confidence, cap) : confidence;
}
