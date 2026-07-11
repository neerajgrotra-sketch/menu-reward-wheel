import { describe, it, expect } from 'vitest';
import {
  estimateDiscountImpact,
  computeConfidence,
  buildPlanTasks,
  explainProposal,
  revalidateProposal,
  composeExecutiveSummary,
  composeWhyNow,
  composeConfidenceEvidence,
  composeConsiderations,
  explainProposalBullets,
  computeDecisionScore,
  composeDecisionSummary,
  composeTradeoffs,
  composeAlternatives,
  composeWhyThisRecommendation,
  composeSuccessMetrics,
  composeMonitoringReminder,
} from './menu-pricing';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';

function resolvedItem(overrides: Partial<ResolvedDiscountItem>): ResolvedDiscountItem {
  return {
    id: 'item-id',
    name: 'Cardamom Chai',
    categoryId: 'category-id',
    categoryName: 'Breakfast',
    price: 3,
    before: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null },
    after: {
      specialEnabled: true,
      specialType: 'percentage',
      specialPercent: 20,
      specialPrice: null,
      specialStartAt: null,
      specialEndAt: null,
      specialNoExpiry: true,
    },
    ...overrides,
  };
}

describe('estimateDiscountImpact', () => {
  it('returns no impact/margin/warnings for clear_discount', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'all' } };
    const result = estimateDiscountImpact(action, [resolvedItem({})]);
    expect(result).toEqual({ revenueImpact: null, margin: null, warnings: [] });
  });

  it('never fabricates a margin figure — no cost data exists in the schema', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = estimateDiscountImpact(action, [resolvedItem({})]);
    expect(result.margin).toBeNull();
    expect(result.warnings).toContain('Margin estimate unavailable — no cost data is configured for these items.');
  });

  it('picks a wider revenue-impact band for a deeper percentage discount', () => {
    const shallow: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'percentage', value: 10, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const deep: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'percentage', value: 40, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const shallowResult = estimateDiscountImpact(shallow, [resolvedItem({})]);
    const deepResult = estimateDiscountImpact(deep, [resolvedItem({})]);
    expect(shallowResult.revenueImpact).toBe('+3–6%');
    expect(deepResult.revenueImpact).toBe('+8–15%');
  });

  it('derives an effective percentage from a fixed_price discount relative to current price', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'fixed_price', value: 2.4, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    // $3 -> $2.40 is a 20% effective discount, same band as a direct 20% off.
    const result = estimateDiscountImpact(action, [resolvedItem({ price: 3 })]);
    expect(result.revenueImpact).toBe('+6–10%');
  });

  it('returns no impact when there are no resolved items', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Cardamom Chai' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = estimateDiscountImpact(action, []);
    expect(result.revenueImpact).toBeNull();
  });
});

describe('computeConfidence (V2)', () => {
  it('is high for an exact single-item match, explicit selection, category, or all', () => {
    expect(computeConfidence('item_exact', false)).toBe('high');
    expect(computeConfidence('items_explicit', false)).toBe('high');
    expect(computeConfidence('category_exact', false)).toBe('high');
    expect(computeConfidence('all', false)).toBe('high');
  });

  it('is medium for a fuzzy name_contains match or a substring item match', () => {
    expect(computeConfidence('name_contains', false)).toBe('medium');
    expect(computeConfidence('item_substring', false)).toBe('medium');
  });

  it('is low for a fuzzy category match', () => {
    expect(computeConfidence('category_substring', false)).toBe('low');
  });

  it('downgrades an otherwise-high-confidence match to low when the schedule could not be understood', () => {
    expect(computeConfidence('item_exact', true)).toBe('low');
  });
});

describe('buildPlanTasks (V2 — scoped-down planning graph)', () => {
  it('marks every step completed and leaves approval pending when no schedule was requested', () => {
    const tasks = buildPlanTasks({ scheduleRequested: false, scheduleParseFailed: false });
    expect(tasks.find((t) => t.id === 'await_approval')?.status).toBe('pending');
    expect(tasks.filter((t) => t.id !== 'await_approval').every((t) => t.status === 'completed')).toBe(true);
  });

  it('marks configure_schedule failed when a requested schedule could not be parsed', () => {
    const tasks = buildPlanTasks({ scheduleRequested: true, scheduleParseFailed: true });
    expect(tasks.find((t) => t.id === 'configure_schedule')?.status).toBe('failed');
  });

  it('marks configure_schedule completed when a requested schedule parsed fine', () => {
    const tasks = buildPlanTasks({ scheduleRequested: true, scheduleParseFailed: false });
    expect(tasks.find((t) => t.id === 'configure_schedule')?.status).toBe('completed');
  });
});

