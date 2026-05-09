'use client';

import { useEffect, useRef, useState } from 'react';
import type { GamePlayProps } from '@/lib/games/types';
import {
  defaultScratchCardState,
  getScratchCardStatusText,
  reduceScratchCardState,
  type ScratchCardState,
} from '@/lib/games/scratch-card/stateMachine';

const GRID_COLUMNS = 8;
const GRID_ROWS = 5;
const CELL_COUNT = GRID_COLUMNS * GRID_ROWS;

function getCellIndex(clientX: number, clientY: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const column = Math.min(GRID_COLUMNS - 1, Math.floor((x / rect.width) * GRID_COLUMNS));
  const row = Math.min(GRID_ROWS - 1, Math.floor((y / rect.height) * GRID_ROWS));
  return row * GRID_COLUMNS + column;
}

export default function ScratchCardGame({ canPlay, playing, playsRemaining, onPlay }: GamePlayProps) {
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const onPlayCalledRef = useRef(false);
  const revealTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const [scratchState, setScratchState] = useState<ScratchCardState>(defaultScratchCardState);
  const [scratchedCells, setScratchedCells] = useState<Set<number>>(() => new Set());
  const [isPointerDown, setIsPointerDown] = useState(false);

  const isRevealing = playing || scratchState.phase === 'revealing';
  const isCompleted = scratchState.phase === 'completed';
  const isDisabled = !canPlay || isRevealing || isCompleted;
  const overlayOpacity = Math.max(0, 0.9 - scratchState.progress / 100);
  const progressLabel = `${Math.round(scratchState.progress)}% scratched`;

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
    }, 250);

    completeTimerRef.current = window.setTimeout(() => {
      setScratchState((current) => reduceScratchCardState(current, { type: 'COMPLETE' }));
    }, 900);
  }, [scratchState.phase, onPlay]);

  function updateScratchProgress(clientX: number, clientY: number) {
    const card = cardRef.current;
    if (!card || isDisabled) return;

    setScratchState((current) => {
      if (current.phase === 'idle') return reduceScratchCardState(current, { type: 'START_SCRATCH' });
      return current;
    });

    const cellIndex = getCellIndex(clientX, clientY, card);

    setScratchedCells((current) => {
      const next = new Set(current);
      next.add(cellIndex);
      [cellIndex - 1, cellIndex + 1, cellIndex - GRID_COLUMNS, cellIndex + GRID_COLUMNS].forEach((neighbour) => {
        if (neighbour >= 0 && neighbour < CELL_COUNT) next.add(neighbour);
      });

      const progress = Math.min(100, (next.size / CELL_COUNT) * 100);
      setScratchState((currentState) => reduceScratchCardState(currentState, { type: 'UPDATE_PROGRESS', progress }));
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
  }

  function handleAccessibleScratch() {
    if (isDisabled) return;
    setScratchState((current) => {
      const started = current.phase === 'idle' ? reduceScratchCardState(current, { type: 'START_SCRATCH' }) : current;
      return reduceScratchCardState(started, { type: 'UPDATE_PROGRESS', progress: Math.min(100, started.progress + 20) });
    });
    setScratchedCells((current) => {
      const next = new Set(current);
      for (let index = next.size; index < Math.min(CELL_COUNT, next.size + 8); index += 1) next.add(index);
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
          className="group relative aspect-[1.45/1] w-full touch-none overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 text-left shadow-2xl transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          aria-label="Scratch the card to reveal your reward"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,.35),transparent_20%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,.25),transparent_28%)]" />
          <div className="relative z-10 flex h-full flex-col justify-between rounded-[1.4rem] border-2 border-white/65 bg-white/18 p-4 text-white backdrop-blur-[1px]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
              <h2 className="mt-2 text-4xl font-black leading-none drop-shadow">Scratch<br />& Win</h2>
            </div>
            <div className="rounded-2xl bg-black/20 p-3 text-center shadow-inner">
              <p className="text-sm font-black uppercase tracking-wide">
                {getScratchCardStatusText(scratchState, playing)}
              </p>
              {scratchState.phase === 'scratching' && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/25">
                  <div className="h-full rounded-full bg-white transition-all duration-150" style={{ width: `${Math.max(8, scratchState.progress)}%` }} />
                </div>
              )}
            </div>
          </div>

          {!isCompleted && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-stone-300 backdrop-blur-[1px] transition duration-200" style={{ opacity: overlayOpacity }}>
              <div className="rounded-full bg-white px-6 py-4 text-lg font-black text-stone-700 shadow-xl">
                {scratchState.phase === 'idle' ? '👆 Drag to Scratch' : progressLabel}
              </div>
            </div>
          )}

          {isRevealing && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/20 backdrop-blur-[1px]">
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
          {isRevealing ? 'Revealing...' : playsRemaining > 0 ? (scratchState.phase === 'idle' ? 'Scratch Card' : progressLabel) : 'No Plays Left'}
        </button>
      </div>
    </section>
  );
}
