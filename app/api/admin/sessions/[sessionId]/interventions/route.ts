import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

export const dynamic = 'force-dynamic';

// GET /api/admin/sessions/:sessionId/interventions
// Returns live_interventions for the session, newest first.
// Enriched with guest_name from session_guests where guest_id is set.

export async function GET(
  _req: NextRequest,
  { params }: { params: { sessionId: string } },
) {
  try {
    const authClient = createServerAuthClient();
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { sessionId } = params;
    if (!sessionId || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Ownership check
    const { data: session } = await supabase
      .from('visit_sessions')
      .select('id, restaurant_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('id', session.restaurant_id)
      .eq('owner_id', userData.user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    }

    // Load interventions
    const { data: interventions, error: interventionsError } = await supabase
      .from('live_interventions')
      .select('id,session_id,guest_id,opportunity_type,action_type,confidence_score,reasoning_summary,status,created_at,acknowledged_at,converted')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false });

    if (interventionsError) {
      return NextResponse.json({ error: interventionsError.message }, { status: 500 });
    }

    // Enrich with guest names
    const guestIds = Array.from(new Set(
      (interventions ?? []).map((i) => i.guest_id).filter((g): g is string => g !== null),
    ));

    let guestNameMap = new Map<string, string | null>();
    if (guestIds.length > 0) {
      const { data: guests } = await supabase
        .from('session_guests')
        .select('id, guest_name')
        .in('id', guestIds);
      guestNameMap = new Map((guests ?? []).map((g) => [g.id, g.guest_name ?? null]));
    }

    const enriched = (interventions ?? []).map((i) => ({
      ...i,
      guest_name: i.guest_id ? (guestNameMap.get(i.guest_id) ?? null) : null,
    }));

    return NextResponse.json({ interventions: enriched });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
