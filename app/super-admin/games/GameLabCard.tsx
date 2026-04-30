'use client';

import { useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { RewardWheel, getRewardWheelTargetRotation } from '@/components/RewardWheel';
import type { Reward } from '@/types/reward';
import { updateGame } from './actions';

type GameStatus = 'active' | 'coming_soon' | 'disabled';
type WinEffect = 'confetti' | 'stars' | 'celebration' | 'none';

type WheelConfig = {
  speed?: number;
  spinRotations?: number;
  slowdownSeconds?: number;
  winEffect?: WinEffect;
  tryAgain?: {
    enabled?: boolean;
    label?: string;
    backgroundColor?: string;
    textColor?: string;
  };
};

type GameConfig = {
  wheel?: WheelConfig;
};

export type GameForLab = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: GameStatus;
  icon: string | null;
  min_rewards: number;
  max_rewards: number;
  min_products?: number | null;
  max_products?: number | null;
  default_spins: number;
  default_coupon_expiry_minutes: number;
  stop_on_win_default: boolean;
  supports_coupon: boolean;
  supports_weighting: boolean;
  supports_try_again: boolean;
  sort_order: number;
  game_config?: GameConfig | null;
};

const statuses: GameStatus[] = ['active', 'coming_soon', 'disabled'];
const winEffects: { value: WinEffect; label: string }[] = [
  { value: 'confetti', label: 'Confetti' },
  { value: 'stars', label: 'Stars' },
  { value: 'celebration', label: 'Celebration Mix' },
  { value: 'none', label: 'None' },
];

const sampleRewards = ['Free Fries', '10% Off', 'Free Drink', 'BOGO', 'Dessert', 'VIP Deal', 'Lunch Deal', 'Chef Pick', 'Combo', 'Try Again'];

function statusLabel(status: GameStatus) {
  if (status === 'coming_soon') return 'Coming soon';
  return status[0].toUpperCase() + status.slice(1);
}

function statusClass(status: GameStatus) {
  if (status === 'active') return 'bg-green-50 text-green-700';
  if (status === 'disabled') return 'bg-stone-100 text-stone-500';
  return 'bg-orange-50 text-[#FF6B00]';
}

