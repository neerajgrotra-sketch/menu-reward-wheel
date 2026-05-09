'use client';

import MysteryBoxRuntime from '@/lib/games/mystery-box/runtime';
import type { GamePlayProps } from '@/lib/games/types';

/**
 * Compatibility wrapper.
 *
 * PR 8 moves Mystery Box runtime ownership into:
 * /lib/games/mystery-box/runtime.tsx
 *
 * Existing imports can continue using:
 * components/games/MysteryBoxGame
 *
 * until all runtime references migrate directly to the
 * formal game-contract architecture.
 */
export default function MysteryBoxGame({
  canPlay,
  spinning,
  spinsRemaining,
  onPick,
}: {
  canPlay: boolean;
  spinning: boolean;
  spinsRemaining: number;
  onPick: () => void;
}) {
  const props: GamePlayProps = {
    canPlay,
    playing: spinning,
    playsRemaining: spinsRemaining,
    playsUsed: 0,
    maxPlays: spinsRemaining,
    onPlay: onPick,
    rotation: 0,
    rewards: [],
  };

  return <MysteryBoxRuntime {...props} />;
}
