// ── Session Join Resolver ──────────────────────────────────────────────────────
//
// Canonical logic for a device joining a dining session.
//
// Given a touchpoint (table), this function:
//   1. Finds any existing active session for that touchpoint
//   2. Abandons it if stale (no activity for STALE_HOURS)
//   3. Creates a new dining session when needed
//   4. Always creates a new session_guests row for the joining device
//   5. Atomically increments visit_sessions.guest_count for new devices
//
// Called by POST /api/public/sessions/resolve.
// Returns everything the route needs to compose its response.
//
// DB calls use the service-role client — no RLS bypass needed at call sites.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { JoinSessionResult } from './types';

const STALE_HOURS = 2;

// Two UUID4s concatenated, no hyphens — 64 hex chars, 256 bits of entropy.
// Sufficient as an opaque bearer token for heartbeat auth.
function generateGuestToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

function generateSessionAccessCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function resolveSessionJoin(
  touchpointId: string,
  restaurantId: string,
  deviceFingerprint: string,
  userAgent: string | null,
  knownSessionId: string | null,
  supabase: SupabaseClient,
): Promise<JoinSessionResult> {
  // ── 1. Look for an existing active session on this touchpoint ─────────────

  const { data: existing } = await supabase
    .from('visit_sessions')
    .select('id, session_access_code, last_activity_at, guest_count, status')
    .eq('touchpoint_id', touchpointId)
    .eq('status', 'active')
    .maybeSingle();

  let sessionId: string;
  let sessionAccessCode: string;
  let isNewSession = false;

  const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000);
  const existingIsFresh =
    existing !== null && new Date(existing.last_activity_at) >= staleThreshold;

  if (existingIsFresh) {
    // Reuse the active session
    sessionId = existing.id;
    sessionAccessCode = existing.session_access_code;
  } else {
    // Abandon stale session (if any) and create a fresh one
    if (existing) {
      await supabase
        .from('visit_sessions')
        .update({
          status: 'abandoned',
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Invalidate all lingering guests from the abandoned session (non-fatal)
      void Promise.resolve(
        supabase.rpc('disconnect_session_guests', { p_session_id: existing.id })
      ).catch((e: unknown) => {
        console.warn('[spinbite:presence] disconnect_session_guests failed', e);
      });
    }

    const newCode = generateSessionAccessCode();
    const { data: created, error: createErr } = await supabase
      .from('visit_sessions')
      .insert({
        restaurant_id: restaurantId,
        touchpoint_id: touchpointId,
        status: 'active',
        session_access_code: newCode,
        guest_count: 1,
        session_interaction_log: JSON.stringify([
          { event: 'qr_scan', ts: new Date().toISOString() },
        ]),
      })
      .select('id, session_access_code')
      .single();

    if (createErr || !created) {
      // Race condition: another request created the session concurrently.
      // The partial unique index (status = 'active') prevents two active sessions
      // on the same touchpoint — error code 23505.
      if (createErr?.code === '23505') {
        const { data: race } = await supabase
          .from('visit_sessions')
          .select('id, session_access_code')
          .eq('touchpoint_id', touchpointId)
          .eq('status', 'active')
          .maybeSingle();

        if (!race) throw new Error('Failed to resolve session after concurrent insert.');
        sessionId = race.id;
        sessionAccessCode = race.session_access_code;
        // isNewSession stays false — we lost the race but the session exists
      } else {
        throw new Error(createErr?.message ?? 'Failed to create session.');
      }
    } else {
      sessionId = created.id;
      sessionAccessCode = created.session_access_code;
      isNewSession = true;
    }
  }

  // ── 2. Determine if this is a new device vs. same device reconnecting ─────
  //
  // A device is considered the "same" if it already knows the current session ID
  // (stored in sessionStorage from a prior visit in this browser tab).
  // Any other case — new device, different tab, cleared storage — is new.

  const isNewDevice = !knownSessionId || knownSessionId !== sessionId;

  // ── 3. Create a session_guests row for this device ────────────────────────
  // Non-fatal: if session_guests table is unavailable (e.g. pending migration),
  // session resolution still succeeds. Guest tracking degrades gracefully.

  const guestToken = generateGuestToken();
  let guestId = '';

  try {
    const { data: guest, error: guestErr } = await supabase
      .from('session_guests')
      .insert({
        session_id: sessionId,
        restaurant_id: restaurantId,
        guest_token: guestToken,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
        status: 'active',
      })
      .select('id')
      .single();

    if (guestErr) {
      console.warn('[spinbite:presence] session_guests insert failed', guestErr.message);
    } else if (guest) {
      guestId = guest.id;
    }
  } catch (e: unknown) {
    console.warn('[spinbite:presence] session_guests unavailable', e);
  }

  // ── 4. Increment guest_count on the session for new devices ───────────────
  //
  // For new sessions, guest_count was seeded to 1 at insert time.
  // For existing sessions with a new device joining, increment atomically.
  // Same-device reconnects do not increment (prevents inflation on refreshes).

  if (!isNewSession && isNewDevice) {
    void Promise.resolve(
      supabase.rpc('increment_guest_count', { p_session_id: sessionId })
    ).catch((e: unknown) => {
      console.warn('[spinbite:presence] increment_guest_count failed', e);
    });
  }

  // Touch last_activity_at on reconnects (keeps session alive without inflating count)
  if (!isNewSession && !isNewDevice) {
    await supabase
      .from('visit_sessions')
      .update({
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('status', 'active');
  }

  return {
    session_id: sessionId,
    guest_id: guestId,
    guest_token: guestToken,
    is_new_session: isNewSession,
    is_new_device: isNewDevice,
    session_access_code: sessionAccessCode,
  };
}
