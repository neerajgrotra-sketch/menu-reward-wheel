'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { getGameDefinition } from '@/lib/games/registry';
import { usePromotionBuilder } from '@/lib/builder/context';
import type { Reward, RewardType } from '@/types/reward';

type WheelReward = {
  id?: string;
  temp_id?: string;
  label: string;
  reward_type: 'free' | 'discount' | 'custom';
  reward_value?: number | null;
  weight: number;
  menu_item_id?: string | null;
  daily_limit?: number | null;
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

function toRuntimeRewardType(reward: WheelReward): RewardType {
  if (reward.reward_type === 'free') return 'FREE_ITEM_WITH_PURCHASE';
  if (reward.reward_type === 'custom') return 'CHEF_SPECIAL';
  return 'PERCENT_OFF_ITEM';
}

function toRuntimeReward(reward: WheelReward, index: number): Reward {
  const label = reward.label || `Reward ${index + 1}`;
  return {
    id: reward.id || reward.temp_id || `builder-preview-${index}`,
    label,
    description: reward.reward_value ? `${reward.reward_value}% off ${label}` : label,
    weight: reward.weight || 30,
    terms: 'Builder preview only.',
    rewardType: toRuntimeRewardType(reward),
    menuItemId: reward.menu_item_id || undefined,
    dailyLimit: reward.daily_limit || 10,
    active: true,
  };
}

function demoRewards(): WheelReward[] {
  return [
    { label: 'Lucky Bite', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: '15% Pasta', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Free App', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Free Drink', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'BOGO Dessert', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: '20% Off', reward_type: 'custom', reward_value: null, weight: 1 },
  ];
}

function pickWeighted(list: Reward[]) {
  let random = Math.random() * list.reduce((sum, item) => sum + (item.weight || 0), 0);
  for (let i = 0; i < list.length; i += 1) {
    random -= list[i].weight || 0;
    if (random <= 0) return i;
  }
  return Math.max(0, list.length - 1);
}

function weightName(weight: number) {
  if (weight >= 60) return 'Common';
  if (weight <= 10) return 'Rare';
  return 'Normal';
}

function useHideLegacyWheelHeader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const host = document.querySelector('[data-spinbite-non-wheel-builder-preview="true"]');
    const card = host?.closest('.rounded-\[2rem\]');
    const header = card?.querySelector('div.mb-3') as HTMLElement | null;
    if (header) {
      header.style.display = 'none';
      header.setAttribute('aria-hidden', 'true');
    }
    return () => {
      if (header) {
        header.style.display = '';
        header.removeAttribute('aria-hidden');
      }
    };
  }, [enabled]);
}

function NonWheelPreview({ rewards }: { rewards: WheelReward[] }) {
  const { state, dispatch } = usePromotionBuilder();
  const [playing, setPlaying] = useState(false);
  const runtimeRewards = useMemo(() => rewards.map((reward, index) => toRuntimeReward(reward, index)), [rewards]);
  const game = getGameDefinition(state.gameType);
  const PlayComponent = game.PlayComponent;
  const canPlay = runtimeRewards.length > 0 && !playing;

  useHideLegacyWheelHeader(true);

  function testPlay() {
    if (!canPlay) return;
    const selectedIndex = pickWeighted(runtimeRewards);
    setPlaying(true);
    dispatch({ type: 'setPreview', preview: { spinning: true, result: '' } });
    window.setTimeout(() => {
      const result = runtimeRewards[selectedIndex]?.label || 'Reward';
      setPlaying(false);
      dispatch({ type: 'setPreview', preview: { spinning: false, result } });
      confetti(game.confetti);
    }, game.resultDelayMs);
  }

  return (
    <div data-spinbite-non-wheel-builder-preview="true" className="w-full text-[#1F1F1F]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF6B00]">Game Preview</p>
          <h2 className="mt-1 text-2xl font-black">{game.icon} {game.name}</h2>
          <p className="mt-1 text-sm font-bold text-stone-500">{game.labels.instruction}</p>
          {state.preview.result && <p className="mt-2 text-sm font-black text-green-700">🎉 {state.preview.result}</p>}
        </div>
        <button
          type="button"
          onClick={testPlay}
          disabled={!canPlay}
          className="rounded-full bg-[#1F1F1F] px-5 py-3 text-sm font-black text-white shadow disabled:bg-stone-300"
        >
          {playing ? 'Testing...' : 'Test'}
        </button>
      </div>

      <PlayComponent
        rewards={runtimeRewards}
        canPlay={canPlay}
        playing={playing}
        playsRemaining={1}
        playsUsed={0}
        maxPlays={1}
        onPlay={testPlay}
        rotation={state.preview.rotation}
      />
    </div>
  );
}

function WheelOnlyPreview({ rewards, rotation = 0, spinning = false }: SpinWheelPreviewProps) {
  const visibleRewards = rewards.length > 0 ? rewards : demoRewards();
  const segmentAngle = 360 / visibleRewards.length;
  const labelRadius = 76;
  const gradientStart = 90 - segmentAngle / 2;
  const gradient = visibleRewards
    .map((_, index) => `${COLORS[index % COLORS.length]} ${index * segmentAngle}deg ${(index + 1) * segmentAngle}deg`)
    .join(', ');

  return (
    <div className="w-full overflow-visible">
      <div className="mx-auto flex w-full max-w-[18rem] flex-col items-center gap-3 sm:max-w-sm sm:gap-4">
        <div className="relative mx-auto h-64 w-64 max-w-full rounded-full p-2 sm:h-80 sm:w-80 sm:p-3">
          <div
            className="relative h-full w-full rounded-full border-[7px] border-white shadow-2xl transition-transform duration-[2800ms] ease-out sm:border-8"
            style={{ background: `conic-gradient(from ${gradientStart}deg, ${gradient})`, transform: `rotate(${rotation}deg)` }}
          >
            {visibleRewards.map((reward, index) => {
              const angle = index * segmentAngle;
              const radians = angle * (Math.PI / 180);
              const radius = visibleRewards.length > 6 ? labelRadius - 6 : labelRadius;
              const x = Math.cos(radians) * radius;
              const y = Math.sin(radians) * radius;

              return (
                <div
                  key={reward.id || `${reward.label}-${index}`}
                  className="absolute left-1/2 top-1/2 z-10 flex w-[68px] items-center justify-center text-center sm:w-[82px]"
                  style={{
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`,
                    transformOrigin: 'center center',
                  }}
                >
                  <span className="block text-[9px] font-black uppercase leading-tight tracking-tight text-stone-900 sm:text-[11px]">
                    {wheelLabel(reward)}
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
            {rewards.map((reward, index) => (
              <div key={reward.id || `${reward.label}-${index}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black shadow-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="truncate text-stone-800">{wheelLabel(reward)}</span>
                </div>
                <span className="shrink-0 text-stone-500">{weightName(reward.weight)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpinWheelPreview(props: SpinWheelPreviewProps) {
  const { state } = usePromotionBuilder();

  if (state.gameType !== 'wheel') {
    return <NonWheelPreview rewards={props.rewards} />;
  }

  return <WheelOnlyPreview {...props} />;
}
