export type GameType =
  | 'wheel'
  | 'mystery_box'
  | 'scratch_card'
  | 'open_the_door'
  | 'slot_machine'
  | 'pick_a_door'
  | 'fortune_cookie';

export interface GamePoolEntry {
  gameType: GameType;
  weight: number;
  enabled: boolean;
}

export interface SelectedGameResult {
  gameType: GameType;
  selectedAt: string;
}
