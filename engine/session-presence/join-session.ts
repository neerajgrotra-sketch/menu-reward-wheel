// ── Session Join Resolver ──────────────────────────────────────────────────────
//
// Canonical logic for a device joining a dining session.
//
// Given a touchpoint (table), this function:
//   1. Finds any existing active session for that touchpoint
//   2. Abandons it if stale (no activity for STALE_HOURS)
//   3. Creates a new dining session when needed
//   4. Reattaches to the caller's existing session_guests row when a valid
//      known_guest_token is provided for THIS session — otherwise creates one
//   5. Atomically increments visit_sessions.guest_count only for genuinely new devices
//
// Called by POST /api/public/sessions/resolve.
// Returns everything the route needs to compose its response.
//
// DB calls use the service-role client — no RLS bypass needed at call sites.
//
// session_guests is the single source of truth for "who is connected." A page
// refresh must reuse the caller's existing row, never create a second one —
// otherwise the same physical guest counts twice until the 3-minute stale
// sweep catches up, which is exactly what caused the ribbon/popover guest
// count mismatch and refresh-triggered fluctuation (2026-07-01 audit).

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
  knownGuestToken: string | null,
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
        // @deprecated visit_sessions.session_interaction_log — use session_events table instead.
        // Retained for backward compatibility only. No new writes should be added here.
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

  // ── 3. Reattach to an existing session_guests row, or create one ──────────
  //
  // A valid known_guest_token scoped to THIS resolved session is definitive
  // proof this is the same device reconnecting (e.g. a page refresh) — reuse
  // its row instead of inserting a new one. Only fall back to inserting when
  // no token was provided, or the token doesn't belong to this session (new
  // device, cleared storage, or the prior session was abandoned/recreated).
  // Non-fatal throughout: if session_guests is unavailable, session
  // resolution still succeeds and guest tracking degrades gracefully.

  let guestToken = '';
  let guestId = '';
  let reattached = false;

  if (knownGuestToken) {
    try {
      const { data: existingGuest } = await supabase
        .from('session_guests')
        .select('id, status')
        .eq('guest_token', knownGuestToken)
        .eq('session_id', sessionId)
        .maybeSingle();

      if (existingGuest && existingGuest.status !== 'blocked') {
        const { error: reattachErr } = await supabase
          .from('session_guests')
          .update({ status: 'active', last_seen_at: new Date().toISOString() })
          .eq('id', existingGuest.id);

        if (!reattachErr) {
          guestId = existingGuest.id;
          guestToken = knownGuestToken;
          reattached = true;
        }
      }
    } catch (e: unknown) {
      console.warn('[spinbite:presence] guest reattach lookup failed', e);
    }
  }

  if (!reattached) {
    guestToken = generateGuestToken();
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
  }

  // ── 4. Increment guest_count on the session for genuinely new devices ─────
  //
  // For new sessions, guest_count was seeded to 1 at insert time.
  // For existing sessions with a new device joining, increment atomically.
  // Reattached devices never increment — they were already counted.

  if (!isNewSession && isNewDevice && !reattached) {
    void Promise.resolve(
      supabase.rpc('increment_guest_count', { p_session_id: sessionId })
    ).catch((e: unknown) => {
      console.warn('[spinbite:presence] increment_guest_count failed', e);
    });
  }

  // Touch last_activity_at on reconnects (keeps session alive without inflating count)
  if (!isNewSession && (!isNewDevice || reattached)) {
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
    is_new_device: isNewDevice && !reattached,
    session_access_code: sessionAccessCode,
  };
}
