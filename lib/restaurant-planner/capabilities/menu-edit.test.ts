import { describe, it, expect } from 'vitest';
import {
  computeConfidence,
  buildPlanTasks,
  explainProposal,
  estimateMenuEditImpact,
  revalidateProposal,
  applyMenuEditProposal,
  makeMenuEditDecisionCopyAdapter,
} from './menu-edit';
import type { ResolvedMenuEditItem } from '@/lib/menu-edit-actions/resolve';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

function resolvedItem(overrides: Partial<ResolvedMenuEditItem>): ResolvedMenuEditItem {
  return {
    id: 'item-id',
    name: 'Ras Malai',
    categoryId: 'category-id',
    categoryName: 'Desserts',
    before: { price: 6.99 },
    after: { price: 7.99 },
    ...overrides,
  };
}

describe('computeConfidence (menu_edit — no schedule dimension)', () => {
  it('is high for an exact single-item match, explicit selection, category, or all', () => {
    expect(computeConfidence('item_exact')).toBe('high');
    expect(computeConfidence('items_explicit')).toBe('high');
    expect(computeConfidence('category_exact')).toBe('high');
    expect(computeConfidence('all')).toBe('high');
  });

  it('is medium for a fuzzy name_contains match or a substring item match', () => {
    expect(computeConfidence('name_contains')).toBe('medium');
    expect(computeConfidence('item_substring')).toBe('medium');
  });

  it('is low for a fuzzy category match', () => {
    expect(computeConfidence('category_substring')).toBe('low');
  });
});

describe('buildPlanTasks', () => {
  it('has no configure_schedule step, unlike menu_pricing — menu_edit has no schedule concept', () => {
    const tasks = buildPlanTasks();
    expect(tasks.some((t) => t.id === 'configure_schedule')).toBe(false);
  });

  it('every task is completed except the pending await_approval', () => {
    const tasks = buildPlanTasks();
    const awaitApproval = tasks.find((t) => t.id === 'await_approval');
    expect(awaitApproval?.status).toBe('pending');
    expect(tasks.filter((t) => t.id !== 'await_approval').every((t) => t.status === 'completed')).toBe(true);
  });
});

describe('explainProposal', () => {
  const target = { scope: 'item' as const, name: 'Ras Malai' };

  it('describes a set_price action', () => {
    const action: MenuEditAction = { type: 'set_price', target, price: 7.99 };
    const reasoning = explainProposal({ matchKind: 'item_exact', itemCount: 1, action });
    expect(reasoning).toContain('setting the price to $7.99');
  });

  it('describes an adjust_price increase in percentage terms', () => {
    const action: MenuEditAction = { type: 'adjust_price', target, adjustment: { direction: 'increase', amount: { kind: 'percentage', value: 5 } } };
    const reasoning = explainProposal({ matchKind: 'category_exact', itemCount: 4, action });
    expect(reasoning).toContain('increasing the price by 5%');
    expect(reasoning).toContain('4 items affected');
  });

  it('describes a set_availability hide action', () => {
    const action: MenuEditAction = { type: 'set_availability', target, available: false };
    expect(explainProposal({ matchKind: 'item_exact', itemCount: 1, action })).toContain('hiding it from the menu');
  });

  it('describes a set_tag chef_special action', () => {
    const action: MenuEditAction = { type: 'set_tag', target, tag: 'chef_special', enabled: true };
    expect(explainProposal({ matchKind: 'item_exact', itemCount: 1, action })).toContain('marking it as Chef Special');
  });
});

