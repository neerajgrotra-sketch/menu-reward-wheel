import { describe, it, expect } from 'vitest';
import { resolveMenuEditAction, isResolvableMenuEditAction } from './resolve';
import type { MenuEditAction } from '@/lib/intelligence/actions/menu-edit-schema';
import type { MenuCategoryRow, MenuItemRow } from '@/lib/menu/queries';

const categories: MenuCategoryRow[] = [
  { id: 'cat-breakfast', menu_id: 'menu-1', name: 'Breakfast', slug: 'breakfast', display_order: 10 },
  { id: 'cat-desserts', menu_id: 'menu-1', name: 'Desserts', slug: 'desserts', display_order: 20 },
];

function item(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: 'item-id',
    category_id: 'cat-breakfast',
    restaurant_id: 'r-1',
    name: 'Item',
    description: null,
    image_url: null,
    price: 5,
    is_featured: false,
    available: true,
    tags: [],
    display_order: 0,
    special_enabled: false,
    special_type: null,
    special_percent: null,
    special_price: null,
    special_start_at: null,
    special_end_at: null,
    special_no_expiry: false,
    ...overrides,
  };
}

const items: MenuItemRow[] = [
  item({ id: 'chai', name: 'Cardamom Chai', category_id: 'cat-breakfast', price: 3 }),
  item({ id: 'lassi', name: 'Lassi', category_id: 'cat-breakfast', price: 6.99 }),
  item({ id: 'gulab-jamun', name: 'Gulab Jamun', category_id: 'cat-desserts', price: 5.99 }),
  item({ id: 'rasmalai', name: 'Ras Malai', category_id: 'cat-desserts', price: 6.99, is_featured: false, tags: ['chef_special'] }),
  item({ id: 'halwa', name: 'Halwa', category_id: 'cat-desserts', price: 4.5, description: 'Old description' }),
];

describe('resolveMenuEditAction — set_price', () => {
  it('sets an exact price on a single item resolved by name', () => {
    const action: MenuEditAction = { type: 'set_price', target: { scope: 'item', name: 'Ras Malai' }, price: 7.99 };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'rasmalai', before: { price: 6.99 }, after: { price: 7.99 } });
  });

  it('rounds an exact price to 2 decimals', () => {
    const action: MenuEditAction = { type: 'set_price', target: { scope: 'item', name: 'Ras Malai' }, price: 7.999 };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].after.price).toBe(8);
  });

  it('an increase to the same price as today is still resolved — a no-op is caught at apply time, not here', () => {
    const action: MenuEditAction = { type: 'set_price', target: { scope: 'item', name: 'Ras Malai' }, price: 6.99 };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(true);
  });
});

describe('resolveMenuEditAction — adjust_price', () => {
  it('increases every appetizer-category item by a fixed amount', () => {
    const action: MenuEditAction = {
      type: 'adjust_price',
      target: { scope: 'category', name: 'Breakfast' },
      adjustment: { direction: 'increase', amount: { kind: 'fixed', value: 1 } },
    };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.after.price).sort()).toEqual([4, 7.99].sort());
  });

  it('decreases a single item by a percentage', () => {
    const action: MenuEditAction = {
      type: 'adjust_price',
      target: { scope: 'item', name: 'Halwa' },
      adjustment: { direction: 'decrease', amount: { kind: 'percentage', value: 10 } },
    };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].after.price).toBe(4.05);
  });

  it('filters out an item whose price is null', () => {
    const withNullPrice = [...items, item({ id: 'mystery', name: 'Mystery Item', category_id: 'cat-breakfast', price: null })];
    const action: MenuEditAction = {
      type: 'adjust_price',
      target: { scope: 'name_contains', query: 'mystery' },
      adjustment: { direction: 'increase', amount: { kind: 'fixed', value: 1 } },
    };
    const result = resolveMenuEditAction(action, categories, withNullPrice);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/price that can be adjusted/i);
  });

  it('rejects a decrease that would take every matching item to $0 or below', () => {
    const action: MenuEditAction = {
      type: 'adjust_price',
      target: { scope: 'item', name: 'Cardamom Chai' },
      adjustment: { direction: 'decrease', amount: { kind: 'fixed', value: 10 } },
    };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
  });
});

