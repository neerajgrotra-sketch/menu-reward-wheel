import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

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
  });
}

function generateSessionAccessCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const STALE_HOURS = 2;

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

    const { restaurant_id, touchpoint_id, known_session_id } = body as {
      restaurant_id?: string;
      touchpoint_id?: string;
      known_session_id?: string | null;
    };

    if (!restaurant_id || !touchpoint_id) {
      return NextResponse.json(
        { error: 'restaurant_id and touchpoint_id are required.' },
        { status: 400 },
      );
    }

    const supabase = makeServiceClient();

    // 1. Validate touchpoint belongs to restaurant and is active
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

    // 2. Look for existing active session for this touchpoint
    const { data: existingSession } = await supabase
      .from('visit_sessions')
      .select('id, session_access_code, last_activity_at, guest_count, status, started_at')
      .eq('touchpoint_id', touchpoint_id)
      .eq('status', 'active')
      .maybeSingle();

    let sessionId: string;
    let sessionAccessCode: string;
    let isNewSession = false;
    let isNewDevice = false;

    if (existingSession) {
      const lastActivity = new Date(existingSession.last_activity_at);
      const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);

      if (lastActivity < staleThreshold) {
        // Task 6: Mark stale session abandoned, then create a new one
        await supabase
          .from('visit_sessions')
          .update({ status: 'abandoned', ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', existingSession.id);

        const newCode = generateSessionAccessCode();
        const { data: newSession, error: createError } = await supabase
          .from('visit_sessions')
          .insert({
            restaurant_id,
            touchpoint_id,
            status: 'active',
            session_access_code: newCode,
            guest_count: 1,
            session_interaction_log: JSON.stringify([
              { event: 'qr_scan', ts: new Date().toISOString() },
            ]),
          })
          .select('id, session_access_code')
          .single();

        if (createError || !newSession) {
          console.error('[spinbite:sessions] create after abandon failed', createError?.message);
          return NextResponse.json({ error: 'Failed to create session.' }, { status: 500 });
        }

        sessionId = newSession.id;
        sessionAccessCode = newSession.session_access_code;
        isNewSession = true;
        isNewDevice = true;
      } else {
        // Existing active, fresh session — return it
        sessionId = existingSession.id;
        sessionAccessCode = existingSession.session_access_code;

        // Task 7: Guest count — is this a new device joining?
        // Client sends known_session_id from sessionStorage; mismatch = new device
        isNewDevice = !known_session_id || known_session_id !== existingSession.id;

        if (isNewDevice) {
          // Increment guest_count for the new device joining
          await supabase
            .from('visit_sessions')
            .update({
              guest_count: existingSession.guest_count + 1,
              last_activity_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSession.id)
            .eq('status', 'active');
        }

        // Append qr_scan event to interaction log
        await supabase.rpc('append_session_interaction', {
          p_session_id: sessionId,
          p_event: { event: 'qr_scan', ts: new Date().toISOString() },
        });
      }
    } else {
      // No existing active session — create new
      const newCode = generateSessionAccessCode();
      const { data: newSession, error: createError } = await supabase
        .from('visit_sessions')
        .insert({
          restaurant_id,
          touchpoint_id,
          status: 'active',
          session_access_code: newCode,
          guest_count: 1,
          session_interaction_log: JSON.stringify([
            { event: 'qr_scan', ts: new Date().toISOString() },
          ]),
        })
        .select('id, session_access_code')
        .single();

      if (createError || !newSession) {
        // Handle concurrent insert race: partial unique index violation (23505)
        if (createError?.code === '23505') {
          const { data: raceSession } = await supabase
            .from('visit_sessions')
            .select('id, session_access_code, guest_count')
            .eq('touchpoint_id', touchpoint_id)
            .eq('status', 'active')
            .maybeSingle();

          if (raceSession) {
            sessionId = raceSession.id;
            sessionAccessCode = raceSession.session_access_code;
            isNewDevice = !known_session_id || known_session_id !== raceSession.id;
          } else {
            console.error('[spinbite:sessions] race condition but no session found');
            return NextResponse.json({ error: 'Failed to resolve session.' }, { status: 500 });
          }
        } else {
          console.error('[spinbite:sessions] create failed', createError?.message);
          return NextResponse.json({ error: 'Failed to create session.' }, { status: 500 });
        }
      } else {
        sessionId = newSession.id;
        sessionAccessCode = newSession.session_access_code;
        isNewSession = true;
        isNewDevice = true;
      }
    }

    console.log('[spinbite:sessions] resolved', {
      session_id: sessionId,
      touchpoint_id,
      is_new_session: isNewSession,
      is_new_device: isNewDevice,
    });

    return NextResponse.json(
      {
        visit_session_id: sessionId,
        session_access_code: sessionAccessCode,
        touchpoint_name: touchpoint.name,
        touchpoint_type: touchpoint.type,
        section_name: touchpoint.section_name,
        is_new_session: isNewSession,
        is_new_device: isNewDevice,
      },
      { status: isNewSession ? 201 : 200 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.';
    console.error('[spinbite:sessions] resolve error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
