import { describe, it, expect } from 'vitest';
import { toItemView } from './proposal-copy';
import type { ResolvedDiscountItem } from './resolve';

function resolvedItem(overrides: Partial<ResolvedDiscountItem>): ResolvedDiscountItem {
  return {
    id: 'item-id',
    name: 'Halwa',
    categoryId: 'cat-desserts',
    categoryName: 'Desserts',
    price: 6.99,
    before: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null },
    after: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null, specialStartAt: null, specialEndAt: null, specialNoExpiry: false },
    ...overrides,
  };
}

describe('toItemView — Before/After price labels', () => {
  it('clear_discount on a percentage special shows the discounted price as Current, base price as Recommended', () => {
    const item = resolvedItem({
      before: { specialEnabled: true, specialType: 'percentage', specialPercent: 20, specialPrice: null },
      after: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null, specialStartAt: null, specialEndAt: null, specialNoExpiry: false },
    });
    const view = toItemView(item);
    expect(view.beforeLabel).toBe('$5.59');
    expect(view.afterLabel).toBe('$6.99');
    expect(view.badge).toBeUndefined();
  });

  it('clear_discount on a fixed_price special shows the special price as Current, base price as Recommended', () => {
    const item = resolvedItem({
      before: { specialEnabled: true, specialType: 'fixed_price', specialPercent: null, specialPrice: 5.59 },
      after: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null, specialStartAt: null, specialEndAt: null, specialNoExpiry: false },
    });
    const view = toItemView(item);
    expect(view.beforeLabel).toBe('$5.59');
    expect(view.afterLabel).toBe('$6.99');
  });

  it('set_discount on a not-currently-discounted item shows base price as Current, discounted price as Recommended', () => {
    const item = resolvedItem({
      price: 10,
      before: { specialEnabled: false, specialType: null, specialPercent: null, specialPrice: null },
      after: { specialEnabled: true, specialType: 'percentage', specialPercent: 20, specialPrice: null, specialStartAt: null, specialEndAt: null, specialNoExpiry: false },
    });
    const view = toItemView(item);
    expect(view.beforeLabel).toBe('$10.00');
    expect(view.afterLabel).toBe('$8.00');
    expect(view.badge).toBe('20% OFF');
  });
});