describe('explainProposal (V2 — deterministic explainability)', () => {
  const action: MenuDiscountAction = {
    type: 'set_discount',
    target: { scope: 'item', name: 'Cardamom Chai' },
    discount: { discountType: 'percentage', value: 20 },
  };

  it('states the match reasoning, item count, discount, and schedule', () => {
    const text = explainProposal({
      matchKind: 'item_exact',
      itemCount: 1,
      action,
      scheduleRequested: false,
      scheduleParseFailed: false,
      impact: { revenueImpact: '+6–10%', margin: null, warnings: [] },
    });
    expect(text).toContain('matched exactly');
    expect(text).toContain('1 item affected');
    expect(text).toContain('20% off');
    expect(text).toContain('starts immediately');
    expect(text).toContain('+6–10%');
  });

  it('surfaces a schedule-parse failure in the explanation rather than hiding it', () => {
    const text = explainProposal({
      matchKind: 'item_exact',
      itemCount: 1,
      action,
      scheduleRequested: true,
      scheduleParseFailed: true,
      impact: { revenueImpact: null, margin: null, warnings: [] },
    });
    expect(text).toMatch(/couldn't be understood/);
  });
});

describe('revalidateProposal (V2 — pre-execution staleness check)', () => {
  it('passes when there is no snapshot to compare against', () => {
    expect(revalidateProposal(null, [])).toEqual({ ok: true });
  });

  it('passes when live state exactly matches the snapshot', () => {
    const snap = resolvedItem({});
    expect(revalidateProposal([snap], [snap])).toEqual({ ok: true });
  });

  it('fails when a snapshotted item no longer exists live', () => {
    const snap = resolvedItem({ id: 'gone' });
    const result = revalidateProposal([snap], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/no longer available/);
  });

  it('fails when the live price has changed since the snapshot was taken', () => {
    const snap = resolvedItem({ price: 3 });
    const live = resolvedItem({ price: 4 });
    const result = revalidateProposal([snap], [live]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/changed since this proposal was shown/);
  });

  it('fails when the live discount state has changed since the snapshot was taken', () => {
    const snap = resolvedItem({ before: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null } });
    const live = resolvedItem({ before: { specialEnabled: true, specialType: 'percentage', specialPercent: 10, specialPrice: null } });
    const result = revalidateProposal([snap], [live]);
    expect(result.ok).toBe(false);
  });
});

describe('composeExecutiveSummary (V2 — backfilled)', () => {
  it('labels a low-confidence recommendation as experimental regardless of considerations or impact', () => {
    const text = composeExecutiveSummary({ confidence: 'low', considerationCount: 0, impact: { revenueImpact: '+6–10%', margin: null, warnings: [] } });
    expect(text).toMatch(/Experimental recommendation/);
  });

  it('surfaces the consideration count when there are open considerations, regardless of confidence', () => {
    const text = composeExecutiveSummary({ confidence: 'high', considerationCount: 2, impact: { revenueImpact: null, margin: null, warnings: [] } });
    expect(text).toContain('2 points worth reviewing');
  });

  it('uses singular phrasing for exactly one consideration', () => {
    const text = composeExecutiveSummary({ confidence: 'high', considerationCount: 1, impact: { revenueImpact: null, margin: null, warnings: [] } });
    expect(text).toContain('one point worth reviewing');
  });

  it('cites the revenue impact for a clean high-confidence, no-consideration recommendation', () => {
    const text = composeExecutiveSummary({ confidence: 'high', considerationCount: 0, impact: { revenueImpact: '+6–10%', margin: null, warnings: [] } });
    expect(text).toContain('Low-risk recommendation');
    expect(text).toContain('+6–10%');
  });

  it('falls back to a hard-to-measure phrase when there is no revenue impact figure', () => {
    const text = composeExecutiveSummary({ confidence: 'medium', considerationCount: 0, impact: { revenueImpact: null, margin: null, warnings: [] } });
    expect(text).toContain('modest, hard-to-measure effect');
  });
});

describe('composeWhyNow (V2 — backfilled)', () => {
  it('lists every applicable timing signal', () => {
    const signals = composeWhyNow({ campaignCoverage: 'none', itemCoverage: 'none', hasRecentDiscount: false });
    expect(signals).toHaveLength(3);
  });

  it('omits a signal whose condition does not hold', () => {
    const signals = composeWhyNow({ campaignCoverage: 'active', itemCoverage: 'none', hasRecentDiscount: false });
    expect(signals.some((s) => s.includes('No active campaign'))).toBe(false);
  });

  it('falls back to "no special timing factors" when every signal is absent', () => {
    const signals = composeWhyNow({ campaignCoverage: 'active', itemCoverage: 'active', hasRecentDiscount: true });
    expect(signals).toEqual(['No special timing factors were detected for this recommendation.']);
  });
});

