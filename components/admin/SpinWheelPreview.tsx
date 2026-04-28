'use client';

type WheelReward = {
  id?: string;
  label: string;
  reward_type: 'free' | 'discount' | 'custom';
  reward_value?: number | null;
  weight: number;
};

type SpinWheelPreviewProps = {
  rewards: WheelReward[];
  rotation?: number;
  spinning?: boolean;
  selectedIndex?: number | null;
};

const COLORS = ['#fb923c', '#f97316', '#fed7aa', '#ffedd5', '#fdba74', '#ea580c', '#fef3c7', '#facc15'];

function wheelLabel(reward: WheelReward) {
  if (reward.reward_type === 'free') return `FREE ${reward.label}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${reward.label}`;
  return reward.label;
}

function demoRewards(): WheelReward[] {
  return [
    { label: 'Lucky Bite', reward_type: 'custom', reward_value: null, weight: 60 },
    { label: '15% Pasta', reward_type: 'custom', reward_value: null, weight: 30 },
    { label: 'Free App', reward_type: 'custom', reward_value: null, weight: 10 },
    { label: 'Free Drink', reward_type: 'custom', reward_value: null, weight: 30 },
    { label: 'BOGO Dessert', reward_type: 'custom', reward_value: null, weight: 10 },
    { label: '20% Off', reward_type: 'custom', reward_value: null, weight: 60 },
  ];
}

function buildSlices(rewards: WheelReward[]) {
  const totalWeight = rewards.reduce((sum, reward) => sum + Math.max(reward.weight || 0, 0), 0) || rewards.length || 1;
  let cursor = 0;

  return rewards.map((reward, index) => {
    const safeWeight = Math.max(reward.weight || 0, 0) || 1;
    const size = (safeWeight / totalWeight) * 360;
    const start = cursor;
    const end = cursor + size;
    const mid = start + size / 2;
    cursor = end;

    return {
      reward,
      index,
      start,
      end,
      mid,
      percentage: Math.round((safeWeight / totalWeight) * 100),
    };
  });
}

export default function SpinWheelPreview({ rewards, rotation = 0, spinning = false }: SpinWheelPreviewProps) {
  const visibleRewards = rewards.length > 0 ? rewards : demoRewards();
  const slices = buildSlices(visibleRewards);
  const labelRadius = 76;
  const gradient = slices
    .map((slice) => `${COLORS[slice.index % COLORS.length]} ${slice.start}deg ${slice.end}deg`)
    .join(', ');

  return (
    <div className="w-full overflow-visible">
      <div className="mx-auto flex w-full max-w-[18rem] flex-col items-center gap-3 sm:max-w-sm sm:gap-4">
        <div className="relative mx-auto h-64 w-64 max-w-full rounded-full p-2 sm:h-80 sm:w-80 sm:p-3">
          <div
            className="relative h-full w-full rounded-full border-[7px] border-white shadow-2xl transition-transform duration-[2800ms] ease-out sm:border-8"
            style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)` }}
          >
            {slices.map((slice) => {
              const radians = slice.mid * (Math.PI / 180);
              const radius = visibleRewards.length > 6 ? labelRadius - 6 : labelRadius;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;
              const readableAngle = slice.mid > 90 && slice.mid < 270 ? slice.mid + 180 : slice.mid;

              return (
                <div
                  key={slice.reward.id || `${slice.reward.label}-${slice.index}`}
                  className="absolute left-1/2 top-1/2 z-10 flex w-[68px] items-center justify-center text-center sm:w-[82px]"
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${readableAngle}deg)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <span className="block text-[9px] font-black uppercase leading-tight tracking-tight text-stone-900 sm:text-[11px]">
                    {wheelLabel(slice.reward)}
                  </span>
                </div>
              );
            })}

            <div className="absolute left-1/2 top-1/2 z-20 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-stone-900 text-center text-[11px] font-black uppercase tracking-wide text-white shadow-xl sm:h-16 sm:w-16 sm:text-xs">
              Spin
            </div>
          </div>

          <div className="absolute -right-1 top-1/2 z-30 -translate-y-1/2 text-4xl drop-shadow-lg sm:text-5xl">◀</div>
          {spinning && <div className="absolute inset-0 rounded-full bg-white/10" />}
        </div>

        {rewards.length > 0 && (
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
            {slices.map((slice) => (
              <div key={slice.reward.id || `${slice.reward.label}-${slice.index}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black shadow-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[slice.index % COLORS.length] }} />
                  <span className="truncate text-stone-800">{wheelLabel(slice.reward)}</span>
                </div>
                <span className="shrink-0 text-stone-500">{slice.percentage}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
