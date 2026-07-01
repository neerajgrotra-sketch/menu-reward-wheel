import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveSessionJoin } from '@/engine/session-presence';

// ── Per-IP rate limit (in-memory, per Lambda instance) ────────────────────────
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 60;
const ipBuckets = new Map<string, number[]>();
let ipCleanupCounter = 0;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const cutoff = now - IP_WINDOW_MS;
  ipCleanupCounter++;
  if (ipCleanupCounter % 100 === 0) {
    ipBuckets.forEach((ts, key) => {
      const fresh = ts.filter((t: number) => t > cutoff);
      if (fresh.length === 0) ipBuckets.delete(key);
      else ipBuckets.set(key, fresh);
    });
  }
  const timestamps = (ipBuckets.get(ip) ?? []).filter((t) => t > cutoff);
  if (timestamps.length >= IP_MAX) return true;
  timestamps.push(now);
  ipBuckets.set(ip, timestamps);
  return false;
}

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

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      req.headers.get('x-real-ip') ??
      'unknown';

    if (checkIpRateLimit(ip)) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
    }

    const {
      restaurant_id,
      touchpoint_id,
      known_session_id,
      known_guest_token,
      device_fingerprint,
      user_agent,
    } = body as {
      restaurant_id?: string;
      touchpoint_id?: string;
      known_session_id?: string | null;
      known_guest_token?: string | null;
      device_fingerprint?: string;
      user_agent?: string | null;
    };

    if (!restaurant_id || !touchpoint_id) {
      return NextResponse.json(
        { error: 'restaurant_id and touchpoint_id are required.' },
        { status: 400 },
      );
    }

    const supabase = makeServiceClient();

    // Validate touchpoint belongs to restaurant and is active
    const { data: touchpoint, error: tpError } = await supabase
      .from('restaurant_touchpoints')
      .select('id, name, type, section_name, touchpoint_code, restaurant_id')
      .eq('id', touchpoint_id)
      .eq('restaurant_id', restaurant_id)
      .eq('active', true)
      .is('deleted_at', null)
      .maybeSingle();

    if (tpError || !touchpoint) {
      return NextResponse.json(
        { error: 'Touchpoint not found or inactive.' },
        { status: 404 },
      );
    }

    // Delegate all session + guest creation to the presence engine
    const fingerprint = device_fingerprint ?? 'unknown';
    const ua = user_agent ?? req.headers.get('user-agent') ?? null;

    const join = await resolveSessionJoin(
      touchpoint_id,
      restaurant_id,
      fingerprint,
      ua,
      known_session_id ?? null,
      known_guest_token ?? null,
      supabase,
    );

    // Append qr_scan interaction to the session log (fire-and-forget)
    void Promise.resolve(
      supabase.rpc('append_session_interaction', {
        p_session_id: join.session_id,
        p_event: { event: 'qr_scan', ts: new Date().toISOString() },
      }),
    ).catch(() => {});

    console.log('[spinbite:sessions] resolved', {
      session_id: join.session_id,
      guest_id: join.guest_id,
      touchpoint_id,
      is_new_session: join.is_new_session,
      is_new_device: join.is_new_device,
    });

    return NextResponse.json(
      {
        visit_session_id: join.session_id,
        guest_id: join.guest_id,
        guest_token: join.guest_token,
        session_access_code: join.session_access_code,
        touchpoint_name: touchpoint.name,
        touchpoint_type: touchpoint.type,
        section_name: touchpoint.section_name,
        is_new_session: join.is_new_session,
        is_new_device: join.is_new_device,
      },
      { status: join.is_new_session ? 201 : 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:sessions] resolve error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
