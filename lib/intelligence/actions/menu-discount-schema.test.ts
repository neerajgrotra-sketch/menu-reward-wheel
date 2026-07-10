import { describe, it, expect } from 'vitest';
import { isMenuDiscountAction } from './menu-discount-schema';

describe('isMenuDiscountAction', () => {
  it('accepts a clear_discount action targeting a category', () => {
    expect(isMenuDiscountAction({ type: 'clear_discount', target: { scope: 'category', name: 'Desserts' } })).toBe(true);
  });

  it('accepts a clear-all action', () => {
    expect(isMenuDiscountAction({ type: 'clear_discount', target: { scope: 'all' } })).toBe(true);
  });

  it('accepts a set_discount action with a schedule', () => {
    expect(
      isMenuDiscountAction({
        type: 'set_discount',
        target: { scope: 'category', name: 'Desserts' },
        discount: { discountType: 'percentage', value: 20, startTime: '19:00' },
      }),
    ).toBe(true);
  });

  it('rejects a percentage discount of 100 or more', () => {
    expect(
      isMenuDiscountAction({
        type: 'set_discount',
        target: { scope: 'item', name: 'Chai' },
        discount: { discountType: 'percentage', value: 100 },
      }),
    ).toBe(false);
  });

  it('rejects a discount target missing a name for scope=item', () => {
    expect(isMenuDiscountAction({ type: 'clear_discount', target: { scope: 'item' } })).toBe(false);
  });

  it('rejects a non-object value', () => {
    expect(isMenuDiscountAction('chai')).toBe(false);
  });

  it('rejects an unrecognized action type', () => {
    expect(isMenuDiscountAction({ type: 'do_something_else', target: { scope: 'all' } })).toBe(false);
  });

  describe('V2 target scopes', () => {
    it('accepts scope:"items" with an explicit name list', () => {
      expect(
        isMenuDiscountAction({
          type: 'set_discount',
          target: { scope: 'items', names: ['Cardamom Chai', 'Masala Chai'] },
          discount: { discountType: 'percentage', value: 20 },
        }),
      ).toBe(true);
    });

    it('rejects scope:"items" with an empty name list', () => {
      expect(isMenuDiscountAction({ type: 'clear_discount', target: { scope: 'items', names: [] } })).toBe(false);
    });

    it('accepts scope:"name_contains" for an "apply to all matches" fragment', () => {
      expect(
        isMenuDiscountAction({
          type: 'set_discount',
          target: { scope: 'name_contains', query: 'chai' },
          discount: { discountType: 'percentage', value: 20 },
        }),
      ).toBe(true);
    });

    it('rejects scope:"name_contains" with a blank query', () => {
      expect(isMenuDiscountAction({ type: 'clear_discount', target: { scope: 'name_contains', query: '  ' } })).toBe(false);
    });

    it('accepts scope:"category" with an exclude list', () => {
      expect(
        isMenuDiscountAction({
          type: 'set_discount',
          target: { scope: 'category', name: 'Desserts', exclude: ['Gulab Jamun'] },
          discount: { discountType: 'percentage', value: 20 },
        }),
      ).toBe(true);
    });

    it('rejects a non-empty-string exclude entry', () => {
      expect(
        isMenuDiscountAction({
          type: 'clear_discount',
          target: { scope: 'category', name: 'Desserts', exclude: [''] },
        }),
      ).toBe(false);
    });

    it('accepts a discount with dayOffset "tomorrow"', () => {
      expect(
        isMenuDiscountAction({
          type: 'set_discount',
          target: { scope: 'category', name: 'Desserts' },
          discount: { discountType: 'percentage', value: 15, startTime: '18:00', dayOffset: 'tomorrow' },
        }),
      ).toBe(true);
    });

    it('rejects an invalid dayOffset value', () => {
      expect(
        isMenuDiscountAction({
          type: 'set_discount',
          target: { scope: 'category', name: 'Desserts' },
          discount: { discountType: 'percentage', value: 15, dayOffset: 'yesterday' },
        }),
      ).toBe(false);
    });
  });
});
