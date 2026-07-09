import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { ACTIVE_ORDER_STATUSES } from '@/lib/orders/order-status';

// GET /api/admin/dashboard-operations
// Health signals for systems that have a real data source today. Deliberately
// excludes a "Kitchen" tile — there's no KDS/ticket-age signal yet (staff-roles
// is a stated prerequisite per the Order Operations Engine design). A fabricated
// green/amber/red dot would be worse than no tile.

const WARN_MINUTES = 20;
const BAD_MINUTES = 45;
const PAYMENTS_WINDOW_HOURS = 24;

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

function formatWaitDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

type Health = 'good' | 'warn' | 'bad';

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
        orders: { count: 0, health: 'good' as Health, note: 'No active orders' },
        tables: { count: 0, health: 'good' as Health, note: 'No occupied tables' },
        payments: { count: 0, health: 'good' as Health, note: 'No payments in the last 24h' },
      });
    }

    const [ordersResult, sessionsResult, paymentsResult] = await Promise.all([
      serviceClient
        .from('orders')
        .select('id,created_at')
        .in('restaurant_id', restaurantIds)
        .in('status', ACTIVE_ORDER_STATUSES),
      serviceClient
        .from('visit_sessions')
        .select('touchpoint_id')
        .in('restaurant_id', restaurantIds)
        .eq('status', 'active'),
      serviceClient
        .from('payments')
        .select('status')
        .in('restaurant_id', restaurantIds)
        .gte('created_at', new Date(Date.now() - PAYMENTS_WINDOW_HOURS * 60 * 60 * 1000).toISOString()),
    ]);

    const firstError = ordersResult.error || sessionsResult.error || paymentsResult.error;
    if (firstError) {
      return NextResponse.json({ error: firstError.message }, { status: 500 });
    }

    const activeOrders = (ordersResult.data || []) as Array<{ id: string; created_at: string }>;
    const oldestMinutes = activeOrders.reduce((max, order) => {
      const minutes = (Date.now() - new Date(order.created_at).getTime()) / 60000;
      return Math.max(max, minutes);
    }, 0);
    const ordersHealth: Health = oldestMinutes >= BAD_MINUTES ? 'bad' : oldestMinutes >= WARN_MINUTES ? 'warn' : 'good';

    const occupiedTouchpoints = new Set(
      (sessionsResult.data || [])
        .map((session) => session.touchpoint_id as string | null)
        .filter((id): id is string => Boolean(id)),
    );

    const recentPayments = (paymentsResult.data || []) as Array<{ status: string }>;
    const failedPayments = recentPayments.filter((payment) => payment.status !== 'succeeded').length;
    const paymentsHealth: Health = failedPayments > 0 ? 'warn' : 'good';

    return NextResponse.json({
      orders: {
        count: activeOrders.length,
        health: ordersHealth,
        note:
          activeOrders.length === 0
            ? 'No active orders'
            : ordersHealth === 'good'
              ? `${activeOrders.length} active`
              : `${activeOrders.length} active, oldest waiting ${formatWaitDuration(oldestMinutes)}`,
      },
      tables: {
        count: occupiedTouchpoints.size,
        health: 'good' as Health,
        note: occupiedTouchpoints.size === 0 ? 'No occupied tables' : `${occupiedTouchpoints.size} occupied`,
      },
      payments: {
        count: recentPayments.length,
        health: paymentsHealth,
        note:
          recentPayments.length === 0
            ? 'No payments in the last 24h'
            : failedPayments > 0
              ? `${failedPayments} not succeeded`
              : `${recentPayments.length} succeeded`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Could not load operations status.' }, { status: 500 });
  }
}
