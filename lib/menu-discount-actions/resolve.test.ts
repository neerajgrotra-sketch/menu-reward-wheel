import { describe, it, expect } from 'vitest';
import { resolveMenuDiscountAction, isResolvableAction, type ResolvableAction } from './resolve';
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
  item({ id: 'chai', name: 'Cardamom Chai', category_id: 'cat-breakfast', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 20, special_no_expiry: true }),
  item({ id: 'lassi', name: 'Lassi', category_id: 'cat-breakfast', price: 6.99, special_enabled: false }),
  item({ id: 'mint-tea', name: 'Mint Tea', category_id: 'cat-breakfast', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 50, special_no_expiry: true }),
  item({ id: 'gulab-jamun', name: 'Gulab Jamun', category_id: 'cat-desserts', price: 5.99, special_enabled: false }),
  item({ id: 'rasmalai', name: 'Rasmalai', category_id: 'cat-desserts', price: 6.99, special_enabled: true, special_type: 'percentage', special_percent: 15, special_no_expiry: true }),
];

describe('resolveMenuDiscountAction', () => {
  it('clears discounts scoped to a category, skipping items with no active discount', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'category', name: 'desserts' } };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id)).toEqual(['rasmalai']); // gulab-jamun excluded, no discount to clear
    expect(result.items[0].after.specialEnabled).toBe(false);
  });

  it('clears discounts scoped to all products', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'all' } };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id).sort()).toEqual(['chai', 'mint-tea', 'rasmalai'].sort());
  });

  it('applies a new percentage discount to a single item resolved by name', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Lassi' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'lassi',
      after: { specialEnabled: true, specialType: 'percentage', specialPercent: 20 },
    });
  });

  it('returns unresolved with a clear reason when no category matches', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'category', name: 'Beverages' } };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/no category found/i);
  });

  it('returns unresolved with candidates when an item name is ambiguous', () => {
    const ambiguousItems = [...items, item({ id: 'iced-chai', name: 'Iced Chai', category_id: 'cat-breakfast' })];
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'item', name: 'chai' } };
    const result = resolveMenuDiscountAction(action, categories, ambiguousItems);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.candidates).toEqual(expect.arrayContaining(['Cardamom Chai', 'Iced Chai']));
  });

  it('rejects a fixed-price "discount" that is not actually lower than the current price', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'item', name: 'Lassi' },
      discount: { discountType: 'fixed_price', value: 9.99, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.reason).toMatch(/not lower than the current price/i);
  });

  it('returns unresolved when clearing a discount on an item that has none', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'item', name: 'Lassi' } };
    const result = resolveMenuDiscountAction(action, categories, items);
    expect(result.resolved).toBe(false);
  });
});

