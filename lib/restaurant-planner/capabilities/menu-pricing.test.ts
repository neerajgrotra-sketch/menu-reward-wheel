import { describe, it, expect } from 'vitest';
import { estimateDiscountImpact, computeConfidence, buildPlanTasks, explainProposal, revalidateProposal } from './menu-pricing';
import type { ResolvableAction, ResolvedDiscountItem } from '@/lib/menu-discount-actions/resolve';
import type { MenuDiscountAction } from '@/lib/intelligence/actions/menu-discount-schema';

function resolvedItem(overrides: Partial<ResolvedDiscountItem>): ResolvedDiscountItem {
  return {
    id: 'item-id',
    name: 'Cardamom Chai',
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
