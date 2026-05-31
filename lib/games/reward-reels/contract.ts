import type { GameContract, GamePhase, GamePlayProps, ValidationResult } from '@/lib/games/types';

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

function RewardReelsPlaceholderGame(_props: GamePlayProps) {
  return null;
}

export const rewardReelsContract: GameContract = {
  type: 'reward_reels',
  name: 'Reward Reels',
  icon: '🎰',
  availability: 'beta',
  labels: {
    title: 'Reward Reels',
    instruction: 'Pull the reels to reveal your reward.',
    playsAvailableSuffix: 'plays left 🎰',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Play Again',
  },
  createCard: {
    title: 'Reward Reels',
    description: 'A coming-soon reel-style game where customers reveal an instant reward using the shared coupon engine.',
    statusLabel: 'Coming soon',
  },
  preview: {
    supportsBuilderPreview: false,
    previewTitle: 'Reward Reels Preview',
    previewDisclaimer: 'This game is coming soon and is not selectable yet.',
  },
  analytics: {
    category: 'instant_win',
    eventPrefix: 'reward_reels',
  },
  resultDelayMs: 1600,
  supportedPhases,
  validateConfig: () => createDefaultValidationResult(),
  confetti: {
    particleCount: 220,
    spread: 110,
    origin: { y: 0.6 },
  },
  components: {},
  PlayComponent: RewardReelsPlaceholderGame,
  getTargetRotation: () => null,
};