// Real snapshot pulled from the live "Punjabi By Nature" restaurant via
// Supabase MCP (2026-07-09) — not synthetic fixtures, so these cases catch
// anything the hand-written fixtures above might miss on real-shaped data.
describe('resolveMenuDiscountAction against a real menu snapshot', () => {
  const realCategories: MenuCategoryRow[] = [
    { id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', menu_id: 'm', name: 'Breakfast', slug: 'breakfast', display_order: 10 },
    { id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', menu_id: 'm', name: 'Lunch', slug: 'lunch', display_order: 20 },
    { id: 'a63ff226-9888-43d8-b729-c87a290ee88f', menu_id: 'm', name: 'Dinner', slug: 'dinner', display_order: 30 },
    { id: 'eaf12d60-62b9-4579-9db4-81e04e468ec5', menu_id: 'm', name: 'Kids Special', slug: 'kids-special', display_order: 40 },
    { id: '11e8bf00-975e-48b4-a2b0-0bd25230c3ba', menu_id: 'm', name: 'Desserts', slug: 'desserts', display_order: 50 },
  ];

  const realItems: MenuItemRow[] = [
    item({ id: 'french-toast', name: 'French toast', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 11.99 }),
    item({ id: 'cardamom-chai', name: 'Cardamom Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 20 }),
    item({ id: 'mint-tea', name: 'Mint Tea', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 50 }),
    item({ id: 'kashmiri-chai', name: 'Kashmiri Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 20 }),
    item({ id: 'halwa-poori', name: 'Halwa Poori', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 11.99 }),
    item({ id: 'lassi', name: 'Lassi', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 6.99 }),
    item({ id: 'veg-pakora', name: 'Veg. Pakora', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 5.99, special_enabled: true, special_type: 'percentage', special_percent: 30 }),
    item({ id: 'masala-chai', name: 'Masala Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3.99 }),
    item({ id: 'tandoori-chicken', name: 'Tandoori Chicken', category_id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', price: 22.99, special_enabled: true, special_type: 'percentage', special_percent: 20 }),
    item({ id: 'haryali-chicken', name: 'Haryali Chicken', category_id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', price: 24.99 }),
    item({ id: 'naan-kabab', name: 'Naan Kabab', category_id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', price: 13.99 }),
    item({ id: 'palak-paneer', name: 'Palak Paneer', category_id: 'a63ff226-9888-43d8-b729-c87a290ee88f', price: 25.99 }),
    item({ id: 'kadhi', name: 'Kadhi', category_id: 'a63ff226-9888-43d8-b729-c87a290ee88f', price: 24.99 }),
    item({ id: 'sheesh-kabab', name: 'Sheesh Kabab', category_id: 'a63ff226-9888-43d8-b729-c87a290ee88f', price: 23.99 }),
    item({ id: 'chocolate-pizza', name: 'Chocolate Pizza', category_id: 'eaf12d60-62b9-4579-9db4-81e04e468ec5', price: 12.99 }),
    item({ id: 'mini-idlis', name: 'Mini idlis', category_id: 'eaf12d60-62b9-4579-9db4-81e04e468ec5', price: 5.99 }),
    item({ id: 'ras-malai', name: 'Ras Malai', category_id: '11e8bf00-975e-48b4-a2b0-0bd25230c3ba', price: 6.99 }),
    item({ id: 'halwa', name: 'Halwa', category_id: '11e8bf00-975e-48b4-a2b0-0bd25230c3ba', price: 6.99 }),
  ];

  it('"remove discounts from desserts" correctly finds nothing to do — neither dessert has an active discount today', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'category', name: 'desserts' } };
    const result = resolveMenuDiscountAction(action, realCategories, realItems);
    expect(result.resolved).toBe(false);
  });

  it('"remove all discounts" resolves to exactly the 5 items currently on special', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'all' } };
    const result = resolveMenuDiscountAction(action, realCategories, realItems);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id).sort()).toEqual(
      ['cardamom-chai', 'mint-tea', 'kashmiri-chai', 'veg-pakora', 'tandoori-chicken'].sort(),
    );
  });

  it('"chai" is genuinely ambiguous across 3 real items — surfaces candidates rather than guessing', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'item', name: 'chai' } };
    const result = resolveMenuDiscountAction(action, realCategories, realItems);
    expect(result.resolved).toBe(false);
    if (result.resolved) throw new Error('expected unresolved');
    expect(result.candidates).toEqual(
      expect.arrayContaining(['Cardamom Chai', 'Kashmiri Chai', 'Masala Chai']),
    );
  });

  it('an exact single-item name still resolves even though it is a substring of others ("Kashmiri Chai")', () => {
    const action: ResolvableAction = { type: 'clear_discount', target: { scope: 'item', name: 'Kashmiri Chai' } };
    const result = resolveMenuDiscountAction(action, realCategories, realItems);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items.map((i) => i.id)).toEqual(['kashmiri-chai']);
  });

  it('applies a 20% breakfast-wide discount, skipping nothing (set_discount ignores current state)', () => {
    const action: ResolvableAction = {
      type: 'set_discount',
      target: { scope: 'category', name: 'Breakfast' },
      discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
    };
    const result = resolveMenuDiscountAction(action, realCategories, realItems);
    expect(result.resolved).toBe(true);
    if (!result.resolved) throw new Error('expected resolved');
    expect(result.items).toHaveLength(8); // every Breakfast item, discounted or not
  });
});

describe('isResolvableAction', () => {
  it('accepts a well-formed clear_discount action', () => {
    expect(isResolvableAction({ type: 'clear_discount', target: { scope: 'all' } })).toBe(true);
  });

  it('accepts a well-formed set_discount action', () => {
    expect(
      isResolvableAction({
        type: 'set_discount',
        target: { scope: 'category', name: 'Desserts' },
        discount: { discountType: 'percentage', value: 20, specialStartAt: null, specialEndAt: null, specialNoExpiry: true },
      }),
    ).toBe(true);
  });

  it('rejects a target missing a name for scope=item', () => {
    expect(isResolvableAction({ type: 'clear_discount', target: { scope: 'item' } })).toBe(false);
  });

  it('rejects a set_discount action missing its discount payload', () => {
    expect(isResolvableAction({ type: 'set_discount', target: { scope: 'all' } })).toBe(false);
  });

  it('rejects garbage input', () => {
    expect(isResolvableAction(null)).toBe(false);
    expect(isResolvableAction('nope')).toBe(false);
    expect(isResolvableAction({})).toBe(false);
  });
});
