import type { SupabaseClient } from '@supabase/supabase-js';

// Returns the session id if it exists, belongs to the restaurant, and is
// currently 'active'; null otherwise. Never silently detach a session and
// insert an orphan order (Rules 34/39) — callers must reject with 409
// SESSION_INVALID when a visitSessionId was supplied but this returns null.
export async function resolveActiveSessionId(
  supabase: SupabaseClient,
  restaurantId: string,
  visitSessionId: string,
): Promise<string | null> {
  const { data: sessionRow } = await supabase
    .from('visit_sessions')
    .select('id')
    .eq('id', visitSessionId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .maybeSingle();

  return sessionRow?.id ?? null;
}
