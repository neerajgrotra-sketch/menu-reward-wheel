import MysteryBoxGameAdapter from '@/components/games/MysteryBoxGameAdapter';
import ScratchCardGame from '@/components/games/ScratchCardGame';
import WheelGame from '@/components/games/WheelGame';
import { getRewardWheelTargetRotation } from '@/components/RewardWheel';
import type {
  GameContract,
  GameDefinition,
  GamePhase,
  GameType,
  ValidationResult,
} from '@/lib/games/types';

/**
 * PR 1 FOUNDATION
 *
 * This registry intentionally wraps the EXISTING game implementations
 * without changing runtime behavior.
 *
 * Future PRs will:
 * - Move each game into its own /lib/games/<game>/ folder
 * - Extract builder previews from Promotion Builder
 * - Extract animation choreography
 * - Add formal game state machines
 * - Reduce hardcoded game branches
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

const wheelGame: GameContract = {
  type: 'wheel',
  name: 'Spin Wheel',
  icon: '🎯',
  availability: 'active',
  labels: {
    title: 'Spin & Win',
    instruction: 'Spin to unlock your reward.',
    playsAvailableSuffix: 'plays left 🎯',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Spin Again',
  },
  createCard: {
    title: 'Spin Wheel',
    description: 'Customers scan a QR code, spin a branded prize wheel, and win configured rewards.',
    statusLabel: 'Available now',
  },
  preview: {
    supportsBuilderPreview: true,
    previewTitle: 'Wheel Preview',
    previewDisclaimer: 'Preview only. Coupon issuing happens on the live play page.',
  },
  analytics: {
    category: 'chance',
    eventPrefix: 'wheel',
  },
  resultDelayMs: 2900,
  supportedPhases: defaultSupportedPhases,
  validateConfig: () => createDefaultValidationResult(),
  formatReward: defaultRewardFormatter,
  confetti: {
    particleCount: 180,
    spread: 100,
    origin: { y: 0.6 },
  },
  PlayComponent: WheelGame,
  getTargetRotation: ({ currentRotation, selectedIndex, segmentAngle }) =>
    getRewardWheelTargetRotation({
      currentRotation,
      selectedIndex,
      segmentAngle,
      rotations: 5,
    }),
};

const mysteryBoxGame: GameContract = {
  type: 'mystery_box',
  name: 'Mystery Box Reveal',
  icon: '🎁',
  availability: 'active',
  labels: {
    title: 'Mystery Box Reveal',
    instruction: 'Pick a mystery box to unlock your reward.',
    playsAvailableSuffix: 'plays left 🎯',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Pick Again',
  },
  createCard: {
    title: 'Mystery Box Reveal',
    description: 'Customers tap one of 3 mystery boxes and reveal a surprise coupon with stars and confetti.',
    statusLabel: 'Available now',
  },
  preview: {
    supportsBuilderPreview: true,
    previewTitle: 'Mystery Box Preview',
    previewDisclaimer: 'Preview only. Coupon issuing happens on the live play page.',
  },
  analytics: {
    category: 'reveal',
    eventPrefix: 'mystery_box',
  },
  resultDelayMs: 1250,
  supportedPhases: defaultSupportedPhases,
  validateConfig: () => createDefaultValidationResult(),
  formatReward: defaultRewardFormatter,
  confetti: {
    particleCount: 240,
    spread: 120,
    origin: { y: 0.6 },
    shapes: ['square', 'circle', 'star'],
  },
  PlayComponent: MysteryBoxGameAdapter,
  getTargetRotation: () => null,
};

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
  wheel: wheelGame,
  spin_wheel: wheelGame,
  mystery_box: mysteryBoxGame,
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

/**
 * New architecture-facing helper.
 *
 * Future Promotion Builder refactors should use this helper instead of
 * hardcoded game branching.
 */
export function getGameContract(gameType?: string | null): GameContract {
  return getGameDefinition(gameType);
}

export function getAvailableGameContracts(): GameContract[] {
  return availableGames;
}