describe('resolveMenuEditAction — rename_item / update_description', () => {
  it('renames a single item', () => {
    const action: MenuEditAction = { type: 'rename_item', target: { scope: 'item', name: 'Ras Malai' }, name: 'Rasmalai Deluxe' };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0]).toMatchObject({ before: { name: 'Ras Malai' }, after: { name: 'Rasmalai Deluxe' } });
  });

  it('trims whitespace-only description to null', () => {
    const action: MenuEditAction = { type: 'update_description', target: { scope: 'item', name: 'Halwa' }, description: '   ' };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].after.description).toBeNull();
  });
});

describe('resolveMenuEditAction — move_category', () => {
  it('moves a single item into a real destination category', () => {
    const action: MenuEditAction = { type: 'move_category', target: { scope: 'item', name: 'Ras Malai' }, toCategoryName: 'Breakfast' };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0]).toMatchObject({ before: { category_id: 'cat-desserts' }, after: { category_id: 'cat-breakfast' } });
  });

  it('returns unresolved with a clear reason when the destination category does not exist', () => {
    const action: MenuEditAction = { type: 'move_category', target: { scope: 'item', name: 'Ras Malai' }, toCategoryName: 'Beverages' };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/no category found/i);
  });

  it('returns unresolved with candidates when the destination category name is ambiguous', () => {
    const ambiguousCategories = [...categories, { id: 'cat-desserts-2', menu_id: 'menu-1', name: 'Desserts Extra', slug: 'desserts-extra', display_order: 25 }];
    const action: MenuEditAction = { type: 'move_category', target: { scope: 'item', name: 'Ras Malai' }, toCategoryName: 'dessert' };
    const result = resolveMenuEditAction(action, ambiguousCategories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.candidates).toEqual(expect.arrayContaining(['Desserts', 'Desserts Extra']));
  });

  it('resolves a no-op move (destination equals current category) — apply-time skip handles it, not a resolve-time error', () => {
    const action: MenuEditAction = { type: 'move_category', target: { scope: 'item', name: 'Ras Malai' }, toCategoryName: 'Desserts' };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].before.category_id).toBe(result.items[0].after.category_id);
  });
});

describe('resolveMenuEditAction — set_availability / set_tag', () => {
  it('hides a single item', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'item', name: 'Ras Malai' }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0]).toMatchObject({ before: { available: true }, after: { available: false } });
  });

  it('turns on the dedicated is_featured column for tag "featured"', () => {
    const action: MenuEditAction = { type: 'set_tag', target: { scope: 'item', name: 'Ras Malai' }, tag: 'featured', enabled: true };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0]).toMatchObject({ before: { is_featured: false }, after: { is_featured: true } });
  });

  it('adds a tag string for "popular" without disturbing an existing "chef_special" tag', () => {
    const action: MenuEditAction = { type: 'set_tag', target: { scope: 'item', name: 'Ras Malai' }, tag: 'popular', enabled: true };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].after.tags).toEqual(expect.arrayContaining(['chef_special', 'popular']));
  });

  it('removes a tag string when disabling', () => {
    const action: MenuEditAction = { type: 'set_tag', target: { scope: 'item', name: 'Ras Malai' }, tag: 'chef_special', enabled: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items[0].after.tags).not.toContain('chef_special');
  });
});

describe('resolveMenuEditAction — target scopes and matchKind (shared with menu_pricing)', () => {
  it('returns unresolved with a clear reason when no category matches', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'category', name: 'Beverages' }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/no category found/i);
  });

  it('returns unresolved with candidates when an item name is ambiguous', () => {
    const ambiguousItems = [...items, item({ id: 'iced-chai', name: 'Iced Chai', category_id: 'cat-breakfast' })];
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'item', name: 'chai' }, available: false };
    const result = resolveMenuEditAction(action, categories, ambiguousItems);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.candidates).toEqual(expect.arrayContaining(['Cardamom Chai', 'Iced Chai']));
  });

  it('resolves an explicit "items" selection to exactly those items, matchKind items_explicit', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'items', names: ['Ras Malai', 'Halwa'] }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id).sort()).toEqual(['halwa', 'rasmalai'].sort());
    expect(result.matchKind).toBe('items_explicit');
  });

  it('resolves "all" to every item, matchKind all', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'all' }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items).toHaveLength(items.length);
    expect(result.matchKind).toBe('all');
  });

  it('respects a category exclude list', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'category', name: 'Desserts', exclude: ['Halwa'] }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id)).not.toContain('halwa');
  });

  it('reports item_exact for an exact single-item match', () => {
    const action: MenuEditAction = { type: 'set_availability', target: { scope: 'item', name: 'Ras Malai' }, available: false };
    const result = resolveMenuEditAction(action, categories, items);
    if (result.resolved) expect(result.matchKind).toBe('item_exact');
  });
});

