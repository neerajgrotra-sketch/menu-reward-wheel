'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { getGameDefinition } from '@/lib/games/registry';
import OpenTheDoorBuilderPreview from '@/lib/games/open-the-door/builderPreview';
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
const SCRATCH_COLUMNS = 14;
const SCRATCH_ROWS = 8;
const SCRATCH_CELL_COUNT = SCRATCH_COLUMNS * SCRATCH_ROWS;
const SCRATCH_THRESHOLD = 72;

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
  const displayLabel = wheelLabel({ ...reward, label });
  return {
    id: reward.id || reward.temp_id || `builder-preview-${index}`,
    label: displayLabel,
    description: displayLabel,
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
    { label: 'Reward 1', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Reward 2', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Reward 3', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Reward 4', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Reward 5', reward_type: 'custom', reward_value: null, weight: 1 },
    { label: 'Reward 6', reward_type: 'custom', reward_value: null, weight: 1 },
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

function getScratchCellIndex(clientX: number, clientY: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  const column = Math.min(SCRATCH_COLUMNS - 1, Math.floor((x / rect.width) * SCRATCH_COLUMNS));
  const row = Math.min(SCRATCH_ROWS - 1, Math.floor((y / rect.height) * SCRATCH_ROWS));
  return row * SCRATCH_COLUMNS + column;
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

function MysteryBoxBuilderPreview({ selectedBox, result }: { selectedBox: number | null; result: string }) {
  console.log('MysteryBoxPreview Rendered');
  const revealMode = selectedBox !== null;
  return (
    <div className="mx-auto mt-5 w-full max-w-sm">
      {selectedBox !== null && (
        <p className="mb-3 rounded-2xl bg-orange-50 px-4 py-2 text-center text-sm font-black text-[#FF6B00]">
          Opening Box {selectedBox + 1}...
        </p>
      )}
      <div className={revealMode ? 'relative min-h-[12rem] w-full' : 'grid w-full grid-cols-3 gap-3'}>
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
                    ? { position: 'absolute', left: '50%', top: '44%', width: '8.25rem', height: '8.25rem', zIndex: 20, animation: 'selectedTremble 0.85s ease-in-out infinite', transform: 'translate(-50%, -50%)' }
                    : undefined
                  : { animation: `boxFloat 2.4s ease-in-out infinite ${index * 0.15}s` }
              }
            >
              {selected && <span className="absolute left-1/2 top-1 z-20 -translate-x-1/2 text-3xl" style={{ animation: 'sparkleBurst 1.05s ease-out infinite' }}>✨</span>}
              <span className="text-4xl drop-shadow-sm">{selected ? '🎉' : '🎁'}</span>
              <span className="absolute bottom-3 text-[11px] font-black uppercase tracking-wide text-white">Box {index + 1}</span>
            </div>
          );
        })}
      </div>
      {selectedBox !== null && result && (
        <div className="mt-3 rounded-3xl bg-green-50 px-4 py-3 text-center text-sm font-black text-green-800 shadow-inner">
          Prize revealed: {result}
        </div>
      )}
    </div>
  );
}

