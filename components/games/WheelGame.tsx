'use client';

import { RewardWheel } from '@/components/RewardWheel';
import type { GamePlayProps } from '@/lib/games/types';

export default function WheelGame({
  rewards,
  rotation,
  playing,
  canPlay,
  playsRemaining,
  onPlay,
}: GamePlayProps) {
  return (
    <>
      <div className="mt-6">
        <RewardWheel rewards={rewards} rotation={rotation} spinning={playing} />
      </div>
      <button
        onClick={onPlay}
        disabled={!canPlay}
        className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white shadow-xl disabled:bg-stone-400"
      >
        {playing ? 'Spinning...' : playsRemaining > 0 ? 'Spin Now' : 'All Spins Used'}
      </button>
    </>
  );
}
