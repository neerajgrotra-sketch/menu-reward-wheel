import { describe, it, expect } from 'vitest';
import { isMenuEditAction, isMenuEditTarget } from './menu-edit-schema';

describe('isMenuEditTarget', () => {
  it('accepts every scope variant', () => {
    expect(isMenuEditTarget({ scope: 'all' })).toBe(true);
    expect(isMenuEditTarget({ scope: 'category', name: 'Desserts' })).toBe(true);
    expect(isMenuEditTarget({ scope: 'item', name: 'Ras Malai' })).toBe(true);
    expect(isMenuEditTarget({ scope: 'items', names: ['Ras Malai', 'Halwa'] })).toBe(true);
    expect(isMenuEditTarget({ scope: 'name_contains', query: 'chai' })).toBe(true);
  });

  it('accepts category/name_contains with an exclude list', () => {
    expect(isMenuEditTarget({ scope: 'category', name: 'Desserts', exclude: ['Halwa'] })).toBe(true);
  });

  it('rejects a target missing a required name/query/names', () => {
    expect(isMenuEditTarget({ scope: 'item' })).toBe(false);
    expect(isMenuEditTarget({ scope: 'category' })).toBe(false);
    expect(isMenuEditTarget({ scope: 'items', names: [] })).toBe(false);
    expect(isMenuEditTarget({ scope: 'name_contains' })).toBe(false);
  });

  it('rejects a non-object or unrecognized scope', () => {
    expect(isMenuEditTarget(null)).toBe(false);
    expect(isMenuEditTarget('chai')).toBe(false);
    expect(isMenuEditTarget({ scope: 'nonsense' })).toBe(false);
  });
});

describe('isMenuEditAction', () => {
  const target = { scope: 'item' as const, name: 'Ras Malai' };

  it('accepts a well-formed set_price action', () => {
    expect(isMenuEditAction({ type: 'set_price', target, price: 7.99 })).toBe(true);
  });

  it('rejects set_price with a non-positive price', () => {
    expect(isMenuEditAction({ type: 'set_price', target, price: 0 })).toBe(false);
    expect(isMenuEditAction({ type: 'set_price', target, price: -5 })).toBe(false);
  });

  it('accepts a well-formed adjust_price action, increase and decrease, fixed and percentage', () => {
    expect(
      isMenuEditAction({ type: 'adjust_price', target, adjustment: { direction: 'increase', amount: { kind: 'fixed', value: 1 } } }),
    ).toBe(true);
    expect(
      isMenuEditAction({ type: 'adjust_price', target, adjustment: { direction: 'decrease', amount: { kind: 'percentage', value: 5 } } }),
    ).toBe(true);
  });

  it('rejects adjust_price with a percentage amount at or above 100', () => {
    expect(
      isMenuEditAction({ type: 'adjust_price', target, adjustment: { direction: 'increase', amount: { kind: 'percentage', value: 100 } } }),
    ).toBe(false);
  });

  it('rejects adjust_price with an invalid direction', () => {
    expect(
      isMenuEditAction({ type: 'adjust_price', target, adjustment: { direction: 'sideways', amount: { kind: 'fixed', value: 1 } } }),
    ).toBe(false);
  });

  it('accepts a well-formed rename_item action', () => {
    expect(isMenuEditAction({ type: 'rename_item', target, name: 'Rasmalai Deluxe' })).toBe(true);
  });

  it('rejects rename_item with a blank name', () => {
    expect(isMenuEditAction({ type: 'rename_item', target, name: '   ' })).toBe(false);
  });

  it('accepts update_description with an empty string (clearing the description)', () => {
    expect(isMenuEditAction({ type: 'update_description', target, description: '' })).toBe(true);
  });

  it('accepts a well-formed move_category action', () => {
    expect(isMenuEditAction({ type: 'move_category', target, toCategoryName: 'Desserts' })).toBe(true);
  });

  it('rejects move_category with a blank destination', () => {
    expect(isMenuEditAction({ type: 'move_category', target, toCategoryName: '' })).toBe(false);
  });

  it('accepts a well-formed set_availability action, true and false', () => {
    expect(isMenuEditAction({ type: 'set_availability', target, available: true })).toBe(true);
    expect(isMenuEditAction({ type: 'set_availability', target, available: false })).toBe(true);
  });

  it('accepts a well-formed set_tag action for each tag', () => {
    expect(isMenuEditAction({ type: 'set_tag', target, tag: 'featured', enabled: true })).toBe(true);
    expect(isMenuEditAction({ type: 'set_tag', target, tag: 'chef_special', enabled: false })).toBe(true);
    expect(isMenuEditAction({ type: 'set_tag', target, tag: 'popular', enabled: true })).toBe(true);
  });

  it('rejects set_tag with an unrecognized tag', () => {
    expect(isMenuEditAction({ type: 'set_tag', target, tag: 'trending', enabled: true })).toBe(false);
  });

  it('rejects an action with an invalid target', () => {
    expect(isMenuEditAction({ type: 'set_price', target: { scope: 'item' }, price: 5 })).toBe(false);
  });

  it('rejects a non-object value and an unrecognized action type', () => {
    expect(isMenuEditAction('chai')).toBe(false);
    expect(isMenuEditAction({ type: 'do_something_else', target })).toBe(false);
  });
});
