import type { ComponentType } from 'react';
import type { Options as ConfettiOptions } from 'canvas-confetti';
import type { Reward } from '@/types/reward';

export type GameType = 'wheel' | 'spin_wheel' | 'mystery_box' | 'scratch_card' | 'reward_reels' | 'open_the_door';

export type GamePhase =
  | 'idle'
  | 'configuring'
  | 'previewing'
  | 'playing'
  | 'animating'
  | 'revealing'
  | 'completed';

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings?: string[];
};

export type GameAvailability = 'active' | 'beta' | 'hidden';
export type GameExperienceCategory = 'chance' | 'reveal' | 'instant_win';

export type GameLabels = {
  title: string;
  instruction: string;
  playsAvailableSuffix: string;
  noPlaysText: string;
  playAgainText: string;
};

export type GameCreateCard = {
  title: string;
  description: string;
  statusLabel: string;
};

export type GamePreviewBehavior = {
  supportsBuilderPreview: boolean;
  previewTitle: string;
  previewDisclaimer: string;
};

export type GameAnalytics = {
  category: GameExperienceCategory;
  eventPrefix: string;
};

export type GamePlayProps = {
  rewards?: Reward[];
  winningReward?: Reward;
  canPlay: boolean;
  playing: boolean;
  playsRemaining: number;
  playsUsed?: number;
  maxPlays?: number;
  onPlay: () => void;
  rotation?: number;
};

export type GameTargetRotationArgs = {
  currentRotation: number;
  selectedIndex: number;
  segmentAngle: number;
};

export type GameBuilderPreviewProps = {
  rewards?: Reward[];
  rotation?: number;
};

export type GameConfigPanelProps = {
  title?: string;
  description?: string;
};

export type GameContract = {
  type: GameType;
  name: string;
  icon: string;
  availability: GameAvailability;
  labels: GameLabels;
  createCard: GameCreateCard;
  preview: GamePreviewBehavior;
  analytics: GameAnalytics;
  resultDelayMs: number;
  confetti: ConfettiOptions;
  supportedPhases: GamePhase[];

  validateConfig?: (config: unknown) => ValidationResult;
  formatReward?: (reward: Reward) => string;

  components?: {
    BuilderPreview?: ComponentType<GameBuilderPreviewProps>;
    ConfigPanel?: ComponentType<GameConfigPanelProps>;
    Runtime?: ComponentType<any>;
  };

  PlayComponent: ComponentType<GamePlayProps>;
  getTargetRotation?: (args: GameTargetRotationArgs) => number | null;
};

export type GameDefinition = GameContract;
