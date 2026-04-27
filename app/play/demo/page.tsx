'use client';

import { useMemo, useState } from 'react';
import { CountdownTimer } from '@/components/CountdownTimer';
import { RewardWheel } from '@/components/RewardWheel';
import { createCouponCode, demoRewards, pickWeightedReward } from '@/lib/rewards';
import type { Reward } from '@/types/reward';

export default function DemoPlayPage() {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const segmentAngle = useMemo(() => 360 / demoRewards.length, []);

  function spin() {
    if (spinning) return;

    const selected = pickWeightedReward(demoRewards);
    const selectedIndex = demoRewards.findIndex((item) => item.id === selected.id);

    const currentNormalized = rotation % 360;
    const targetAngle = -(selectedIndex * segmentAngle);
    const extraSpins = 5 * 360;

    const finalRotation = rotation + extraSpins + (targetAngle - currentNormalized);

    setReward(null);
    setCoupon(null);
    setSpinning(true);
    setRotation(finalRotation);

    setTimeout(() => {
      setReward(selected);
      setCoupon(createCouponCode());
      setSpinning(false);
    }, 2900);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white/80 p-5 text-center shadow-xl backdrop-blur">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-orange-700">Demo Restaurant</p>
          <h1 className="mt-2 text-3xl font-black">Spin to unlock your menu reward</h1>
          <p className="mt-2 text-sm text-stone-600">Everyone wins.</p>
        </div>

        <div className="mt-6">
          <RewardWheel rewards={demoRewards} rotation={rotation} spinning={spinning} />
        </div>

        <button onClick={spin} disabled={spinning || Boolean(reward)} className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white">
          {spinning ? 'Spinning...' : reward ? 'Reward Unlocked' : 'Spin Now'}
        </button>

        {reward && coupon && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl">
            <h2 className="text-2xl font-black">{reward.description}</h2>
            <div className="mt-4 text-center">
              <p className="text-2xl font-black">{coupon}</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
