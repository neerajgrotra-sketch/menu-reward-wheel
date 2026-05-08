import type { ComponentType } from 'react';
import type { Options as ConfettiOptions } from 'canvas-confetti';
import type { Reward } from '@/types/reward';

export type GameType = 'wheel' | 'mystery_box' | 'scratch_card';

export type GameLabels = {
  title: string;
  instruction: string;
  playsAvailableSuffix: string;
  noPlaysText: string;
  playAgainText: string;
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
  labels: GameLabels;
  resultDelayMs: number;
  confetti: ConfettiOptions;
  PlayComponent: ComponentType<GamePlayProps>;
  getTargetRotation?: (args: GameTargetRotationArgs) => number | null;
};
