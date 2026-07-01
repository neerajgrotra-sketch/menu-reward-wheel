import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { updateGuestPresence } from '@/engine/session-presence';

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

// POST /api/public/sessions/:visitSessionId/heartbeat
//
// Body: { guest_token: string }
//
// Called by the public guest page on a fixed interval (every 30–60 seconds).
// Refreshes last_seen_at and returns current presence status.
//
// Responses:
//   200 { active: true }              — heartbeat accepted, session live
//   200 { active: false }             — session ended; frontend must redirect
//   400                               — missing guest_token
//   500                               — internal error

export async function POST(
  req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const body = await req.json().catch(() => null);
    if (!body?.guest_token || typeof body.guest_token !== 'string') {
      return NextResponse.json({ error: 'guest_token is required.' }, { status: 400 });
    }

    const { visitSessionId } = params;
    if (!visitSessionId || !/^[0-9a-f-]{36}$/.test(visitSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();
    const result = await updateGuestPresence(body.guest_token, supabase);

    if (!result.session_active) {
      return NextResponse.json({ active: false }, { status: 200 });
    }

    return NextResponse.json({ active: true, status: result.status }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:heartbeat] error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
