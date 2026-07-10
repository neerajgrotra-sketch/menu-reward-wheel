// Analytics Tools — read-only evidence sources for the Revenue Intelligence
// Agent (lib/restaurant-planner/revenue-intelligence/). Every tool here
// answers exactly one real, restaurant-scoped question over orders/
// order_items/promotions/coupon_redemptions/menu_items — nothing here
// mutates anything (permission: 'read', mutating: false throughout). None of
// this duplicates existing business logic: dashboard-metrics/route.ts
// computes a handful of overlapping numbers but keeps all of its query logic
// inlined in the route (nothing exported/reusable), so these are new,
// dedicated queries, not copies.
//
// Fixed, documented assumptions (never silently baked in — surfaced in the
// opportunity reasoning that consumes them):
//   - "Trailing window" defaults to 30 days unless a tool's caller overrides it.
//   - Lunch/dinner daypart boundaries are fixed UTC-hour windows
//     (11:00–15:00 / 17:00–22:00) — there is no restaurant-level timezone
//     column anywhere in the schema (see getRestaurantTimezone's own header
//     in restaurant.ts, a documented stub that always returns null).

import type { ToolDefinition, ToolContext } from './types';
import { ok } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

type CompletedOrder = { id: string; created_at: string; subtotal: number; order_origin: string };

async function fetchCompletedOrdersSince(ctx: ToolContext, sinceIso: string, untilIso?: string): Promise<CompletedOrder[]> {
  let query = ctx.supabase
    .from('orders')
    .select('id, created_at, subtotal, order_origin')
    .eq('restaurant_id', ctx.restaurantId)
    .eq('status', 'completed')
    .gte('created_at', sinceIso);
  if (untilIso) query = query.lt('created_at', untilIso);
  const { data } = await query;
  // created_at is nullable in the generated schema type (no DB-level NOT
  // NULL) even though the column always has a DEFAULT now() in practice —
  // filtered defensively rather than trusted, same posture as everything
  // else in this file that never assumes a "should always be set" value.
  return (data ?? [])
    .filter((o) => o.created_at !== null)
    .map((o) => ({ id: o.id, created_at: o.created_at as string, subtotal: o.subtotal, order_origin: o.order_origin }));
}

async function fetchCompletedOrders(ctx: ToolContext, windowDays: number): Promise<CompletedOrder[]> {
  return fetchCompletedOrdersSince(ctx, new Date(Date.now() - windowDays * DAY_MS).toISOString());
}

export type CategorySales = { categoryId: string; categoryName: string; revenue: number; quantity: number };

// Shared by getCategorySalesBreakdown and getOrdersByDaypart (which needs
// the same aggregation scoped to just its daypart's order ids) — one
// implementation, not two copies of the same join.
async function aggregateCategorySales(ctx: ToolContext, orderIds: string[]): Promise<CategorySales[]> {
  if (orderIds.length === 0) return [];

  const { data: orderItemRows } = await ctx.supabase.from('order_items').select('menu_item_id, quantity, line_total').in('order_id', orderIds);
  const items = orderItemRows ?? [];
  const menuItemIds = Array.from(new Set(items.map((i) => i.menu_item_id).filter((id): id is string => id !== null)));
  if (menuItemIds.length === 0) return [];

  const { data: menuItemRows } = await ctx.supabase.from('menu_items').select('id, category_id').in('id', menuItemIds).eq('restaurant_id', ctx.restaurantId);
  const categoryIdByItemId = new Map((menuItemRows ?? []).map((m) => [m.id, m.category_id]));
  const categoryIds = Array.from(new Set((menuItemRows ?? []).map((m) => m.category_id).filter((id): id is string => id !== null)));
  if (categoryIds.length === 0) return [];

  const { data: categoryRows } = await ctx.supabase.from('menu_categories').select('id, name').in('id', categoryIds);
  const categoryNameById = new Map((categoryRows ?? []).map((c) => [c.id, c.name]));

  const totals = new Map<string, { revenue: number; quantity: number }>();
  for (const item of items) {
    if (!item.menu_item_id) continue;
    const categoryId = categoryIdByItemId.get(item.menu_item_id);
    if (!categoryId) continue;
    const agg = totals.get(categoryId) ?? { revenue: 0, quantity: 0 };
    agg.revenue += Number(item.line_total ?? 0);
    agg.quantity += item.quantity ?? 0;
    totals.set(categoryId, agg);
  }

  return Array.from(totals.entries())
    .map(([categoryId, agg]) => ({ categoryId, categoryName: categoryNameById.get(categoryId) ?? 'Unknown', ...agg }))
    .sort((a, b) => b.revenue - a.revenue);
}

