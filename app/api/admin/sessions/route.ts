import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url) throw new Error('Supabase URL is missing.');
  if (!serviceKey) throw new Error('Service key is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const restaurantId = searchParams.get('restaurant_id');
    const statusFilter = searchParams.get('status') || 'active';

    if (!restaurantId) {
      return NextResponse.json({ error: 'restaurant_id is required.' }, { status: 400 });
    }

    const serviceClient = makeServiceClient();

    // Verify ownership
    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id')
      .eq('id', restaurantId)
      .eq('owner_id', userData.user.id)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found.' }, { status: 404 });
    }

    // Lazy stale-session cleanup before returning active sessions
    if (statusFilter === 'active') {
      await serviceClient.rpc('mark_stale_sessions_abandoned', {
        p_restaurant_id: restaurantId,
        p_timeout_hours: 2,
      });
    }

    const { data: sessions, error: sessionsError } = await serviceClient
      .from('visit_sessions')
      .select(
        'id,status,started_at,ended_at,last_activity_at,guest_count,menu_items_viewed,orders_count,promotion_interactions,coupons_issued,total_spend,assigned_ai_agent,restaurant_touchpoints(id,name,type,section_name,touchpoint_code)',
      )
      .eq('restaurant_id', restaurantId)
      .eq('status', statusFilter)
      .order('started_at', { ascending: false })
      .limit(100);

    if (sessionsError) {
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: sessions ?? [] });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
