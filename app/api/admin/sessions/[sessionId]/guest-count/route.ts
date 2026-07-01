import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient as createServerAuthClient } from '@/lib/supabase/server';
import { getActiveGuestCount } from '@/engine/session-presence';

function makeServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase service client is not configured.');
  return createServiceClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input as RequestInfo, { ...(init as RequestInit), cache: 'no-store' }),
    },
  });
}

export const dynamic = 'force-dynamic';

// GET /api/admin/sessions/:sessionId/guest-count
// Returns the current count of active session_guests for a session.
// Requires the caller to own the restaurant that owns the session.

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

    // Verify ownership
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
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Not authorised.' }, { status: 403 });
    }

    // Same sweep-then-count helper the public /presence and /guests routes
    // use — one code path for "what is the active count" across admin and
    // customer surfaces.
    const count = await getActiveGuestCount(sessionId, supabase);

    return NextResponse.json({ count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
