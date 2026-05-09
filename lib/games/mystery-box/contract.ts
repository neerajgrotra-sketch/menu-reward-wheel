import MysteryBoxGameAdapter from '@/components/games/MysteryBoxGameAdapter';
import type { GameContract, GamePhase, ValidationResult } from '@/lib/games/types';

const supportedPhases: GamePhase[] = [
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

/**
 * Mystery Box game contract.
 *
 * PR 4 extracts Mystery Box into its formal per-game folder without changing
 * the underlying MysteryBoxGameAdapter component or runtime behavior.
 *
 * Future Mystery Box PRs can move builder preview, runtime, animation
 * choreography, reveal timing, and state machine logic into this folder.
 */
export const mysteryBoxContract: GameContract = {
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
  supportedPhases,
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
