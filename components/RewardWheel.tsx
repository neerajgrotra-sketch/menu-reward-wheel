'use client';

import type { Reward } from '@/types/reward';

const colors = ['#fb923c', '#f97316', '#fed7aa', '#ffedd5', '#fdba74', '#ea580c', '#fef3c7', '#facc15'];

export function normalizeWheelRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

export function getRewardWheelTargetRotation(params: {
  currentRotation: number;
  selectedIndex: number;
  segmentAngle: number;
  rotations?: number;
}) {
  const fullRotations = Math.max(1, Math.round(params.rotations ?? 5));
  const currentNormalizedRotation = normalizeWheelRotation(params.currentRotation);
  const selectedSegmentCenterAtPointer = -(params.selectedIndex * params.segmentAngle);

  return params.currentRotation + fullRotations * 360 + (selectedSegmentCenterAtPointer - currentNormalizedRotation);
}

export function RewardWheel({
  rewards,
  rotation,
  spinning,
  transitionDurationMs = 2800,
}: {
  rewards: Reward[];
  rotation: number;
  spinning: boolean;
  transitionDurationMs?: number;
}) {
  const segmentAngle = 360 / rewards.length;
  const labelRadius = 94;
  const gradientStart = 90 - segmentAngle / 2;

  const gradient = rewards
    .map((_, index) => `${colors[index % colors.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`)
    .join(', ');

  return (
    <div className="relative mx-auto h-80 w-80 max-w-full rounded-full p-3 shadow-glow">
      <div
        className="relative h-full w-full rounded-full border-8 border-white shadow-2xl transition-transform ease-out"
        style={{
          background: `conic-gradient(from ${gradientStart}deg, ${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transitionDuration: spinning ? `${transitionDurationMs}ms` : '350ms',
        }}
      >
        {rewards.map((reward, index) => {
          const angle = index * segmentAngle;
          const radians = angle * (Math.PI / 180);
          const x = Math.cos(radians) * labelRadius;
          const y = Math.sin(radians) * labelRadius;

          return (
            <div
              key={reward.id}
              className="absolute left-1/2 top-1/2 z-10 flex w-[82px] items-center justify-center text-center"
              style={{
                transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`,
                transformOrigin: 'center center',
              }}
            >
              <span className="block text-[11px] font-black uppercase leading-tight tracking-tight text-stone-900">
                {reward.label}
              </span>
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
