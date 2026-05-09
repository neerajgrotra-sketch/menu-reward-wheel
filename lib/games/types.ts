import type { ComponentType } from 'react';
import type { Options as ConfettiOptions } from 'canvas-confetti';
import type { Reward } from '@/types/reward';

/**
 * PR 1 FOUNDATION
 *
 * This file establishes the formal game-contract architecture foundation
 * without changing current runtime or Promotion Builder behavior.
 *
 * Future PRs will:
 * - Move builder previews into per-game folders
 * - Move runtime implementations into per-game folders
 * - Move animation choreography into per-game folders
 * - Introduce formal state machines per game
 * - Reduce hardcoded Promotion Builder branching
 */

export type GameType = 'wheel' | 'spin_wheel' | 'mystery_box' | 'scratch_card';

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

/**
 * Formal game contract foundation.
 *
 * PR 1 intentionally keeps the current game implementations and runtime logic
 * untouched. This contract creates the stable architecture layer that future
 * PRs will build on.
 */
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

  /**
   * Future extraction targets.
   *
   * Upcoming PRs will move these into:
   * /lib/games/<game>/builderPreview.tsx
   * /lib/games/<game>/runtime.tsx
   * /lib/games/<game>/animations.ts
   * /lib/games/<game>/stateMachine.ts
   */
  components?: {
    BuilderPreview?: ComponentType<any>;
    Runtime?: ComponentType<any>;
  };

  PlayComponent: ComponentType<GamePlayProps>;
  getTargetRotation?: (args: GameTargetRotationArgs) => number | null;
};

/**
 * Backwards-compatible alias.
 *
 * Existing code may still reference GameDefinition.
 * Keeping this alias avoids runtime or compile regressions during PR 1.
 */
export type GameDefinition = GameContract;
