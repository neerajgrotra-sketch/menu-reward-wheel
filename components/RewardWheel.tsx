'use client';

import type { Reward } from '@/types/reward';

const colors = ['#fb923c', '#f97316', '#fed7aa', '#ffedd5', '#fdba74', '#ea580c', '#fef3c7', '#facc15'];

export function RewardWheel({ rewards, rotation, spinning }: { rewards: Reward[]; rotation: number; spinning: boolean }) {
  const segmentAngle = 360 / rewards.length;
  const labelRadius = 108;

  const gradient = rewards
    .map((_, index) => `${colors[index % colors.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`)
    .join(', ');

  return (
    <div className="relative mx-auto h-80 w-80 max-w-full rounded-full p-3 shadow-glow">
      <div
        className="relative h-full w-full rounded-full border-8 border-white shadow-2xl transition-transform duration-[2800ms] ease-out"
        style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)` }}
      >
        {rewards.map((reward, index) => {
          const angle = index * segmentAngle + segmentAngle / 2;
          const radians = (angle - 90) * (Math.PI / 180);
          const x = Math.cos(radians) * labelRadius;
          const y = Math.sin(radians) * labelRadius;

          return (
            <div
              key={reward.id}
              className="absolute left-1/2 top-1/2 z-10"
              style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
            >
              <div className="rounded-md bg-white/85 px-2.5 py-1.5 text-center shadow-md backdrop-blur-sm">
                <span className="block max-w-[74px] text-[10px] font-black uppercase leading-tight text-stone-900">
                  {reward.label}
                </span>
              </div>
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 z-20 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-stone-900 text-center text-xs font-black uppercase tracking-wide text-white shadow-xl">
          Spin
        </div>
      </div>

      <div className="absolute -right-1 top-1/2 z-30 -translate-y-1/2 text-5xl drop-shadow-lg">◀</div>

      {spinning && <div className="absolute inset-0 rounded-full bg-white/10" />}
    </div>
  );
}
