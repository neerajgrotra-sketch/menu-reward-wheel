import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { sweepStaleGuests } from '@/engine/session-presence';
import { ACTIVE_ORDER_STATUSES } from '@/lib/orders/order-status';

// GET /api/admin/sessions/summary
// Per-restaurant live counts (active sessions, current guests, active orders)
// for every restaurant the authenticated user owns — powers the Dining
// Intelligence landing page tiles in one call instead of one fetch per
// restaurant. visit_sessions/session_guests/orders are all transactional
// state (Rule 35), so the service client below bypasses the Next.js Data
// Cache on every read.

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Service key is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

export const dynamic = 'force-dynamic';

type RestaurantSummary = {
  activeSessions: number;
  currentGuests: number;
  activeOrders: number;
};

export async function GET() {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = makeServiceClient();

    const restaurantsResult = await supabase
      .from('restaurants')
      .select('id')
      .eq('owner_id', userData.user.id);

    if (restaurantsResult.error) {
      return NextResponse.json({ error: restaurantsResult.error.message }, { status: 500 });
    }

    const restaurantIds = (restaurantsResult.data || []).map((r) => r.id as string);

    const summary: Record<string, RestaurantSummary> = {};
    for (const id of restaurantIds) {
      summary[id] = { activeSessions: 0, currentGuests: 0, activeOrders: 0 };
    }

    if (restaurantIds.length === 0) {
      return NextResponse.json({ summary });
    }

    // Lazy stale-session cleanup, same RPC the restaurant-scoped sessions
    // route already calls — keeps "active" counts honest before we count.
    await Promise.all(
      restaurantIds.map((id) =>
        supabase.rpc('mark_stale_sessions_abandoned', { p_restaurant_id: id, p_timeout_hours: 2 }),
      ),
    );

    const activeSessionsResult = await supabase
      .from('visit_sessions')
      .select('id,restaurant_id')
      .in('restaurant_id', restaurantIds)
      .eq('status', 'active');

    if (activeSessionsResult.error) {
      return NextResponse.json({ error: activeSessionsResult.error.message }, { status: 500 });
    }

    const activeSessions = activeSessionsResult.data || [];
    const sessionToRestaurant = new Map<string, string>();
    for (const s of activeSessions) {
      sessionToRestaurant.set(s.id as string, s.restaurant_id as string);
      summary[s.restaurant_id as string].activeSessions += 1;
    }

    // Sweep presence for every active session before counting guests, so the
    // number matches what the per-session live indicator would show.
    const activeSessionIds = Array.from(sessionToRestaurant.keys());
    if (activeSessionIds.length > 0) {
      await Promise.all(activeSessionIds.map((id) => sweepStaleGuests(id, supabase)));

      const guestsResult = await supabase
        .from('session_guests')
        .select('session_id')
        .in('session_id', activeSessionIds)
        .eq('status', 'active');

      if (guestsResult.error) {
        return NextResponse.json({ error: guestsResult.error.message }, { status: 500 });
      }

      for (const g of guestsResult.data || []) {
        const restaurantId = sessionToRestaurant.get(g.session_id as string);
        if (restaurantId) summary[restaurantId].currentGuests += 1;
      }
    }

    const ordersResult = await supabase
      .from('orders')
      .select('restaurant_id')
      .in('restaurant_id', restaurantIds)
      .in('status', ACTIVE_ORDER_STATUSES);

    if (ordersResult.error) {
      return NextResponse.json({ error: ordersResult.error.message }, { status: 500 });
    }

    for (const o of ordersResult.data || []) {
      summary[o.restaurant_id as string].activeOrders += 1;
    }

    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
