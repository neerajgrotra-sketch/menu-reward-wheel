"use client";

import { getRuntimeGameComponent } from '@/lib/games/registry';
import type { GameType } from '@/lib/games/types';

interface GameRuntimeRendererProps {
  gameType: GameType;
  gameProps?: Record<string, unknown>;
}

export default function GameRuntimeRenderer({
  gameType,
  gameProps,
}: GameRuntimeRendererProps) {
  const GameComponent = getRuntimeGameComponent(gameType);

  if (!GameComponent) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
        Unsupported game type: {gameType}
      </div>
    );
  }

  return <GameComponent {...gameProps} />;
}
