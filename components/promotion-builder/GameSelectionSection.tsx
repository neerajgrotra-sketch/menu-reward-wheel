'use client';

import { getGameContract } from '@/lib/games/registry';

export type BuilderGameType = 'wheel' | 'mystery_box' | 'scratch_card';

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

function GameCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-3 w-full rounded-3xl border-2 p-5 text-left transition active:scale-[0.99] ${
        selected ? 'border-green-600 bg-green-50 shadow' : 'border-stone-100 bg-stone-50'
      }`}
    >
      {children}
    </button>
  );
}

export function GameSelectionSection({ label, gameType, onChange }: GameSelectionSectionProps) {
  const wheelGame = getGameContract('wheel');

  return (
    <div className="mt-5 rounded-3xl bg-white p-5 shadow-xl">
      <p className="text-sm font-black uppercase text-[#FF6B00]">{label}</p>

      <GameCard selected={gameType === 'wheel'} onClick={() => onChange('wheel')}>
        <div className="flex items-start gap-4">
          <MiniPrizeWheel />
          <div>
            <p className="text-2xl font-black">{wheelGame.name}</p>
            <p className="mt-1 text-sm font-bold text-stone-600">{wheelGame.createCard.description}</p>
            <p className="mt-2 text-xs font-black uppercase text-green-700">{wheelGame.createCard.statusLabel}</p>
          </div>
        </div>
      </GameCard>

      <GameCard selected={gameType === 'mystery_box'} onClick={() => onChange('mystery_box')}>
        <div className="flex items-start gap-4">
          <MiniMysteryBox />
          <div>
            <p className="text-2xl font-black">Mystery Box Reveal</p>
            <p className="mt-1 text-sm font-bold text-stone-600">
              Customers tap one of 3 mystery boxes and reveal a surprise coupon with stars and confetti.
            </p>
            <p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p>
          </div>
        </div>
      </GameCard>

      <GameCard selected={gameType === 'scratch_card'} onClick={() => onChange('scratch_card')}>
        <div className="flex items-start gap-4">
          <MiniScratchCard />
          <div>
            <p className="text-2xl font-black">Scratch Card</p>
            <p className="mt-1 text-sm font-bold text-stone-600">
              Customers tap a digital scratch card to reveal a surprise reward using the same coupon engine.
            </p>
            <p className="mt-2 text-xs font-black uppercase text-green-700">Available now</p>
          </div>
        </div>
      </GameCard>
    </div>
  );
}
