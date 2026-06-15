'use client';

import { getAvailableGameContracts } from '@/lib/games/registry';
import { MiniPrizeWheel, MiniMysteryBox, MiniScratchCard, MiniOpenDoor } from '@/components/game-visuals/GameVisual';

export type BuilderGameType = 'wheel' | 'mystery_box' | 'scratch_card' | 'open_the_door';

export type GameSelectionSectionProps = {
  label: string;
  gameType: BuilderGameType;
  onChange: (gameType: BuilderGameType) => void;
};

function MiniRewardReels() {
  return (
    <div
      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl shadow-inner"
      style={{ background: 'linear-gradient(135deg,#fde68a,#fed7aa,#fbbf24)' }}
      aria-hidden="true"
    >
      {/* Slot machine reels — three vertical bars */}
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex h-8 w-2 flex-col overflow-hidden rounded bg-white/60">
            {[0, 1, 2].map((j) => (
              <div
                key={j}
                className="flex flex-1 items-center justify-center rounded"
                style={{
                  background: ['#FF6B00','#E63939','#00C853','#FFD166','#2DD4BF','#F97316'][(i * 3 + j) % 6],
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GameCard({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-3 w-full rounded-3xl border-2 p-5 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 ${
        selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50'
      }`}
    >
      {children}
    </button>
  );
}

export function GameSelectionSection({ label, gameType, onChange }: GameSelectionSectionProps) {
  const gameContracts = getAvailableGameContracts();

  return (
    <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
      <p className="text-sm font-black uppercase text-[#FF6B00]">{label}</p>

      {gameContracts.map((game) => {
        const isSelectable =
          game.availability === 'active' &&
          (game.type === 'wheel' || game.type === 'mystery_box' || game.type === 'scratch_card' || game.type === 'open_the_door');
        const selected = game.type === gameType;
        const title = game.createCard.title;

        const handleClick = () => {
          if (!isSelectable) return;
          onChange(game.type as BuilderGameType);
        };

        const icon =
          game.type === 'wheel'
            ? <MiniPrizeWheel size={64} />
            : game.type === 'mystery_box'
            ? <MiniMysteryBox size={64} />
            : game.type === 'scratch_card'
            ? <MiniScratchCard size={64} />
            : game.type === 'open_the_door'
            ? <MiniOpenDoor size={64} />
            : <MiniRewardReels />;

        return (
          <GameCard key={game.type} selected={selected} disabled={!isSelectable} onClick={handleClick}>
            <div className="flex items-start gap-4">
              {icon}
              <div>
                <p className="text-2xl font-black">{title}</p>
                <p className="mt-1 text-sm font-bold text-stone-600">{game.createCard.description}</p>
                <p className="mt-2 text-xs font-black uppercase text-green-700">
                  {game.createCard.statusLabel}
                </p>
              </div>
            </div>
          </GameCard>
        );
      })}
    </div>
  );
}
