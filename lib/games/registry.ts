import MysteryBoxGameAdapter from '@/components/games/MysteryBoxGameAdapter';
import ScratchCardGame from '@/components/games/ScratchCardGame';
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

const scratchCardGame: GameDefinition = {
  type: 'scratch_card',
  name: 'Scratch Card',
  icon: '🪙',
  labels: {
    title: 'Scratch & Win',
    instruction: 'Scratch the card to reveal your reward.',
    playsAvailableSuffix: 'scratches left 🪙',
    noPlaysText: 'No scratches left — enjoy your rewards 🎉',
    playAgainText: 'Scratch Again',
  },
  resultDelayMs: 1400,
  confetti: {
    particleCount: 220,
    spread: 110,
    origin: { y: 0.6 },
  },
  PlayComponent: ScratchCardGame,
  getTargetRotation: () => null,
};

export const gameRegistry: Record<GameType, GameDefinition> = {
  wheel: wheelGame,
  mystery_box: mysteryBoxGame,
  scratch_card: scratchCardGame,
};

export function getGameDefinition(gameType?: string | null): GameDefinition {
  if (gameType === 'mystery_box') return gameRegistry.mystery_box;
  if (gameType === 'scratch_card') return gameRegistry.scratch_card;
  return gameRegistry.wheel;
}
