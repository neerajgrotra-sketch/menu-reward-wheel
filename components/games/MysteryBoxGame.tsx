'use client';

import { useState } from 'react';

type Props = {
  canPlay: boolean;
  spinning: boolean;
  spinsRemaining: number;
  onPick: () => void;
};

export default function MysteryBoxGame({ canPlay, spinning, spinsRemaining, onPick }: Props) {
  const [selectedBox, setSelectedBox] = useState<number | null>(null);

  function pick(index: number) {
    if (!canPlay || spinning || selectedBox !== null) return;
    setSelectedBox(index);
    onPick();
    window.setTimeout(() => setSelectedBox(null), 3600);
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white/85 p-5 text-center shadow-xl">
      <style jsx>{`
        @keyframes mysteryShake {
          0%, 100% { transform: rotate(0deg) scale(1); }
          20% { transform: rotate(-5deg) scale(1.04); }
          40% { transform: rotate(5deg) scale(1.07); }
          60% { transform: rotate(-4deg) scale(1.1); }
          80% { transform: rotate(4deg) scale(1.08); }
        }
        @keyframes mysteryOpen {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          70% { transform: translateY(-24px) rotate(-12deg); opacity: 1; }
          100% { transform: translateY(-34px) rotate(-18deg); opacity: 0; }
        }
        @keyframes sparkleBurst {
          0% { transform: translateY(8px) scale(.6); opacity: 0; }
          45% { transform: translateY(-22px) scale(1.25); opacity: 1; }
          100% { transform: translateY(-46px) scale(.7); opacity: 0; }
        }
      `}</style>

      <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Mystery Box Reveal</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">Pick a box to reveal your prize</h2>
      <p className="mt-2 text-sm font-bold text-stone-600">
        {spinsRemaining > 0 ? 'Tap one mystery box. Every play wins a reward.' : 'No plays left — enjoy your rewards.'}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((index) => {
          const active = selectedBox === index;
          const disabled = !canPlay || spinning || selectedBox !== null;
          return (
            <button
              key={index}
              type="button"
              onClick={() => pick(index)}
              disabled={disabled}
              className={`relative h-32 rounded-[1.5rem] border-2 p-2 shadow-xl transition active:scale-95 ${active ? 'border-[#FF6B00] bg-orange-50' : 'border-white bg-gradient-to-br from-[#FF6B00] to-[#E63939]'} ${disabled && !active ? 'opacity-60' : ''}`}
              aria-label={`Mystery box ${index + 1}`}
            >
              {active && (
                <>
                  <span className="absolute left-1/2 top-8 z-20 -translate-x-1/2 text-4xl" style={{ animation: 'sparkleBurst 1.1s ease-out infinite' }}>✨</span>
                  <span className="absolute left-4 top-12 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.25s ease-out infinite .1s' }}>⭐</span>
                  <span className="absolute right-4 top-12 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.25s ease-out infinite .2s' }}>💫</span>
                </>
              )}
              <div className="relative mx-auto mt-4 flex h-20 w-20 items-center justify-center" style={active ? { animation: 'mysteryShake .7s ease-in-out infinite' } : undefined}>
                <div className="absolute top-1 h-7 w-20 rounded-t-xl bg-[#FFD166] shadow" style={active ? { animation: 'mysteryOpen .9s ease-in forwards .35s' } : undefined} />
                <div className="absolute bottom-0 h-16 w-20 rounded-b-2xl rounded-t-md bg-[#1F1F1F] shadow-2xl" />
                <div className="absolute bottom-0 h-16 w-4 bg-[#FFD166]" />
                <div className="absolute bottom-7 h-4 w-20 bg-[#FFD166]" />
                <div className="absolute bottom-4 text-2xl">🎁</div>
              </div>
              <p className={`mt-2 text-xs font-black uppercase ${active ? 'text-[#FF6B00]' : 'text-white'}`}>{active ? 'Opening...' : `Box ${index + 1}`}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
