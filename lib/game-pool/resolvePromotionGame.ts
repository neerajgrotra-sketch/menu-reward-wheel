import { createClient } from '@supabase/supabase-js';
import { selectWeightedGame } from './selectWeightedGame';
import type { GamePoolEntry, GameType } from './types';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

  const gamePool: GamePoolEntry[] =
    assignments?.map((assignment) => ({
      gameType: assignment.game_type as GameType,
      weight: assignment.weight,
      enabled: assignment.enabled,
    })) ?? [];

  let selectedGame: GameType;

  if (gamePool.length > 0) {
    selectedGame = selectWeightedGame(gamePool).gameType;
  } else {
    if (!fallbackGameType) {
      throw new Error('No game pool assignments or fallback game type available');
    }
    selectedGame = fallbackGameType;
  }

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

      return {
        gameType: (racedSession?.selected_game_type as GameType) || selectedGame,
        isNewSession: false,
        playSessionId: (racedSession?.id as string) ?? '',
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
