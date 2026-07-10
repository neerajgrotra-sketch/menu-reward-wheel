// Pure opportunity logic for increase_average_order_value. No I/O — see
// category-coverage-goals.ts's header for the convention this follows.
//
// Honesty rule (see the architecture doc): the resulting action is a
// paired-item percentage discount ({scope:'items', names:[A,B]}), described
// as exactly that — never as "creating a bundle." No single-combined-price
// bundle action exists yet (that's pricing_agent's create_bundle,
// unregistered/inactive). Evidence is a real order_items co-occurrence
// count (lib/restaurant-planner/tools/analytics.ts's
// getFrequentlyCoOrderedItems) — never an unmotivated heuristic like "the
// two priciest items."

import type { CoOrderedPair } from '../../tools/analytics';
import { applyConfidenceCap, type RevenueOpportunityCandidate } from '../facts';
import type { Confidence } from '../../proposal';

const STARTER_DISCOUNT_PERCENT = 10;
// Below this co-occurrence count, the pairing signal is real but thin —
// still shown, with an explicit weak-evidence caveat, rather than suppressed
// outright, since even a handful of shared orders is more evidence than a
// guess. Below buildAovOpportunity's own zero-pairs floor, there's nothing
// to show at all (the orchestrator degrades the whole goal to an answer).
const HIGH_CONFIDENCE_MIN_COUNT = 5;

export function buildAovOpportunity(params: { pairs: CoOrderedPair[]; confidenceCap: Confidence | null }): RevenueOpportunityCandidate | null {
  const top = params.pairs[0];
  if (!top) return null;

  const baseConfidence: Confidence = top.coOccurrenceCount >= HIGH_CONFIDENCE_MIN_COUNT ? 'high' : 'low';
  const confidence = applyConfidenceCap(baseConfidence, params.confidenceCap);
  const weakEvidenceNote =
    top.coOccurrenceCount < HIGH_CONFIDENCE_MIN_COUNT
      ? ' This pattern is based on a small number of shared orders — treat it as a starting hypothesis, not a strong signal.'
      : '';

  return {
    goal: 'increase_average_order_value',
    title: `Discount ${top.itemAName} and ${top.itemBName} together`,
    action: {
      type: 'set_discount',
      target: { scope: 'items', names: [top.itemAName, top.itemBName] },
      discount: { discountType: 'percentage', value: STARTER_DISCOUNT_PERCENT },
    },
    requiredCapability: 'menu_pricing',
    confidence,
    observation: `${top.itemAName} and ${top.itemBName} appeared in the same order ${top.coOccurrenceCount} time${top.coOccurrenceCount === 1 ? '' : 's'} over the last 30 days — more than any other item pair.`,
    reasoning: `Discounting items guests already tend to order together encourages larger orders. This is a paired-item discount, not a single bundled price — SpinBite doesn't yet support creating one combined price for two items.${weakEvidenceNote}`,
    assumptions: [
      'Based on completed orders from the last 30 days.',
      'Co-purchase count reflects orders containing both items — not necessarily guests treating them as a deliberate combo.',
    ],
    toolsUsed: ['getFrequentlyCoOrderedItems'],
    rankSignal: top.coOccurrenceCount,
  };
}
