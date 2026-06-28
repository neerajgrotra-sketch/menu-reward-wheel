import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const dynamic = 'force-dynamic';

// GET /api/public/sessions/:visitSessionId/presence
//
// Public — no auth required. session_id is treated as semi-public; only guests
// who resolved the session have it.
//
// Returns active guest count + session liveness for the customer-facing ribbon.
// Used by the public QR menu page to show 🟢 Table X  👥 N and detect 🔴 Session Ended.

export async function GET(
  _req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;
    if (!visitSessionId || !/^[0-9a-f-]{36}$/.test(visitSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    const { data: session } = await supabase
      .from('visit_sessions')
      .select('status')
      .eq('id', visitSessionId)
      .maybeSingle();

    if (!session || session.status !== 'active') {
      return NextResponse.json({ active_guest_count: 0, session_active: false });
    }

    // Sweep stale guests then count active
    await supabase.rpc('update_stale_guest_presence', { p_session_id: visitSessionId });

    const { count } = await supabase
      .from('session_guests')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', visitSessionId)
      .eq('status', 'active');

    return NextResponse.json({ active_guest_count: count ?? 0, session_active: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:presence] GET error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
