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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 64;

export const dynamic = 'force-dynamic';

// POST /api/public/sessions/:visitSessionId/guest-name
//
// Body: { guest_token: string, guest_name: string }
//
// Updates session_guests.guest_name for the guest identified by guest_token.
// Validates the token belongs to this specific session before writing.
// Public route — no auth cookie required; bearer is the guest_token itself.

export async function POST(
  req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;
    if (!UUID_RE.test(visitSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const { guest_token, guest_name } = body as { guest_token?: string; guest_name?: string };

    if (!guest_token || typeof guest_token !== 'string') {
      return NextResponse.json({ error: 'guest_token is required.' }, { status: 400 });
    }

    if (typeof guest_name !== 'string') {
      return NextResponse.json({ error: 'guest_name must be a string.' }, { status: 400 });
    }

    const trimmedName = guest_name.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmedName) {
      return NextResponse.json({ error: 'guest_name must not be empty.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    // Validate token belongs to this session — prevents one guest updating another guest's name
    const { data: guest, error: guestError } = await supabase
      .from('session_guests')
      .select('id, session_id')
      .eq('guest_token', guest_token)
      .maybeSingle();

    if (guestError || !guest) {
      return NextResponse.json({ error: 'Invalid guest token.' }, { status: 403 });
    }

    if (guest.session_id !== visitSessionId) {
      return NextResponse.json({ error: 'Token does not belong to this session.' }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from('session_guests')
      .update({ guest_name: trimmedName })
      .eq('id', guest.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, guest_name: trimmedName }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:guest-name] error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
