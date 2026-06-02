import type { GameType as CanonicalGameType } from '@/lib/games/types';

export type GameType = CanonicalGameType;

export interface GamePoolEntry {
  gameType: GameType;
  weight: number;
  enabled: boolean;
}

export interface SelectedGameResult {
  gameType: GameType;
  selectedAt: string;
}
