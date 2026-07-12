// The capability-aware Decision Intelligence composition layer.
//
// Split out of capabilities/menu-pricing.ts while building the menu_edit
// capability's second Important pre-merge finding: 11 of 12 "Decision
// Intelligence" composers were being reused verbatim by menu_edit's preview
// route despite several of them hardcoding pricing/discount language
// ("Complete pricing information," "instead of discounting it," "Average
// order value" as a rename's success metric). Reusing menu_pricing's FILE
// for genuinely shared logic was also backwards — menu_edit had to import
// from a capability it was explicitly told not to touch.
//
// This file now owns:
//   1. The pieces that were ALREADY capability-agnostic (no hardcoded
//      domain language in their output) — computeDecisionScore,
//      composeDecisionSummary, composeTradeoffs, explainProposalBullets,
//      composeMonitoringReminder, MATCH_EXPLANATION. Moved here verbatim —
//      zero logic change, same output for the same input, only relocated.
//   2. The DecisionCopyAdapter contract every capability must implement for
//      the parts that DO need domain-specific language — composeWhyNow,
//      composeConfidenceEvidence, composeConsiderations, composeAlternatives,
//      composeWhyThisRecommendation, composeSuccessMetrics,
//      composeExecutiveSummary. capabilities/menu-pricing.ts and
//      capabilities/menu-edit.ts each export a `make*DecisionCopyAdapter()`
//      factory implementing this contract with their own wording — a third
//      capability (promotion_agent, when built) implements the same
//      contract instead of reusing whichever capability shipped first.
//   3. composeDecisionCard() — the one orchestration function both
//      preview routes call: shared facts + one capability's adapter in,
//      the full Decision Card fields out. This is the "composition layer,
//      not duplicated UI" — routes stopped hand-assembling 12 fields
//      inline and now make one call.

import type { Confidence } from './proposal';
import type { CoverageKind } from './tools/analytics';

// Structurally identical to menu-pricing's and menu-edit's own MatchKind
// types (same 7 literals) — not imported from either, so this file has no
// dependency on any capability's resolver. TypeScript accepts either
// capability's MatchKind value here since the literal sets match exactly.
export type MatchKindLike =
  | 'all'
  | 'category_exact'
  | 'category_substring'
  | 'item_exact'
  | 'item_substring'
  | 'items_explicit'
  | 'name_contains';

export const MATCH_EXPLANATION: Record<MatchKindLike, string> = {
  all: 'Every menu item was targeted explicitly.',
  category_exact: 'The category name matched exactly.',
  category_substring: 'The category name was matched approximately — double-check this is the right category.',
  item_exact: 'The item name matched exactly.',
  item_substring: 'The item name was matched approximately — double-check this is the right item.',
  items_explicit: 'These items were selected explicitly.',
  name_contains: 'Every item whose name contains the requested text was matched.',
};

// Structurally identical to menu-pricing's DiscountImpactEstimate — kept as
// a neutral name here since menu_edit's impact is never about a discount.
export type ImpactEstimate = {
  revenueImpact: string | null;
  margin: string | null;
  warnings: string[];
};

export type ConfidenceEvidenceItem = { met: boolean; label: string };
export type DecisionTier = 'strong' | 'good' | 'moderate' | 'weak';
export type DecisionSummary = { tier: DecisionTier; emoji: string; label: string; bullets: string[] };
export type Tradeoffs = { benefits: string[]; tradeoffs: string[] };
export type Alternative = { text: string; evidenceBacked: boolean };
export type MonitoringReminder = { days: 1 | 3 | 7; label: string };

// --- Capability-agnostic composers (moved verbatim from menu-pricing.ts) --

