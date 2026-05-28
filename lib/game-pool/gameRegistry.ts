import type { ComponentType } from 'react';
import type { GameType } from './types';

const PlaceholderGame = (() => null) as ComponentType<any>;

export const GAME_REGISTRY: Record<GameType, ComponentType<any>> = {
  wheel: PlaceholderGame,
  mystery_box: PlaceholderGame,
  scratch_card: PlaceholderGame,
  slot_machine: PlaceholderGame,
  pick_a_door: PlaceholderGame,
  fortune_cookie: PlaceholderGame,
};