function ScratchCardBuilderPreview({ result, resetKey, onReveal }: { result: string; resetKey: number; onReveal: () => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [scratchedCells, setScratchedCells] = useState<Set<number>>(() => new Set());
  const [isPointerDown, setIsPointerDown] = useState(false);
  const [coin, setCoin] = useState<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const progress = Math.min(100, Math.round((scratchedCells.size / SCRATCH_CELL_COUNT) * 100));
  const showReward = revealed || Boolean(result);

  useEffect(() => {
    setScratchedCells(new Set());
    setIsPointerDown(false);
    setCoin(null);
    setRevealed(false);
  }, [resetKey]);

  useEffect(() => {
    if (!revealed && progress >= SCRATCH_THRESHOLD) {
      setRevealed(true);
      onReveal();
    }
  }, [onReveal, progress, revealed]);

  function scratchAt(clientX: number, clientY: number) {
    const card = cardRef.current;
    if (!card || revealed) return;
    const rect = card.getBoundingClientRect();
    setCoin({ x: clientX - rect.left, y: clientY - rect.top });
    const cellIndex = getScratchCellIndex(clientX, clientY, card);
    setScratchedCells((current) => {
      const next = new Set(current);
      next.add(cellIndex);
      return next;
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (revealed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPointerDown(true);
    scratchAt(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isPointerDown || revealed) return;
    scratchAt(event.clientX, event.clientY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsPointerDown(false);
    setCoin(null);
  }

  return (
    <div className="mx-auto mt-5 max-w-sm">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="relative aspect-[1.45/1] w-full touch-none overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-orange-400 via-yellow-300 to-red-500 p-5 text-left shadow-2xl select-none"
        aria-label="Scratch the card preview"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.55),transparent_25%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,.35),transparent_20%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,.25),transparent_28%)]" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center rounded-[1.4rem] border-2 border-white/65 bg-white/18 p-4 text-center text-white backdrop-blur-[1px]">
          <p className="absolute left-4 top-4 text-xs font-black uppercase tracking-[0.18em] text-white/80">Scratch Card</p>
          {showReward ? (
            <div className="rounded-[1.5rem] bg-black/35 px-5 py-4 shadow-2xl backdrop-blur-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/80">You won</p>
              <h2 className="mt-1 text-3xl font-black leading-tight drop-shadow">{result || 'Reward'}</h2>
            </div>
          ) : (
            <div>
              <h2 className="text-4xl font-black leading-none drop-shadow">Scratch<br />& Win</h2>
              <p className="mt-4 rounded-full bg-black/20 px-4 py-2 text-xs font-black uppercase tracking-wide">Prize hidden below</p>
            </div>
          )}
        </div>

        {!revealed && (
          <div className="absolute inset-0 z-20 grid" style={{ gridTemplateColumns: `repeat(${SCRATCH_COLUMNS}, 1fr)`, gridTemplateRows: `repeat(${SCRATCH_ROWS}, 1fr)` }}>
            {Array.from({ length: SCRATCH_CELL_COUNT }).map((_, index) => (
              <div
                key={index}
                className="border border-white/10 bg-gradient-to-br from-stone-300 via-stone-100 to-stone-400 transition-opacity duration-150"
                style={{ opacity: scratchedCells.has(index) ? 0 : 0.97 }}
              />
            ))}
          </div>
        )}

        {!revealed && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
            <div className="rounded-full bg-white/95 px-5 py-3 text-sm font-black text-stone-700 shadow-xl">
              {progress === 0 ? '🪙 Scratch to reveal' : 'Keep scratching...'}
            </div>
          </div>
        )}

        {coin && !revealed && (
          <div
            className="pointer-events-none absolute z-40 grid h-12 w-12 place-items-center rounded-full border-4 border-stone-300 bg-stone-100 text-2xl shadow-2xl"
            style={{ left: coin.x - 24, top: coin.y - 24 }}
          >
            🪙
          </div>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
        <div className="h-full rounded-full bg-[#FF6B00] transition-all duration-150" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-center text-xs font-black text-stone-500">
        Keep scratching until the reward appears.
      </p>
    </div>
  );
}

function NonWheelPreview({ rewards, rotation }: Pick<SpinWheelPreviewProps, 'rewards' | 'rotation'>) {
  const builder = useOptionalPromotionBuilder();
  const [localResult, setLocalResult] = useState('');
  const [playing, setPlaying] = useState(false);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [scratchResetKey, setScratchResetKey] = useState(0);
  const runtimeRewards = useMemo(() => rewards.map((reward, index) => toRuntimeReward(reward, index)), [rewards]);
  const gameType = builder?.state.gameType || 'wheel';
  const game = getGameDefinition(gameType);
  const BuilderPreview = game.components?.BuilderPreview ||
    (game.type === 'open_the_door' ? OpenTheDoorBuilderPreview : undefined);
  const canPlay = runtimeRewards.length > 0 && !playing;
  const result = builder?.state.preview.result || localResult;

  useEffect(() => {
    console.log('SpinWheelPreview NonWheelPreview', {
      builderPresent: !!builder,
      builderGameType: builder?.state.gameType,
      resolvedGameType: game.type,
      hasBuilderPreview: !!BuilderPreview,
    });
  }, [builder, game.type, BuilderPreview]);

  useHideLegacyWheelHeader(true);

  function updatePreview(spinning: boolean, previewResult: string) {
    if (builder) {
      builder.dispatch({ type: 'setPreview', preview: { spinning, result: previewResult } });
    } else {
      setLocalResult(previewResult);
    }
  }

  function revealScratchPrize() {
    if (!runtimeRewards.length) return;
    const selectedIndex = pickWeighted(runtimeRewards);
    const nextResult = runtimeRewards[selectedIndex]?.label || 'Reward';
    updatePreview(false, nextResult);
    confetti(game.confetti);
  }

  function testPlay() {
    if (!canPlay) return;

    if (gameType === 'scratch_card') {
      updatePreview(false, '');
      setScratchResetKey((current) => current + 1);
      return;
    }

    const selectedIndex = pickWeighted(runtimeRewards);
    const nextSelectedBox = Math.floor(Math.random() * 3);
    setPlaying(true);
    setSelectedBox(nextSelectedBox);
    updatePreview(true, '');

    window.setTimeout(() => {
      const nextResult = runtimeRewards[selectedIndex]?.label || 'Reward';
      setPlaying(false);
      updatePreview(false, nextResult);
      confetti(game.confetti);
    }, game.resultDelayMs);

    window.setTimeout(() => setSelectedBox(null), game.resultDelayMs + 2200);
  }

  return (
    <div data-spinbite-non-wheel-builder-preview="true" className="w-full text-[#1F1F1F]">
      <style jsx>{`
        @keyframes boxFloat {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-7px) scale(1.04); }
        }
        @keyframes selectedTremble {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(1.12); }
          20% { transform: translate(-50%, -50%) rotate(-6deg) scale(1.22); }
          40% { transform: translate(-50%, -50%) rotate(6deg) scale(1.28); }
          60% { transform: translate(-50%, -50%) rotate(-4deg) scale(1.24); }
          80% { transform: translate(-50%, -50%) rotate(4deg) scale(1.18); }
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
          {gameType === 'scratch_card' ? 'Reset' : playing ? 'Testing...' : 'Test'}
        </button>
      </div>

      {gameType === 'scratch_card'
        ? <ScratchCardBuilderPreview result={result} resetKey={scratchResetKey} onReveal={revealScratchPrize} />
        : BuilderPreview
          ? <BuilderPreview rewards={runtimeRewards} rotation={rotation} />
          : <MysteryBoxBuilderPreview selectedBox={selectedBox} result={result} />}
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
                  style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angle}deg)`, transformOrigin: 'center center' }}
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
    console.log('SpinWheelPreview rendered for non-wheel game', { gameType: builder.state.gameType });
    return <NonWheelPreview rewards={props.rewards} rotation={props.rotation} />;
  }

  return <WheelOnlyPreview {...props} />;
}
