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

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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

    // "Orders" counts volume (every order placed today, cancellations aside);
    // revenue/AOV are scoped to status='completed' only, since subtotal isn't
    // realized until an order is actually fulfilled. These can legitimately
    // diverge — e.g. orders placed but not yet completed — that's not a bug.
    const ordersTodayResult = await serviceClient
      .from('orders')
      .select('status,subtotal')
      .in('restaurant_id', restaurantIds)
      .neq('status', 'cancelled')
      .gte('created_at', startOfTodayIso());

    if (ordersTodayResult.error) {
      return NextResponse.json({ error: ordersTodayResult.error.message }, { status: 500 });
    }

    const todaysOrders = (ordersTodayResult.data || []) as Array<{ status: string; subtotal: number | null }>;
    const completedToday = todaysOrders.filter((order) => order.status === 'completed');
    const revenueToday = completedToday.reduce((sum, order) => sum + (order.subtotal || 0), 0);
    const ordersToday = todaysOrders.length;
    const avgOrderValue = completedToday.length > 0 ? revenueToday / completedToday.length : 0;

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
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load dashboard metrics.' }, { status: 500 });
  }
}
