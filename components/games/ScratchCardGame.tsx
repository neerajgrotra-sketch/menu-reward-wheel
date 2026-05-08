'use client';

import { useEffect, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';

export default function ScratchCardGame({ canPlay, playing, playsRemaining, onPlay }: GamePlayProps) {
  const [scratched, setScratched] = useState(false);

  useEffect(() => {
    if (playing) setScratched(true);
  }, [playing]);

  function handleScratch() {
    if (!canPlay || playing) return;
    setScratched(true);
    onPlay();
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white/85 p-5 text-center shadow-xl">
      <div className="mx-auto max-w-sm">
        <button
          type="button"
          onClick={handleScratch}
          disabled={!canPlay || playing}
          className="group relative aspect-[1.45/1] w-full overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 text-left shadow-2xl transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,.35),transparent_20%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,.25),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between rounded-[1.4rem] border-2 border-white/65 bg-white/18 p-4 text-white backdrop-blur-[1px]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
              <h2 className="mt-2 text-4xl font-black leading-none drop-shadow">Scratch<br />& Win</h2>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 text-center shadow-inner">
              <p className="text-sm font-black uppercase tracking-wide">
                {playing ? 'Revealing...' : scratched ? 'Reward revealed!' : 'Tap to scratch'}
              </p>
            </div>
          </div>
          {!scratched && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-300/88 backdrop-blur-[1px] transition group-active:opacity-80">
              <div className="rounded-full bg-white px-6 py-4 text-lg font-black text-stone-700 shadow-xl">👆 Tap to Scratch</div>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={handleScratch}
          disabled={!canPlay || playing}
          className="mt-5 w-full rounded-full bg-[#1F1F1F] px-6 py-4 text-lg font-black text-white shadow-xl disabled:bg-stone-300"
        >
          {playing ? 'Revealing...' : playsRemaining > 0 ? 'Scratch Card' : 'No Plays Left'}
        </button>
      </div>
    </section>
  );
}
