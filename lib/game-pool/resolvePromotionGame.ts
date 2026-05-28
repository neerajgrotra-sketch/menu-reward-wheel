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

export async function resolvePromotionGame({
  promotionId,
  sessionToken,
  fallbackGameType,
  customerId,
  ipAddress,
  userAgent,
}: ResolvePromotionGameParams): Promise<GameType> {
  const { data: existingSession } = await supabase
    .from('play_sessions')
    .select('selected_game_type')
    .eq('session_token', sessionToken)
    .maybeSingle();

  if (existingSession?.selected_game_type) {
    return existingSession.selected_game_type as GameType;
  }

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

  const { error: sessionError } = await supabase
    .from('play_sessions')
    .insert({
      promotion_id: promotionId,
      selected_game_type: selectedGame,
      session_token: sessionToken,
      customer_id: customerId,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

  if (sessionError) {
    throw new Error(`Failed to persist play session: ${sessionError.message}`);
  }

  return selectedGame;
}
