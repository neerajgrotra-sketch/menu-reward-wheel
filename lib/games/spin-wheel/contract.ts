import WheelGame from '@/components/games/WheelGame';
import { getRewardWheelTargetRotation } from '@/components/RewardWheel';
import SpinWheelBuilderPreview from '@/lib/games/spin-wheel/builderPreview';
import SpinWheelConfigPanel from '@/lib/games/spin-wheel/configPanel';
import SpinWheelRuntime from '@/lib/games/spin-wheel/runtime';
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

export const spinWheelContract: GameContract = {
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
  supportedPhases,
  validateConfig: () => createDefaultValidationResult(),
  formatReward: defaultRewardFormatter,
  confetti: {
    particleCount: 180,
    spread: 100,
    origin: { y: 0.6 },
  },
  components: {
    BuilderPreview: SpinWheelBuilderPreview,
    ConfigPanel: SpinWheelConfigPanel,
    Runtime: SpinWheelRuntime,
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
