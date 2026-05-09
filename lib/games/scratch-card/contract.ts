import ScratchCardGame from '@/components/games/ScratchCardGame';
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
 * Scratch Card game contract.
 *
 * PR 5 extracts Scratch Card into its formal per-game folder and introduces
 * a dedicated scratch-card state machine foundation.
 *
 * Future PRs can move scratch choreography, reveal masking,
 * gesture tracking, animation sequencing, and builder preview behavior
 * behind this contract.
 */
export const scratchCardContract: GameContract = {
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
    description: 'Customers scratch through a digital card to reveal a surprise reward using the shared coupon engine.',
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
  supportedPhases,
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