export function explainProposalBullets(params: {
  matchKind: MatchKindLike;
  itemCount: number;
  scheduleParseFailed: boolean;
  impact: ImpactEstimate;
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

const DECISION_TIER_META: Record<DecisionTier, { emoji: string; label: string; verdict: string }> = {
  strong: { emoji: '🟢', label: 'Recommended', verdict: 'Recommended.' },
  good: { emoji: '🟡', label: 'Worth Testing', verdict: 'Recommended as an experiment.' },
  moderate: { emoji: '🟠', label: 'Experimental', verdict: 'Treat this as an experiment and monitor results closely.' },
  weak: { emoji: '🔴', label: 'Insufficient Evidence', verdict: 'Consider collecting more data before proceeding.' },
};

export function computeDecisionScore(params: {
  confidence: Confidence;
  evidenceMetCount: number;
  dataQuality: 'good' | 'limited';
  considerationCount: number;
}): DecisionTier {
  let points = 0;
  points += params.confidence === 'high' ? 2 : params.confidence === 'medium' ? 1 : 0;
  points += params.dataQuality === 'good' ? 1 : 0;
  points += params.evidenceMetCount >= 3 ? 1 : 0;
  points -= params.considerationCount >= 3 ? 2 : params.considerationCount >= 1 ? 1 : 0;
  if (points >= 4) return 'strong';
  if (points >= 2) return 'good';
  if (points >= 0) return 'moderate';
  return 'weak';
}

export function composeDecisionSummary(params: { tier: DecisionTier; supportingFacts: string[]; riskFacts: string[] }): DecisionSummary {
  const meta = DECISION_TIER_META[params.tier];
  const bullets = [...params.supportingFacts.slice(0, 2), ...params.riskFacts.slice(0, 2)];
  if (bullets.length === 0) bullets.push('No additional evidence is available yet.');
  bullets.push(meta.verdict);
  return { tier: params.tier, emoji: meta.emoji, label: meta.label, bullets };
}

export function composeTradeoffs(params: { benefitSignals: string[]; riskSignals: string[] }): Tradeoffs {
  return { benefits: Array.from(new Set(params.benefitSignals)), tradeoffs: Array.from(new Set(params.riskSignals)) };
}

const MONITORING_REMINDER_BY_TIER: Record<DecisionTier, MonitoringReminder> = {
  strong: { days: 7, label: 'Check performance after 1 week.' },
  good: { days: 3, label: 'Check performance after 3 days.' },
  moderate: { days: 3, label: 'Check performance after 3 days.' },
  weak: { days: 1, label: 'Check performance after 1 day.' },
};

export function composeMonitoringReminder(tier: DecisionTier): MonitoringReminder {
  return MONITORING_REMINDER_BY_TIER[tier];
}

// --- The capability-aware contract ---------------------------------------

export type WhyNowFacts = { campaignCoverage: CoverageKind; itemCoverage: CoverageKind; hasRecentActivity: boolean };
export type ConfidenceEvidenceFacts = { matchKind: MatchKindLike; scheduleParseFailed: boolean; orderCount: number };
export type ConsiderationFacts = { warnings: string[]; campaignOverlap: boolean; orderCount: number };
export type AlternativeFacts = { itemNames: string[]; coOrderedNames: string[] };
export type SuccessMetricFacts = { itemNames: string[]; categoryName: string | null };
export type ExecutiveSummaryFacts = { confidence: Confidence; considerationCount: number; impact: ImpactEstimate };

// Every capability that renders a Decision Card implements this — the
// explicit, checkable statement that "appropriate copy for this capability"
// is a real requirement, not something a future capability gets by silently
// inheriting whichever capability shipped first. Built as factory-returned
// objects (capabilities/menu-pricing.ts's makeMenuPricingDecisionCopyAdapter,
// capabilities/menu-edit.ts's makeMenuEditDecisionCopyAdapter) rather than
// static objects, so an adapter can close over the specific action being
// proposed (e.g. menu_edit's composeSuccessMetrics branches on action.type
// to say something honest about a rename vs. a price change).
export type DecisionCopyAdapter = {
  composeWhyNow(facts: WhyNowFacts): string[];
  composeConfidenceEvidence(facts: ConfidenceEvidenceFacts): ConfidenceEvidenceItem[];
  composeConsiderations(facts: ConsiderationFacts): string[];
  composeAlternatives(facts: AlternativeFacts): Alternative[];
  composeWhyThisRecommendation(alternatives: Alternative[]): string | null;
  composeSuccessMetrics(facts: SuccessMetricFacts): string[];
  composeExecutiveSummary(facts: ExecutiveSummaryFacts): string;
};

export type DecisionCardInputs = {
  matchKind: MatchKindLike;
  itemCount: number;
  scheduleParseFailed: boolean;
  impact: ImpactEstimate;
  confidence: Confidence;
  campaignCoverage: CoverageKind;
  itemCoverage: CoverageKind;
  hasRecentActivity: boolean;
  orderCount: number;
  dataQuality: 'good' | 'limited';
  itemNames: string[];
  categoryName: string | null;
  coOrderedNames: string[];
  campaignOverlap: boolean;
};

export type DecisionCard = {
  considerations: string[];
  confidenceEvidence: ConfidenceEvidenceItem[];
  whyNow: string[];
  reasoningBullets: string[];
  executiveSummary: string;
  decisionSummary: DecisionSummary;
  tradeoffs: Tradeoffs;
  alternatives: Alternative[];
  whyThisRecommendation: string | null;
  successMetrics: string[];
  monitoringReminder: MonitoringReminder;
};

// The composition layer's single entry point — every preview route calls
// this once instead of hand-assembling 12 fields inline. Domain-specific
// pieces come from `adapter`; everything else is the shared, capability-
// agnostic math/regrouping above.
export function composeDecisionCard(adapter: DecisionCopyAdapter, inputs: DecisionCardInputs): DecisionCard {
  const considerations = adapter.composeConsiderations({
    warnings: inputs.impact.warnings,
    campaignOverlap: inputs.campaignOverlap,
    orderCount: inputs.orderCount,
  });
  const confidenceEvidence = adapter.composeConfidenceEvidence({
    matchKind: inputs.matchKind,
    scheduleParseFailed: inputs.scheduleParseFailed,
    orderCount: inputs.orderCount,
  });
  const whyNow = adapter.composeWhyNow({
    campaignCoverage: inputs.campaignCoverage,
    itemCoverage: inputs.itemCoverage,
    hasRecentActivity: inputs.hasRecentActivity,
  });
  const reasoningBullets = explainProposalBullets({
    matchKind: inputs.matchKind,
    itemCount: inputs.itemCount,
    scheduleParseFailed: inputs.scheduleParseFailed,
    impact: inputs.impact,
  });
  const executiveSummary = adapter.composeExecutiveSummary({
    confidence: inputs.confidence,
    considerationCount: considerations.length,
    impact: inputs.impact,
  });
  const evidenceMetCount = confidenceEvidence.filter((e) => e.met).length;
  const decisionTier = computeDecisionScore({
    confidence: inputs.confidence,
    evidenceMetCount,
    dataQuality: inputs.dataQuality,
    considerationCount: considerations.length,
  });
  const decisionSummary = composeDecisionSummary({
    tier: decisionTier,
    supportingFacts: confidenceEvidence.filter((e) => e.met).map((e) => e.label),
    riskFacts: considerations,
  });
  const tradeoffs = composeTradeoffs({ benefitSignals: [...reasoningBullets, ...whyNow], riskSignals: considerations });
  const alternatives = adapter.composeAlternatives({ itemNames: inputs.itemNames, coOrderedNames: inputs.coOrderedNames });
  const whyThisRecommendation = adapter.composeWhyThisRecommendation(alternatives);
  const successMetrics = adapter.composeSuccessMetrics({ itemNames: inputs.itemNames, categoryName: inputs.categoryName });
  const monitoringReminder = composeMonitoringReminder(decisionTier);

  return {
    considerations,
    confidenceEvidence,
    whyNow,
    reasoningBullets,
    executiveSummary,
    decisionSummary,
    tradeoffs,
    alternatives,
    whyThisRecommendation,
    successMetrics,
    monitoringReminder,
  };
}
