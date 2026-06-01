import OpenTheDoorRuntime from '@/lib/games/open-the-door/runtime';
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

export const openTheDoorContract: GameContract = {
  type: 'open_the_door',
  name: 'Open The Door',
  icon: '🚪',
  availability: 'active',
  labels: {
    title: 'Open The Door',
    instruction: 'Choose one of three doors to reveal your surprise reward.',
    playsAvailableSuffix: 'plays left 🎯',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Pick again',
  },
  createCard: {
    title: 'Open The Door',
    description: 'Customers choose one of three doors and reveal a surprise coupon behind it.',
    statusLabel: 'Available now',
  },
  preview: {
    supportsBuilderPreview: true,
    previewTitle: 'Open The Door Preview',
    previewDisclaimer: 'Preview only. Coupon issuing happens on the live play page.',
  },
  analytics: {
    category: 'reveal',
    eventPrefix: 'open_the_door',
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
  components: {
    Runtime: OpenTheDoorRuntime,
  },
  PlayComponent: OpenTheDoorRuntime,
  getTargetRotation: () => null,
};
