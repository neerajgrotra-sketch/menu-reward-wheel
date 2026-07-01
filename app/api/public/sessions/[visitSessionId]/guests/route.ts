import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sweepStaleGuests } from '@/engine/session-presence';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type GuestRow = {
  id: string;
  guest_name: string | null;
  status: 'active' | 'inactive' | 'disconnected' | 'blocked';
  joined_at: string | null;
  last_seen_at: string | null;
};

type PublicGuest = {
  id: string;
  display_name: string;
  is_named: boolean;
  status: GuestRow['status'];
  joined_at: string | null;
  last_seen_at: string | null;
};

export const dynamic = 'force-dynamic';

// GET /api/public/sessions/:visitSessionId/guests
//
// Public — no auth required. session_id is treated as semi-public; only guests
// who resolved the session (i.e. scanned the table QR) have it, matching the
// trust model of the existing /presence route.
//
// Returns a privacy-safe guest list for the customer-facing "Connected Diners"
// popover. Never exposes guest_token, device_fingerprint, or user_agent.

export async function GET(
  _req: NextRequest,
  { params }: { params: { visitSessionId: string } },
) {
  try {
    const { visitSessionId } = params;
    if (!visitSessionId || !UUID_RE.test(visitSessionId)) {
      return NextResponse.json({ error: 'Invalid session ID.' }, { status: 400 });
    }

    const supabase = makeServiceClient();

    const { data: session } = await supabase
      .from('visit_sessions')
      .select('status')
      .eq('id', visitSessionId)
      .maybeSingle();

    if (!session || session.status !== 'active') {
      return NextResponse.json({ session_active: false, active_guest_count: 0, guests: [] });
    }

    // Sweep stale guests first so status reflects the 3/10-minute presence rules.
    // Same helper GET /presence uses — one sweep implementation, one source of truth.
    await sweepStaleGuests(visitSessionId, supabase);

    const { data: rows, error } = await supabase
      .from('session_guests')
      .select('id, guest_name, status, joined_at, last_seen_at')
      .eq('session_id', visitSessionId)
      .in('status', ['active', 'inactive'])
      .order('joined_at', { ascending: true });

    if (error) {
      console.error('[spinbite:session-guests] query error', error.message);
      return NextResponse.json({ session_active: false, active_guest_count: 0, guests: [] });
    }

    const guestRows = (rows ?? []) as GuestRow[];

    const named = guestRows.filter((g) => g.guest_name && g.guest_name.trim());
    const anonymous = guestRows.filter((g) => !g.guest_name || !g.guest_name.trim());

    let anonymousCounter = 0;
    const guests: PublicGuest[] = [
      ...named.map((g) => ({
        id: g.id,
        display_name: g.guest_name!.trim(),
        is_named: true,
        status: g.status,
        joined_at: g.joined_at,
        last_seen_at: g.last_seen_at,
      })),
      ...anonymous.map((g) => {
        anonymousCounter += 1;
        return {
          id: g.id,
          display_name: `Anonymous Guest ${anonymousCounter}`,
          is_named: false,
          status: g.status,
          joined_at: g.joined_at,
          last_seen_at: g.last_seen_at,
        };
      }),
    ];

    const activeCount = guestRows.filter((g) => g.status === 'active').length;

    return NextResponse.json({
      session_active: true,
      active_guest_count: activeCount,
      guests,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:session-guests] GET error', message);
    // Never let an unhandled exception surface a malformed body to the client —
    // always the same safe shape the popover expects.
    return NextResponse.json({ session_active: false, active_guest_count: 0, guests: [] });
  }
}
