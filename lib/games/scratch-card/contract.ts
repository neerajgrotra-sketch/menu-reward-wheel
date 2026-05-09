import ScratchCardGame from '@/components/games/ScratchCardGame';
import ScratchCardBuilderPreview from '@/lib/games/scratch-card/builderPreview';
import ScratchCardConfigPanel from '@/lib/games/scratch-card/configPanel';
import ScratchCardRuntime from '@/lib/games/scratch-card/runtime';
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
  components: {
    BuilderPreview: ScratchCardBuilderPreview,
    ConfigPanel: ScratchCardConfigPanel,
    Runtime: ScratchCardRuntime,
  },
  PlayComponent: ScratchCardGame,
  getTargetRotation: () => null,
};
