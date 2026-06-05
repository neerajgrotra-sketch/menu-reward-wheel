import { createClient } from '@supabase/supabase-js';
import { selectWeightedGame } from './selectWeightedGame';
import type { GamePoolEntry, GameType } from './types';

// The module-level client must opt out of Next.js 14's Data Cache. Without
// `cache: 'no-store'`, Next.js caches the initial empty GET response for a
// new session token and serves it on the very next request (the recovery
// reload), causing the fast-path SELECT to return null even though the row
// was just inserted — and turning every recovery call into a 409 conflict
// that falls through to playSessionId: "".
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
        fetch(url, { ...options, cache: 'no-store' }),
    },
  },
);

interface ResolvePromotionGameParams {
  promotionId: string;
  sessionToken: string;
  fallbackGameType?: GameType;
  customerId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResolveResult {
  gameType: GameType;
  isNewSession: boolean;
  /** UUID primary key of the play_sessions row — used as FK when issuing coupons. */
  playSessionId: string;
}

export async function resolvePromotionGame({
  promotionId,
  sessionToken,
  fallbackGameType,
  customerId,
  ipAddress,
  userAgent,
}: ResolvePromotionGameParams): Promise<ResolveResult> {
  // Fast path: session already exists (reload / rescan scenario).
  const { data: existingSession } = await supabase
    .from('play_sessions')
    .select('id, selected_game_type')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (existingSession) {
    return {
      gameType: (existingSession.selected_game_type as GameType) || (fallbackGameType ?? ('wheel' as GameType)),
      isNewSession: false,
      playSessionId: existingSession.id as string,
    };
  }

  // New session: pick a game type from the promotion's pool.
  const { data: assignments, error } = await supabase
    .from('promotion_game_assignments')
    .select('game_type, weight, enabled')
    .eq('promotion_id', promotionId)
    .eq('enabled', true);

  if (error) {
    throw new Error(`Failed to fetch game assignments: ${error.message}`);
  }

  // Build the effective pool: primary experience always leads, followed by
  // additional experiences from promotion_game_assignments.
  // De-duplicate by normalised game_type: 'wheel' and 'spin_wheel' are the same
  // game stored under two historical identifiers and must count as one slot.
  const normType = (gt: string) => (gt === 'wheel' ? 'spin_wheel' : gt);
  const seen = new Set<string>();
  const effectivePool: GamePoolEntry[] = [];

  if (fallbackGameType) {
    seen.add(normType(fallbackGameType));
    effectivePool.push({ gameType: fallbackGameType, weight: 1, enabled: true });
  }

  for (const a of (assignments ?? [])) {
    if (!seen.has(normType(a.game_type))) {
      seen.add(normType(a.game_type));
      effectivePool.push({ gameType: a.game_type as GameType, weight: a.weight, enabled: a.enabled });
    }
  }

  if (effectivePool.length === 0) {
    throw new Error('No game pool assignments or fallback game type available');
  }

  const selectedGame = selectWeightedGame(effectivePool).gameType;

  // Insert new session and return the generated id.
  // If a concurrent request already inserted the same token (race condition),
  // catch the unique-constraint violation (23505) and recover by fetching the
  // winner's row rather than crashing.
  const { data: newSession, error: sessionError } = await supabase
    .from('play_sessions')
    .insert({
      promotion_id: promotionId,
      selected_game_type: selectedGame,
      session_token: sessionToken,
      customer_id: customerId,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (sessionError) {
    if (sessionError.code === '23505') {
      // Race: another in-flight request won the insert. Fetch what it stored.
      const { data: racedSession } = await supabase
        .from('play_sessions')
        .select('id, selected_game_type')
        .eq('session_token', sessionToken)
        .maybeSingle();

      if (!racedSession?.id) {
        // The session exists (23505 confirms it) but the SELECT returned nothing —
        // typically a transient connection-pooler issue. Throw so the outer catch
        // returns a 500 the client can retry rather than silently returning an
        // empty playSessionId that breaks downstream coupon lookup.
        throw new Error(`Race-condition recovery failed: session ${sessionToken} exists but could not be read back.`);
      }

      return {
        gameType: (racedSession.selected_game_type as GameType) || selectedGame,
        isNewSession: false,
        playSessionId: racedSession.id as string,
      };
    }

    throw new Error(`Failed to persist play session: ${sessionError.message}`);
  }

  return {
    gameType: selectedGame,
    isNewSession: true,
    playSessionId: newSession.id as string,
  };
}
