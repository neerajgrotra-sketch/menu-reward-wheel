import type { MenuFixture, MenuAssignmentFixture, MenuFixtureCategory, MenuFixtureItem, MenuFixtureMenu } from '../../runner/types';
import { smallCafe } from '../restaurants/small-cafe';

// Synthetic edge-case fixture: an empty category (Specials — no items at
// all), zero item-level coverage anywhere, and one deliberately
// name-ambiguous pair (two "Latte" variants) alongside one unambiguous item.

const MENU_ID = 'eval-fixture-small-cafe-menu';

const menus: MenuFixtureMenu[] = [{ id: MENU_ID, name: 'Cafe Menu', menu_type: 'standard', description: null, active: true }];

const assignments: MenuAssignmentFixture[] = [
  { restaurant_id: smallCafe.id, menu_id: MENU_ID, active: true, display_order: 0, created_at: '2026-01-01T00:00:00.000Z' },
];

const categories: MenuFixtureCategory[] = [
  { id: 'sc-cat-drinks', menu_id: MENU_ID, name: 'Drinks', slug: 'drinks', display_order: 10, active: true },
  { id: 'sc-cat-desserts', menu_id: MENU_ID, name: 'Desserts', slug: 'desserts', display_order: 20, active: true },
  { id: 'sc-cat-specials', menu_id: MENU_ID, name: 'Specials', slug: 'specials', display_order: 30, active: true }, // deliberately empty
];

function item(overrides: Partial<MenuFixtureItem>): MenuFixtureItem {
  return {
    id: 'item-id',
    category_id: categories[0].id,
    restaurant_id: smallCafe.id,
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
    active: true,
    deleted_at: null,
    ...overrides,
  };
}

const items: MenuFixtureItem[] = [
  item({ id: 'sc-vanilla-latte', name: 'Vanilla Latte', category_id: 'sc-cat-drinks', price: 4.5 }),
  item({ id: 'sc-caramel-latte', name: 'Caramel Latte', category_id: 'sc-cat-drinks', price: 4.75 }),
  item({ id: 'sc-drip-coffee', name: 'Drip Coffee', category_id: 'sc-cat-drinks', price: 2.5 }),
  item({ id: 'sc-brownie', name: 'Brownie', category_id: 'sc-cat-desserts', price: 3.5 }),
];

export const smallCafeMenu: MenuFixture = { menus, assignments, categories, items };