function readWheelConfig(game: GameForLab) {
  return {
    speed: game.game_config?.wheel?.speed ?? 1.2,
    spinRotations: game.game_config?.wheel?.spinRotations ?? 6,
    slowdownSeconds: game.game_config?.wheel?.slowdownSeconds ?? 3.5,
    winEffect: game.game_config?.wheel?.winEffect ?? 'confetti',
    tryAgain: {
      enabled: game.game_config?.wheel?.tryAgain?.enabled ?? game.supports_try_again,
      label: game.game_config?.wheel?.tryAgain?.label ?? 'Try Again',
      backgroundColor: game.game_config?.wheel?.tryAgain?.backgroundColor ?? '#111111',
      textColor: game.game_config?.wheel?.tryAgain?.textColor ?? '#ffffff',
    },
  } satisfies Required<WheelConfig>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-stone-500">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function TextInput({ name, defaultValue, placeholder }: { name: string; defaultValue?: string | number | null; placeholder?: string }) {
  return <input name={name} defaultValue={defaultValue ?? ''} placeholder={placeholder} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function NumberInput({ name, defaultValue, step = 1, min }: { name: string; defaultValue: number; step?: number; min?: number }) {
  return <input name={name} type="number" step={step} min={min} defaultValue={defaultValue} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#FF6B00]" />;
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl bg-stone-50 px-4 py-3 text-sm font-black text-stone-700">
      <span>{label}</span>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-5 w-5 accent-[#FF6B00]" />
    </label>
  );
}

function SpinWheelPreview({ game }: { game: GameForLab }) {
  const wheel = readWheelConfig(game);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState('Ready to test global feel');
  const minProducts = game.min_products ?? game.min_rewards;
  const maxProducts = game.max_products ?? game.max_rewards;
  const segmentCount = Math.max(2, Math.min(10, maxProducts));
  const segmentAngle = 360 / segmentCount;
  const transitionDurationMs = Math.round((wheel.slowdownSeconds * 1000) / Math.max(0.2, wheel.speed));

  const rewards: Reward[] = useMemo(() => {
    const base = Array.from({ length: segmentCount }, (_, index) => {
      const label = sampleRewards[index] || `Reward ${index + 1}`;
      return {
        id: `lab-reward-${index}`,
        label,
        description: label,
        terms: 'Super Admin preview reward.',
        weight: 1,
        active: true,
      };
    });

    if (wheel.tryAgain.enabled && base.length) {
      const tryAgainLabel = wheel.tryAgain.label || 'Try Again';
      base[base.length - 1] = {
        id: 'lab-try-again',
        label: tryAgainLabel,
        description: tryAgainLabel,
        terms: 'Preview try-again segment.',
        weight: 1,
        active: true,
      };
    }

    return base;
  }, [segmentCount, wheel.tryAgain.enabled, wheel.tryAgain.label]);

  function celebrate() {
    if (wheel.winEffect === 'none') return;
    const origin = { x: 0.28, y: 0.56 };
    if (wheel.winEffect === 'stars') {
      confetti({ particleCount: 90, spread: 75, scalar: 1.1, shapes: ['star'], origin });
      return;
    }
    if (wheel.winEffect === 'celebration') {
      confetti({ particleCount: 140, spread: 95, origin });
      setTimeout(() => confetti({ particleCount: 70, spread: 70, shapes: ['star'], origin: { x: 0.3, y: 0.52 } }), 220);
      return;
    }
    confetti({ particleCount: 130, spread: 95, origin });
  }

  function testSpin() {
    if (spinning) return;
    setSpinning(true);
    const selectedIndex = Math.floor(Math.random() * rewards.length);
    const finalRotation = getRewardWheelTargetRotation({ currentRotation: rotation, selectedIndex, segmentAngle, rotations: wheel.spinRotations });
    setRotation(finalRotation);

    window.setTimeout(() => {
      const winner = rewards[selectedIndex];
      setLastResult(winner.label);
      setSpinning(false);
      if (winner.id !== 'lab-try-again') celebrate();
    }, transitionDurationMs);
  }

  return (
    <div className="rounded-[2rem] bg-gradient-to-b from-orange-50 to-amber-100 p-5 text-stone-950 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FF6B00]">Live game lab</p>
          <h4 className="mt-1 text-2xl font-black">Spin Wheel Preview</h4>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-600 shadow">{segmentCount} panels</span>
      </div>

      <div className="mt-4 rounded-3xl bg-white/80 p-4 text-center shadow-lg">
        <p className="text-lg font-black text-[#FF6B00]">Global test mode 🎯</p>
        <p className="mt-1 text-sm font-bold text-stone-600">Uses the same wheel component and landing math as the customer play page.</p>
      </div>

      <div className="mt-6">
        <RewardWheel rewards={rewards} rotation={rotation} spinning={spinning} transitionDurationMs={transitionDurationMs} />
      </div>

      <div className="mt-5 rounded-3xl bg-white p-4 text-center shadow-lg">
        <p className="text-xs font-black uppercase tracking-wide text-stone-500">Last test result</p>
        <p className="mt-1 text-2xl font-black">{lastResult}</p>
        <p className="mt-2 text-xs font-bold text-stone-500">Visual guardrail: {minProducts}–{maxProducts} products/rewards recommended for a clean wheel.</p>
      </div>

      <button type="button" onClick={testSpin} disabled={spinning} className="mt-4 w-full rounded-3xl bg-green-600 px-5 py-5 text-base font-black text-white shadow-xl disabled:bg-stone-400">
        {spinning ? 'Testing spin...' : 'Test Global Spin Feel'}
      </button>
    </div>
  );
}

function PlaceholderPreview({ game }: { game: GameForLab }) {
  return (
    <div className="rounded-[2rem] border-2 border-dashed border-stone-200 bg-stone-50 p-6 text-center shadow-inner">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-white text-5xl shadow">{game.icon || '🎮'}</div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-stone-400">Preview placeholder</p>
      <h4 className="mt-2 text-3xl font-black">{game.name}</h4>
      <p className="mt-2 text-sm font-semibold leading-6 text-stone-500">Game-specific lab controls will be added when this game engine is built. It should not inherit Spin Wheel physics.</p>
    </div>
  );
}

export default function GameLabCard({ game }: { game: GameForLab }) {
  const isSpinWheel = game.slug === 'spin-wheel';
  const wheel = readWheelConfig(game);
  const minProducts = game.min_products ?? game.min_rewards;
  const maxProducts = game.max_products ?? game.max_rewards;

  return (
    <form action={updateGame} className="rounded-[2rem] bg-white p-5 shadow-xl">
      <input type="hidden" name="id" value={game.id} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-orange-50 text-4xl shadow-inner">{game.icon || '🎮'}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-3xl font-black">{game.name}</h3>
              <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${statusClass(game.status)}`}>{statusLabel(game.status)}</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-600">{game.description || 'No description added.'}</p>
          </div>
        </div>
        <button type="submit" className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white shadow-lg">Save Global Game</button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[420px_1fr]">
        <div>{isSpinWheel ? <SpinWheelPreview game={game} /> : <PlaceholderPreview game={game} />}</div>

        <div className="rounded-[2rem] bg-[#FFF8F0] p-4">
          <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Global configuration</p>
          <p className="mt-1 text-sm font-semibold text-stone-600">These defaults control how this game type behaves across the platform unless a future promotion-level override is introduced.</p>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <Field label="Name"><TextInput name="name" defaultValue={game.name} /></Field>
            <Field label="Slug"><TextInput name="slug" defaultValue={game.slug} /></Field>
            <Field label="Icon"><TextInput name="icon" defaultValue={game.icon} /></Field>
            <Field label="Status">
              <select name="status" defaultValue={game.status} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#FF6B00]">
                {statuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Description">
              <textarea name="description" defaultValue={game.description || ''} rows={3} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#FF6B00]" />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <Field label="Min Rewards"><NumberInput name="min_rewards" defaultValue={game.min_rewards} min={1} /></Field>
            <Field label="Max Rewards"><NumberInput name="max_rewards" defaultValue={game.max_rewards} min={1} /></Field>
            <Field label="Min Products"><NumberInput name="min_products" defaultValue={minProducts} min={1} /></Field>
            <Field label="Max Products"><NumberInput name="max_products" defaultValue={maxProducts} min={1} /></Field>
            <Field label="Sort Order"><NumberInput name="sort_order" defaultValue={game.sort_order} /></Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Default Spins"><NumberInput name="default_spins" defaultValue={game.default_spins} min={1} /></Field>
            <Field label="Coupon Expiry Minutes"><NumberInput name="default_coupon_expiry_minutes" defaultValue={game.default_coupon_expiry_minutes} min={1} /></Field>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Toggle name="stop_on_win_default" label="Stop on win" defaultChecked={game.stop_on_win_default} />
            <Toggle name="supports_coupon" label="Supports coupon" defaultChecked={game.supports_coupon} />
            <Toggle name="supports_weighting" label="Supports weighting" defaultChecked={game.supports_weighting} />
            <Toggle name="supports_try_again" label="Supports try again" defaultChecked={game.supports_try_again} />
          </div>

          {isSpinWheel && (
            <div className="mt-5 rounded-[2rem] bg-white p-4 shadow-inner">
              <p className="text-sm font-black uppercase tracking-wide text-[#FF6B00]">Spin Wheel physics and effects</p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Field label="Wheel Speed"><NumberInput name="wheel_speed" defaultValue={wheel.speed} step={0.1} min={0.2} /></Field>
                <Field label="Spin Rotations"><NumberInput name="spin_rotations" defaultValue={wheel.spinRotations} min={2} /></Field>
                <Field label="Slowdown Seconds"><NumberInput name="slowdown_seconds" defaultValue={wheel.slowdownSeconds} step={0.1} min={1} /></Field>
                <Field label="Win Effect">
                  <select name="win_effect" defaultValue={wheel.winEffect} className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm font-black outline-none focus:border-[#FF6B00]">
                    {winEffects.map((effect) => <option key={effect.value} value={effect.value}>{effect.label}</option>)}
                  </select>
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Try Again Label"><TextInput name="try_again_label" defaultValue={wheel.tryAgain.label} /></Field>
                <Field label="Try Again Background"><input name="try_again_background_color" type="color" defaultValue={wheel.tryAgain.backgroundColor} className="h-12 w-full rounded-2xl border border-stone-200 bg-white p-2" /></Field>
                <Field label="Try Again Text"><input name="try_again_text_color" type="color" defaultValue={wheel.tryAgain.textColor} className="h-12 w-full rounded-2xl border border-stone-200 bg-white p-2" /></Field>
              </div>

              <p className="mt-3 rounded-2xl bg-stone-50 p-3 text-xs font-bold leading-5 text-stone-500">Default Try Again panel style is black background with white text. Toggle “Supports try again” to include or remove it from the lab preview. The customer wheel currently uses the shared wheel color palette; custom segment colors are saved for future renderer support.</p>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
