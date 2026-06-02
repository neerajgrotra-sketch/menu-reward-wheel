import { mysteryBoxContract } from '@/lib/games/mystery-box/contract';
import { openTheDoorContract } from '@/lib/games/open-the-door/contract';
import { rewardReelsContract } from '@/lib/games/reward-reels/contract';
import { scratchCardContract } from '@/lib/games/scratch-card/contract';
import { spinWheelContract } from '@/lib/games/spin-wheel/contract';
import type { ComponentType } from 'react';
import type {
  GameContract,
  GameDefinition,
  GameType,
} from '@/lib/games/types';

/**
 * PR 5
 *
 * All current customer games now use formal per-game contract folders:
 * - Spin Wheel
 * - Mystery Box
 * - Scratch Card
 * - Reward Reels placeholder
 *
 * Scratch Card now also has a dedicated state-machine foundation for
 * future choreography and reveal sequencing improvements.
 *
 * Promotion Builder should continue migrating away from hardcoded game
 * branches and toward contract-driven rendering.
 */

export const gameRegistry: Record<string, GameContract> = {
  wheel: spinWheelContract,
  spin_wheel: spinWheelContract,
  mystery_box: mysteryBoxContract,
  scratch_card: scratchCardContract,
  reward_reels: rewardReelsContract,
  open_the_door: openTheDoorContract,
};

export const availableGames = Object.values(gameRegistry).filter(
  (game, index, games) =>
    game.availability !== 'hidden' &&
    games.findIndex((candidate) => candidate.type === game.type) === index,
);

const validGameTypes: GameType[] = [
  'wheel',
  'spin_wheel',
  'mystery_box',
  'scratch_card',
  'reward_reels',
  'open_the_door',
];

export function isValidGameType(gameType?: string | null): gameType is GameType {
  return validGameTypes.includes(gameType as GameType);
}

export function getRuntimeGameComponent(gameType?: string | null): ComponentType<any> | null {
  if (!isValidGameType(gameType)) return null;
  return getGameDefinition(gameType).PlayComponent;
}

export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  if (gameType === 'scratch_card') return gameRegistry.scratch_card;
  if (gameType === 'reward_reels') return gameRegistry.reward_reels;
  if (gameType === 'open_the_door') return gameRegistry.open_the_door;
  if (gameType === 'spin_wheel') return gameRegistry.spin_wheel;
  return gameRegistry.wheel;
}

export function getGameContract(gameType?: string | null): GameContract {
  return getGameDefinition(gameType);
}

export function getAvailableGameContracts(): GameContract[] {
  return availableGames;
}
