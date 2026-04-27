'use client';

import type { Reward } from '@/types/reward';

const colors = ['#fb923c', '#f97316', '#fed7aa', '#ffedd5', '#fdba74', '#ea580c', '#fef3c7', '#facc15'];

function shortLabel(label: string) {
  return label
    .replace('Paneer', 'PNR')
    .replace('Mango Lassi', 'Lassi')
    .replace('Free ', 'Free\n')
    .replace('$3 Lunch', '$3\nLunch')
    .replace('App Deal', 'App\nDeal')
    .replace('Chef Pick', 'Chef\nPick')
    .replace('10% PNR', '10%\nPNR')
    .replace('5% Off', '5%\nOff');
}

export function RewardWheel({ rewards, rotation, spinning }: { rewards: Reward[]; rotation: number; spinning: boolean }) {
  const segmentAngle = 360 / rewards.length;
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
          const segmentMidDeg = index * segmentAngle + segmentAngle / 2;

          return (
            <div
              key={reward.id}
              className="absolute left-1/2 top-1/2 z-10 h-0 w-0"
              style={{ transform: `rotate(${segmentMidDeg}deg)` }}
            >
              <div
                className="absolute left-[62px] top-1/2 flex h-10 w-16 -translate-y-1/2 items-center justify-center text-center"
                style={{ transform: `rotate(90deg)` }}
              >
                <span className="whitespace-pre-line rounded-md bg-white/55 px-1.5 py-1 text-[9px] font-black uppercase leading-[0.9] tracking-tight text-stone-900 shadow-sm">
                  {shortLabel(reward.label)}
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
