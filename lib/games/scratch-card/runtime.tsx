'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';
import {
  defaultScratchCardState,
  reduceScratchCardState,
  type ScratchCardState,
} from '@/lib/games/scratch-card/stateMachine';

const GRID_COLUMNS = 14;
const GRID_ROWS = 8;
const CELL_COUNT = GRID_COLUMNS * GRID_ROWS;

function getCellIndex(clientX: number, clientY: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const column = Math.min(GRID_COLUMNS - 1, Math.floor((x / rect.width) * GRID_COLUMNS));
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / rect.height) * GRID_ROWS));
  return row * GRID_COLUMNS + column;
}

export default function ScratchCardRuntime({ canPlay, playing, playsRemaining, onPlay }: GamePlayProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const onPlayCalledRef = useRef(false);
  const revealTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const [scratchState, setScratchState] = useState<ScratchCardState>(defaultScratchCardState);
  const [scratchedCells, setScratchedCells] = useState<Set<number>>(() => new Set());
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [coin, setCoin] = useState<{ x: number; y: number } | null>(null);

  const isRevealing = playing || scratchState.phase === 'revealing';
  const isCompleted = scratchState.phase === 'completed';
  const isDisabled = !canPlay || isRevealing || isCompleted;
  const progress = Math.min(100, Math.round((scratchedCells.size / CELL_COUNT) * 100));

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current);
      if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (playsRemaining > 0 && canPlay && !playing && scratchState.phase === 'completed') {
      setScratchState((current) => reduceScratchCardState(current, { type: 'RESET' }));
      setScratchedCells(new Set());
      onPlayCalledRef.current = false;
      setIsPointerDown(false);
      setCoin(null);
    }
  }, [canPlay, playing, playsRemaining, scratchState.phase]);

  useEffect(() => {
    if (scratchState.phase !== 'threshold_reached' || onPlayCalledRef.current) return;

    onPlayCalledRef.current = true;
    setScratchState((current) => reduceScratchCardState(current, { type: 'START_REVEAL' }));
    onPlay();

    revealTimerRef.current = window.setTimeout(() => {
      const fullSet = new Set<number>();
      for (let index = 0; index < CELL_COUNT; index += 1) fullSet.add(index);
      setScratchedCells(fullSet);
      setScratchState((current) => reduceScratchCardState(current, { type: 'UPDATE_PROGRESS', progress: 100 }));
    }, 350);

    completeTimerRef.current = window.setTimeout(() => {
      setScratchState((current) => reduceScratchCardState(current, { type: 'COMPLETE' }));
    }, 1050);
  }, [scratchState.phase, onPlay]);

  function updateScratchProgress(clientX: number, clientY: number) {
    const card = cardRef.current;
    if (!card || isDisabled) return;

    const rect = card.getBoundingClientRect();
    setCoin({ x: clientX - rect.left, y: clientY - rect.top });

    setScratchState((current) => {
      if (current.phase === 'idle') return reduceScratchCardState(current, { type: 'START_SCRATCH' });
      return current;
    });

    const cellIndex = getCellIndex(clientX, clientY, card);

    setScratchedCells((current) => {
      const next = new Set(current);
      next.add(cellIndex);
      const nextProgress = Math.min(100, (next.size / CELL_COUNT) * 100);
      setScratchState((currentState) => reduceScratchCardState(currentState, { type: 'UPDATE_PROGRESS', progress: nextProgress }));
      return next;
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (isDisabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPointerDown(true);
    updateScratchProgress(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!isPointerDown || isDisabled) return;
    updateScratchProgress(event.clientX, event.clientY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPointerDown(false);
    setCoin(null);
  }

  function handleAccessibleScratch() {
    if (isDisabled) return;
    setScratchState((current) => {
      const started = current.phase === 'idle' ? reduceScratchCardState(current, { type: 'START_SCRATCH' }) : current;
      return reduceScratchCardState(started, { type: 'UPDATE_PROGRESS', progress: Math.min(100, started.progress + 12) });
    });
    setScratchedCells((current) => {
      const next = new Set(current);
      for (let index = next.size; index < Math.min(CELL_COUNT, next.size + 6); index += 1) next.add(index);
      return next;
    });
  }

  return (
    <section className="mt-6 rounded-[2rem] bg-white/85 p-5 text-center shadow-xl">
      <div className="mx-auto max-w-sm">
        <button
          ref={cardRef}
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleAccessibleScratch();
            }
          }}
          disabled={!canPlay || isRevealing}
          className="relative aspect-[1.45/1] w-full touch-none overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 text-left shadow-2xl transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          aria-label="Scratch the card to reveal your reward"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,.35),transparent_20%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,.25),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col items-center justify-center rounded-[1.4rem] border-2 border-white/65 bg-white/18 p-4 text-center text-white backdrop-blur-[1px]">
            <p className="absolute left-4 top-4 text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
            {isCompleted ? (
              <div className="rounded-[1.5rem] bg-black/35 px-5 py-4 shadow-2xl backdrop-blur-sm">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">You won</p>
                <h2 className="mt-1 text-3xl font-black leading-tight drop-shadow">Reward Revealed</h2>
              </div>
            ) : (
              <div>
                <h2 className="text-4xl font-black leading-none drop-shadow">Scratch<br />& Win</h2>
                <p className="mt-4 text-sm font-black uppercase tracking-[0.14em] text-white/85">Reveal your reward</p>
              </div>
            )}
          </div>

          {!isCompleted && (
            <div className="absolute inset-0 z-20 grid" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
              {Array.from({ length: CELL_COUNT }).map((_, index) => (
                <div
                  key={index}
                  className="border border-white/10 bg-gradient-to-br from-stone-300 via-stone-100 to-stone-400 transition-opacity duration-150"
                  style={{ opacity: scratchedCells.has(index) ? 0 : 0.97 }}
                />
              ))}
            </div>
          )}

          {!isCompleted && !isRevealing && (
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
              <div className="rounded-full bg-white/95 px-5 py-3 text-sm font-black text-stone-700 shadow-xl">
                {progress === 0 ? '🪙 Scratch to reveal' : 'Keep scratching...'}
              </div>
            </div>
          )}

          {coin && !isCompleted && !isRevealing && (
            <div
              className="pointer-events-none absolute z-40 grid h-12 w-12 place-items-center rounded-full border-4 border-stone-300 bg-stone-100 text-2xl shadow-2xl"
              style={{ left: coin.x - 24, top: coin.y - 24 }}
            >
              🪙
            </div>
          )}

          {isRevealing && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/20 backdrop-blur-[1px]">
              <div className="animate-pulse rounded-full bg-[#1F1F1F] px-6 py-4 text-lg font-black text-white shadow-xl">Revealing...</div>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={handleAccessibleScratch}
          disabled={isDisabled}
          className="mt-5 w-full rounded-full bg-[#1F1F1F] px-6 py-4 text-lg font-black text-white shadow-xl disabled:bg-stone-300"
        >
          {isRevealing ? 'Revealing...' : playsRemaining > 0 ? (scratchState.phase === 'idle' ? 'Scratch Card' : 'Keep Scratching') : 'No Plays Left'}
        </button>
      </div>
    </section>
  );
}
