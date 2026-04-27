'use client';

import { useState } from 'react';
import { getWorkspace, saveWorkspace } from '@/lib/rewards';
import type { RestaurantWorkspace, Reward } from '@/types/reward';

export default function RewardsPage() {
  const [workspace, setWorkspace] = useState<RestaurantWorkspace | null>(() => getWorkspace());
  const [label, setLabel] = useState('');
  const [weight, setWeight] = useState(10);

  if (!workspace) {
    return <div className="p-6">No workspace</div>;
  }

  function addReward() {
    if (!workspace || !label.trim()) return;

    const newReward: Reward = {
      id: 'r_' + Date.now(),
      label: label.trim(),
      description: label.trim(),
      weight,
      terms: 'Standard terms apply',
      active: true,
    };

    const nextWorkspace: RestaurantWorkspace = {
      ...workspace,
      rewards: [...workspace.rewards, newReward],
    };

    saveWorkspace(nextWorkspace);
    setWorkspace(nextWorkspace);
    setLabel('');
    setWeight(10);
  }

  return (
    <main className="min-h-screen bg-orange-50 p-6 text-stone-950">
      <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h1 className="text-2xl font-black">Wheel Rewards</h1>

        <div className="mt-4 space-y-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Reward label (e.g. Free Lassi)"
            className="w-full rounded-xl border px-3 py-2"
          />

          <input
            type="number"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full rounded-xl border px-3 py-2"
          />

          <button
            onClick={addReward}
            className="w-full rounded-xl bg-green-600 px-4 py-3 font-black text-white"
          >
            Add Reward
          </button>
        </div>

        <ul className="mt-4 space-y-2">
          {workspace.rewards.map((reward) => (
            <li key={reward.id} className="rounded-xl bg-stone-100 px-3 py-2 font-bold">
              {reward.label} (w: {reward.weight})
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