export const getCategorySalesBreakdown: ToolDefinition<{ windowDays?: number }, CategorySales[]> = {
  name: 'getCategorySalesBreakdown',
  description: 'Revenue and quantity sold per menu category over a trailing window (default 30 days) of completed orders. Summing every returned row equals total order-item revenue for the window.',
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const orders = await fetchCompletedOrders(ctx, input.windowDays ?? 30);
    return ok(await aggregateCategorySales(ctx, orders.map((o) => o.id)));
  },
};

type DaypartKey = 'lunch' | 'dinner';

// Fixed UTC-hour windows — a real, documented limitation (see file header),
// not a localized dining-hours model.
const DAYPART_WINDOWS: Record<DaypartKey, { startHour: number; endHour: number }> = {
  lunch: { startHour: 11, endHour: 15 },
  dinner: { startHour: 17, endHour: 22 },
};

function isInDaypart(createdAtIso: string, daypart: DaypartKey): boolean {
  const hour = new Date(createdAtIso).getUTCHours();
  const window = DAYPART_WINDOWS[daypart];
  return hour >= window.startHour && hour < window.endHour;
}

export type DaypartStats = {
  daypart: DaypartKey;
  currentPeriodOrders: number;
  priorPeriodOrders: number;
  currentPeriodShare: number; // fraction of ALL completed orders in the current 15-day period that fall in this daypart
  priorPeriodShare: number; // same, for the prior 15-day period
  topCategories: CategorySales[]; // within the current period's daypart orders only, revenue desc
};

export const getOrdersByDaypart: ToolDefinition<{ daypart: DaypartKey }, DaypartStats> = {
  name: 'getOrdersByDaypart',
  description: "Trailing-15-vs-prior-15-day comparison of one daypart's share of all completed orders, plus a category revenue breakdown within that daypart's current-period orders. Daypart boundaries are fixed UTC-hour windows, not restaurant-localized (no timezone column exists in the schema).",
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const now = Date.now();
    const currentSince = new Date(now - 15 * DAY_MS).toISOString();
    const priorSince = new Date(now - 30 * DAY_MS).toISOString();

    const [current, prior] = await Promise.all([
      fetchCompletedOrdersSince(ctx, currentSince),
      fetchCompletedOrdersSince(ctx, priorSince, currentSince),
    ]);

    const currentDaypartOrders = current.filter((o) => isInDaypart(o.created_at, input.daypart));
    const priorDaypartOrders = prior.filter((o) => isInDaypart(o.created_at, input.daypart));

    const topCategories = await aggregateCategorySales(ctx, currentDaypartOrders.map((o) => o.id));

    return ok({
      daypart: input.daypart,
      currentPeriodOrders: currentDaypartOrders.length,
      priorPeriodOrders: priorDaypartOrders.length,
      currentPeriodShare: current.length > 0 ? currentDaypartOrders.length / current.length : 0,
      priorPeriodShare: prior.length > 0 ? priorDaypartOrders.length / prior.length : 0,
      topCategories,
    });
  },
};

export type CoverageKind = 'none' | 'stale' | 'active';

export type PromotionCoverage = { campaignCoverage: CoverageKind; itemCoverage: CoverageKind };

