import MysteryBoxGameAdapter from '@/components/games/MysteryBoxGameAdapter';
import WheelGame from '@/components/games/WheelGame';
import { getRewardWheelTargetRotation } from '@/components/RewardWheel';
import type { GameDefinition, GameType } from '@/lib/games/types';

const wheelGame: GameDefinition = {
  type: 'wheel',
  name: 'Spin Wheel',
  icon: '🎯',
  labels: {
    title: 'Spin & Win',
    instruction: 'Spin to unlock your reward.',
    playsAvailableSuffix: 'plays left 🎯',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Spin Again',
  },
  resultDelayMs: 2900,
  confetti: {
    particleCount: 180,
    spread: 100,
    origin: { y: 0.6 },
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

const mysteryBoxGame: GameDefinition = {
  type: 'mystery_box',
  name: 'Mystery Box Reveal',
  icon: '🎁',
  labels: {
    title: 'Mystery Box Reveal',
    instruction: 'Pick a mystery box to unlock your reward.',
    playsAvailableSuffix: 'plays left 🎯',
    noPlaysText: 'No plays left — enjoy your rewards 🎉',
    playAgainText: 'Pick Again',
  },
  resultDelayMs: 1250,
  confetti: {
    particleCount: 240,
    spread: 120,
    origin: { y: 0.6 },
    shapes: ['square', 'circle', 'star'],
  },
  PlayComponent: MysteryBoxGameAdapter,
  getTargetRotation: () => null,
};

export const gameRegistry: Record<GameType, GameDefinition> = {
  wheel: wheelGame,
  mystery_box: mysteryBoxGame,
};

export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  return gameRegistry.wheel;
}
