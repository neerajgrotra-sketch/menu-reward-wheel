import { describe, it, expect } from 'vitest';
import { formatItemLine } from './context';
import type { MenuItemRow } from '@/lib/menu/queries';

function menuItem(overrides: Partial<MenuItemRow>): MenuItemRow {
  return {
    id: 'item-id',
    category_id: 'category-id',
    restaurant_id: 'restaurant-id',
    name: 'Naan Kabab',
    description: null,
    image_url: null,
    price: 10.99,
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

describe('formatItemLine (menu snapshot price fix)', () => {
  it('includes the item price so plain price questions are answerable', () => {
    expect(formatItemLine(menuItem({ name: 'Naan Kabab', price: 10.99 }))).toBe('Naan Kabab $10.99');
  });

  it('labels an item with no price set rather than fabricating one', () => {
    expect(formatItemLine(menuItem({ price: null }))).toBe('Naan Kabab price not set');
  });

  it('shows the discounted price for an active percentage special', () => {
    const line = formatItemLine(
      menuItem({ name: 'Kashmiri Chai', price: 5.99, special_enabled: true, special_type: 'percentage', special_percent: 20 }),
    );
    expect(line).toBe('Kashmiri Chai $5.99 (on special: $4.79)');
  });

  it('shows the discounted price for an active fixed-price special', () => {
    const line = formatItemLine(
      menuItem({ name: 'Butter Chicken', price: 15.99, special_enabled: true, special_type: 'fixed_price', special_price: 12.99 }),
    );
    expect(line).toBe('Butter Chicken $15.99 (on special: $12.99)');
  });

  it('falls back to the plain price line when special is enabled but the discount amount cannot be computed', () => {
    const line = formatItemLine(menuItem({ price: 10.99, special_enabled: true, special_type: 'percentage', special_percent: null }));
    expect(line).toBe('Naan Kabab $10.99');
  });
});