describe('Bulk Edit Safety — rename_item/update_description require explicit confirmation for >1 item', () => {
  it('blocks a category-scoped rename that would match multiple items, listing them as candidates', () => {
    const action: MenuEditAction = { type: 'rename_item', target: { scope: 'category', name: 'Desserts' }, name: 'Chef Special' };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/identically to all 3 matched items/i);
    expect(result.reason).toMatch(/Apply to all/i);
    expect(result.candidates).toEqual(expect.arrayContaining(['Gulab Jamun', 'Ras Malai', 'Halwa']));
  });

  it('blocks an "all"-scoped update_description that would match multiple items', () => {
    const action: MenuEditAction = { type: 'update_description', target: { scope: 'all' }, description: 'Same for everyone' };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/identically to all 5 matched items/i);
  });

  it('blocks an explicit multi-item "items" scope too — the gate is about item count, not scope type', () => {
    const action: MenuEditAction = { type: 'rename_item', target: { scope: 'items', names: ['Gulab Jamun', 'Halwa'] }, name: 'Sweet Treat' };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(false);
  });

  it('does NOT block a single-item rename — no confirmation needed for one item', () => {
    const action: MenuEditAction = { type: 'rename_item', target: { scope: 'item', name: 'Ras Malai' }, name: 'Rasmalai Deluxe' };
    const result = resolveMenuEditAction(action, categories, items);
    expect(result.resolved).toBe(true);
  });

  it('does NOT block a multi-item price/availability/tag action — same treatment per item is correct bulk semantics there', () => {
    const price: MenuEditAction = { type: 'set_price', target: { scope: 'category', name: 'Desserts' }, price: 5.99 };
    const availability: MenuEditAction = { type: 'set_availability', target: { scope: 'category', name: 'Desserts' }, available: false };
    const tag: MenuEditAction = { type: 'set_tag', target: { scope: 'category', name: 'Desserts' }, tag: 'featured', enabled: true };
    expect(resolveMenuEditAction(price, categories, items).resolved).toBe(true);
    expect(resolveMenuEditAction(availability, categories, items).resolved).toBe(true);
    expect(resolveMenuEditAction(tag, categories, items).resolved).toBe(true);
  });

  it('proceeds normally once bulkConfirmed:true is passed — the TargetSelector "Apply to all" / apply-route / preview-route re-resolve path', () => {
    const action: MenuEditAction = { type: 'rename_item', target: { scope: 'category', name: 'Desserts' }, name: 'Chef Special' };
    const result = resolveMenuEditAction(action, categories, items, { bulkConfirmed: true });
    expect(result.resolved).toBe(true);
    if (result.resolved) expect(result.items).toHaveLength(3);
  });

  it('bulkConfirmed:true against an explicit narrowed items list (the actual TargetSelector round trip) resolves to exactly the selected items', () => {
    const action: MenuEditAction = { type: 'update_description', target: { scope: 'items', names: ['Gulab Jamun', 'Halwa'] }, description: 'Shared blurb' };
    const result = resolveMenuEditAction(action, categories, items, { bulkConfirmed: true });
    expect(result.resolved).toBe(true);
    if (result.resolved) expect(result.items.map((i) => i.name).sort()).toEqual(['Gulab Jamun', 'Halwa'].sort());
  });
});

describe('isResolvableMenuEditAction', () => {
  it('accepts a well-formed action', () => {
    expect(isResolvableMenuEditAction({ type: 'set_price', target: { scope: 'all' }, price: 5 })).toBe(true);
  });

  it('rejects a malformed target', () => {
    expect(isResolvableMenuEditAction({ type: 'set_price', target: { scope: 'item' }, price: 5 })).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(isResolvableMenuEditAction(null)).toBe(false);
    expect(isResolvableMenuEditAction('nope')).toBe(false);
  });
});
