'use client';

import { useEffect, useState } from 'react';
import { RewardWheel } from '@/components/RewardWheel';
import type { GamePlayProps } from '@/lib/games/types';
import {
  defaultSpinWheelState,
  getSpinWheelButtonText,
  reduceSpinWheelState,
  type SpinWheelState,
} from '@/lib/games/spin-wheel/stateMachine';

export default function SpinWheelRuntime({
  rewards = [],
  rotation = 0,
  playing,
  canPlay,
  playsRemaining,
  onPlay,
}: GamePlayProps) {
  const [state, setState] = useState<SpinWheelState>(defaultSpinWheelState);

  useEffect(() => {
    if (canPlay && !playing && (state.phase === 'idle' || state.phase === 'completed')) {
      setState((current) => reduceSpinWheelState(current, { type: 'READY' }));
    }
  }, [canPlay, playing, state.phase]);

  useEffect(() => {
    if (playing && state.phase === 'ready') {
      setState((current) => reduceSpinWheelState(current, { type: 'START_SPIN' }));
    }
  }, [playing, state.phase]);

  useEffect(() => {
    if (!playing && state.phase === 'spinning') {
      setState((current) => reduceSpinWheelState(current, { type: 'START_SETTLING' }));

      const timer = window.setTimeout(() => {
        setState((current) => reduceSpinWheelState(current, { type: 'COMPLETE' }));
      }, 450);

      return () => window.clearTimeout(timer);
    }
  }, [playing, state.phase]);

  function handleSpin() {
    if (!canPlay || playing || state.phase === 'spinning') return;

    setState((current) => reduceSpinWheelState(current, { type: 'START_SPIN' }));
    onPlay();
  }

  return (
    <>
      <div className="mt-6">
        <RewardWheel rewards={rewards} rotation={rotation} spinning={playing} />
      </div>

      <div className="mt-3 text-center text-sm font-black uppercase tracking-wide text-stone-500">
        {state.phase === 'completed'
          ? 'Reward ready!'
          : state.phase === 'settling'
            ? 'Finalizing spin...'
            : state.phase === 'spinning'
              ? 'Wheel spinning...'
              : 'Ready to spin'}
      </div>

      <button
        onClick={handleSpin}
        disabled={!canPlay || playing}
        className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400"
      >
        {getSpinWheelButtonText(state, playing, playsRemaining)}
      </button>
    </>
  );
}
