"use client";

import { GAME_REGISTRY } from '@/lib/game-pool/gameRegistry';
import type { GameType } from '@/lib/game-pool/types';

interface GameRuntimeRendererProps {
  gameType: GameType;
  gameProps?: Record<string, unknown>;
}

export default function GameRuntimeRenderer({
  gameType,
  gameProps,
}: GameRuntimeRendererProps) {
  const GameComponent = GAME_REGISTRY[gameType];

  if (!GameComponent) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        Unsupported game type: {gameType}
      </div>
    );
  }

  return <GameComponent {...gameProps} />;
}