describe('composeConfidenceEvidence (V2 — backfilled)', () => {
  it('marks all four checks met for a strong, fully-informed, adequately-ordered item', () => {
    const evidence = composeConfidenceEvidence({ matchKind: 'item_exact', scheduleParseFailed: false, allPricesKnown: true, orderCount: 10 });
    expect(evidence.every((e) => e.met)).toBe(true);
    expect(evidence).toHaveLength(4);
  });

  it('marks the match, pricing, schedule, and order-count checks unmet independently', () => {
    const evidence = composeConfidenceEvidence({ matchKind: 'item_substring', scheduleParseFailed: true, allPricesKnown: false, orderCount: 1 });
    expect(evidence.every((e) => !e.met)).toBe(true);
  });
});

describe('composeConsiderations (V2 — backfilled)', () => {
  it('passes warnings through untouched', () => {
    const considerations = composeConsiderations({ warnings: ['Margin estimate unavailable.'], campaignOverlap: false, orderCount: 10 });
    expect(considerations).toEqual(['Margin estimate unavailable.']);
  });

  it('appends a campaign-overlap consideration when one exists', () => {
    const considerations = composeConsiderations({ warnings: [], campaignOverlap: true, orderCount: 10 });
    expect(considerations).toContain('An active campaign-level promotion already covers this category.');
  });

  it('appends a limited-data consideration below the minimum order threshold', () => {
    const considerations = composeConsiderations({ warnings: [], campaignOverlap: false, orderCount: 2 });
    expect(considerations.some((c) => c.includes('Limited historical sales data'))).toBe(true);
  });

  it('returns an empty list when nothing is wrong', () => {
    expect(composeConsiderations({ warnings: [], campaignOverlap: false, orderCount: 10 })).toEqual([]);
  });
});

describe('explainProposalBullets (V2 — backfilled)', () => {
  it('bullets the match explanation, item count, and revenue impact', () => {
    const bullets = explainProposalBullets({ matchKind: 'item_exact', itemCount: 1, scheduleParseFailed: false, impact: { revenueImpact: '+6–10%', margin: null, warnings: [] } });
    expect(bullets).toContain('This change affects 1 item.');
    expect(bullets.some((b) => b.includes('+6–10%'))).toBe(true);
  });

  it('surfaces a schedule-parse failure as its own bullet', () => {
    const bullets = explainProposalBullets({ matchKind: 'item_exact', itemCount: 1, scheduleParseFailed: true, impact: { revenueImpact: null, margin: null, warnings: [] } });
    expect(bullets.some((b) => b.includes("couldn't be understood"))).toBe(true);
  });
});

describe('computeDecisionScore (V1 — Decision Intelligence Layer)', () => {
  it('is strong for high confidence, good data, strong evidence, and no considerations', () => {
    expect(computeDecisionScore({ confidence: 'high', evidenceMetCount: 4, dataQuality: 'good', considerationCount: 0 })).toBe('strong');
  });

  it('is weak for low confidence, limited data, and multiple considerations', () => {
    expect(computeDecisionScore({ confidence: 'low', evidenceMetCount: 0, dataQuality: 'limited', considerationCount: 3 })).toBe('weak');
  });

  it('downgrades an otherwise-high-confidence score when considerations pile up', () => {
    const clean = computeDecisionScore({ confidence: 'high', evidenceMetCount: 4, dataQuality: 'good', considerationCount: 0 });
    const withConsiderations = computeDecisionScore({ confidence: 'high', evidenceMetCount: 4, dataQuality: 'good', considerationCount: 3 });
    expect(clean).toBe('strong');
    expect(withConsiderations).not.toBe('strong');
  });

  it('is moderate for a medium-confidence match with no other signals', () => {
    expect(computeDecisionScore({ confidence: 'medium', evidenceMetCount: 0, dataQuality: 'limited', considerationCount: 0 })).toBe('moderate');
  });
});

describe('composeDecisionSummary (V1)', () => {
  it('maps each tier to its owner-facing emoji and label', () => {
    expect(composeDecisionSummary({ tier: 'strong', supportingFacts: [], riskFacts: [] })).toMatchObject({ emoji: '🟢', label: 'Recommended' });
    expect(composeDecisionSummary({ tier: 'good', supportingFacts: [], riskFacts: [] })).toMatchObject({ emoji: '🟡', label: 'Worth Testing' });
    expect(composeDecisionSummary({ tier: 'moderate', supportingFacts: [], riskFacts: [] })).toMatchObject({ emoji: '🟠', label: 'Experimental' });
    expect(composeDecisionSummary({ tier: 'weak', supportingFacts: [], riskFacts: [] })).toMatchObject({ emoji: '🔴', label: 'Insufficient Evidence' });
  });

  it('includes real supporting and risk facts, capped at two each, plus the tier verdict', () => {
    const summary = composeDecisionSummary({
      tier: 'good',
      supportingFacts: ['Strong item match', 'Complete pricing information', 'Schedule understood as requested'],
      riskFacts: ['Limited historical sales data.'],
    });
    expect(summary.bullets).toEqual(['Strong item match', 'Complete pricing information', 'Limited historical sales data.', 'Recommended as an experiment.']);
  });

  it('falls back to a placeholder bullet when there is no supporting or risk evidence at all', () => {
    const summary = composeDecisionSummary({ tier: 'weak', supportingFacts: [], riskFacts: [] });
    expect(summary.bullets[0]).toBe('No additional evidence is available yet.');
  });
});

