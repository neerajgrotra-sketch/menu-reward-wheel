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
    <section className="mt-6 rounded-[2rem] bg-white/95 p-5 text-center shadow-xl">
      <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Open The Door</p>
      <h2 className="mt-2 text-3xl font-black leading-tight">Choose a mysterious door</h2>
      <p className="mt-2 text-sm font-bold text-stone-600">
        {playsRemaining > 0 ? 'Tap a door to reveal your prize behind it.' : 'No plays left — enjoy your rewards.'}
      </p>

      <div className="mt-3 text-sm font-black uppercase tracking-wide text-stone-500">
        {state.phase === 'idle' && 'Choose carefully — every door hides a surprise.'}
        {state.phase === 'revealing' && 'Swinging the door open...'}
        {state.phase === 'completed' && 'Your reward is revealed!'}
      </div>

      <div className={state.selectedDoor === null ? 'mt-6 grid grid-cols-3 gap-4' : 'relative mt-6 min-h-[14rem]'}>
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
              className={`relative overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-slate-950/90 p-3 text-left shadow-[0_25px_60px_-30px_rgba(15,23,42,0.9)] transition-all duration-300 ${
                hidden ? 'pointer-events-none scale-90 opacity-0' : ''
              } ${active ? 'z-20' : ''} ${disabled && !active && state.selectedDoor === null ? 'opacity-60' : ''}`}
              style={
                state.selectedDoor === null
                  ? { animation: `doorFloat 2.8s ease-in-out infinite ${index * 0.08}s` }
                  : active
                  ? {
                      position: 'absolute',
                      left: '50%',
                      top: '50%',
                      width: '10rem',
                      height: '13rem',
                      transform: 'translate(-50%, -50%)',
                      zIndex: 20,
                    }
                  : undefined
              }
              aria-label={`Door ${index + 1}`}
            >
              <div className={`door-shell ${active ? 'door-shell-active' : ''} ${state.phase === 'revealing' && active ? 'door-swing' : ''}`}>
                <div className="door-frame" />
                <div className="door-panel">
                  <div className="door-knob" />
                </div>
                <div className="door-glow" />
                <div className="door-light" />
                {active && state.phase === 'completed' && (
                  <div className="reward-reveal">✨</div>
                )}
              </div>
              <div className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-stone-400">
                {doorLabel(index)}
              </div>
            </button>
          );
        })}
      </div>

      <style jsx>{`
        @keyframes doorFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        @keyframes glowPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.7; }
        }

        @keyframes swingOpen {
          0% { transform: rotateY(0deg); }
          70% { transform: rotateY(-90deg); }
          100% { transform: rotateY(-90deg); }
        }

        @keyframes burst {
          0% { opacity: 0; transform: scale(0.8) translateY(10px); }
          20% { opacity: 1; transform: scale(1.05) translateY(-8px); }
          100% { opacity: 0; transform: scale(1.2) translateY(-36px); }
        }

        button:hover .door-shell {
          transform: translateY(-2px);
        }

        button:hover .door-glow {
          opacity: 1;
          box-shadow: 0 0 28px rgba(245, 158, 11, 0.65);
        }

        .door-shell {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 12.5rem;
          border-radius: 1.75rem;
          background: linear-gradient(180deg, #0f172a 0%, #111827 45%, #0b1120 100%);
          overflow: hidden;
          transition: transform 0.25s ease, box-shadow 0.25s ease;
          transform-style: preserve-3d;
          box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.08);
        }

        .door-shell-active {
          transform: translateY(-2px);
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35);
        }

        .door-swing {
          animation: swingOpen 0.9s ease forwards;
          transform-origin: left center;
        }

        .door-frame {
          position: absolute;
          inset: 0;
          border: 2px solid rgba(148, 163, 184, 0.18);
          border-radius: 1.75rem;
          pointer-events: none;
        }

        .door-panel {
          position: absolute;
          inset: 0.85rem;
          border-radius: 1.25rem;
          background: linear-gradient(180deg, #1f2937 0%, #111827 45%, #0f172a 100%);
          box-shadow: inset 0 0 40px rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .door-knob {
          width: 0.9rem;
          height: 0.9rem;
          border-radius: 9999px;
          background: radial-gradient(circle at top, #f8fafc, #cbd5e1);
          box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.35);
        }

        .door-glow {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 15%, rgba(245, 158, 11, 0.35), transparent 40%);
          opacity: 0.35;
          pointer-events: none;
          transition: opacity 0.25s ease;
          filter: blur(10px);
          animation: glowPulse 2.8s ease-in-out infinite;
        }

        .door-light {
          position: absolute;
          bottom: 1rem;
          left: 50%;
          width: 72%;
          height: 1.4rem;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(245, 158, 11, 0.85), rgba(245, 158, 11, 0));
          opacity: 0.55;
          filter: blur(6px);
          pointer-events: none;
          border-radius: 9999px;
        }

        .reward-reveal {
          position: absolute;
          left: 50%;
          top: 16%;
          transform: translateX(-50%);
          font-size: 2rem;
          color: #fbbf24;
          text-shadow: 0 0 18px rgba(251, 191, 36, 0.85);
          animation: burst 1.2s ease-out forwards;
          pointer-events: none;
        }
      `}</style>
    </section>
  );
}
