'use client';

import { getAvailableGameContracts } from '@/lib/games/registry';

export type BuilderGameType = 'wheel' | 'mystery_box' | 'scratch_card' | 'open_the_door';

export type GameSelectionSectionProps = {
  label: string;
  gameType: BuilderGameType;
  onChange: (gameType: BuilderGameType) => void;
};

function MiniPrizeWheel() {
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <style jsx>{`@keyframes spinPause{0%{transform:rotate(0deg)}55%{transform:rotate(760deg)}70%{transform:rotate(760deg)}100%{transform:rotate(1080deg)}}`}</style>
      <div className="absolute -right-1 top-1/2 z-20 -translate-y-1/2 text-lg">◀</div>
      <div
        className="h-16 w-16 rounded-full border-4 border-white shadow-lg"
        style={{
          animation: 'spinPause 3.2s cubic-bezier(.18,.8,.25,1) infinite',
          background:
            'conic-gradient(#FF6B00 0deg 45deg,#FFD166 45deg 90deg,#00C853 90deg 135deg,#E63939 135deg 180deg,#FF8A00 180deg 225deg,#FFF0C2 225deg 270deg,#2DD4BF 270deg 315deg,#F97316 315deg 360deg)',
        }}
      />
      <div className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[#1F1F1F] text-[10px] font-black text-white shadow">
        SPIN
      </div>
    </div>
  );
}

function MiniMysteryBox() {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-4xl shadow-inner">
      🎁
    </div>
  );
}

function MiniScratchCard() {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 text-4xl shadow-inner">
      🪙
    </div>
  );
}

function MiniOpenDoor() {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-slate-100 via-stone-100 to-slate-200 text-4xl shadow-inner">
      🚪
    </div>
  );
}

function MiniRewardReels() {
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-200 via-orange-100 to-amber-300 text-4xl shadow-inner">
      🎰
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
        const title = game.type === 'reward_reels' ? 'Slot Machine' : game.createCard.title;

        const handleClick = () => {
          if (!isSelectable) return;
          if (game.type === 'wheel' || game.type === 'mystery_box' || game.type === 'scratch_card') {
            onChange(game.type);
          }
        };

        const icon =
          game.type === 'wheel'
            ? <MiniPrizeWheel />
            : game.type === 'mystery_box'
            ? <MiniMysteryBox />
            : game.type === 'scratch_card'
            ? <MiniScratchCard />
            : game.type === 'open_the_door'
            ? <MiniOpenDoor />
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
