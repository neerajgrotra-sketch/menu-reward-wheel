'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { getGameDefinition } from '@/lib/games/registry';
import { useOptionalPromotionBuilder } from '@/lib/builder/context';
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
    const card = host?.parentElement;
    const header = Array.from(card?.children || []).find((child) => child instanceof HTMLElement && child.classList.contains('mb-3')) as HTMLElement | undefined;
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

function RewardLegend({ rewards }: { rewards: WheelReward[] }) {
  if (!rewards.length) return null;
  return (
    <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
      {rewards.map((reward, index) => (
        <div key={reward.id || reward.temp_id || `${reward.label}-${index}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-black shadow-sm">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
            <span className="truncate text-stone-800">{wheelLabel(reward)}</span>
          </div>
          <span className="shrink-0 text-stone-500">{weightName(reward.weight)}</span>
        </div>
      ))}
    </div>
  );
}

function MysteryBoxBuilderPreview({ active, selectedBox, result }: { active: boolean; selectedBox: number | null; result: string }) {
  const revealMode = active || selectedBox !== null;

  return (
    <div className={revealMode ? 'relative mx-auto mt-5 min-h-[13rem] w-full max-w-sm' : 'mx-auto mt-5 grid w-full max-w-sm grid-cols-3 gap-3'}>
      {[0, 1, 2].map((index) => {
        const selected = selectedBox === index;
        const hidden = selectedBox !== null && !selected;

        return (
          <div
            key={index}
            className={`relative flex h-28 items-center justify-center rounded-[1.35rem] border-2 border-white bg-gradient-to-br from-[#FF6B00] to-[#E63939] p-2 text-center shadow-xl transition-all duration-500 ${hidden ? 'scale-75 opacity-0' : ''}`}
            style={
              revealMode
                ? selected
                  ? { position: 'absolute', left: '50%', top: '46%', width: '9.25rem', height: '9.25rem', zIndex: 20, animation: 'selectedTremble 0.85s ease-in-out infinite', transform: 'translate(-50%, -50%)' }
                  : undefined
                : { animation: `boxFloat 2.4s ease-in-out infinite ${index * 0.15}s` }
            }
          >
            {selected && (
              <>
                <span className="absolute left-1/2 top-1 z-20 -translate-x-1/2 text-3xl" style={{ animation: 'sparkleBurst 1.05s ease-out infinite' }}>✨</span>
                <span className="absolute left-3 top-10 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.2s ease-out infinite .1s' }}>⭐</span>
                <span className="absolute right-3 top-10 z-20 text-2xl" style={{ animation: 'sparkleBurst 1.2s ease-out infinite .2s' }}>💫</span>
              </>
            )}
            <span className="text-4xl drop-shadow-sm">{selected ? '🎉' : '🎁'}</span>
            <span className="absolute bottom-3 text-[11px] font-black uppercase tracking-wide text-white">{selected ? 'Opening...' : `Box ${index + 1}`}</span>
          </div>
        );
      })}

      {selectedBox !== null && result && (
        <div className="absolute inset-x-0 bottom-0 rounded-3xl bg-green-50 px-4 py-3 text-center text-sm font-black text-green-800 shadow-inner">
          Prize revealed: {result}
        </div>
      )}
    </div>
  );
}

function ScratchCardBuilderPreview({ active }: { active: boolean }) {
  return (
    <div className="mx-auto mt-5 max-w-sm">
      <div className="relative aspect-[1.45/1] w-full overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 text-left shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,.35),transparent_20%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,.25),transparent_28%)]" />
        <div className="relative z-10 flex h-full flex-col justify-between rounded-[1.4rem] border-2 border-white/65 bg-white/18 p-4 text-white backdrop-blur-[1px]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
            <h2 className="mt-2 text-4xl font-black leading-none drop-shadow">Scratch<br />& Win</h2>
          </div>
          <div className="rounded-2xl bg-black/20 p-3 text-center shadow-inner">
            <p className="text-sm font-black uppercase tracking-wide">{active ? 'Revealing...' : 'Tap Test to Reveal'}</p>
          </div>
        </div>
        {active && <div className="absolute inset-0 z-20 bg-white/20" />}
      </div>
    </div>
  );
}

function NonWheelPreview({ rewards }: { rewards: WheelReward[] }) {
  const builder = useOptionalPromotionBuilder();
  const [localResult, setLocalResult] = useState('');
  const [playing, setPlaying] = useState(false);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const runtimeRewards = useMemo(() => rewards.map((reward, index) => toRuntimeReward(reward, index)), [rewards]);
  const gameType = builder?.state.gameType || 'wheel';
  const game = getGameDefinition(gameType);
  const canPlay = runtimeRewards.length > 0 && !playing;
  const result = builder?.state.preview.result || localResult;

  useHideLegacyWheelHeader(true);

  function updatePreview(spinning: boolean, previewResult: string) {
    if (builder) {
      builder.dispatch({ type: 'setPreview', preview: { spinning, result: previewResult } });
    } else {
      setLocalResult(previewResult);
    }
  }

  function testPlay() {
    if (!canPlay) return;
    const selectedIndex = pickWeighted(runtimeRewards);
    const nextSelectedBox = gameType === 'mystery_box' ? Math.floor(Math.random() * 3) : null;

    setPlaying(true);
    setSelectedBox(nextSelectedBox);
    updatePreview(true, '');

    window.setTimeout(() => {
      const nextResult = runtimeRewards[selectedIndex]?.label || 'Reward';
      setPlaying(false);
      updatePreview(false, nextResult);
      confetti(game.confetti);
    }, game.resultDelayMs);

    if (nextSelectedBox !== null) {
      window.setTimeout(() => setSelectedBox(null), game.resultDelayMs + 1700);
    }
  }

  return (
    <div data-spinbite-non-wheel-builder-preview="true" className="w-full text-[#1F1F1F]">
      <style jsx>{`
        @keyframes boxFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-7px) scale(1.04); }
        }
        @keyframes selectedTremble {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.18); }
          20% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.27); }
          40% { transform: translate(-50%, -50%) rotate(6deg) scale(1.34); }
          60% { transform: translate(-50%, -50%) rotate(-4deg) scale(1.31); }
          80% { transform: translate(-50%, -50%) rotate(4deg) scale(1.24); }
        }
        @keyframes sparkleBurst {
          0% { transform: translateY(8px) scale(.65); opacity: 0; }
          45% { transform: translateY(-22px) scale(1.2); opacity: 1; }
          100% { transform: translateY(-46px) scale(.8); opacity: 0; }
        }
      `}</style>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#FF6B00]">Game Preview</p>
          <h2 className="mt-1 text-2xl font-black">{game.icon} {game.name}</h2>
          <p className="mt-1 text-sm font-bold text-stone-500">{game.labels.instruction}</p>
          {result && <p className="mt-2 text-sm font-black text-green-700">🎉 {result}</p>}
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

      {gameType === 'scratch_card' ? <ScratchCardBuilderPreview active={playing} /> : <MysteryBoxBuilderPreview active={playing} selectedBox={selectedBox} result={result} />}
      <RewardLegend rewards={rewards} />
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

        <RewardLegend rewards={rewards} />
      </div>
    </div>
  );
}

export default function SpinWheelPreview(props: SpinWheelPreviewProps) {
  const builder = useOptionalPromotionBuilder();

  if (builder && builder.state.gameType !== 'wheel') {
    return <NonWheelPreview rewards={props.rewards} />;
  }

  return <WheelOnlyPreview {...props} />;
}
