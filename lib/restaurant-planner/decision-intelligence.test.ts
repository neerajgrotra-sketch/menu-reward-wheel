import { describe, it, expect } from 'vitest';
import { composeDecisionCard, type DecisionCopyAdapter, type DecisionCardInputs } from './decision-intelligence';

// A minimal fake adapter proving composeDecisionCard actually calls the
// adapter for the domain-specific pieces and its own shared logic for
// everything else — the "composition layer, not duplicated UI" contract
// itself, independent of any one capability's wording.
function fakeAdapter(): DecisionCopyAdapter {
  return {
    composeWhyNow: () => ['fake-why-now'],
    composeConfidenceEvidence: () => [{ met: true, label: 'fake-evidence' }],
    composeConsiderations: () => ['fake-consideration'],
    composeAlternatives: () => [{ text: 'fake-alternative', evidenceBacked: false }],
    composeWhyThisRecommendation: (alternatives) => (alternatives.length > 0 ? 'fake-why-this' : null),
    composeSuccessMetrics: () => ['fake-metric'],
    composeExecutiveSummary: () => 'fake-summary',
  };
}

const baseInputs: DecisionCardInputs = {
  matchKind: 'item_exact',
  itemCount: 1,
  scheduleParseFailed: false,
  impact: { revenueImpact: null, margin: null, warnings: [] },
  confidence: 'high',
  campaignCoverage: 'none',
  itemCoverage: 'none',
  hasRecentActivity: false,
  orderCount: 10,
  dataQuality: 'good',
  itemNames: ['Item'],
  categoryName: null,
  coOrderedNames: [],
  campaignOverlap: false,
};

describe('composeDecisionCard — the composition layer orchestrator', () => {
  it('delegates every domain-specific field to the adapter', () => {
    const card = composeDecisionCard(fakeAdapter(), baseInputs);
    expect(card.whyNow).toEqual(['fake-why-now']);
    expect(card.confidenceEvidence).toEqual([{ met: true, label: 'fake-evidence' }]);
    expect(card.considerations).toEqual(['fake-consideration']);
    expect(card.alternatives).toEqual([{ text: 'fake-alternative', evidenceBacked: false }]);
    expect(card.whyThisRecommendation).toBe('fake-why-this');
    expect(card.successMetrics).toEqual(['fake-metric']);
    expect(card.executiveSummary).toBe('fake-summary');
  });

  it('computes the shared, capability-agnostic fields itself (decision tier, tradeoffs, monitoring reminder, reasoning bullets)', () => {
    const card = composeDecisionCard(fakeAdapter(), baseInputs);
    // confidence high (+2) + dataQuality good (+1) + evidenceMetCount 1 of 3 needed (+0) - 1 consideration (-1) = 2 points -> 'good'
    expect(card.decisionSummary.tier).toBe('good');
    expect(card.reasoningBullets[0]).toBe('The item name matched exactly.');
    expect(card.tradeoffs.tradeoffs).toContain('fake-consideration');
    expect(card.monitoringReminder).toEqual({ days: 3, label: 'Check performance after 3 days.' });
  });

  it('passes an empty alternatives array through to composeWhyThisRecommendation, which can react to it (e.g. return null)', () => {
    const noAlternativesAdapter: DecisionCopyAdapter = { ...fakeAdapter(), composeAlternatives: () => [] };
    const card = composeDecisionCard(noAlternativesAdapter, baseInputs);
    expect(card.alternatives).toEqual([]);
    expect(card.whyThisRecommendation).toBeNull();
  });

  it('two different adapters given the same inputs produce different domain copy — proves capabilities do not silently share wording', () => {
    const otherAdapter: DecisionCopyAdapter = { ...fakeAdapter(), composeSuccessMetrics: () => ['other-capability-metric'] };
    const cardA = composeDecisionCard(fakeAdapter(), baseInputs);
    const cardB = composeDecisionCard(otherAdapter, baseInputs);
    expect(cardA.successMetrics).not.toEqual(cardB.successMetrics);
  });
});
