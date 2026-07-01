// ── Presence Heartbeat ────────────────────────────────────────────────────────
//
// updateGuestPresence(guestToken) — called by POST /heartbeat on each ping.
//   Refreshes last_seen_at and returns current status + session liveness.
//   If the guest token is unknown or the parent session is no longer active,
//   returns session_active: false so the frontend can redirect.
//
// sweepStaleGuests(sessionId) — maintenance sweep per session.
//   Drives the inactive / disconnected status transitions defined in the migration.
//   Called at the start of getActiveGuestCount so counts are always fresh.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { HeartbeatResult, GuestStatus } from './types';

export async function updateGuestPresence(
  guestToken: string,
  supabase: SupabaseClient,
): Promise<HeartbeatResult> {
  // Fetch the guest row and its parent session status in one round-trip
  const { data: guest } = await supabase
    .from('session_guests')
    .select('id, status, session_id, visit_sessions!inner(status)')
    .eq('guest_token', guestToken)
    .maybeSingle();

  if (!guest) {
    return { updated: false, status: null, session_active: false };
  }

  // Type-narrow the nested join result
  const sessionStatus = (guest.visit_sessions as unknown as { status: string } | null)?.status;
  const sessionActive = sessionStatus === 'active';

  // If session ended, ensure this guest is disconnected
  if (!sessionActive) {
    if (guest.status !== 'disconnected' && guest.status !== 'blocked') {
      await supabase
        .from('session_guests')
        .update({ status: 'disconnected' })
        .eq('id', guest.id);
    }
    return { updated: false, status: 'disconnected', session_active: false };
  }

  // Blocked guests cannot heartbeat — that's an explicit staff action and
  // must never be silently overridden by a client that's still pinging.
  //
  // 'disconnected' is NOT excluded here (was previously, which was the bug):
  // disconnected only means "no heartbeat for 13+ minutes," an *inference*
  // from absence. The moment a heartbeat actually arrives, that inference is
  // false — the device is provably still there — so it must be allowed to
  // resurrect the guest back to 'active', exactly like resolveSessionJoin's
  // reattach path already does (which excludes only 'blocked', not
  // 'disconnected'). Without this, a guest whose tab survives backgrounding
  // long enough to cross the disconnect threshold (e.g. iOS Safari
  // suspending a backgrounded tab's timers) gets stuck showing as
  // permanently gone even while still actively heartbeating, because every
  // heartbeat after that point was a silent no-op.
  if (guest.status === 'blocked') {
    return { updated: false, status: guest.status as GuestStatus, session_active: true };
  }

  // Refresh presence — reactivate if the guest was inactive or disconnected
  const { error } = await supabase
    .from('session_guests')
    .update({
      last_seen_at: new Date().toISOString(),
      status: 'active',
    })
    .eq('id', guest.id);

  if (error) {
    return { updated: false, status: guest.status as GuestStatus, session_active: true };
  }

  return { updated: true, status: 'active', session_active: true };
}

// Delegates to the SQL RPC which applies both thresholds atomically.
// Returns void — callers that need counts call getActiveGuestCount after.
export async function sweepStaleGuests(
  sessionId: string,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase.rpc('update_stale_guest_presence', { p_session_id: sessionId });
}
