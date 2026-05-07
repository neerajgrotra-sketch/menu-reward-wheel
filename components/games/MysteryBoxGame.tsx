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
    <section className="mt-6 rounded-[2rem] bg-white/90 p-5 text-center shadow-xl">
      <style jsx>{`
        @keyframes boxFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.04); }
        }
        @keyframes selectedTremble {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.18); }
          20% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.25); }
          40% { transform: translate(-50%, -50%) rotate(6deg) scale(1.3); }
          60% { transform: translate(-50%, -50%) rotate(-4deg) scale(1.28); }
          80% { transform: translate(-50%, -50%) rotate(4deg) scale(1.23); }
        }
        @keyframes sparkleBurst {
          0% { transform: translateY(8px) scale(.65); opacity: 0; }
          45% { transform: translateY(-22px) scale(1.2); opacity: 1; }
          100% { transform: translateY(-46px) scale(.8); opacity: 0; }
        }
      `}</style>

      <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Mystery Box Reveal</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">Pick a box to reveal your prize</h2>
      <p className="mt-2 text-sm font-bold text-stone-600">
        {spinsRemaining > 0 ? 'Tap one mystery box. Every play wins a reward.' : 'No plays left — enjoy your rewards.'}
      </p>

      <div className={selectedBox === null ? 'mt-6 grid grid-cols-3 gap-3' : 'relative mt-6 min-h-[10rem]'}>
        {[0, 1, 2].map((index) => {
          const active = selectedBox === index;
          const disabled = !canPlay || spinning || selectedBox !== null;
          const hidden = selectedBox !== null && !active;

          return (
            <button
              key={index}
              type="button"
              onClick={() => pick(index)}
              disabled={disabled}
              className={`relative flex h-32 items-center justify-center overflow-visible rounded-[1.5rem] border-2 border-white bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-2 shadow-xl transition active:scale-95 ${hidden ? 'scale-75 opacity-0' : ''} ${disabled && !active && selectedBox === null ? 'opacity-55' : ''}`}
              style={
                selectedBox === null
                  ? { animation: `boxFloat 2.4s ease-in-out infinite ${index * 0.15}s` }
                  : active
                    ? { position: 'absolute', left: '50%', top: '50%', width: '8.5rem', height: '8.5rem', zIndex: 20, animation: 'selectedTremble 1s ease-in-out infinite' }
                    : undefined
              }
              aria-label={`Mystery box ${index + 1}`}
            >
              {active && (
                <>
                  <span className="absolute left-1/2 top-2 z-20 -translate-x-1/2 text-3xl" style={{ animation: 'sparkleBurst 1.1s ease-out infinite' }}>✨</span>
                  <span className="absolute left-3 top-10 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.25s ease-out infinite .1s' }}>⭐</span>
                  <span className="absolute right-3 top-10 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.25s ease-out infinite .2s' }}>💫</span>
                </>
              )}
              <span className="text-5xl drop-shadow-sm">{active ? '🎉' : '🎁'}</span>
              <span className="absolute bottom-3 text-xs font-black uppercase tracking-wide text-white">{active ? 'Opening...' : `Box ${index + 1}`}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
