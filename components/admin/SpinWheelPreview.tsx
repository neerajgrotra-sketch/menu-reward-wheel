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
  spinning?: boolean;
  selectedIndex?: number | null;
};

const SEGMENT_COLORS = [
  '#FF6B00',
  '#FFD166',
  '#00C853',
  '#E63939',
  '#2DD4BF',
  '#F97316',
  '#8B5CF6',
  '#FACC15',
  '#06B6D4',
  '#FB7185',
];

function rewardLabel(reward: WheelReward) {
  if (reward.reward_type === 'free') return `FREE ${reward.label}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% OFF ${reward.label}`;
  return reward.label;
}

export default function SpinWheelPreview({ rewards, spinning = false, selectedIndex = null }: SpinWheelPreviewProps) {
  const segmentCount = Math.max(rewards.length, 1);
  const segmentSize = 360 / segmentCount;
  const gradient =
    rewards.length > 0
      ? rewards
          .map((_, index) => {
            const start = index * segmentSize;
            const end = (index + 1) * segmentSize;
            return `${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} ${start}deg ${end}deg`;
          })
          .join(',')
      : '#E7E5E4 0deg 360deg';

  const stoppedRotation =
    selectedIndex === null ? undefined : `rotate(${360 * 5 - selectedIndex * segmentSize - segmentSize / 2}deg)`;

  return (
    <div className="w-full">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-4">
        <div className="relative h-72 w-72 sm:h-80 sm:w-80">
          <style jsx>{`
            @keyframes wheelSpin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
          <div className="absolute left-1/2 top-[-10px] z-20 -translate-x-1/2 text-4xl drop-shadow">▼</div>
          <div
            className="h-full w-full rounded-full border-[10px] border-white shadow-2xl transition-transform duration-1000 ease-out"
            style={{
              background: `conic-gradient(${gradient})`,
              animation: spinning ? 'wheelSpin .65s linear infinite' : undefined,
              transform: spinning ? undefined : stoppedRotation,
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#1F1F1F] text-center text-white shadow-xl ring-8 ring-white">
              <div>
                <p className="text-lg font-black leading-none">SPIN</p>
                <p className="mt-1 text-[10px] font-black uppercase text-white/70">BITE</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {rewards.map((reward, index) => (
            <div key={reward.id || `${reward.label}-${index}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black shadow-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }} />
                <span className="truncate text-stone-800">{rewardLabel(reward)}</span>
              </div>
              <span className="shrink-0 text-stone-400">{reward.weight}</span>
            </div>
          ))}
          {rewards.length === 0 && (
            <div className="rounded-2xl bg-white px-4 py-3 text-center text-sm font-black text-stone-500 shadow-sm sm:col-span-2">Add rewards to preview the wheel.</div>
          )}
        </div>
      </div>
    </div>
  );
}
