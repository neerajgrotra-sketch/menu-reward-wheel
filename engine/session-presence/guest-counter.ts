// ── Active Guest Counter ───────────────────────────────────────────────────────
//
// getActiveGuestCount(sessionId) — returns the number of guests currently
// considered active (status = 'active') for a session.
//
// Always runs a stale sweep before counting so the returned number reflects
// the 3-minute inactivity rule without requiring a separate caller step.
//
// Powers the 👥 N indicator on the admin sessions UI.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sweepStaleGuests } from './presence-heartbeat';

export async function getActiveGuestCount(
  sessionId: string,
  supabase: SupabaseClient,
): Promise<number> {
  // Sweep first so count reflects current presence state
  await sweepStaleGuests(sessionId, supabase);

  const { count, error } = await supabase
    .from('session_guests')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'active');

  if (error || count === null) return 0;
  return count;
}
