'use client';

import MysteryBoxGame from '@/components/games/MysteryBoxGame';
import type { GamePlayProps } from '@/lib/games/types';

export default function MysteryBoxGameAdapter({
  canPlay,
  playing,
  playsRemaining,
  onPlay,
}: GamePlayProps) {
  return (
    <MysteryBoxGame
      canPlay={canPlay}
      spinning={playing}
      spinsRemaining={playsRemaining}
      onPick={onPlay}
    />
  );
}
