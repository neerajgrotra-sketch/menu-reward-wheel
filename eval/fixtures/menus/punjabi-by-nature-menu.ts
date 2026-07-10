import type { MenuFixture, MenuAssignmentFixture, MenuFixtureCategory, MenuFixtureItem, MenuFixtureMenu } from '../../runner/types';
import { punjabiByNature } from '../restaurants/punjabi-by-nature';

// Real menu shape, pulled via Supabase MCP (2026-07-09) — the same data
// lib/menu-discount-actions/resolve.test.ts already uses inline as "real
// snapshot pulled from the live restaurant." Promoted here into a shared,
// named fixture so eval golden conversations and future tests can both
// reference it instead of re-copying it inline. Category/item ids are the
// real UUIDs/slugs from that pull; menu_id/restaurant_id are the real
// Punjabi By Nature ids from the eval restaurant fixture.

const MENU_ID = 'e8f5a001-0000-4000-8000-000000000001';

const menus: MenuFixtureMenu[] = [
  { id: MENU_ID, name: 'Main Menu', menu_type: 'standard', description: null, active: true },
];

const assignments: MenuAssignmentFixture[] = [
  { restaurant_id: punjabiByNature.id, menu_id: MENU_ID, active: true, display_order: 0, created_at: '2026-04-28T00:22:56.868Z' },
];

const categories: MenuFixtureCategory[] = [
  { id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', menu_id: MENU_ID, name: 'Breakfast', slug: 'breakfast', display_order: 10, active: true },
  { id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', menu_id: MENU_ID, name: 'Lunch', slug: 'lunch', display_order: 20, active: true },
  { id: 'a63ff226-9888-43d8-b729-c87a290ee88f', menu_id: MENU_ID, name: 'Dinner', slug: 'dinner', display_order: 30, active: true },
  { id: 'eaf12d60-62b9-4579-9db4-81e04e468ec5', menu_id: MENU_ID, name: 'Kids Special', slug: 'kids-special', display_order: 40, active: true },
  { id: '11e8bf00-975e-48b4-a2b0-0bd25230c3ba', menu_id: MENU_ID, name: 'Desserts', slug: 'desserts', display_order: 50, active: true },
];

function item(overrides: Partial<MenuFixtureItem>): MenuFixtureItem {
  return {
    id: 'item-id',
    category_id: categories[0].id,
    restaurant_id: punjabiByNature.id,
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
  item({ id: 'french-toast', name: 'French toast', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 11.99 }),
  item({ id: 'cardamom-chai', name: 'Cardamom Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 20, special_no_expiry: true }),
  item({ id: 'mint-tea', name: 'Mint Tea', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 50, special_no_expiry: true }),
  item({ id: 'kashmiri-chai', name: 'Kashmiri Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3, special_enabled: true, special_type: 'percentage', special_percent: 20, special_no_expiry: true }),
  item({ id: 'halwa-poori', name: 'Halwa Poori', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 11.99 }),
  item({ id: 'lassi', name: 'Lassi', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 6.99 }),
  item({ id: 'veg-pakora', name: 'Veg. Pakora', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 5.99, special_enabled: true, special_type: 'percentage', special_percent: 30, special_no_expiry: true }),
  item({ id: 'masala-chai', name: 'Masala Chai', category_id: '0ebe5bc8-e0e2-40fd-8bf7-b0d5983f46f5', price: 3.99 }),
  item({ id: 'tandoori-chicken', name: 'Tandoori Chicken', category_id: 'a2bb7ea7-71da-4b61-9fd7-bce11441316b', price: 22.99, special_enabled: true, special_type: 'percentage', special_percent: 20, special_no_expiry: true }),
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

export const punjabiByNatureMenu: MenuFixture = { menus, assignments, categories, items };
