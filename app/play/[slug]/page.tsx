'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CountdownTimer } from '@/components/CountdownTimer';
import { RewardWheel } from '@/components/RewardWheel';
import { createCouponCode, getWorkspace, pickWeightedReward } from '@/lib/rewards';
import type { Reward } from '@/types/reward';

export default function PlayPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);

  const segmentAngle = useMemo(() => (rewards.length ? 360 / rewards.length : 0), [rewards]);

  useEffect(() => {
    const workspace = getWorkspace();
    if (workspace && workspace.restaurant.slug === slug) {
      setRewards(workspace.rewards.filter((r) => r.active !== false));
    }
  }, [slug]);

  function spin() {
    if (spinning || rewards.length === 0) return;

    const selected = pickWeightedReward(rewards);
    const selectedIndex = rewards.findIndex((r) => r.id === selected.id);

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

  if (rewards.length === 0) {
    return <div className="p-6">No active rewards found for this restaurant.</div>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-100 px-4 py-6 text-stone-950">
      <section className="mx-auto max-w-md">
        <div className="rounded-3xl bg-white/80 p-5 text-center shadow-xl">
          <h1 className="text-2xl font-black">Spin & Win</h1>
        </div>

        <div className="mt-6">
          <RewardWheel rewards={rewards} rotation={rotation} spinning={spinning} />
        </div>

        <button
          onClick={spin}
          disabled={spinning || Boolean(reward)}
          className="mt-6 w-full rounded-3xl bg-green-600 px-6 py-5 text-xl font-black text-white"
        >
          {spinning ? 'Spinning...' : reward ? 'Reward Unlocked' : 'Spin Now'}
        </button>

        {reward && coupon && (
          <section className="mt-6 rounded-3xl bg-white p-5 shadow-xl">
            <h2 className="text-2xl font-black">{reward.description}</h2>
            <div className="mt-4 text-center">
              <p className="text-2xl font-black">{coupon}</p>
            </div>
            <p className="mt-3 text-center text-red-600 font-bold">
              Expires in <CountdownTimer minutes={20} />
            </p>
          </section>
        )}
      </section>
    </main>
  );
}