describe('composeTradeoffs (V1)', () => {
  it('deduplicates repeated benefit and risk signals', () => {
    const result = composeTradeoffs({ benefitSignals: ['Low risk.', 'Low risk.'], riskSignals: ['Limited data.'] });
    expect(result.benefits).toEqual(['Low risk.']);
    expect(result.tradeoffs).toEqual(['Limited data.']);
  });

  it('returns empty arrays rather than fabricating content when there are no signals', () => {
    expect(composeTradeoffs({ benefitSignals: [], riskSignals: [] })).toEqual({ benefits: [], tradeoffs: [] });
  });
});

describe('composeAlternatives (V1)', () => {
  it('prefers real co-order evidence over generic templates', () => {
    const alternatives = composeAlternatives({ itemNames: ['Kashmiri Chai'], coOrderedNames: ['Rasmalai', 'Gulab Jamun'] });
    expect(alternatives).toHaveLength(2);
    expect(alternatives.every((a) => a.evidenceBacked)).toBe(true);
    expect(alternatives[0].text).toContain('Bundle Kashmiri Chai with Rasmalai');
  });

  it('caps evidence-backed alternatives at two even with more co-ordered items', () => {
    const alternatives = composeAlternatives({ itemNames: ['Kashmiri Chai'], coOrderedNames: ['A', 'B', 'C'] });
    expect(alternatives).toHaveLength(2);
  });

  it('falls back to generic, non-evidence-backed templates only when no co-order data exists', () => {
    const alternatives = composeAlternatives({ itemNames: ['Kashmiri Chai'], coOrderedNames: [] });
    expect(alternatives).toHaveLength(2);
    expect(alternatives.every((a) => !a.evidenceBacked)).toBe(true);
  });

  it('uses a generic plural label for multi-item proposals', () => {
    const alternatives = composeAlternatives({ itemNames: ['Kashmiri Chai', 'Masala Chai'], coOrderedNames: [] });
    expect(alternatives[0].text).toContain('these items');
  });
});

describe('composeWhyThisRecommendation (V1)', () => {
  it('explains the direct-discount choice against real alternatives', () => {
    const text = composeWhyThisRecommendation([{ text: 'Bundle Kashmiri Chai with Rasmalai — frequently ordered together', evidenceBacked: true }]);
    expect(text).toContain('Bundle Kashmiri Chai with Rasmalai');
    expect(text).toContain('Ask SpinBite can apply automatically today');
  });

  it('does not fabricate an alternative when none exist', () => {
    const text = composeWhyThisRecommendation([]);
    expect(text).toBe('No deterministic alternative was identified — this is the most direct way to reach the objective.');
  });
});

describe('composeSuccessMetrics (V1)', () => {
  it('includes an item-order metric and average order value for a single item with no category', () => {
    const metrics = composeSuccessMetrics({ itemNames: ['Kashmiri Chai'], categoryName: null });
    expect(metrics).toEqual(['Orders containing Kashmiri Chai', 'Average order value']);
  });

  it('adds a category-revenue metric when a single category is known', () => {
    const metrics = composeSuccessMetrics({ itemNames: ['Kashmiri Chai'], categoryName: 'Beverages' });
    expect(metrics).toContain('Beverages category revenue');
  });

  it('never lists promotion redemption — menu_items specials have no redemption event', () => {
    const metrics = composeSuccessMetrics({ itemNames: ['Kashmiri Chai'], categoryName: 'Beverages' });
    expect(metrics.some((m) => m.toLowerCase().includes('redemption'))).toBe(false);
  });
});

describe('composeMonitoringReminder (V1)', () => {
  it('recommends a longer review window for a strong recommendation and a shorter one for a weak one', () => {
    expect(composeMonitoringReminder('strong')).toEqual({ days: 7, label: 'Check performance after 1 week.' });
    expect(composeMonitoringReminder('weak')).toEqual({ days: 1, label: 'Check performance after 1 day.' });
  });
});
