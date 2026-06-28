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

export async function PATCH(
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

    const serviceClient = makeServiceClient();

    // Verify the session belongs to a restaurant owned by this user
    const { data: session } = await serviceClient
      .from('visit_sessions')
      .select('id,restaurant_id,status,started_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
    }

    const { data: restaurant } = await serviceClient
      .from('restaurants')
      .select('id')
      .eq('id', session.restaurant_id)
      .eq('owner_id', userData.user.id)
      .maybeSingle();

    if (!restaurant) {
      return NextResponse.json({ error: 'Not authorised to end this session.' }, { status: 403 });
    }

    if (session.status !== 'active') {
      return NextResponse.json({ error: 'Session is already ended.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const startedAt = new Date(session.started_at ?? now).getTime();
    const durationSeconds = Math.floor((Date.now() - startedAt) / 1000);

    const { error: updateError } = await serviceClient
      .from('visit_sessions')
      .update({
        status: 'completed',
        ended_at: now,
        ended_by: userData.user.id,
        updated_at: now,
      })
      .eq('id', sessionId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Disconnect all session_guests — invalidates every guest_token immediately.
    // Any in-flight heartbeat after this point will receive session_active: false.
    // Fire-and-forget: session row is already closed; guest invalidation is best-effort.
    Promise.resolve(
      serviceClient.rpc('disconnect_session_guests', { p_session_id: sessionId })
    ).catch((err: unknown) => {
      console.error('[spinbite:sessions] disconnect_session_guests failed', err);
    });

    // Write SESSION_ENDED to session_events (fire-and-forget; session is already closed)
    Promise.resolve(serviceClient.from('session_events').insert({
      session_id: sessionId,
      restaurant_id: session.restaurant_id,
      event_type: 'SESSION_ENDED',
      metadata: { reason: 'manual', duration_seconds: durationSeconds },
    })).catch((err: unknown) => {
      console.error('[spinbite:sessions] SESSION_ENDED event failed', err);
    });

    // Broadcast instant termination to all connected customer devices.
    // Uses Supabase Realtime Broadcast REST API — HTTP, no WebSocket needed server-side.
    // Customer pages subscribed to session-lifecycle:{sessionId} receive this immediately.
    // Fire-and-forget: the 30s presence poll is the safety net if broadcast fails.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && serviceKey) {
      void fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
        },
        body: JSON.stringify({
          messages: [{
            topic: `session-lifecycle:${sessionId}`,
            event: 'session_ended',
            payload: { session_id: sessionId },
          }],
        }),
      }).catch((err: unknown) => {
        console.error('[spinbite:sessions] broadcast session_ended failed', err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
