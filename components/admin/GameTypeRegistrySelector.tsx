'use client';

import type { GameType } from '@/lib/games/types';
import { availableGames } from '@/lib/games/registry';

type Props = {
  selectedGameType: GameType;
  onSelect: (gameType: GameType) => void;
};

function MiniGamePreview({ gameType, icon }: { gameType: GameType; icon: string }) {
  if (gameType === 'wheel') {
    return (
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
        <style jsx>{`@keyframes spinPause{0%{transform:rotate(0deg)}55%{transform:rotate(760deg)}70%{transform:rotate(760deg)}100%{transform:rotate(1080deg)}}`}</style>
        <div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-lg">◀</div>
        <div
          className="h-16 w-16 rounded-full border-4 border-white shadow-lg"
          style={{
            animation: 'spinPause 3.2s cubic-bezier(.18,.8,.25,1) infinite',
            background: 'conic-gradient(#FF6B00 0deg 45deg,#FFD166 45deg 90deg,#00C853 90deg 135deg,#E63939 135deg 180deg,#FF8A00 180deg 225deg,#FFF0C2 225deg 270deg,#2DD4BF 270deg 315deg,#F97316 315deg 360deg)',
          }}
        />
        <div className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1F1F1F] text-[10px] font-black text-white shadow">SPIN</div>
      </div>
    );
  }

  if (gameType === 'scratch_card') {
    return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 text-4xl shadow-inner">{icon}</div>;
  }

  return <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-4xl shadow-inner">{icon}</div>;
}

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
              <MiniGamePreview gameType={game.type} icon={game.icon} />
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
