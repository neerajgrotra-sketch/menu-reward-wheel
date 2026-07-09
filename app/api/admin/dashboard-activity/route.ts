import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

// GET /api/admin/dashboard-activity
// Merges recent promotion changes, coupon redemptions, completed orders, and
// guest joins into one sorted feed for the admin dashboard timeline. Read-only,
// owner-scoped, service-role (Rule 35 — bypasses the Data Cache since all four
// source tables are mutable transactional state).

const FEED_LIMIT = 15;
const PER_SOURCE_LIMIT = 15;

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Server metrics are not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

export const dynamic = 'force-dynamic';

type ActivityEvent = {
  id: string;
  type: 'promotion' | 'coupon_redeemed' | 'order_completed' | 'guest_joined';
  title: string;
  meta: string;
  occurredAt: string;
};

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
      return NextResponse.json({ events: [] });
    }

    const [promotionsResult, redemptionsResult, ordersResult, guestsResult] = await Promise.all([
      serviceClient
        .from('promotions')
        .select('id,name,status,updated_at')
        .in('restaurant_id', restaurantIds)
        .neq('status', 'draft')
        .order('updated_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      serviceClient
        .from('coupon_redemptions')
        .select('id,coupon_code,redeemed_at')
        .in('restaurant_id', restaurantIds)
        .eq('status', 'redeemed')
        .not('redeemed_at', 'is', null)
        .order('redeemed_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      serviceClient
        .from('orders')
        .select('id,order_number,subtotal,completed_at')
        .in('restaurant_id', restaurantIds)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      serviceClient
        .from('session_guests')
        .select('id,guest_name,joined_at')
        .in('restaurant_id', restaurantIds)
        .order('joined_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT),
    ]);

    const firstError =
      promotionsResult.error || redemptionsResult.error || ordersResult.error || guestsResult.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const events: ActivityEvent[] = [];

    for (const promo of promotionsResult.data || []) {
      if (!promo.updated_at) continue;
      events.push({
        id: `promotion-${promo.id}`,
        type: 'promotion',
        title: promo.status === 'active' ? 'Promotion live' : 'Promotion updated',
        meta: promo.name as string,
        occurredAt: promo.updated_at as string,
      });
    }

    for (const redemption of redemptionsResult.data || []) {
      events.push({
        id: `redemption-${redemption.id}`,
        type: 'coupon_redeemed',
        title: 'Coupon redeemed',
        meta: redemption.coupon_code as string,
        occurredAt: redemption.redeemed_at as string,
      });
    }

    for (const order of ordersResult.data || []) {
      events.push({
        id: `order-${order.id}`,
        type: 'order_completed',
        title: 'Order completed',
        meta: `#${order.order_number} · $${Number(order.subtotal || 0).toFixed(2)}`,
        occurredAt: order.completed_at as string,
      });
    }

    for (const guest of guestsResult.data || []) {
      if (!guest.joined_at) continue;
      events.push({
        id: `guest-${guest.id}`,
        type: 'guest_joined',
        title: 'Guest joined',
        meta: (guest.guest_name as string) || 'New guest',
        occurredAt: guest.joined_at as string,
      });
    }

    events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return NextResponse.json({ events: events.slice(0, FEED_LIMIT) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load recent activity.' }, { status: 500 });
  }
}
