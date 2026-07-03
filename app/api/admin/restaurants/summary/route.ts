import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

// GET /api/admin/restaurants/summary
// Per-restaurant live tile stats (tables, assigned menus, active promotions,
// active sessions, ordering/payment capability flags) for every restaurant
// the authenticated user owns — powers the Restaurant Directory grid in one
// call instead of one fetch per restaurant. Mirrors
// app/api/admin/sessions/summary/route.ts (same service-client + no-store
// pattern per Rule 35) but is a dedicated route so Dining Intelligence's
// existing contract is never touched.

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
  tablesCount: number;
  assignedMenusCount: number;
  activePromotionsCount: number;
  activeSessionsCount: number;
  orderingEnabled: boolean;
  paymentEnabled: boolean;
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
      .eq('owner_id', userData.user.id)
      .is('deleted_at', null);

    if (restaurantsResult.error) {
      return NextResponse.json({ error: restaurantsResult.error.message }, { status: 500 });
    }

    const restaurantIds = (restaurantsResult.data || []).map((r) => r.id as string);

    const summary: Record<string, RestaurantSummary> = {};
    for (const id of restaurantIds) {
      summary[id] = {
        tablesCount: 0,
        assignedMenusCount: 0,
        activePromotionsCount: 0,
        activeSessionsCount: 0,
        orderingEnabled: false,
        paymentEnabled: false,
      };
    }

    if (restaurantIds.length === 0) {
      return NextResponse.json({ summary });
    }

    const now = new Date().toISOString();

    const [tablesResult, assignmentsResult, promotionsResult, sessionsResult, capabilitiesResult] = await Promise.all([
      supabase
        .from('restaurant_touchpoints')
        .select('restaurant_id')
        .in('restaurant_id', restaurantIds)
        .is('deleted_at', null),
      (supabase as any)
        .from('restaurant_menu_assignments')
        .select('restaurant_id')
        .in('restaurant_id', restaurantIds)
        .eq('active', true),
      supabase
        .from('promotions')
        .select('restaurant_id,status,starts_at,ends_at')
        .in('restaurant_id', restaurantIds),
      supabase
        .from('visit_sessions')
        .select('restaurant_id')
        .in('restaurant_id', restaurantIds)
        .eq('status', 'active'),
      (supabase as any)
        .from('restaurant_capabilities')
        .select('restaurant_id,capability_name,enabled')
        .in('restaurant_id', restaurantIds)
        .in('capability_name', ['ordering', 'payment_simulation']),
    ]);

    if (tablesResult.error) return NextResponse.json({ error: tablesResult.error.message }, { status: 500 });
    if (assignmentsResult.error) return NextResponse.json({ error: assignmentsResult.error.message }, { status: 500 });
    if (promotionsResult.error) return NextResponse.json({ error: promotionsResult.error.message }, { status: 500 });
    if (sessionsResult.error) return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 });
    if (capabilitiesResult.error) return NextResponse.json({ error: capabilitiesResult.error.message }, { status: 500 });

    for (const row of tablesResult.data || []) {
      summary[row.restaurant_id as string].tablesCount += 1;
    }

    for (const row of (assignmentsResult.data || []) as Array<{ restaurant_id: string }>) {
      summary[row.restaurant_id].assignedMenusCount += 1;
    }

    // "Active" mirrors the Promotions page's statusOf(): not a draft, started, not ended.
    for (const p of (promotionsResult.data || []) as Array<{ restaurant_id: string; status: string; starts_at: string | null; ends_at: string | null }>) {
      if (p.status === 'draft') continue;
      if (p.ends_at && p.ends_at <= now) continue;
      if (p.starts_at && p.starts_at > now) continue;
      summary[p.restaurant_id].activePromotionsCount += 1;
    }

    for (const row of sessionsResult.data || []) {
      summary[row.restaurant_id as string].activeSessionsCount += 1;
    }

    for (const row of (capabilitiesResult.data || []) as Array<{ restaurant_id: string; capability_name: string; enabled: boolean }>) {
      if (row.capability_name === 'ordering') summary[row.restaurant_id].orderingEnabled = row.enabled === true;
      if (row.capability_name === 'payment_simulation') summary[row.restaurant_id].paymentEnabled = row.enabled === true;
    }

    return NextResponse.json({ summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