// Deliberately distinguishes the two, unrelated "promotion" concepts this
// codebase has: campaign-level `promotions` (spin-wheel games, needs the
// still-inactive promotion_agent capability to create) and item-level
// `menu_items.special_*` fields (menu_pricing, active today). Conflating
// them would misrepresent what's actually executable.
export const getPromotionCoverage: ToolDefinition<{ categoryId?: string }, PromotionCoverage> = {
  name: 'getPromotionCoverage',
  description: "Whether campaign-level promotions and/or item-level menu specials currently cover a category (or, with no categoryId, the whole restaurant) — each independently 'none' | 'stale' (existed but expired) | 'active'.",
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const now = Date.now();

    let itemQuery = ctx.supabase
      .from('menu_items')
      .select('special_enabled, special_end_at, special_no_expiry')
      .eq('restaurant_id', ctx.restaurantId)
      .is('deleted_at', null)
      .eq('active', true);
    if (input.categoryId) itemQuery = itemQuery.eq('category_id', input.categoryId);
    const { data: menuItemRows } = await itemQuery;

    let itemCoverage: CoverageKind = 'none';
    for (const item of menuItemRows ?? []) {
      if (!item.special_enabled) continue;
      const expired = !item.special_no_expiry && item.special_end_at !== null && new Date(item.special_end_at).getTime() < now;
      if (!expired) {
        itemCoverage = 'active';
        break;
      }
      itemCoverage = 'stale';
    }

    const { data: promotionRows } = await ctx.supabase
      .from('promotions')
      .select('id, status, starts_at, ends_at')
      .eq('restaurant_id', ctx.restaurantId)
      .neq('status', 'draft');

    let relevantPromotionIds: Set<string> | null = null;
    if (input.categoryId) {
      const { data: itemsInCategory } = await ctx.supabase
        .from('menu_items')
        .select('id')
        .eq('restaurant_id', ctx.restaurantId)
        .eq('category_id', input.categoryId);
      const itemIds = (itemsInCategory ?? []).map((m) => m.id);
      if (itemIds.length === 0) {
        relevantPromotionIds = new Set();
      } else {
        const { data: rewardRows } = await ctx.supabase.from('promotion_rewards').select('promotion_id, menu_item_id').in('menu_item_id', itemIds);
        relevantPromotionIds = new Set((rewardRows ?? []).map((r) => r.promotion_id));
      }
    }

    let campaignCoverage: CoverageKind = 'none';
    for (const promo of promotionRows ?? []) {
      if (relevantPromotionIds && !relevantPromotionIds.has(promo.id)) continue;
      const started = !promo.starts_at || new Date(promo.starts_at).getTime() <= now;
      const ended = promo.ends_at !== null && new Date(promo.ends_at).getTime() < now;
      if (promo.status === 'active' && started && !ended) {
        campaignCoverage = 'active';
        break;
      }
      if (promo.status === 'active' && ended && campaignCoverage === 'none') campaignCoverage = 'stale';
    }

    return ok({ campaignCoverage, itemCoverage });
  },
};

export type QrAdoptionStats = { qrOrders: number; directOrders: number; totalOrders: number; qrAdoptionRate: number };

export const getQrAdoptionStats: ToolDefinition<{ windowDays?: number }, QrAdoptionStats> = {
  name: 'getQrAdoptionStats',
  description: 'Share of completed orders originating from a QR-scan dining session (order_origin) vs. a direct link, over a trailing window (default 30 days).',
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const orders = await fetchCompletedOrders(ctx, input.windowDays ?? 30);
    const qrOrders = orders.filter((o) => o.order_origin === 'restaurant_qr').length;
    const totalOrders = orders.length;
    return ok({ qrOrders, directOrders: totalOrders - qrOrders, totalOrders, qrAdoptionRate: totalOrders > 0 ? qrOrders / totalOrders : 0 });
  },
};

export type CouponEngagementStats = { issued: number; redeemed: number; redemptionRate: number };

