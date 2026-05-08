import type { ComponentType } from 'react';
import type { Options as ConfettiOptions } from 'canvas-confetti';
import type { Reward } from '@/types/reward';

export type GameType = 'wheel' | 'mystery_box' | 'scratch_card';

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
  rewards: Reward[];
  canPlay: boolean;
  playing: boolean;
  playsRemaining: number;
  playsUsed: number;
  maxPlays: number;
  onPlay: () => void;
  rotation: number;
};

export type GameTargetRotationArgs = {
  currentRotation: number;
  selectedIndex: number;
  segmentAngle: number;
};

export type GameDefinition = {
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
  PlayComponent: ComponentType<GamePlayProps>;
  getTargetRotation?: (args: GameTargetRotationArgs) => number | null;
};
