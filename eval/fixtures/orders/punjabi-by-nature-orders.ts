import type { OrdersFixture } from '../../runner/types';
import { punjabiByNature } from '../restaurants/punjabi-by-nature';

// Synthetic but realistic order history for revenue_intelligence golden
// conversations — timestamps are relative to Date.now() at import time (not
// hardcoded dates) so the fixture doesn't silently go stale/out-of-window as
// real time passes, matching the 30-day trailing-window convention every
// analytics tool uses (lib/restaurant-planner/tools/analytics.ts).
//
// Deliberate signal built into this data:
//   - Desserts (ras-malai, halwa) appear in several orders, with ZERO
//     item-level coverage on either (both special_enabled:false in the menu
//     fixture) -> a real, high-confidence increase_dessert_sales opportunity.
//   - Cardamom Chai + Ras Malai are co-purchased together 6 times -> a real,
//     high-confidence (>=5 threshold) increase_average_order_value pairing.
//   - order_origin is a realistic ~70/30 QR/direct split, for a real
//     (non-fabricated) increase_qr_adoption answer.
//   - 22 total completed orders clears both MIN_ORDERS_FOR_ANY_OPPORTUNITY
//     (5) and MIN_ORDERS_FOR_FULL_CONFIDENCE (20), so confidence values in
//     these golden conversations reflect the real per-goal rule, not the
//     thin-data cap.

const DAY_MS = 24 * 60 * 60 * 1000;
function daysAgo(n: number, hourUtc: number): string {
  const d = new Date(Date.now() - n * DAY_MS);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
}

type OrderSpec = { id: string; daysAgo: number; hourUtc: number; origin: 'restaurant_qr' | 'direct_link'; items: Array<{ menuItemId: string; name: string; price: number; qty?: number }> };

const CHAI = { menuItemId: 'cardamom-chai', name: 'Cardamom Chai', price: 3 };
const RASMALAI = { menuItemId: 'ras-malai', name: 'Ras Malai', price: 6.99 };
const HALWA = { menuItemId: 'halwa', name: 'Halwa', price: 6.99 };
const TANDOORI = { menuItemId: 'tandoori-chicken', name: 'Tandoori Chicken', price: 22.99 };
const NAAN = { menuItemId: 'naan-kabab', name: 'Naan Kabab', price: 13.99 };

const orderSpecs: OrderSpec[] = [
  // Chai + Ras Malai co-purchased 6 times -> AOV pairing signal.
  { id: 'o1', daysAgo: 2, hourUtc: 19, origin: 'restaurant_qr', items: [CHAI, RASMALAI] },
  { id: 'o2', daysAgo: 4, hourUtc: 18, origin: 'restaurant_qr', items: [CHAI, RASMALAI] },
  { id: 'o3', daysAgo: 6, hourUtc: 20, origin: 'restaurant_qr', items: [CHAI, RASMALAI] },
  { id: 'o4', daysAgo: 8, hourUtc: 12, origin: 'direct_link', items: [CHAI, RASMALAI] },
  { id: 'o5', daysAgo: 10, hourUtc: 13, origin: 'restaurant_qr', items: [CHAI, RASMALAI] },
  { id: 'o6', daysAgo: 12, hourUtc: 19, origin: 'restaurant_qr', items: [CHAI, RASMALAI] },
  // Extra dessert-only orders (Halwa) -> dessert category revenue share.
  { id: 'o7', daysAgo: 3, hourUtc: 20, origin: 'restaurant_qr', items: [HALWA] },
  { id: 'o8', daysAgo: 5, hourUtc: 21, origin: 'direct_link', items: [HALWA] },
  { id: 'o9', daysAgo: 7, hourUtc: 18, origin: 'restaurant_qr', items: [HALWA, TANDOORI] },
  // Non-dessert orders, mixed dayparts, to give total-revenue denominator.
  { id: 'o10', daysAgo: 1, hourUtc: 19, origin: 'restaurant_qr', items: [TANDOORI, NAAN] },
  { id: 'o11', daysAgo: 9, hourUtc: 12, origin: 'direct_link', items: [TANDOORI] },
  { id: 'o12', daysAgo: 11, hourUtc: 13, origin: 'restaurant_qr', items: [NAAN] },
  { id: 'o13', daysAgo: 13, hourUtc: 18, origin: 'restaurant_qr', items: [TANDOORI, NAAN] },
  { id: 'o14', daysAgo: 14, hourUtc: 19, origin: 'restaurant_qr', items: [TANDOORI] },
  { id: 'o15', daysAgo: 15, hourUtc: 20, origin: 'direct_link', items: [NAAN] },
  { id: 'o16', daysAgo: 16, hourUtc: 12, origin: 'restaurant_qr', items: [TANDOORI] },
  { id: 'o17', daysAgo: 17, hourUtc: 21, origin: 'restaurant_qr', items: [NAAN] },
  { id: 'o18', daysAgo: 18, hourUtc: 19, origin: 'direct_link', items: [TANDOORI] },
  { id: 'o19', daysAgo: 19, hourUtc: 18, origin: 'restaurant_qr', items: [NAAN] },
  { id: 'o20', daysAgo: 20, hourUtc: 13, origin: 'restaurant_qr', items: [TANDOORI, NAAN] },
  { id: 'o21', daysAgo: 21, hourUtc: 12, origin: 'restaurant_qr', items: [TANDOORI] },
  { id: 'o22', daysAgo: 22, hourUtc: 20, origin: 'direct_link', items: [NAAN] },
];

const orders = orderSpecs.map((spec) => ({
  id: spec.id,
  restaurant_id: punjabiByNature.id,
  status: 'completed',
  created_at: daysAgo(spec.daysAgo, spec.hourUtc),
  subtotal: spec.items.reduce((sum, i) => sum + i.price * (i.qty ?? 1), 0),
  order_origin: spec.origin,
}));

const orderItems = orderSpecs.flatMap((spec) =>
  spec.items.map((i, idx) => ({
    id: `${spec.id}-item-${idx}`,
    order_id: spec.id,
    menu_item_id: i.menuItemId,
    name_snapshot: i.name,
    quantity: i.qty ?? 1,
    line_total: i.price * (i.qty ?? 1),
  })),
);

export const punjabiByNatureOrders: OrdersFixture = {
  orders,
  orderItems,
  promotions: [],
  promotionRewards: [],
  couponRedemptions: [],
};