export const getCouponEngagementStats: ToolDefinition<{ windowDays?: number }, CouponEngagementStats> = {
  name: 'getCouponEngagementStats',
  description: 'Coupons issued vs. redeemed and the resulting redemption rate, over a trailing window (default 30 days) of issued coupons.',
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const since = new Date(Date.now() - (input.windowDays ?? 30) * DAY_MS).toISOString();
    const { data } = await ctx.supabase.from('coupon_redemptions').select('status').eq('restaurant_id', ctx.restaurantId).gte('issued_at', since);
    const rows = data ?? [];
    const issued = rows.length;
    const redeemed = rows.filter((r) => r.status === 'redeemed').length;
    return ok({ issued, redeemed, redemptionRate: issued > 0 ? redeemed / issued : 0 });
  },
};

export type AverageOrderValueStats = { currentAOV: number | null; priorAOV: number | null; orderCount: number };

export const getAverageOrderValue: ToolDefinition<{ windowDays?: number }, AverageOrderValueStats> = {
  name: 'getAverageOrderValue',
  description: 'Current vs. prior-period average order value (mean completed-order subtotal) over a trailing window (default 30 days), plus the current period order count.',
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const windowDays = input.windowDays ?? 30;
    const now = Date.now();
    const currentSince = new Date(now - windowDays * DAY_MS).toISOString();
    const priorSince = new Date(now - windowDays * 2 * DAY_MS).toISOString();

    const [current, prior] = await Promise.all([
      fetchCompletedOrdersSince(ctx, currentSince),
      fetchCompletedOrdersSince(ctx, priorSince, currentSince),
    ]);

    const average = (rows: CompletedOrder[]) => (rows.length > 0 ? rows.reduce((sum, r) => sum + Number(r.subtotal ?? 0), 0) / rows.length : null);

    return ok({ currentAOV: average(current), priorAOV: average(prior), orderCount: current.length });
  },
};

export type CoOrderedPair = { itemAId: string; itemAName: string; itemBId: string; itemBName: string; coOccurrenceCount: number };

// The evidence source for the average-order-value goal: without a real
// co-purchase count, "bundle X with Y" would be an unmotivated heuristic
// (e.g. "pick the two priciest items") dressed up as evidence. Item names
// come from order_items.name_snapshot (the name at the time of each order)
// rather than a menu_items join — one less join, and more accurate for a
// historical co-purchase question than the item's current name.
export const getFrequentlyCoOrderedItems: ToolDefinition<{ windowDays?: number; minCount?: number }, CoOrderedPair[]> = {
  name: 'getFrequentlyCoOrderedItems',
  description: 'Menu item pairs that appeared together in the same completed order at least minCount times (default 2), over a trailing window (default 30 days), ranked by co-occurrence count.',
  capability: 'revenue_intelligence',
  permission: 'read',
  mutating: false,
  version: 1,
  execute: async (input, ctx) => {
    const minCount = input.minCount ?? 2;
    const orders = await fetchCompletedOrders(ctx, input.windowDays ?? 30);
    if (orders.length === 0) return ok([]);

    const { data: orderItemRows } = await ctx.supabase
      .from('order_items')
      .select('order_id, menu_item_id, name_snapshot')
      .in('order_id', orders.map((o) => o.id));
    const rows = (orderItemRows ?? []).filter((r): r is { order_id: string; menu_item_id: string; name_snapshot: string } => r.menu_item_id !== null);

    const nameById = new Map(rows.map((r) => [r.menu_item_id, r.name_snapshot]));
    const itemIdsByOrder = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = itemIdsByOrder.get(row.order_id) ?? new Set<string>();
      set.add(row.menu_item_id);
      itemIdsByOrder.set(row.order_id, set);
    }

    const pairCounts = new Map<string, number>();
    for (const itemIds of Array.from(itemIdsByOrder.values())) {
      const ids = Array.from(itemIds);
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const key = [ids[i], ids[j]].sort().join('|');
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
        }
      }
    }

    return ok(
      Array.from(pairCounts.entries())
        .filter(([, count]) => count >= minCount)
        .map(([key, count]) => {
          const [itemAId, itemBId] = key.split('|');
          return {
            itemAId,
            itemAName: nameById.get(itemAId) ?? 'Unknown item',
            itemBId,
            itemBName: nameById.get(itemBId) ?? 'Unknown item',
            coOccurrenceCount: count,
          };
        })
        .sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount),
    );
  },
};
