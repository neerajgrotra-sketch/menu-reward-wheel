'use client';

import { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import MysteryBoxGame from '@/components/games/MysteryBoxGame';
import SpinWheelPreview from '@/components/admin/SpinWheelPreview';
import { createClient } from '@/lib/supabase/client';

type Props = { promotionId: string };
type GameType = 'wheel' | 'mystery_box';
type PreviewReward = {
  id: string;
  label: string;
  description: string;
  terms: string;
  weight: number;
  active: boolean;
};

type PromotionPreview = {
  id: string;
  game_type?: string | null;
};

function rewardLabel(reward: any, menuItemName?: string) {
  const baseName = reward.custom_name || menuItemName || 'Reward';
  if (reward.reward_type === 'free') return `FREE ${baseName}`;
  if (reward.reward_type === 'discount') return `${reward.reward_value || 0}% ${baseName}`;
  return baseName;
}

function pickWeightedIndex(list: PreviewReward[]) {
  let random = Math.random() * list.reduce((sum, item) => sum + item.weight, 0);
  for (let i = 0; i < list.length; i += 1) {
    random -= list[i].weight;
    if (random <= 0) return i;
  }
  return Math.max(0, list.length - 1);
}

export default function BuilderGamePreviewRuntime({ promotionId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [promotion, setPromotion] = useState<PromotionPreview | null>(null);
  const [rewards, setRewards] = useState<PreviewReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [result, setResult] = useState('');

  const gameType: GameType = promotion?.game_type === 'mystery_box' ? 'mystery_box' : 'wheel';
  const isMysteryBox = gameType === 'mystery_box';

  useEffect(() => {
    async function load() {
      setLoading(true);
      const promotionResult = await supabase
        .from('promotions')
        .select('id,game_type')
        .eq('id', promotionId)
        .single();

      if (promotionResult.data) setPromotion(promotionResult.data as PromotionPreview);

      const rewardResult = await supabase
        .from('promotion_rewards')
        .select('id,menu_item_id,custom_name,reward_type,reward_value,weight')
        .eq('promotion_id', promotionId)
        .order('created_at', { ascending: true });

      const rawRewards = rewardResult.data || [];
      const menuItemIds = rawRewards.map((item: any) => item.menu_item_id).filter(Boolean);
      let namesById: Record<string, string> = {};

      if (menuItemIds.length > 0) {
        const itemResult = await supabase.from('menu_items').select('id,name').in('id', menuItemIds);
        namesById = Object.fromEntries((itemResult.data || []).map((item: any) => [item.id, item.name]));
      }

      setRewards(rawRewards.map((item: any) => {
        const label = rewardLabel(item, item.menu_item_id ? namesById[item.menu_item_id] : undefined);
        return {
          id: item.id,
          label,
          description: label,
          terms: 'Preview only.',
          weight: item.weight || 30,
          active: true,
        };
      }));

      setLoading(false);
    }

    if (promotionId) load();
  }, [promotionId, supabase]);

  function testPreview() {
    if (playing || rewards.length < 2) return;
    const selectedIndex = pickWeightedIndex(rewards);
    const selected = rewards[selectedIndex];
    setResult('');
    setPlaying(true);

    if (!isMysteryBox) {
      const segmentAngle = 360 / rewards.length;
      const finalRotation = rotation + 5 * 360 + (-(selectedIndex * segmentAngle) - (rotation % 360));
      setRotation(finalRotation);
    }

    window.setTimeout(() => {
      setResult(selected?.description || 'Reward');
      setPlaying(false);
      confetti({
        particleCount: isMysteryBox ? 220 : 160,
        spread: isMysteryBox ? 120 : 95,
        origin: { y: 0.62 },
        shapes: isMysteryBox ? ['square', 'circle', 'star'] : undefined,
      });
    }, isMysteryBox ? 1250 : 2900);
  }

  if (loading) return null;

  return (
    <section className="mx-auto mt-6 max-w-6xl rounded-[2rem] bg-white p-5 text-[#1F1F1F] shadow-xl ring-1 ring-orange-100">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.14em] text-[#FF6B00]">Native Game Preview Runtime</p>
          <h2 className="mt-1 text-3xl font-black">{isMysteryBox ? '🎁 Mystery Box Reveal' : '🎯 Spin Wheel'}</h2>
          <p className="mt-2 max-w-2xl text-sm font-bold text-stone-600">
            This preview is rendered directly by React, not injected by DOM scanning or MutationObserver patches.
          </p>
        </div>
        <button
          onClick={testPreview}
          disabled={playing || rewards.length < 2}
          className="rounded-full bg-[#1F1F1F] px-6 py-3 text-sm font-black text-white shadow-lg disabled:bg-stone-300"
        >
          {playing ? 'Testing...' : 'Test Preview'}
        </button>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div className="rounded-[2rem] bg-orange-50 p-4">
          {isMysteryBox ? (
            <MysteryBoxGame canPlay={!playing && rewards.length >= 2} spinning={playing} spinsRemaining={1} onPick={testPreview} />
          ) : (
            <SpinWheelPreview rewards={rewards as any} rotation={rotation} spinning={playing} />
          )}
        </div>

        <div className="rounded-[2rem] bg-stone-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-stone-500">Preview Rewards</p>
          {result && <p className="mt-3 rounded-2xl bg-green-50 p-3 text-sm font-black text-green-700">🎉 Test result: {result}</p>}
          <div className="mt-4 space-y-2">
            {rewards.length ? rewards.map((reward) => (
              <div key={reward.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
                <p className="min-w-0 truncate text-sm font-black text-stone-900">{reward.description}</p>
                <span className="shrink-0 rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-[#FF6B00]">Weight {reward.weight}</span>
              </div>
            )) : (
              <p className="rounded-2xl bg-white p-4 text-sm font-bold text-stone-500">Add rewards below, then save to refresh the native preview runtime.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