describe('estimateMenuEditImpact', () => {
  it('never fabricates a revenue or margin figure — a catalog edit has no honest estimate', () => {
    const result = estimateMenuEditImpact();
    expect(result.revenueImpact).toBeNull();
    expect(result.margin).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('revalidateProposal', () => {
  it('passes when there is no persisted snapshot to compare against', () => {
    expect(revalidateProposal(null, [])).toEqual({ ok: true });
  });

  it('passes when live data still matches the snapshot', () => {
    const snapshot = [resolvedItem({})];
    const live = [resolvedItem({})];
    expect(revalidateProposal(snapshot, live)).toEqual({ ok: true });
  });

  it('rejects when the item no longer exists live', () => {
    const snapshot = [resolvedItem({ id: 'gone' })];
    expect(revalidateProposal(snapshot, [])).toMatchObject({ ok: false });
  });

  it('rejects when the live "before" state has drifted since the proposal was shown', () => {
    const snapshot = [resolvedItem({ before: { price: 6.99 } })];
    const live = [resolvedItem({ before: { price: 8.5 } })];
    const result = revalidateProposal(snapshot, live);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/changed since this proposal was shown/i);
  });
});

// Minimal chainable fake matching applyOne's two query shapes: an
// .update().eq().eq() chain (awaited directly, no .select()) against
// menu_items, and a bare .insert() against menu_edit_change_log. No real
// Supabase client exists in this repo's test infra — scoped to exactly
// these chains, same pattern as tools/promotion.test.ts's fakeSupabase.
function fakeAuthClient(opts: { updateError?: { message: string } | null; logError?: { message: string } | null }) {
  const updateChain: any = {
    eq: () => updateChain,
    then: (resolve: any) => resolve({ error: opts.updateError ?? null }),
  };
  return {
    from: (table: string) => {
      if (table === 'menu_items') return { update: () => updateChain };
      if (table === 'menu_edit_change_log') return { insert: async () => ({ error: opts.logError ?? null }) };
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
}

describe('applyMenuEditProposal', () => {
  it('skips a no-op item (before equals after) — no write, reported as skippedNoOp', async () => {
    const noOpItem = resolvedItem({ before: { price: 7.99 }, after: { price: 7.99 } });
    const result = await applyMenuEditProposal(fakeAuthClient({}), 'r1', 'o1', [noOpItem]);
    expect(result).toEqual({ applied: 0, total: 1, skippedNoOp: ['Ras Malai'] });
  });

  it('applies a real change and reports it as applied', async () => {
    const result = await applyMenuEditProposal(fakeAuthClient({}), 'r1', 'o1', [resolvedItem({})]);
    expect(result.applied).toBe(1);
    expect(result.total).toBe(1);
    expect(result.failed).toBeUndefined();
  });

  it('reports a write failure without throwing', async () => {
    const result = await applyMenuEditProposal(fakeAuthClient({ updateError: { message: 'db unavailable' } }), 'r1', 'o1', [resolvedItem({})]);
    expect(result.applied).toBe(0);
    expect(result.failed).toEqual([{ id: 'item-id', name: 'Ras Malai', success: false, error: 'db unavailable' }]);
  });

  it('a change-log insert failure does not mask a successful write — still reported as applied', async () => {
    const result = await applyMenuEditProposal(fakeAuthClient({ logError: { message: 'log table unavailable' } }), 'r1', 'o1', [resolvedItem({})]);
    expect(result.applied).toBe(1);
    expect(result.failed).toBeUndefined();
  });
});

// Pre-merge audit Important finding #1: menu_edit's Decision Card must
// never reuse pricing-flavored language for a structural (non-price)
// change. Every test below asserts the ABSENCE of pricing/sales wording
// for the 5 non-price action types, and confirms price actions (set_price/
// adjust_price) still get an honest, appropriately-scoped version.
describe('makeMenuEditDecisionCopyAdapter — capability-aware Decision Intelligence', () => {
  const target = { scope: 'item' as const, name: 'Ras Malai' };
  const rename: MenuEditAction = { type: 'rename_item', target, name: 'Rasmalai Deluxe' };
  const setPrice: MenuEditAction = { type: 'set_price', target, price: 7.99 };
  const hide: MenuEditAction = { type: 'set_availability', target, available: false };
  const show: MenuEditAction = { type: 'set_availability', target, available: true };
  const featured: MenuEditAction = { type: 'set_tag', target, tag: 'featured', enabled: true };
  const moveCategory: MenuEditAction = { type: 'move_category', target, toCategoryName: 'Desserts' };

  it('composeSuccessMetrics never mentions Average Order Value / revenue for a rename — the audit\'s exact finding', () => {
    const metrics = makeMenuEditDecisionCopyAdapter(rename).composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null });
    expect(metrics.join(' ').toLowerCase()).not.toContain('average order value');
    expect(metrics.join(' ').toLowerCase()).not.toContain('revenue');
    expect(metrics[0]).toContain('new name displays correctly');
  });

  it('composeSuccessMetrics gives a real, action-appropriate answer for each non-price action type', () => {
    const adapter = makeMenuEditDecisionCopyAdapter(hide);
    expect(adapter.composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null })[0]).toContain('no longer appears');
    expect(makeMenuEditDecisionCopyAdapter(show).composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null })[0]).toContain('is visible');
    expect(makeMenuEditDecisionCopyAdapter(featured).composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null })[0]).toContain('Featured');
    expect(makeMenuEditDecisionCopyAdapter(moveCategory).composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null })[0]).toContain('new category');
  });

  it('composeSuccessMetrics DOES use sales-appropriate metrics for a price action — this framing is legitimate there', () => {
    const metrics = makeMenuEditDecisionCopyAdapter(setPrice).composeSuccessMetrics({ itemNames: ['Ras Malai'], categoryName: null });
    expect(metrics).toContain('Average order value');
  });

  it('composeAlternatives is empty for a rename — "bundle it with Y" makes no sense as an alternative to renaming', () => {
    const alternatives = makeMenuEditDecisionCopyAdapter(rename).composeAlternatives({ itemNames: ['Ras Malai'], coOrderedNames: ['Halwa'] });
    expect(alternatives).toEqual([]);
  });

  it('composeAlternatives can suggest a bundle for a price action, worded without "instead of discounting"', () => {
    const alternatives = makeMenuEditDecisionCopyAdapter(setPrice).composeAlternatives({ itemNames: ['Ras Malai'], coOrderedNames: ['Halwa'] });
    expect(alternatives.length).toBeGreaterThan(0);
    expect(alternatives.map((a) => a.text).join(' ')).not.toContain('discounting');
  });

  it('composeWhyThisRecommendation is always null — never fabricates "the most direct way" framing for a catalog edit', () => {
    expect(makeMenuEditDecisionCopyAdapter(rename).composeWhyThisRecommendation([])).toBeNull();
    expect(makeMenuEditDecisionCopyAdapter(setPrice).composeWhyThisRecommendation([{ text: 'x', evidenceBacked: true }])).toBeNull();
  });

  it('composeConfidenceEvidence omits the pricing-information line for non-price actions', () => {
    const evidence = makeMenuEditDecisionCopyAdapter(rename).composeConfidenceEvidence({ matchKind: 'item_exact', scheduleParseFailed: false, orderCount: 10 });
    expect(evidence.some((e) => e.label.toLowerCase().includes('pricing information'))).toBe(false);
    expect(evidence).toHaveLength(2);
  });

  it('composeConfidenceEvidence includes a price-known line for a price action', () => {
    const evidence = makeMenuEditDecisionCopyAdapter(setPrice).composeConfidenceEvidence({ matchKind: 'item_exact', scheduleParseFailed: false, orderCount: 10 });
    expect(evidence.some((e) => e.label.toLowerCase().includes('price data is fully known'))).toBe(true);
    expect(evidence).toHaveLength(3);
  });

  it('composeWhyNow never says "discounted" — rewords the same coverage facts for a catalog edit', () => {
    const signals = makeMenuEditDecisionCopyAdapter(rename).composeWhyNow({ campaignCoverage: 'none', itemCoverage: 'none', hasRecentActivity: false });
    expect(signals.join(' ').toLowerCase()).not.toContain('discounted');
  });

  it('composeExecutiveSummary never claims a "modest, hard-to-measure effect" for a structural change — that phrasing implies a revenue hypothesis a rename does not have', () => {
    const text = makeMenuEditDecisionCopyAdapter(rename).composeExecutiveSummary({ confidence: 'high', considerationCount: 0, impact: { revenueImpact: null, margin: null, warnings: [] } });
    expect(text.toLowerCase()).not.toContain('hard-to-measure');
    expect(text).toContain('not a pricing or revenue decision');
  });
});
