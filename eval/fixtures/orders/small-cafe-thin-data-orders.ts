import type { OrdersFixture } from '../../runner/types';
import { smallCafe } from '../restaurants/small-cafe';

// Deliberately thin — only 2 completed orders, below
// MIN_ORDERS_FOR_ANY_OPPORTUNITY (5). Exists to prove the thin-data gate
// itself: generateRevenueOpportunities must return an honest
// "not enough order history" answer for every goal, never a fabricated
// opportunity, when evidence is this sparse.

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number): string {
  return new Date(Date.now() - n * DAY_MS).toISOString();
}

const orders = [
  { id: 'thin-o1', restaurant_id: smallCafe.id, status: 'completed', created_at: daysAgo(2), subtotal: 4.5, order_origin: 'restaurant_qr' },
  { id: 'thin-o2', restaurant_id: smallCafe.id, status: 'completed', created_at: daysAgo(5), subtotal: 2.5, order_origin: 'direct_link' },
];

const orderItems = [
  { id: 'thin-o1-item-0', order_id: 'thin-o1', menu_item_id: 'sc-vanilla-latte', name_snapshot: 'Vanilla Latte', quantity: 1, line_total: 4.5 },
  { id: 'thin-o2-item-0', order_id: 'thin-o2', menu_item_id: 'sc-drip-coffee', name_snapshot: 'Drip Coffee', quantity: 1, line_total: 2.5 },
];

export const smallCafeThinDataOrders: OrdersFixture = { orders, orderItems, promotions: [], promotionRewards: [], couponRedemptions: [] };
