'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';

type DoorState = {
  phase: 'idle' | 'selected' | 'revealing' | 'completed';
  selectedDoor: number | null;
};

const defaultDoorState: DoorState = {
  phase: 'idle',
  selectedDoor: null,
};

export default function OpenTheDoorRuntime({ canPlay, playing, playsRemaining, onPlay }: GamePlayProps) {
  const revealTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<DoorState>(defaultDoorState);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state.phase !== 'selected') return;

    setState((current) => ({ ...current, phase: 'revealing' }));
    onPlay();

    revealTimerRef.current = window.setTimeout(() => {
      setState((current) => ({ ...current, phase: 'completed' }));
    }, 900);

    resetTimerRef.current = window.setTimeout(() => {
      setState(defaultDoorState);
    }, 3400);
  }, [state.phase, onPlay]);

  function pickDoor(index: number) {
    if (!canPlay || playing || state.phase !== 'idle') return;
    setState({ phase: 'selected', selectedDoor: index });
  }

  function doorLabel(index: number) {
    if (state.selectedDoor === index) {
      if (state.phase === 'revealing') return 'Opening...';
      if (state.phase === 'completed') return 'Revealed!';
      return `Door ${index + 1}`;
    }
    if (state.phase !== 'idle') return '';
    return `Door ${index + 1}`;
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white/90 p-5 text-center shadow-xl">
      <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Open The Door</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">Pick one of three doors</h2>
      <p className="mt-2 text-sm font-bold text-stone-600">
        {playsRemaining > 0 ? 'Tap a door to reveal your prize.' : 'No plays left — enjoy your rewards.'}
      </p>

      <div className="mt-3 text-sm font-black uppercase tracking-wide text-stone-500">
        {state.phase === 'idle' && 'Choose carefully — every door wins.'}
        {state.phase === 'revealing' && 'Opening your door...'}
        {state.phase === 'completed' && 'Reward revealed!'}
      </div>

      <div className={state.selectedDoor === null ? 'mt-6 grid grid-cols-3 gap-3' : 'relative mt-6 min-h-[10rem]'}>
        {[0, 1, 2].map((index) => {
          const active = state.selectedDoor === index;
          const disabled = !canPlay || playing || state.selectedDoor !== null;
          const hidden = state.selectedDoor !== null && !active;

          return (
            <button
              key={index}
              type="button"
              onClick={() => pickDoor(index)}
              disabled={disabled}
              className={`relative flex h-32 items-center justify-center overflow-visible rounded-[1.5rem] border-2 border-white bg-gradient-to-br from-slate-100 to-slate-200 p-2 shadow-xl transition active:scale-95 ${hidden ? 'scale-75 opacity-0' : ''} ${disabled && !active && state.selectedDoor === null ? 'opacity-55' : ''}`}
              style={
                state.selectedDoor === null
                  ? { animation: `bounce 2.4s ease-in-out infinite ${index * 0.1}s` }
                  : active
                    ? { position: 'absolute', left: '50%', top: '50%', width: '8.5rem', height: '8.5rem', zIndex: 20, transform: 'translate(-50%, -50%)' }
                    : undefined
              }
              aria-label={`Door ${index + 1}`}
            >
              <span className="text-5xl">{active ? '🚪' : '🚪'}</span>
              <span className="absolute bottom-3 text-xs font-black uppercase tracking-wide text-stone-600">
                {doorLabel(index)}
              </span>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </section>
  );
}
