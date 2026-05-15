'use client';

import ScratchCardRuntime from '@/lib/games/scratch-card/runtime';
import type { GamePlayProps } from '@/lib/games/types';

/**
 * Compatibility wrapper.
 *
 * PR 7 moves runtime ownership into:
 * /lib/games/scratch-card/runtime.tsx
 *
 * Existing imports can continue using:
 * components/games/ScratchCardGame
 *
 * until all runtime references are migrated directly to the
 * formal game-contract architecture.
 */
export default function ScratchCardGame(props: GamePlayProps) {
  return <ScratchCardRuntime {...props} />;
}
