import { createClient } from '@supabase/supabase-js';
import { selectWeightedGame } from './selectWeightedGame';
import { resolveGameTypeFromSlug } from '@/lib/games/game-registry';
import type { GamePoolEntry, GameType } from './types';

// Must opt out of Next.js 14's Data Cache on every fetch. `cache: 'no-store'` prevents
// Next.js from returning a cached empty GET for new session tokens, which would cause
// the fast-path SELECT to return null and turn every recovery call into a 409 conflict.
// Client is created inside the function (not at module scope) so build-time module
// evaluation does not require env vars to be present.
function makeSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
          fetch(url, { ...options, cache: 'no-store' }),
      },
    },
  );
}

interface ResolvePromotionGameParams {
  promotionId: string;
  sessionToken: string;
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
  customerId,
  ipAddress,
  userAgent,
}: ResolvePromotionGameParams): Promise<ResolveResult> {
  const supabase = makeSupabaseClient();
  // Fast path: session already exists (reload / rescan scenario).
  const { data: existingSession } = await supabase
    .from('play_sessions')
    .select('id, selected_game_type')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (existingSession) {
    return {
      gameType: (existingSession.selected_game_type as GameType) || ('spin_wheel' as GameType),
      isNewSession: false,
      playSessionId: existingSession.id as string,
    };
  }

  // New session: build game pool from promotion_game_assignments, cross-checked against
  // games.status = 'active'. Running both queries in parallel ensures Super Admin disabling
  // a game takes immediate effect at runtime — stale enabled assignments are filtered out.
  const normType = (gt: string) => (gt === 'wheel' ? 'spin_wheel' : gt);

  const [assignmentsResult, activeGamesResult] = await Promise.all([
    supabase
      .from('promotion_game_assignments')
      .select('game_type, weight, enabled')
      .eq('promotion_id', promotionId)
      .eq('enabled', true),
    supabase
      .from('games')
      .select('slug')
      .eq('status', 'active'),
  ]);

  if (assignmentsResult.error) {
    throw new Error(`Failed to fetch game assignments: ${assignmentsResult.error.message}`);
  }
  if (activeGamesResult.error) {
    throw new Error(`Failed to fetch active games: ${activeGamesResult.error.message}`);
  }

  // Only games that are both assignment-enabled AND currently active in Super Admin enter the pool.
  // Resolved via games.slug (NOT NULL/UNIQUE since the table's first migration), not games.id —
  // a UUID primary key that can never match a promotion_game_assignments.game_type slug like
  // 'open_the_door'. Comparing against id here made the pool empty for every promotion.
  const activeGameTypes = new Set(
    (activeGamesResult.data ?? [])
      .map((g) => resolveGameTypeFromSlug(g.slug))
      .filter((gameType): gameType is string => !!gameType)
      .map(normType)
  );

  // De-duplicate by normalised game_type ('wheel' and 'spin_wheel' are the same game).
  const seen = new Set<string>();
  const effectivePool: GamePoolEntry[] = [];

  for (const a of (assignmentsResult.data ?? [])) {
    const norm = normType(a.game_type);
    if (!seen.has(norm) && activeGameTypes.has(norm)) {
      seen.add(norm);
      effectivePool.push({ gameType: a.game_type as GameType, weight: a.weight, enabled: a.enabled });
    }
  }

  if (effectivePool.length === 0) {
    throw new Error(
      `No active game assignments found for promotion ${promotionId}. ` +
      `Ensure promotion_game_assignments has at least one enabled row with is_primary=true.`
    );
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
