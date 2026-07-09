import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { sweepStaleGuests } from '@/engine/session-presence';

type PromotionForCount = {
  id: string;
  status: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Server metrics are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');

  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Transactional read (Rule 35) — orders/session_guests must never come from the Data Cache.
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

const TREND_DAYS = 7;

function startOfDay(offsetDays: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
}

// Index of the day a timestamp falls into within the trailing TREND_DAYS
// window, where 0 = TREND_DAYS-1 ago and TREND_DAYS-1 = today.
function dayBucketIndex(iso: string, windowStart: Date): number {
  const ms = new Date(iso).getTime() - windowStart.getTime();
  return Math.floor(ms / 86_400_000);
}

function isEffectivelyActive(promotion: PromotionForCount) {
  const now = new Date();
  if (promotion.status !== 'active') return false;
  if (promotion.starts_at && now < new Date(promotion.starts_at)) return false;
  if (promotion.ends_at && now > new Date(promotion.ends_at)) return false;
  return true;
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const serviceClient = makeServiceClient();

    const restaurantsResult = await serviceClient
      .from('restaurants')
      .select('id')
      .eq('owner_id', userData.user.id)
      .is('deleted_at', null);

    if (restaurantsResult.error) {
      return NextResponse.json({ error: restaurantsResult.error.message }, { status: 500 });
    }

    const restaurantIds = (restaurantsResult.data || []).map((item) => item.id as string);

    if (restaurantIds.length === 0) {
      return NextResponse.json({
        restaurants: 0,
        activePromotions: 0,
        totalPromotions: 0,
        issuedCoupons: 0,
        redeemedCoupons: 0,
        revenueToday: 0,
        ordersToday: 0,
        avgOrderValue: 0,
        activeGuests: 0,
        trends: {
          revenue: Array(TREND_DAYS).fill(0),
          orders: Array(TREND_DAYS).fill(0),
          avgOrderValue: Array(TREND_DAYS).fill(0),
          redemptions: Array(TREND_DAYS).fill(0),
        },
      });
    }

    const promotionsResult = await serviceClient
      .from('promotions')
      .select('id,status,starts_at,ends_at')
      .in('restaurant_id', restaurantIds);

    if (promotionsResult.error) {
      return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });
    }

    const promotions = (promotionsResult.data || []) as PromotionForCount[];

    const issuedCouponCount = await serviceClient
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .in('restaurant_id', restaurantIds);

    if (issuedCouponCount.error) {
      return NextResponse.json({ error: issuedCouponCount.error.message }, { status: 500 });
    }

    const redeemedCouponCount = await serviceClient
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .in('restaurant_id', restaurantIds)
      .eq('status', 'redeemed');

    if (redeemedCouponCount.error) {
      return NextResponse.json({ error: redeemedCouponCount.error.message }, { status: 500 });
    }

    // "Orders" counts volume (every order placed, cancellations aside);
    // revenue/AOV are scoped to status='completed' only, since subtotal isn't
    // realized until an order is actually fulfilled. These can legitimately
    // diverge — e.g. orders placed but not yet completed — that's not a bug.
    // Pulled as a TREND_DAYS window so today's headline numbers and the KPI
    // sparklines come from one query instead of two.
    const windowStart = startOfDay(TREND_DAYS - 1);

    const [ordersWindowResult, redemptionsWindowResult] = await Promise.all([
      serviceClient
        .from('orders')
        .select('status,subtotal,created_at')
        .in('restaurant_id', restaurantIds)
        .neq('status', 'cancelled')
        .gte('created_at', windowStart.toISOString()),
      serviceClient
        .from('coupon_redemptions')
        .select('redeemed_at')
        .in('restaurant_id', restaurantIds)
        .eq('status', 'redeemed')
        .gte('redeemed_at', windowStart.toISOString()),
    ]);

    if (ordersWindowResult.error) {
      return NextResponse.json({ error: ordersWindowResult.error.message }, { status: 500 });
    }
    if (redemptionsWindowResult.error) {
      return NextResponse.json({ error: redemptionsWindowResult.error.message }, { status: 500 });
    }

    const ordersByDay: Array<{ status: string; subtotal: number | null }[]> = Array.from({ length: TREND_DAYS }, () => []);
    for (const order of (ordersWindowResult.data || []) as Array<{ status: string; subtotal: number | null; created_at: string }>) {
      const index = dayBucketIndex(order.created_at, windowStart);
      if (index >= 0 && index < TREND_DAYS) ordersByDay[index].push(order);
    }

    const redemptionsByDay: number[] = Array.from({ length: TREND_DAYS }, () => 0);
    for (const redemption of (redemptionsWindowResult.data || []) as Array<{ redeemed_at: string }>) {
      const index = dayBucketIndex(redemption.redeemed_at, windowStart);
      if (index >= 0 && index < TREND_DAYS) redemptionsByDay[index] += 1;
    }

    const revenueTrend = ordersByDay.map((day) =>
      day.filter((o) => o.status === 'completed').reduce((sum, o) => sum + (o.subtotal || 0), 0),
    );
    const ordersTrend = ordersByDay.map((day) => day.length);
    const completedCountTrend = ordersByDay.map((day) => day.filter((o) => o.status === 'completed').length);
    const avgOrderValueTrend = revenueTrend.map((revenue, i) => (completedCountTrend[i] > 0 ? revenue / completedCountTrend[i] : 0));

    const todayIndex = TREND_DAYS - 1;
    const revenueToday = revenueTrend[todayIndex];
    const ordersToday = ordersTrend[todayIndex];
    const avgOrderValue = avgOrderValueTrend[todayIndex];

    // Mirrors the sweep-then-count pattern in /api/admin/sessions/summary —
    // sweepStaleGuests is the single source of truth for presence expiry (Rule 13).
    const activeSessionsResult = await serviceClient
      .from('visit_sessions')
      .select('id')
      .in('restaurant_id', restaurantIds)
      .eq('status', 'active');

    if (activeSessionsResult.error) {
      return NextResponse.json({ error: activeSessionsResult.error.message }, { status: 500 });
    }

    const activeSessionIds = (activeSessionsResult.data || []).map((session) => session.id as string);
    let activeGuests = 0;

    if (activeSessionIds.length > 0) {
      await Promise.all(activeSessionIds.map((id) => sweepStaleGuests(id, serviceClient)));

      const guestsResult = await serviceClient
        .from('session_guests')
        .select('id', { count: 'exact', head: true })
        .in('session_id', activeSessionIds)
        .eq('status', 'active');

      if (guestsResult.error) {
        return NextResponse.json({ error: guestsResult.error.message }, { status: 500 });
      }

      activeGuests = guestsResult.count || 0;
    }

    return NextResponse.json({
      restaurants: restaurantIds.length,
      activePromotions: promotions.filter(isEffectivelyActive).length,
      totalPromotions: promotions.length,
      issuedCoupons: issuedCouponCount.count || 0,
      redeemedCoupons: redeemedCouponCount.count || 0,
      revenueToday,
      ordersToday,
      avgOrderValue,
      activeGuests,
      trends: {
        revenue: revenueTrend,
        orders: ordersTrend,
        avgOrderValue: avgOrderValueTrend,
        redemptions: redemptionsByDay,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load dashboard metrics.' }, { status: 500 });
  }
}
