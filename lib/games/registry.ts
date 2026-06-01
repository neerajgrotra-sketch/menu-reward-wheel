import { mysteryBoxContract } from '@/lib/games/mystery-box/contract';
import { rewardReelsContract } from '@/lib/games/reward-reels/contract';
import { scratchCardContract } from '@/lib/games/scratch-card/contract';
import { spinWheelContract } from '@/lib/games/spin-wheel/contract';
import type {
  GameContract,
  GameDefinition,
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
};

export const availableGames = Object.values(gameRegistry).filter(
  (game, index, games) =>
    game.availability !== 'hidden' &&
    games.findIndex((candidate) => candidate.type === game.type) === index,
);

export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  if (gameType === 'scratch_card') return gameRegistry.scratch_card;
  if (gameType === 'reward_reels') return gameRegistry.reward_reels;
  if (gameType === 'spin_wheel') return gameRegistry.spin_wheel;
  return gameRegistry.wheel;
}

export function getGameContract(gameType?: string | null): GameContract {
  return getGameDefinition(gameType);
}

export function getAvailableGameContracts(): GameContract[] {
  return availableGames;
}
