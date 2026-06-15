'use client';

import type { GameType } from '@/lib/games/types';
import { availableGames } from '@/lib/games/registry';
import { getGameVisual } from '@/components/game-visuals/GameVisual';

type Props = {
  selectedGameType: GameType;
  onSelect: (gameType: GameType) => void;
};

export default function GameTypeRegistrySelector({ selectedGameType, onSelect }: Props) {
  return (
    <div className="mt-3 space-y-3">
      {availableGames.map((game) => {
        const selected = selectedGameType === game.type;
        return (
          <button
            key={game.type}
            type="button"
            onClick={() => onSelect(game.type)}
            className={`w-full rounded-3xl border-2 p-5 text-left transition active:scale-[0.99] ${
              selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50'
            }`}
          >
            <div className="flex items-start gap-4">
              {getGameVisual(game.type, 64).visual}
              <div>
                <p className="text-2xl font-black">{game.createCard.title}</p>
                <p className="mt-1 text-sm font-bold text-stone-600">{game.createCard.description}</p>
                <p className="mt-2 text-xs font-black uppercase text-green-700">{game.createCard.statusLabel}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
