import ScratchCardGame from '@/components/games/ScratchCardGame';
import { mysteryBoxContract } from '@/lib/games/mystery-box/contract';
import { spinWheelContract } from '@/lib/games/spin-wheel/contract';
import type {
  GameContract,
  GameDefinition,
  GamePhase,
  ValidationResult,
} from '@/lib/games/types';

/**
 * PR 4
 *
 * Spin Wheel and Mystery Box now use formal per-game contract folders.
 * Scratch Card remains inline temporarily and will be migrated in a future PR.
 *
 * Promotion Builder should continue migrating toward consuming contracts
 * through getGameContract() instead of direct hardcoded branching.
 */

const defaultSupportedPhases: GamePhase[] = [
  'idle',
  'previewing',
  'playing',
  'animating',
  'revealing',
  'completed',
];

function createDefaultValidationResult(): ValidationResult {
  return {
    valid: true,
    errors: [],
  };
}

function defaultRewardFormatter(reward: any): string {
  if (!reward) return '';
  return reward.description
    ? `${reward.label} — ${reward.description}`
    : reward.label || '';
}

const scratchCardGame: GameContract = {
  type: 'scratch_card',
  name: 'Scratch Card',
  icon: '🪙',
  availability: 'active',
  labels: {
    title: 'Scratch & Win',
    instruction: 'Scratch the card to reveal your reward.',
    playsAvailableSuffix: 'scratches left 🪙',
    noPlaysText: 'No scratches left — enjoy your rewards 🎉',
    playAgainText: 'Scratch Again',
  },
  createCard: {
    title: 'Scratch Card',
    description: 'Customers tap a digital scratch card to reveal a surprise reward using the same coupon engine.',
    statusLabel: 'Available now',
  },
  preview: {
    supportsBuilderPreview: true,
    previewTitle: 'Scratch Card Preview',
    previewDisclaimer: 'Preview only. Coupon issuing happens on the live play page.',
  },
  analytics: {
    category: 'instant_win',
    eventPrefix: 'scratch_card',
  },
  resultDelayMs: 1400,
  supportedPhases: defaultSupportedPhases,
  validateConfig: () => createDefaultValidationResult(),
  formatReward: defaultRewardFormatter,
  confetti: {
    particleCount: 220,
    spread: 110,
    origin: { y: 0.6 },
  },
  PlayComponent: ScratchCardGame,
  getTargetRotation: () => null,
};

export const gameRegistry: Record<string, GameContract> = {
  wheel: spinWheelContract,
  spin_wheel: spinWheelContract,
  mystery_box: mysteryBoxContract,
  scratch_card: scratchCardGame,
};

export const availableGames = Object.values(gameRegistry).filter(
  (game) => game.availability !== 'hidden',
);

export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  if (gameType === 'scratch_card') return gameRegistry.scratch_card;
  if (gameType === 'spin_wheel') return gameRegistry.spin_wheel;
  return gameRegistry.wheel;
}

export function getGameContract(gameType?: string | null): GameContract {
  return getGameDefinition(gameType);
}

export function getAvailableGameContracts(): GameContract[] {
  return availableGames;
}
